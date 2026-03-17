import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Loader2, Music, Users, Disc3, ChevronRight } from "lucide-react";
import { library } from "../api/client";
import useStore from "../store/useStore";
import TrackRow from "../components/TrackRow";

export default function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get("view") || "all";
  const [artists, setArtists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(false);
  const { libraryTracks, setLibraryTracks } = useStore();

  const setView = (v) => setSearchParams(v === "all" ? {} : { view: v });

  useEffect(() => {
    setLoading(true);
    const fetches = [library.all()];
    if (view === "artists") fetches.push(library.artists());
    if (view === "albums") fetches.push(library.albums());

    Promise.all(fetches)
      .then(([allData, extraData]) => {
        setLibraryTracks(allData.tracks || []);
        if (view === "artists" && extraData) setArtists(extraData.artists || []);
        if (view === "albums" && extraData) setAlbums(extraData.albums || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [view]);

  const tabs = [
    { id: "all", label: "Songs", icon: Music },
    { id: "artists", label: "Artists", icon: Users },
    { id: "albums", label: "Albums", icon: Disc3 },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-6 pb-3 safe-top sticky top-0 bg-bg-base z-10">
        <h1 className="text-xl font-bold mb-4">Library</h1>
        {/* Tabs */}
        <div className="flex gap-1 bg-bg-elevated rounded-xl p-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                view === id ? "bg-accent text-white" : "text-muted hover:text-white"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-muted" />
          </div>
        ) : view === "all" ? (
          libraryTracks.length > 0 ? (
            <div className="space-y-1">
              {libraryTracks.map((track, i) => (
                <TrackRow key={track.id} track={track} queue={libraryTracks} index={i} />
              ))}
            </div>
          ) : (
            <EmptyState />
          )
        ) : view === "artists" ? (
          artists.length > 0 ? (
            <div className="space-y-1">
              {artists.map((artist) => (
                <Link
                  key={artist.name}
                  to={`/artist/${encodeURIComponent(artist.name)}`}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-bg-hover transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-bg-elevated flex items-center justify-center text-lg shrink-0">
                    🎤
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{artist.name || "Unknown Artist"}</p>
                    <p className="text-xs text-muted">{artist.trackCount} song{artist.trackCount !== 1 ? "s" : ""}</p>
                  </div>
                  <ChevronRight size={16} className="text-muted" />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState />
          )
        ) : (
          albums.length > 0 ? (
            <div className="space-y-3">
              {albums.map((album) => (
                <div key={`${album.artist}|${album.album}`} className="bg-bg-card rounded-xl overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-bg-elevated flex items-center justify-center text-lg shrink-0">
                      💿
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{album.album}</p>
                      <p className="text-xs text-muted truncate">{album.artist}</p>
                    </div>
                  </div>
                  <div className="px-2 pb-2 space-y-0.5">
                    {album.tracks.map((track, i) => (
                      <TrackRow key={track.id} track={track} queue={album.tracks} index={i} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState />
          )
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 text-muted">
      <p className="text-4xl mb-3">📁</p>
      <p className="text-sm font-medium">Nothing here yet</p>
      <p className="text-xs mt-1">Songs you play will be downloaded here</p>
    </div>
  );
}
