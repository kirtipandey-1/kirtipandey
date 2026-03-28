import { create } from 'zustand';
import ws from '../ws';

const useStore = create((set, get) => ({
  // ── Connection ──────────────────────────────────────────────────────────────
  wsStatus: 'connecting',  // 'connecting' | 'connected' | 'disconnected' | 'failed'

  // ── Song-level ──────────────────────────────────────────────────────────────
  abletonConnected: false,
  isPlaying: false,
  isRecording: false,
  tempo: 120.0,
  masterVolume: 0.85,
  numTracks: 0,

  // ── Tracks ──────────────────────────────────────────────────────────────────
  tracks: [],  // [{ index, name, mute, solo, arm, volume }]

  // ── Clips ───────────────────────────────────────────────────────────────────
  clips: [],        // [{ trackIndex, clipIndex, name, state }]
  clipsLoaded: false,
  clipsLoading: false,

  // ── UI ──────────────────────────────────────────────────────────────────────
  activeView: 'mixer',   // 'mixer' | 'session'
  tapTempoTimes: [],

  // ── Called by App.jsx when WS message arrives ────────────────────────────────
  applyServerState: (msg) => {
    if (msg.type === 'STATE') {
      set({
        abletonConnected: msg.abletonConnected,
        isPlaying:        msg.isPlaying,
        isRecording:      msg.isRecording,
        tempo:            msg.tempo,
        masterVolume:     msg.masterVolume,
        numTracks:        msg.numTracks,
        tracks:           msg.tracks ?? [],
      });
    } else if (msg.type === 'CLIPS') {
      set({ clips: msg.clips ?? [], clipsLoaded: true, clipsLoading: false });
    } else if (msg.type === 'ABLETON_DISCONNECTED') {
      set({ abletonConnected: false });
    } else if (msg.type === 'ABLETON_CONNECTED') {
      set({ abletonConnected: true });
    }
  },

  // ── Transport ────────────────────────────────────────────────────────────────
  play: () => {
    ws.send({ type: 'PLAY' });
    set({ isPlaying: true });
  },
  stop: () => {
    ws.send({ type: 'STOP' });
    set({ isPlaying: false });
  },
  record: () => {
    ws.send({ type: 'RECORD' });
  },

  // ── Tempo ────────────────────────────────────────────────────────────────────
  setTempo: (bpm) => {
    ws.send({ type: 'SET_TEMPO', bpm });
    set({ tempo: bpm });
  },

  tapTempo: () => {
    const now = Date.now();
    const times = [...get().tapTempoTimes, now].filter(t => now - t < 4000).slice(-8);
    set({ tapTempoTimes: times });
    if (times.length >= 2) {
      const intervals = times.slice(1).map((t, i) => t - times[i]);
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const bpm = Math.round(60000 / avgInterval * 10) / 10;
      const clamped = Math.max(20, Math.min(999, bpm));
      set({ tempo: clamped });
      if (times.length >= 4) {
        ws.send({ type: 'SET_TEMPO', bpm: clamped });
      }
    }
  },

  // ── Master volume ─────────────────────────────────────────────────────────────
  setMasterVolume: (value) => {
    ws.send({ type: 'SET_MASTER_VOLUME', value });
    set({ masterVolume: value });
  },

  // ── Track controls ────────────────────────────────────────────────────────────
  setMute: (trackIndex, value) => {
    ws.send({ type: 'SET_MUTE', trackIndex, value });
    set(state => ({
      tracks: state.tracks.map(t => t.index === trackIndex ? { ...t, mute: value } : t),
    }));
  },
  setSolo: (trackIndex, value) => {
    ws.send({ type: 'SET_SOLO', trackIndex, value });
    set(state => ({
      tracks: state.tracks.map(t => t.index === trackIndex ? { ...t, solo: value } : t),
    }));
  },
  setArm: (trackIndex, value) => {
    ws.send({ type: 'SET_ARM', trackIndex, value });
    set(state => ({
      tracks: state.tracks.map(t => t.index === trackIndex ? { ...t, arm: value } : t),
    }));
  },
  setTrackVolume: (trackIndex, value) => {
    ws.send({ type: 'SET_TRACK_VOLUME', trackIndex, value });
    set(state => ({
      tracks: state.tracks.map(t => t.index === trackIndex ? { ...t, volume: value } : t),
    }));
  },

  // ── Clips ─────────────────────────────────────────────────────────────────────
  fireClip: (trackIndex, clipIndex) => {
    ws.send({ type: 'FIRE_CLIP', trackIndex, clipIndex });
  },
  stopClip: (trackIndex, clipIndex) => {
    ws.send({ type: 'STOP_CLIP', trackIndex, clipIndex });
  },
  requestClips: () => {
    if (!get().clipsLoaded && !get().clipsLoading) {
      set({ clipsLoading: true });
      ws.send({ type: 'REQUEST_CLIPS' });
    }
  },
  refreshClips: () => {
    set({ clipsLoaded: false, clipsLoading: true });
    ws.send({ type: 'REQUEST_CLIPS' });
  },

  // ── UI ────────────────────────────────────────────────────────────────────────
  setActiveView: (view) => {
    set({ activeView: view });
    if (view === 'session') {
      get().requestClips();
    }
  },

  setWsStatus: (status) => set({ wsStatus: status }),
}));

export default useStore;
