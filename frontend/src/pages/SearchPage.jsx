import React, { useEffect, useRef, useState } from "react";
import { X, Search, Loader2, AlertCircle } from "lucide-react";
import { search as searchApi } from "../api/client";
import useStore from "../store/useStore";
import TrackRow from "../components/TrackRow";

const POLL_INTERVAL = 2000;
const POLL_TIMEOUT = 30000;

export default function SearchPage() {
  const inputRef = useRef(null);
  const pollRef = useRef(null);
  const startedAt = useRef(null);

  const {
    searchQuery,
    searchId,
    searchResults,
    isSearching,
    searchComplete,
    setSearchQuery,
    setSearchId,
    setSearchResults,
    setIsSearching,
    setSearchComplete,
    clearSearch,
  } = useStore();

  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all"); // "all" | "mp3" | "flac"

  // Focus on mount
  useEffect(() => {
    inputRef.current?.focus();
    return () => clearInterval(pollRef.current);
  }, []);

  const startSearch = async (q) => {
    if (!q.trim()) return;
    clearInterval(pollRef.current);
    setError("");
    setIsSearching(true);
    setSearchComplete(false);
    setSearchResults([]);

    try {
      const { id } = await searchApi.start(q.trim());
      setSearchId(id);
      startedAt.current = Date.now();

      pollRef.current = setInterval(async () => {
        try {
          const data = await searchApi.poll(id);
          setSearchResults(data.tracks || []);
          if (data.isComplete || Date.now() - startedAt.current > POLL_TIMEOUT) {
            clearInterval(pollRef.current);
            setIsSearching(false);
            setSearchComplete(true);
            searchApi.stop(id).catch(() => {});
          }
        } catch {
          clearInterval(pollRef.current);
          setIsSearching(false);
        }
      }, POLL_INTERVAL);
    } catch (err) {
      setIsSearching(false);
      setError("Search failed. Is slskd running?");
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    startSearch(searchQuery);
  };

  const handleClear = () => {
    clearSearch();
    clearInterval(pollRef.current);
    inputRef.current?.focus();
  };

  const filteredResults =
    filter === "all"
      ? searchResults
      : searchResults.filter((t) => t.ext === filter);

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-4 pt-6 pb-3 safe-top sticky top-0 bg-bg-base z-10">
        <form onSubmit={handleSubmit}>
          <div className="relative flex items-center">
            <Search size={16} className="absolute left-3 text-muted" />
            <input
              ref={inputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Artists, songs, albums…"
              className="w-full bg-bg-elevated rounded-xl pl-9 pr-10 py-3 text-sm outline-none focus:ring-2 focus:ring-accent/50 placeholder:text-muted"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClear}
                className="absolute right-3 text-muted hover:text-white"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </form>

        {/* Filter pills */}
        {searchResults.length > 0 && (
          <div className="flex gap-2 mt-3">
            {["all", "mp3", "flac"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === f
                    ? "bg-accent text-white"
                    : "bg-bg-elevated text-muted hover:text-white"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Status bar */}
      {(isSearching || searchComplete) && (
        <div className="px-4 py-2 flex items-center gap-2 text-xs text-muted">
          {isSearching && <Loader2 size={12} className="animate-spin" />}
          <span>
            {filteredResults.length} result{filteredResults.length !== 1 ? "s" : ""}
            {isSearching ? " — still searching…" : " — done"}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 bg-red-500/10 text-red-400 rounded-xl px-3 py-2 text-sm">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {filteredResults.length > 0 ? (
          <div className="space-y-1">
            {filteredResults.map((track, i) => (
              <TrackRow
                key={track.id}
                track={track}
                queue={filteredResults}
                index={i}
              />
            ))}
          </div>
        ) : searchComplete && filteredResults.length === 0 ? (
          <div className="text-center py-16 text-muted">
            <p className="text-3xl mb-3">🔍</p>
            <p className="text-sm">No results for "{searchQuery}"</p>
            <p className="text-xs mt-1">Try a different query or format filter</p>
          </div>
        ) : !isSearching && !searchQuery ? (
          <div className="text-center py-16 text-muted">
            <p className="text-4xl mb-3">🎶</p>
            <p className="text-sm font-medium">Find your music</p>
            <p className="text-xs mt-1">Search by artist, song, or album</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
