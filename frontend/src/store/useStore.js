import { create } from "zustand";

const useStore = create((set, get) => ({
  // ─── Player ──────────────────────────────────────────────
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  progress: 0,       // 0-1
  duration: 0,
  volume: 0.8,
  shuffle: false,
  repeat: false,     // "none" | "one" | "all"
  isBuffering: false,

  setCurrentTrack: (track) => set({ currentTrack: track }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setProgress: (v) => set({ progress: v }),
  setDuration: (v) => set({ duration: v }),
  setVolume: (v) => set({ volume: v }),
  setIsBuffering: (v) => set({ isBuffering: v }),
  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  toggleRepeat: () =>
    set((s) => ({
      repeat: s.repeat === "none" ? "all" : s.repeat === "all" ? "one" : "none",
    })),

  // Play a track (optionally with a new queue)
  playTrack: (track, newQueue = null) => {
    const queue = newQueue ?? get().queue;
    const idx = queue.findIndex((t) => t.id === track.id);
    set({
      currentTrack: track,
      queue,
      queueIndex: idx >= 0 ? idx : 0,
      isPlaying: true,
      isBuffering: true,
    });
  },

  playNext: () => {
    const { queue, queueIndex, shuffle, repeat } = get();
    if (!queue.length) return;
    let next;
    if (shuffle) {
      next = Math.floor(Math.random() * queue.length);
    } else if (repeat === "one") {
      next = queueIndex;
    } else {
      next = (queueIndex + 1) % queue.length;
    }
    set({ currentTrack: queue[next], queueIndex: next, isPlaying: true, isBuffering: true });
  },

  playPrev: () => {
    const { queue, queueIndex } = get();
    if (!queue.length) return;
    const prev = (queueIndex - 1 + queue.length) % queue.length;
    set({ currentTrack: queue[prev], queueIndex: prev, isPlaying: true, isBuffering: true });
  },

  addToQueue: (track) =>
    set((s) => ({ queue: [...s.queue, track] })),

  // ─── Search ───────────────────────────────────────────────
  searchQuery: "",
  searchId: null,
  searchResults: [],
  isSearching: false,
  searchComplete: false,

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchId: (id) => set({ searchId: id }),
  setSearchResults: (tracks) => set({ searchResults: tracks }),
  setIsSearching: (v) => set({ isSearching: v }),
  setSearchComplete: (v) => set({ searchComplete: v }),
  clearSearch: () =>
    set({ searchQuery: "", searchId: null, searchResults: [], isSearching: false, searchComplete: false }),

  // ─── Library ──────────────────────────────────────────────
  libraryTracks: [],
  libraryView: "all",  // "all" | "artists" | "albums"
  setLibraryTracks: (t) => set({ libraryTracks: t }),
  setLibraryView: (v) => set({ libraryView: v }),

  // ─── Downloads ────────────────────────────────────────────
  downloads: {},  // trackId -> { state, progress }
  setDownload: (id, info) =>
    set((s) => ({ downloads: { ...s.downloads, [id]: info } })),

  // ─── UI ───────────────────────────────────────────────────
  showNowPlaying: false,
  setShowNowPlaying: (v) => set({ showNowPlaying: v }),
}));

export default useStore;
