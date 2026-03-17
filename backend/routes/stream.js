const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const SLSKD = () => process.env.SLSKD_URL || "http://localhost:5030";
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || "/downloads";

// In-memory map: trackId -> { username, filename, localPath, state }
const downloadCache = new Map();

function trackKey(username, filename) {
  return `${username}::${filename}`;
}

function remoteToLocalPath(username, remoteFilename) {
  // slskd saves files under DOWNLOADS_DIR/<username>/<sanitized-path>
  const normalized = remoteFilename.replace(/\\/g, "/").replace(/^\/+/, "");
  return path.join(DOWNLOADS_DIR, username, normalized);
}

async function getSlskdDownloadStatus(username, filename) {
  try {
    const encoded = encodeURIComponent(filename);
    const r = await axios.get(
      `${SLSKD()}/api/v0/transfers/downloads/${encodeURIComponent(username)}/${encoded}`
    );
    return r.data;
  } catch {
    return null;
  }
}

async function startSlskdDownload(username, filename) {
  const encoded = encodeURIComponent(filename);
  await axios.post(
    `${SLSKD()}/api/v0/transfers/downloads/${encodeURIComponent(username)}/${encoded}`
  );
}

// POST /api/stream/play  { username, filename }
// Triggers a download and returns the track id + status
router.post("/play", async (req, res) => {
  const { username, filename } = req.body;
  if (!username || !filename) {
    return res.status(400).json({ error: "username and filename required" });
  }

  const id = trackKey(username, filename);
  const localPath = remoteToLocalPath(username, filename);

  // If already downloaded and file exists, ready immediately
  if (downloadCache.has(id)) {
    const cached = downloadCache.get(id);
    if (cached.state === "Completed" && fs.existsSync(localPath)) {
      return res.json({ id, state: "Completed", localPath });
    }
  }

  // Start or re-check download
  try {
    const existing = await getSlskdDownloadStatus(username, filename);
    if (!existing || existing.state === "None" || existing.state === "Cancelled") {
      await startSlskdDownload(username, filename);
    }
    downloadCache.set(id, { username, filename, localPath, state: "InProgress" });
    res.json({ id, state: "InProgress" });
  } catch (err) {
    console.error("Play error:", err.message);
    res.status(502).json({ error: "Failed to start download" });
  }
});

// GET /api/stream/status/:username/:encodedFilename
router.get("/status", async (req, res) => {
  const { username, filename } = req.query;
  if (!username || !filename) {
    return res.status(400).json({ error: "username and filename required" });
  }

  const id = trackKey(username, filename);
  const localPath = remoteToLocalPath(username, filename);

  try {
    const dlStatus = await getSlskdDownloadStatus(username, filename);
    const state = dlStatus?.state ?? "Unknown";

    // Try to get file size for progress
    let fileSize = 0;
    let downloadedBytes = 0;
    if (dlStatus) {
      fileSize = dlStatus.size || 0;
      downloadedBytes = dlStatus.bytesTransferred || 0;
    }

    const localExists = fs.existsSync(localPath);
    if (localExists && state === "Completed") {
      downloadCache.set(id, { username, filename, localPath, state: "Completed" });
    }

    res.json({
      id,
      state,
      fileSize,
      downloadedBytes,
      progress: fileSize > 0 ? Math.round((downloadedBytes / fileSize) * 100) : 0,
      ready: state === "Completed" && localExists,
    });
  } catch (err) {
    res.status(502).json({ error: "Status check failed" });
  }
});

// GET /api/stream/audio?username=&filename=
// Streams the downloaded audio file with range support
router.get("/audio", async (req, res) => {
  const { username, filename } = req.query;
  if (!username || !filename) {
    return res.status(400).json({ error: "username and filename required" });
  }

  const localPath = remoteToLocalPath(username, filename);

  if (!fs.existsSync(localPath)) {
    return res.status(404).json({ error: "File not yet downloaded" });
  }

  const stat = fs.statSync(localPath);
  const fileSize = stat.size;
  const ext = path.extname(filename).toLowerCase().replace(".", "");
  const mimeTypes = {
    mp3: "audio/mpeg",
    flac: "audio/flac",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
  };
  const contentType = mimeTypes[ext] || "audio/mpeg";

  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": contentType,
    });
    fs.createReadStream(localPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(localPath).pipe(res);
  }
});

module.exports = router;
