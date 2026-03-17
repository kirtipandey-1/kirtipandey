import React from "react";
import { Play, Pause, Download, Check, Loader2 } from "lucide-react";
import useStore from "../store/useStore";

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function fmtDuration(secs) {
  if (!secs) return "";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function TrackRow({ track, queue, index }) {
  const { currentTrack, isPlaying, playTrack, downloads } = useStore();
  const isActive = currentTrack?.id === track.id;
  const dlInfo = downloads[track.id];

  return (
    <button
      onClick={() => playTrack(track, queue)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
        isActive ? "bg-accent/20" : "hover:bg-bg-hover"
      }`}
    >
      {/* Play indicator */}
      <div className="w-8 h-8 shrink-0 flex items-center justify-center">
        {isActive ? (
          <div className="text-accent">
            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </div>
        ) : (
          <span className="text-muted text-sm tabular-nums">{index + 1}</span>
        )}
      </div>

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate leading-tight ${isActive ? "text-accent" : "text-white"}`}>
          {track.title}
        </p>
        <p className="text-xs text-muted truncate mt-0.5">
          {track.artist}
          {track.album ? ` • ${track.album}` : ""}
        </p>
      </div>

      {/* Metadata + download state */}
      <div className="flex items-center gap-2 text-xs text-muted shrink-0">
        {track.bitRate && <span>{track.bitRate}k</span>}
        {track.ext && <span className="uppercase">{track.ext}</span>}
        {track.length && <span>{fmtDuration(track.length)}</span>}
        {dlInfo?.state === "Completed" && <Check size={12} className="text-green-400" />}
        {dlInfo?.state && dlInfo.state !== "Completed" && (
          <span className="text-accent">{dlInfo.progress ?? 0}%</span>
        )}
      </div>
    </button>
  );
}
