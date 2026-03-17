import React, { useEffect, useRef } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import Player from "./components/Player";
import NowPlayingSheet from "./components/NowPlayingSheet";
import HomePage from "./pages/HomePage";
import SearchPage from "./pages/SearchPage";
import LibraryPage from "./pages/LibraryPage";
import ArtistPage from "./pages/ArtistPage";
import useStore from "./store/useStore";
import { stream } from "./api/client";

export default function App() {
  const audioRef = useRef(null);
  const pollRef = useRef(null);
  const location = useLocation();

  const {
    currentTrack,
    isPlaying,
    volume,
    repeat,
    setIsPlaying,
    setProgress,
    setDuration,
    setIsBuffering,
    setDownload,
    playNext,
    downloads,
  } = useStore();

  // When track changes, trigger download then set audio src
  useEffect(() => {
    if (!currentTrack) return;
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.src = "";
    setProgress(0);
    setIsBuffering(true);

    const { username, filename } = currentTrack;
    if (!username || !filename) return;

    const trackId = `${username}::${filename}`;

    // Start download, then poll until ready
    stream.play(username, filename).catch(console.error);

    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const status = await stream.status(username, filename);
        setDownload(trackId, { state: status.state, progress: status.progress });

        if (status.ready) {
          clearInterval(pollRef.current);
          setIsBuffering(false);
          audio.src = stream.audioUrl(username, filename);
          audio.volume = volume;
          audio.play().catch(console.error);
          setIsPlaying(true);
        } else if (status.state === "Completed" && !status.ready) {
          // File finished but path may be slightly off; retry once
          setTimeout(() => {
            audio.src = stream.audioUrl(username, filename);
            audio.volume = volume;
            audio.play().catch(console.error);
            setIsPlaying(true);
            setIsBuffering(false);
          }, 500);
          clearInterval(pollRef.current);
        }
      } catch {
        // ignore transient errors
      }
    }, 1500);

    return () => clearInterval(pollRef.current);
  }, [currentTrack]);

  // Sync play/pause
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (isPlaying) {
      audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // Volume
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  return (
    <div className="flex flex-col h-full bg-bg-base text-white overflow-hidden">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => {
          const el = e.target;
          if (el.duration) setProgress(el.currentTime / el.duration);
        }}
        onDurationChange={(e) => setDuration(e.target.duration)}
        onEnded={() => {
          if (repeat === "one") {
            audioRef.current.currentTime = 0;
            audioRef.current.play();
          } else {
            playNext();
          }
        }}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
      />

      {/* Pages */}
      <div className="flex-1 overflow-y-auto pb-28">
        <Routes>
          <Route path="/" element={<HomePage audioRef={audioRef} />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/artist/:name" element={<ArtistPage />} />
        </Routes>
      </div>

      {/* Persistent player bar */}
      {currentTrack && <Player audioRef={audioRef} />}

      {/* Bottom navigation */}
      <BottomNav />

      {/* Now Playing full-screen sheet */}
      <NowPlayingSheet audioRef={audioRef} />
    </div>
  );
}
