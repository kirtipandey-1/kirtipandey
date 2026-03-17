const express = require("express");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();
const SLSKD = () => process.env.SLSKD_URL || "http://localhost:5030";

// Active searches: id -> { id, query, startedAt }
const activeSearches = new Map();

// Parse a Soulseek remote filename into a friendly object
function parseFilename(rawFilename) {
  // Convert backslashes, strip leading separators
  const normalized = rawFilename.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/");
  const basename = parts[parts.length - 1];
  const ext = basename.split(".").pop().toLowerCase();

  // Try to parse "Artist - Title.ext" pattern
  const match = basename.match(/^(.+?)\s*-\s*(.+)\.(mp3|flac|ogg|m4a|aac|wav)$/i);
  let artist = "";
  let title = basename.replace(/\.[^.]+$/, "");

  if (match) {
    artist = match[1].trim();
    title = match[2].trim();
  } else if (parts.length >= 3) {
    // folder structure: /Artist/Album/Title.ext
    artist = parts[parts.length - 3] || "";
    title = basename.replace(/\.[^.]+$/, "");
  }

  const album = parts.length >= 2 ? parts[parts.length - 2] : "";

  return { artist, title, album, ext, basename, path: normalized };
}

// POST /api/search/start  { query }
router.post("/start", async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "query is required" });

  const id = uuidv4();
  try {
    await axios.post(`${SLSKD()}/api/v0/searches`, {
      id,
      searchText: query,
    });
    activeSearches.set(id, { id, query, startedAt: Date.now() });
    res.json({ id });
  } catch (err) {
    console.error("Search start error:", err.message);
    res.status(502).json({ error: "Failed to start search via slskd" });
  }
});

// GET /api/search/:id  — poll for results
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [statusRes, responsesRes] = await Promise.all([
      axios.get(`${SLSKD()}/api/v0/searches/${id}`),
      axios.get(`${SLSKD()}/api/v0/searches/${id}/responses`),
    ]);

    const isComplete = statusRes.data?.isComplete ?? false;
    const rawResponses = responsesRes.data || [];

    // Flatten all files from all users into a unified track list
    const tracks = [];
    for (const resp of rawResponses) {
      const username = resp.username;
      for (const file of resp.files || []) {
        const meta = parseFilename(file.filename);
        tracks.push({
          id: `${username}::${file.filename}`,
          username,
          filename: file.filename,
          size: file.size,
          bitRate: file.bitRate || null,
          length: file.length || null,
          ...meta,
        });
      }
    }

    // Deduplicate by artist+title, prefer highest bitrate
    const deduped = new Map();
    for (const t of tracks) {
      const key = `${t.artist.toLowerCase()}|${t.title.toLowerCase()}|${t.ext}`;
      const existing = deduped.get(key);
      if (!existing || (t.bitRate || 0) > (existing.bitRate || 0)) {
        deduped.set(key, t);
      }
    }

    res.json({
      id,
      isComplete,
      total: deduped.size,
      tracks: Array.from(deduped.values()),
    });
  } catch (err) {
    console.error("Search poll error:", err.message);
    res.status(502).json({ error: "Failed to fetch search results" });
  }
});

// DELETE /api/search/:id — stop a search
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await axios.delete(`${SLSKD()}/api/v0/searches/${id}`);
    activeSearches.delete(id);
    res.json({ ok: true });
  } catch {
    res.json({ ok: true }); // best-effort
  }
});

module.exports = router;
