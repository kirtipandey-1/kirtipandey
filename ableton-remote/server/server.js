/**
 * server.js
 * Express + WebSocket bridge between phone browser and Ableton Live via OSC.
 */

const http       = require('http');
const path       = require('path');
const express    = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const osc        = require('./ableton-osc');

const PORT             = parseInt(process.env.PORT)            || 3001;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS)|| 500;
const TRACK_POLL_RATIO = 2; // poll tracks every TRACK_POLL_RATIO * POLL_INTERVAL_MS

// ─── State ───────────────────────────────────────────────────────────────────

let abletonState = {
  abletonConnected: false,
  isPlaying: false,
  isRecording: false,
  tempo: 120.0,
  masterVolume: 0.85,
  numTracks: 0,
  tracks: [],
};

let consecutiveFailures = 0;
const MAX_FAILURES = 3;
let lastStateHash = '';
let pollCount = 0;

// ─── OSC helpers ─────────────────────────────────────────────────────────────

async function fetchTrack(index) {
  try {
    const [nameResult, muteResult, soloResult, armResult, volumeResult] = await Promise.all([
      osc.query('/live/track/get/name',   '/live/track/name',   index).catch(() => ['']),
      osc.query('/live/track/get/mute',   '/live/track/mute',   index).catch(() => [0]),
      osc.query('/live/track/get/solo',   '/live/track/solo',   index).catch(() => [0]),
      osc.query('/live/track/get/arm',    '/live/track/arm',    index).catch(() => [0]),
      osc.query('/live/track/get/volume', '/live/track/volume', index).catch(() => [0.85]),
    ]);
    return {
      index,
      name:   nameResult[0]   ?? `Track ${index + 1}`,
      mute:   Boolean(muteResult[0]),
      solo:   Boolean(soloResult[0]),
      arm:    Boolean(armResult[0]),
      volume: typeof volumeResult[0] === 'number' ? volumeResult[0] : 0.85,
    };
  } catch {
    return { index, name: `Track ${index + 1}`, mute: false, solo: false, arm: false, volume: 0.85 };
  }
}

async function fetchAllTracks(numTracks) {
  const indices = Array.from({ length: numTracks }, (_, i) => i);
  return Promise.all(indices.map(fetchTrack));
}

async function fetchClips(numTracks, numClips = 8) {
  const clips = [];
  for (let t = 0; t < numTracks; t++) {
    for (let c = 0; c < numClips; c++) {
      try {
        const [nameRes] = await osc.query(
          '/live/clip_slot/get/clip/name',
          '/live/clip_slot/clip/name',
          t, c
        ).catch(() => ['']);
        const [hasClip] = await osc.query(
          '/live/clip_slot/get/has_clip',
          '/live/clip_slot/has_clip',
          t, c
        ).catch(() => [0]);
        const [isPlaying] = await osc.query(
          '/live/clip_slot/get/clip/is_playing',
          '/live/clip_slot/clip/is_playing',
          t, c
        ).catch(() => [0]);
        const [isTriggered] = await osc.query(
          '/live/clip_slot/get/clip/is_triggered',
          '/live/clip_slot/clip/is_triggered',
          t, c
        ).catch(() => [0]);

        clips.push({
          trackIndex: t,
          clipIndex: c,
          name: nameRes || '',
          state: !hasClip ? 'empty'
            : isPlaying   ? 'playing'
            : isTriggered ? 'triggered'
            : 'stopped',
        });
      } catch {
        clips.push({ trackIndex: t, clipIndex: c, name: '', state: 'empty' });
      }
    }
  }
  return clips;
}

// ─── Polling ─────────────────────────────────────────────────────────────────

async function pollAbleton() {
  try {
    const [isPlayingRes, tempoRes, masterVolumeRes, numTracksRes] = await Promise.all([
      osc.query('/live/song/get/is_playing',  '/live/song/is_playing'),
      osc.query('/live/song/get/tempo',       '/live/song/tempo'),
      osc.query('/live/master_track/get/volume', '/live/master_track/volume').catch(() => [0.85]),
      osc.query('/live/song/get/num_tracks',  '/live/song/num_tracks'),
    ]);

    const numTracks = numTracksRes[0] ?? 0;

    // Poll tracks every TRACK_POLL_RATIO cycles
    let tracks = abletonState.tracks;
    if (pollCount % TRACK_POLL_RATIO === 0 || abletonState.numTracks !== numTracks) {
      tracks = numTracks > 0 ? await fetchAllTracks(numTracks) : [];
    }

    consecutiveFailures = 0;
    abletonState = {
      abletonConnected: true,
      isPlaying: Boolean(isPlayingRes[0]),
      isRecording: abletonState.isRecording,
      tempo: typeof tempoRes[0] === 'number' ? tempoRes[0] : 120,
      masterVolume: typeof masterVolumeRes[0] === 'number' ? masterVolumeRes[0] : 0.85,
      numTracks,
      tracks,
    };

    broadcastState();
  } catch (err) {
    consecutiveFailures++;
    if (consecutiveFailures >= MAX_FAILURES) {
      const disconnected = { ...abletonState, abletonConnected: false };
      abletonState = disconnected;
      broadcastState(true);
    }
  }
  pollCount++;
}

