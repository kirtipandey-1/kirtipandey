import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2, Search } from "lucide-react";
import { recommendations as recsApi } from "../api/client";
import useStore from "../store/useStore";
import TrackRow from "../components/TrackRow";

export default function ArtistPage() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [artistInfo, setArtistInfo] = useState(null);
  const [topTracks, setTopTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  const { libraryTracks, setSearchQuery, setShowNowPlaying } = useStore();
  const artistLibraryTracks = libraryTracks.filter(
    (t) => t.artist.toLowerCase() === decodeURIComponent(name).toLowerCase()
  );

  useEffect(() => {
    const artistName = decodeURIComponent(name);
    setLoading(true);
    Promise.all([
      recsApi.artistInfo(artistName).catch(() => ({ artist: null })),
      recsApi.topTracks(artistName).catch(() => ({ tracks: [] })),
    ])
      .then(([infoData, topData]) => {
        setArtistInfo(infoData.artist);
        setTopTracks(topData.tracks || []);
      })
      .finally(() => setLoading(false));
  }, [name]);

  const decodedName = decodeURIComponent(name);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div
        className="relative px-4 pt-12 pb-6 safe-top"
        style={{
          background: `linear-gradient(to bottom, hsl(${(decodedName.charCodeAt(0) * 47) % 360},40%,20%), #0f0f0f)`,
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 text-white/80 hover:text-white safe-top"
          style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
        >
          <ChevronLeft size={28} />
        </button>
        <div className="mt-8">
          <p className="text-xs text-white/60 uppercase tracking-wider font-medium mb-1">Artist</p>
          <h1 className="text-3xl font-bold">{decodedName}</h1>
          {artistInfo?.bio && (
            <p className="text-sm text-white/70 mt-2 line-clamp-3">{artistInfo.bio}</p>
          )}
        </div>
      </div>

      <div className="px-4 pb-8">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted" />
          </div>
        ) : (
          <>
            {/* Songs in library */}
            {artistLibraryTracks.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
                  In Your Library
                </h2>
                <div className="space-y-1">
                  {artistLibraryTracks.map((t, i) => (
                    <TrackRow key={t.id} track={t} queue={artistLibraryTracks} index={i} />
                  ))}
                </div>
              </section>
            )}

            {/* Top tracks from Last.fm */}
            {topTracks.length > 0 && (
              <section className="mb-6">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
                  Popular Tracks
                </h2>
                <div className="space-y-1">
                  {topTracks.map((t, i) => (
                    <button
                      key={t.query}
                      onClick={() => {
                        setSearchQuery(t.query);
                        navigate("/search");
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-bg-hover transition-colors text-left"
                    >
                      <span className="text-muted text-sm tabular-nums w-6 text-center">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <p className="text-xs text-muted">{t.artist}</p>
                      </div>
                      <Search size={14} className="text-muted shrink-0" />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Similar artists */}
            {artistInfo?.similar?.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
                  Similar Artists
                </h2>
                <div className="flex flex-wrap gap-2">
                  {artistInfo.similar.map((a) => (
                    <button
                      key={a}
                      onClick={() => navigate(`/artist/${encodeURIComponent(a)}`)}
                      className="px-3 py-1.5 bg-bg-elevated rounded-full text-sm hover:bg-bg-hover transition-colors"
                    >
                      {a}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
