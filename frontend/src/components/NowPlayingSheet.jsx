import React, { useEffect, useState } from "react";
import {
  ChevronDown,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  Plus,
  Loader2,
} from "lucide-react";
import useStore from "../store/useStore";
import { recommendations } from "../api/client";

function formatTime(secs) {
  if (!secs || isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function ArtworkPlaceholder({ track }) {
  const hue = track
    ? (track.artist.charCodeAt(0) * 47 + track.title.charCodeAt(0) * 31) % 360
    : 280;
  return (
    <div
      className="w-full aspect-square rounded-2xl flex items-center justify-center text-6xl select-none"
      style={{
        background: `linear-gradient(135deg, hsl(${hue},60%,20%), hsl(${(hue + 60) % 360},60%,30%))`,
      }}
    >
      🎵
    </div>
  );
}

export default function NowPlayingSheet({ audioRef }) {
  const {
    showNowPlaying,
    setShowNowPlaying,
    currentTrack,
    isPlaying,
    isBuffering,
    progress,
    duration,
    volume,
    shuffle,
    repeat,
    setIsPlaying,
    setProgress,
    setVolume,
    toggleShuffle,
    toggleRepeat,
    playNext,
    playPrev,
    addToQueue,
    downloads,
    playTrack,
  } = useStore();

  const [recs, setRecs] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  useEffect(() => {
    if (!currentTrack || !showNowPlaying) return;
    setLoadingRecs(true);
    recommendations
      .similar(currentTrack.artist, currentTrack.title)
      .then((data) => setRecs(data.tracks || []))
      .catch(() => setRecs([]))
      .finally(() => setLoadingRecs(false));
  }, [currentTrack?.id, showNowPlaying]);

  if (!showNowPlaying || !currentTrack) return null;

  const elapsed = duration * progress;

  const handleSeek = (e) => {
    const val = parseFloat(e.target.value);
    setProgress(val);
    if (audioRef.current?.duration) {
      audioRef.current.currentTime = val * audioRef.current.duration;
    }
  };

  const dlInfo = downloads[currentTrack.id] || {};
  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;

  return (
    <div className="fixed inset-0 z-50 bg-bg-base flex flex-col safe-top safe-bottom overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => setShowNowPlaying(false)} className="text-muted hover:text-white">
          <ChevronDown size={28} />
        </button>
        <span className="text-sm font-semibold text-muted">Now Playing</span>
        <div className="w-7" />
      </div>

      {/* Artwork */}
      <div className="px-8 mt-4">
        <ArtworkPlaceholder track={currentTrack} />
      </div>

      {/* Title + Artist */}
      <div className="px-6 mt-6">
        <h2 className="text-2xl font-bold leading-tight truncate">{currentTrack.title}</h2>
        <p className="text-muted text-base mt-1 truncate">{currentTrack.artist}</p>
        {dlInfo.state && dlInfo.state !== "Completed" && (
          <p className="text-xs text-accent mt-1">
            Downloading… {dlInfo.progress ?? 0}%
          </p>
        )}
      </div>

      {/* Seek bar */}
      <div className="px-6 mt-6">
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={handleSeek}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-muted mt-1 tabular-nums">
          <span>{formatTime(elapsed)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="px-6 mt-4 flex items-center justify-between">
        <button
          onClick={toggleShuffle}
          className={`p-2 ${shuffle ? "text-accent" : "text-muted"} hover:text-white`}
        >
          <Shuffle size={20} />
        </button>
        <button onClick={playPrev} className="p-2 text-white">
          <SkipBack size={28} fill="white" />
        </button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-16 h-16 rounded-full bg-white flex items-center justify-center hover:scale-105 transition-transform"
        >
          {isBuffering ? (
            <Loader2 size={28} className="animate-spin text-black" />
          ) : isPlaying ? (
            <Pause size={28} fill="black" color="black" />
          ) : (
            <Play size={28} fill="black" color="black" />
          )}
        </button>
        <button onClick={playNext} className="p-2 text-white">
          <SkipForward size={28} fill="white" />
        </button>
        <button
          onClick={toggleRepeat}
          className={`p-2 ${repeat !== "none" ? "text-accent" : "text-muted"} hover:text-white`}
        >
          <RepeatIcon size={20} />
        </button>
      </div>

      {/* Volume */}
      <div className="px-6 mt-4 flex items-center gap-3">
        <Volume2 size={16} className="text-muted shrink-0" />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="flex-1"
        />
      </div>

      {/* Recommendations */}
      {recs.length > 0 && (
        <div className="px-4 mt-8 pb-6">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            Similar Tracks
          </h3>
          {recs.slice(0, 8).map((rec) => (
            <button
              key={rec.query}
              onClick={() => {
                const fakeTrack = {
                  id: rec.query,
                  title: rec.title,
                  artist: rec.artist,
                  // username/filename will be searched when played
                  _needsSearch: true,
                  query: rec.query,
                };
                addToQueue(fakeTrack);
              }}
              className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-bg-hover rounded-lg px-2 transition-colors group"
            >
              <div className="w-9 h-9 rounded bg-bg-elevated flex items-center justify-center text-lg shrink-0">
                🎵
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{rec.title}</p>
                <p className="text-xs text-muted truncate">{rec.artist}</p>
              </div>
              <Plus size={16} className="text-muted group-hover:text-accent shrink-0" />
            </button>
          ))}
        </div>
      )}
      {loadingRecs && (
        <div className="flex justify-center py-6">
          <Loader2 size={20} className="animate-spin text-muted" />
        </div>
      )}
    </div>
  );
}