let pollTimer = null;
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollAbleton, POLL_INTERVAL_MS);
  pollAbleton(); // immediate first poll
}

function scheduleImmediatePoll() {
  // Run a poll soon without disrupting the regular interval
  setTimeout(pollAbleton, 80);
}

// ─── WebSocket broadcast ──────────────────────────────────────────────────────

const clients = new Set();

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function broadcastState(force = false) {
  const hash = JSON.stringify(abletonState);
  if (!force && hash === lastStateHash) return;
  lastStateHash = hash;
  broadcast({ type: 'STATE', ...abletonState });
}

// ─── WebSocket message routing ────────────────────────────────────────────────

async function handleMessage(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  switch (msg.type) {
    case 'PLAY':
      osc.send('/live/song/start_playing');
      abletonState.isPlaying = true;
      break;
    case 'STOP':
      osc.send('/live/song/stop_playing');
      abletonState.isPlaying = false;
      break;
    case 'RECORD':
      osc.send('/live/song/record');
      break;

    case 'SET_TEMPO':
      if (typeof msg.bpm === 'number' && msg.bpm >= 20 && msg.bpm <= 999) {
        osc.send('/live/song/set/tempo', msg.bpm);
        abletonState.tempo = msg.bpm;
      }
      break;

    case 'SET_MASTER_VOLUME':
      if (typeof msg.value === 'number') {
        osc.send('/live/master_track/set/volume', Math.max(0, Math.min(1, msg.value)));
        abletonState.masterVolume = msg.value;
      }
      break;

    case 'SET_MUTE':
      osc.send('/live/track/set/mute', msg.trackIndex, msg.value ? 1 : 0);
      updateTrack(msg.trackIndex, { mute: msg.value });
      break;
    case 'SET_SOLO':
      osc.send('/live/track/set/solo', msg.trackIndex, msg.value ? 1 : 0);
      updateTrack(msg.trackIndex, { solo: msg.value });
      break;
    case 'SET_ARM':
      osc.send('/live/track/set/arm', msg.trackIndex, msg.value ? 1 : 0);
      updateTrack(msg.trackIndex, { arm: msg.value });
      break;
    case 'SET_TRACK_VOLUME':
      if (typeof msg.value === 'number') {
        osc.send('/live/track/set/volume', msg.trackIndex, Math.max(0, Math.min(1, msg.value)));
        updateTrack(msg.trackIndex, { volume: msg.value });
      }
      break;

    case 'FIRE_CLIP':
      osc.send('/live/clip_slot/fire', msg.trackIndex, msg.clipIndex);
      break;
    case 'STOP_CLIP':
      osc.send('/live/clip_slot/stop', msg.trackIndex, msg.clipIndex);
      break;

    case 'REQUEST_CLIPS': {
      const clips = await fetchClips(abletonState.numTracks).catch(() => []);
      const payload = JSON.stringify({ type: 'CLIPS', clips });
      if (ws.readyState === WebSocket.OPEN) ws.send(payload);
      return; // don't trigger a general broadcast
    }

    default:
      console.warn('[WS] Unknown message type:', msg.type);
      return;
  }

  // Optimistically broadcast changed state immediately, then confirm with real poll
  broadcastState(true);
  scheduleImmediatePoll();
}

function updateTrack(index, patch) {
  const track = abletonState.tracks.find(t => t.index === index);
  if (track) Object.assign(track, patch);
}

// ─── Express + HTTP server ────────────────────────────────────────────────────

const app = express();

// Serve built React client if it exists
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, abletonConnected: abletonState.abletonConnected, ...abletonState });
});

// SPA fallback
app.get('*', (_req, res) => {
  const indexPath = path.join(clientDist, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) res.status(404).json({ error: 'Client not built. Run: cd ../client && npm run build' });
  });
});

const server = http.createServer(app);

// ─── WebSocket server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[WS] Client connected (total: ${clients.size})`);

  // Send current state immediately on connect
  ws.send(JSON.stringify({ type: 'STATE', ...abletonState }));

  ws.on('message', (raw) => handleMessage(ws, raw));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected (total: ${clients.size})`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
    clients.delete(ws);
  });
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

osc.init();
startPolling();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\nAbleton Remote server running on http://0.0.0.0:${PORT}`);
  console.log(`WebSocket endpoint: ws://0.0.0.0:${PORT}/ws`);
  console.log(`OSC → Ableton:  ${process.env.OSC_HOST || '127.0.0.1'}:${process.env.OSC_SEND_PORT || 11000}`);
  console.log(`OSC ← Ableton:  UDP ${process.env.OSC_RECEIVE_PORT || 11001}\n`);
});

process.on('SIGTERM', () => { osc.close(); process.exit(0); });
process.on('SIGINT',  () => { osc.close(); process.exit(0); });
