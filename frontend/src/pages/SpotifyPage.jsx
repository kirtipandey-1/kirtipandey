import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Music2, Download, CheckCircle2, SkipForward, AlertCircle, Loader2, ChevronRight } from "lucide-react";
import { spotify } from "../api/client";

function isSpotifyUrl(url) {
  return /^https?:\/\/open\.spotify\.com\/(playlist|album|track|artist)\/[A-Za-z0-9]+/.test(url);
}

export default function SpotifyPage() {
  const [url, setUrl] = useState("");
  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null); // { status, downloaded, total, tracks, error }
  const [submitting, setSubmitting] = useState(false);
  const [urlError, setUrlError] = useState("");
  const pollRef = useRef(null);

  // Poll for job status while running
  useEffect(() => {
    if (!jobId) return;

    pollRef.current = setInterval(async () => {
      try {
        const data = await spotify.status(jobId);
        setJob(data);
        if (data.status === "done" || data.status === "error") {
          clearInterval(pollRef.current);
        }
      } catch {
        // transient error, keep polling
      }
    }, 2000);

    return () => clearInterval(pollRef.current);
  }, [jobId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setUrlError("");

    const trimmed = url.trim();
    if (!trimmed) {
      setUrlError("Please enter a Spotify URL.");
      return;
    }
    if (!isSpotifyUrl(trimmed)) {
      setUrlError("Must be a valid open.spotify.com playlist, album, or track URL.");
      return;
    }

    setSubmitting(true);
    try {
      const { jobId: id } = await spotify.download(trimmed);
      setJobId(id);
      setJob({ status: "running", downloaded: 0, total: 0, tracks: [], error: null });
    } catch (err) {
      setUrlError(err?.response?.data?.error || "Failed to start download.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    clearInterval(pollRef.current);
    setUrl("");
    setJobId(null);
    setJob(null);
    setUrlError("");
  }

  const isRunning = job?.status === "running";
  const isDone = job?.status === "done";
  const isError = job?.status === "error";
  const pct = job?.total > 0 ? Math.round((job.downloaded / job.total) * 100) : null;

  return (
    <div className="px-4 pt-6 pb-4 safe-top">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[#1DB954]/20 flex items-center justify-center shrink-0">
          <Music2 size={20} className="text-[#1DB954]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Spotify Importer</h1>
          <p className="text-xs text-muted">Paste a playlist, album, or track URL to download as MP3</p>
        </div>
      </div>

      {/* Input form — only show when no active job */}
      {!jobId && (
        <form onSubmit={handleSubmit} className="mb-6">
          <label className="block text-xs text-muted mb-1.5 font-medium">Spotify URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setUrlError(""); }}
            placeholder="https://open.spotify.com/playlist/…"
            className="w-full bg-bg-elevated rounded-xl px-4 py-3 text-sm placeholder:text-muted outline-none focus:ring-1 focus:ring-accent transition-shadow mb-2"
          />
          {urlError && (
            <p className="text-xs text-red-400 mb-2 flex items-center gap-1">
              <AlertCircle size={12} /> {urlError}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-[#1DB954] hover:bg-[#1ed760] active:bg-[#18a34a] disabled:opacity-50 text-black font-semibold rounded-xl py-3 text-sm transition-colors"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {submitting ? "Starting…" : "Download as MP3"}
          </button>
        </form>
      )}

      {/* Progress card */}
      {job && (
        <div className="bg-bg-card rounded-2xl p-4 mb-4">
          {/* Status row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {isRunning && <Loader2 size={15} className="animate-spin text-[#1DB954]" />}
              {isDone && <CheckCircle2 size={15} className="text-green-400" />}
              {isError && <AlertCircle size={15} className="text-red-400" />}
              <span className="text-sm font-semibold">
                {isRunning && "Downloading…"}
                {isDone && "All done!"}
                {isError && "Download failed"}
              </span>
            </div>
            {(isDone || isError) && (
              <button
                onClick={handleReset}
                className="text-xs text-muted hover:text-white transition-colors"
              >
                Start new
              </button>
            )}
          </div>

          {/* Progress bar */}
          {job.total > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-muted mb-1">
                <span>{job.downloaded} / {job.total} tracks</span>
                {pct !== null && <span>{pct}%</span>}
              </div>
              <div className="h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1DB954] rounded-full transition-all duration-500"
                  style={{ width: `${pct ?? 0}%` }}
                />
              </div>
            </div>
          )}

          {isRunning && job.total === 0 && (
            <p className="text-xs text-muted mb-3">Fetching playlist info from Spotify…</p>
          )}

          {isError && job.error && (
            <p className="text-xs text-red-400 mb-3 break-words">{job.error}</p>
          )}

          {isDone && (
            <Link
              to="/library"
              className="flex items-center gap-1 text-xs text-accent mb-3 hover:underline"
            >
              View in Library <ChevronRight size={13} />
            </Link>
          )}

          {/* Track list */}
          {job.tracks.length > 0 && (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {job.tracks.map((t, i) => (
                <div key={i} className="flex items-center gap-2 py-1">
                  {t.status === "done" ? (
                    <CheckCircle2 size={13} className="text-green-400 shrink-0" />
                  ) : (
                    <SkipForward size={13} className="text-muted shrink-0" />
                  )}
                  <span className="text-xs text-muted truncate">{t.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Info blurb */}
      {!jobId && (
        <div className="bg-bg-card rounded-2xl p-4 text-xs text-muted space-y-1.5">
          <p className="font-medium text-white text-sm">How it works</p>
          <p>1. Paste any public Spotify playlist, album, or track URL above.</p>
          <p>2. Tracks are found on YouTube and downloaded as MP3 automatically.</p>
          <p>3. Files are saved to your library — find them in the Library tab.</p>
          <p className="pt-1 text-[10px]">Powered by spotdl. No Spotify account required.</p>
        </div>
      )}
    </div>
  );
}
