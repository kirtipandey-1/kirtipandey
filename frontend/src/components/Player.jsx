import React from "react";
import { Play, Pause, SkipForward, SkipBack, Loader2 } from "lucide-react";
import useStore from "../store/useStore";

function formatTime(secs) {
  if (!secs || isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function Player({ audioRef }) {
  const {
    currentTrack,
    isPlaying,
    isBuffering,
    progress,
    duration,
    setIsPlaying,
    setProgress,
    playNext,
    playPrev,
    setShowNowPlaying,
  } = useStore();

  if (!currentTrack) return null;

  const handleSeek = (e) => {
    const val = parseFloat(e.target.value);
    setProgress(val);
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = val * audioRef.current.duration;
    }
  };

  const elapsed = duration * progress;

  return (
    <div
      className="fixed bottom-14 left-0 right-0 z-30 bg-bg-card border-t border-white/5 px-4 pt-2 pb-1"
      style={{ paddingBottom: "calc(0.25rem)" }}
    >
      {/* Progress bar */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={progress}
        onChange={handleSeek}
        className="w-full h-1 mb-2"
      />

      <div className="flex items-center gap-3">
        {/* Track info — tap to open full player */}
        <button
          className="flex-1 text-left min-w-0"
          onClick={() => setShowNowPlaying(true)}
        >
          <p className="text-sm font-semibold truncate leading-tight">
            {currentTrack.title}
          </p>
          <p className="text-xs text-muted truncate">{currentTrack.artist}</p>
        </button>

        {/* Time */}
        <span className="text-xs text-muted tabular-nums whitespace-nowrap">
          {formatTime(elapsed)} / {formatTime(duration)}
        </span>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button onClick={playPrev} className="p-1 text-muted hover:text-white transition-colors">
            <SkipBack size={18} />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-9 h-9 rounded-full bg-accent flex items-center justify-center hover:bg-accent-light transition-colors"
          >
            {isBuffering ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isPlaying ? (
              <Pause size={16} fill="white" />
            ) : (
              <Play size={16} fill="white" />
            )}
          </button>
          <button onClick={playNext} className="p-1 text-muted hover:text-white transition-colors">
            <SkipForward size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
