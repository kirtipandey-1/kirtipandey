const express = require("express");
const axios = require("axios");

const router = express.Router();
const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0";

// GET /api/recommendations?track=&artist=
// Returns similar tracks from Last.fm
router.get("/", async (req, res) => {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    return res.json({ tracks: [], note: "Set LASTFM_API_KEY for recommendations" });
  }

  const { track, artist } = req.query;
  if (!track || !artist) {
    return res.status(400).json({ error: "track and artist are required" });
  }

  try {
    const r = await axios.get(LASTFM_BASE, {
      params: {
        method: "track.getSimilar",
        track,
        artist,
        api_key: apiKey,
        format: "json",
        limit: 20,
      },
    });

    const similar = r.data?.similartracks?.track || [];
    const tracks = similar.map((t) => ({
      artist: t.artist?.name || "",
      title: t.name || "",
      mbid: t.mbid || "",
      image: t.image?.find((img) => img.size === "medium")?.["#text"] || "",
      query: `${t.artist?.name || ""} - ${t.name || ""}`,
    }));

    res.json({ tracks });
  } catch (err) {
    console.error("Last.fm error:", err.message);
    res.status(502).json({ error: "Failed to fetch recommendations" });
  }
});

// GET /api/recommendations/top?artist=
router.get("/top", async (req, res) => {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    return res.json({ tracks: [], note: "Set LASTFM_API_KEY for recommendations" });
  }

  const { artist } = req.query;
  if (!artist) return res.status(400).json({ error: "artist is required" });

  try {
    const r = await axios.get(LASTFM_BASE, {
      params: {
        method: "artist.getTopTracks",
        artist,
        api_key: apiKey,
        format: "json",
        limit: 10,
      },
    });

    const toptracks = r.data?.toptracks?.track || [];
    const tracks = toptracks.map((t) => ({
      artist,
      title: t.name,
      image: t.image?.find((img) => img.size === "medium")?.["#text"] || "",
      query: `${artist} - ${t.name}`,
    }));

    res.json({ tracks });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch top tracks" });
  }
});

// GET /api/recommendations/artist-info?artist=
router.get("/artist-info", async (req, res) => {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return res.json({ artist: null });

  const { artist } = req.query;
  if (!artist) return res.status(400).json({ error: "artist is required" });

  try {
    const r = await axios.get(LASTFM_BASE, {
      params: {
        method: "artist.getInfo",
        artist,
        api_key: apiKey,
        format: "json",
      },
    });

    const a = r.data?.artist;
    res.json({
      artist: {
        name: a?.name,
        bio: a?.bio?.summary?.replace(/<[^>]*>/g, "").split(" <a href")[0] || "",
        image: a?.image?.find((img) => img.size === "extralarge")?.["#text"] || "",
        similar: (a?.similar?.artist || []).map((s) => s.name),
      },
    });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch artist info" });
  }
});

module.exports = router;
