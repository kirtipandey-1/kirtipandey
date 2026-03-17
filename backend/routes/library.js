const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || "/downloads";

const AUDIO_EXTS = new Set(["mp3", "flac", "ogg", "m4a", "aac", "wav"]);

function walkDir(dir, base = dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, base));
    } else if (entry.isFile()) {
      const ext = entry.name.split(".").pop().toLowerCase();
      if (AUDIO_EXTS.has(ext)) {
        const relativePath = path.relative(base, fullPath);
        const parts = relativePath.split(path.sep);
        // parts[0] = username, rest = path
        const username = parts[0];
        const remotePath = parts.slice(1).join("/");
        const basename = entry.name;
        const titleMatch = basename.match(/^(.+?)\s*-\s*(.+)\.(mp3|flac|ogg|m4a|aac|wav)$/i);

        results.push({
          id: `${username}::${relativePath.replace(/\\/g, "/")}`,
          username,
          filename: `\\${parts.join("\\")}`,
          localPath: fullPath,
          basename,
          artist: titleMatch ? titleMatch[1].trim() : (parts.length >= 3 ? parts[parts.length - 3] : ""),
          title: titleMatch ? titleMatch[2].trim() : basename.replace(/\.[^.]+$/, ""),
          album: parts.length >= 2 ? parts[parts.length - 2] : "",
          ext,
          size: fs.statSync(fullPath).size,
        });
      }
    }
  }
  return results;
}

// GET /api/library — list all downloaded tracks
router.get("/", (req, res) => {
  const tracks = walkDir(DOWNLOADS_DIR);
  res.json({ tracks, total: tracks.length });
});

// GET /api/library/artists — group by artist
router.get("/artists", (req, res) => {
  const tracks = walkDir(DOWNLOADS_DIR);
  const artistMap = new Map();

  for (const t of tracks) {
    const key = t.artist || "Unknown Artist";
    if (!artistMap.has(key)) artistMap.set(key, []);
    artistMap.get(key).push(t);
  }

  const artists = Array.from(artistMap.entries()).map(([name, songs]) => ({
    name,
    trackCount: songs.length,
    tracks: songs,
  }));

  artists.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ artists });
});

// GET /api/library/albums — group by album
router.get("/albums", (req, res) => {
  const tracks = walkDir(DOWNLOADS_DIR);
  const albumMap = new Map();

  for (const t of tracks) {
    const key = `${t.artist}|${t.album || "Unknown Album"}`;
    if (!albumMap.has(key)) albumMap.set(key, { artist: t.artist, album: t.album || "Unknown Album", tracks: [] });
    albumMap.get(key).tracks.push(t);
  }

  const albums = Array.from(albumMap.values()).sort((a, b) =>
    a.album.localeCompare(b.album)
  );
  res.json({ albums });
});

module.exports = router;
