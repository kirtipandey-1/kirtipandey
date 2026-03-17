import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "/api";

const api = axios.create({ baseURL: BASE, timeout: 15000 });

export const search = {
  start: (query) => api.post("/search/start", { query }).then((r) => r.data),
  poll: (id) => api.get(`/search/${id}`).then((r) => r.data),
  stop: (id) => api.delete(`/search/${id}`).then((r) => r.data),
};

export const stream = {
  play: (username, filename) =>
    api.post("/stream/play", { username, filename }).then((r) => r.data),
  status: (username, filename) =>
    api.get("/stream/status", { params: { username, filename } }).then((r) => r.data),
  audioUrl: (username, filename) =>
    `${BASE}/stream/audio?username=${encodeURIComponent(username)}&filename=${encodeURIComponent(filename)}`,
};

export const library = {
  all: () => api.get("/library").then((r) => r.data),
  artists: () => api.get("/library/artists").then((r) => r.data),
  albums: () => api.get("/library/albums").then((r) => r.data),
};

export const recommendations = {
  similar: (artist, track) =>
    api.get("/recommendations", { params: { artist, track } }).then((r) => r.data),
  topTracks: (artist) =>
    api.get("/recommendations/top", { params: { artist } }).then((r) => r.data),
  artistInfo: (artist) =>
    api.get("/recommendations/artist-info", { params: { artist } }).then((r) => r.data),
};

export const health = () => api.get("/health").then((r) => r.data);

export default api;
