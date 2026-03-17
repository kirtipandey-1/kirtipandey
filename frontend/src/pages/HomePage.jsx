import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Wifi, WifiOff, Loader2, ChevronRight } from "lucide-react";
import { health, library } from "../api/client";
import useStore from "../store/useStore";
import TrackRow from "../components/TrackRow";

export default function HomePage() {
  const [connected, setConnected] = useState(null);
  const [recentTracks, setRecentTracks] = useState([]);
  const navigate = useNavigate();
  const { libraryTracks, setLibraryTracks, playTrack } = useStore();

  useEffect(() => {
    health()
      .then((data) => setConnected(data.slskd === true))
      .catch(() => setConnected(false));

    library
      .all()
      .then((data) => {
        setLibraryTracks(data.tracks || []);
        setRecentTracks((data.tracks || []).slice(0, 6));
      })
      .catch(() => {});
  }, []);

  return (
    <div className="px-4 pt-6 pb-4 safe-top">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Soulify</h1>
          <div className="flex items-center gap-1.5 mt-0.5">
            {connected === null ? (
              <Loader2 size={12} className="animate-spin text-muted" />
            ) : connected ? (
              <>
                <Wifi size={12} className="text-green-400" />
                <span className="text-xs text-green-400">Connected to Soulseek</span>
              </>
            ) : (
              <>
                <WifiOff size={12} className="text-red-400" />
                <span className="text-xs text-red-400">Not connected</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Search shortcut */}
      <button
        onClick={() => navigate("/search")}
        className="w-full flex items-center gap-3 bg-bg-elevated rounded-xl px-4 py-3 text-muted hover:bg-bg-hover transition-colors mb-8"
      >
        <Search size={18} />
        <span className="text-sm">Search for music…</span>
      </button>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <Link
          to="/library"
          className="bg-bg-card rounded-xl p-4 flex flex-col gap-1 hover:bg-bg-hover transition-colors"
        >
          <span className="text-3xl font-bold text-accent">{libraryTracks.length}</span>
          <span className="text-xs text-muted">Songs downloaded</span>
        </Link>
        <Link
          to="/library?view=artists"
          className="bg-bg-card rounded-xl p-4 flex flex-col gap-1 hover:bg-bg-hover transition-colors"
        >
          <span className="text-3xl font-bold text-accent">
            {new Set(libraryTracks.map((t) => t.artist)).size}
          </span>
          <span className="text-xs text-muted">Artists</span>
        </Link>
      </div>

      {/* Recent downloads */}
      {recentTracks.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Recently Downloaded</h2>
            <Link to="/library" className="flex items-center gap-0.5 text-xs text-accent">
              See all <ChevronRight size={14} />
            </Link>
          </div>
          <div className="space-y-1">
            {recentTracks.map((track, i) => (
              <TrackRow key={track.id} track={track} queue={recentTracks} index={i} />
            ))}
          </div>
        </section>
      )}

      {recentTracks.length === 0 && connected && (
        <div className="text-center py-12 text-muted">
          <p className="text-4xl mb-3">🎵</p>
          <p className="text-sm font-medium">No music yet</p>
          <p className="text-xs mt-1">Search for a song to get started</p>
        </div>
      )}
    </div>
  );
}
