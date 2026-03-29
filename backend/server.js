const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");

const searchRoutes = require("./routes/search");
const streamRoutes = require("./routes/stream");
const libraryRoutes = require("./routes/library");
const recommendRoutes = require("./routes/recommendations");
const spotifyRoutes = require("./routes/spotify");

const app = express();
const server = http.createServer(app);

// WebSocket server for real-time download progress
const wss = new WebSocket.Server({ server, path: "/ws" });
app.locals.wss = wss;

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", async (req, res) => {
  const axios = require("axios");
  try {
    const r = await axios.get(
      `${process.env.SLSKD_URL || "http://localhost:5030"}/api/v0/application`,
      { timeout: 3000 }
    );
    res.json({ ok: true, slskd: r.data?.state?.server?.isConnected ?? false });
  } catch {
    res.status(503).json({ ok: false, slskd: false });
  }
});

app.use("/api/search", searchRoutes);
app.use("/api/stream", streamRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/recommendations", recommendRoutes);
app.use("/api/spotify", spotifyRoutes);

// Broadcast download progress updates to all WS clients
function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}
app.locals.broadcast = broadcast;

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Soulify backend running on port ${PORT}`);
});
