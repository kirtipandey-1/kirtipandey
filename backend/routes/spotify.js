const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

// In-memory job store: jobId -> { status, downloaded, total, tracks, error, process }
const jobs = new Map();

function isSpotifyUrl(url) {
  return /^https?:\/\/open\.spotify\.com\/(playlist|album|track|artist)\/[A-Za-z0-9]+/.test(url);
}

// POST /api/spotify/download
router.post("/download", (req, res) => {
  const { url } = req.body;

  if (!url || !isSpotifyUrl(url)) {
    return res.status(400).json({ error: "Invalid Spotify URL" });
  }

  const jobId = uuidv4();
  const downloadsDir = process.env.DOWNLOADS_DIR || "/downloads";
  const outputDir = path.join(downloadsDir, "spotify");
  const outputTemplate = path.join(outputDir, "{list-name}", "{title} - {artists}.{output-ext}");

  const job = {
    status: "running",
    downloaded: 0,
    total: 0,
    tracks: [],
    error: null,
  };
  jobs.set(jobId, job);

  const proc = spawn("spotdl", [
    url,
    "--output", outputTemplate,
    "--format", "mp3",
    "--headless",
  ]);

  proc.stdout.on("data", (data) => {
    const text = data.toString();
    const lines = text.split("\n");

    for (const line of lines) {
      // Detect total: "Found N songs in ..."
      const foundMatch = line.match(/Found (\d+) songs?/i);
      if (foundMatch) {
        job.total = parseInt(foundMatch[1], 10);
      }

      // Detect completed download
      const dlMatch = line.match(/Downloaded\s+"(.+?)"/i);
      if (dlMatch) {
        job.downloaded += 1;
        job.tracks.push({ name: dlMatch[1], status: "done" });
      }

      // Detect skipped (already downloaded)
      const skipMatch = line.match(/Skipping\s+"(.+?)"/i);
      if (skipMatch) {
        job.downloaded += 1;
        job.tracks.push({ name: skipMatch[1], status: "skipped" });
      }
    }
  });

  proc.stderr.on("data", (data) => {
    // spotdl uses stderr for some informational output; ignore non-fatal lines
    const text = data.toString().trim();
    if (text) {
      // Only record as error if the job hasn't succeeded yet and it looks fatal
      if (job.status === "running" && /error/i.test(text)) {
        job.error = text;
      }
    }
  });

  proc.on("close", (code) => {
    job.status = code === 0 ? "done" : "error";
    if (code !== 0 && !job.error) {
      job.error = `spotdl exited with code ${code}`;
    }
    // Clean up job from memory after 10 minutes
    setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
  });

  res.json({ jobId });
});

// GET /api/spotify/status/:jobId
router.get("/status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  res.json({
    status: job.status,
    downloaded: job.downloaded,
    total: job.total,
    tracks: job.tracks,
    error: job.error,
  });
});

module.exports = router;
