import { useRef } from 'react';
import useStore from '../store/useStore';

const TRACK_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

export default function TrackRow({ track }) {
  const setMute        = useStore(s => s.setMute);
  const setSolo        = useStore(s => s.setSolo);
  const setArm         = useStore(s => s.setArm);
  const setTrackVolume = useStore(s => s.setTrackVolume);
  const debounceRef    = useRef(null);

  const color = TRACK_COLORS[track.index % TRACK_COLORS.length];

  function handleVolume(e) {
    const value = parseFloat(e.target.value);
    useStore.setState(state => ({
      tracks: state.tracks.map(t => t.index === track.index ? { ...t, volume: value } : t),
    }));
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setTrackVolume(track.index, value), 150);
  }

  const btnBase = 'w-10 h-10 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform select-none';

  return (
    <div className="bg-bg-elevated rounded-xl p-3 flex flex-col gap-2">
      {/* Top row: color dot + name + mute / solo / arm */}
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="flex-1 text-sm font-medium text-text-primary truncate min-w-0">
          {track.name || `Track ${track.index + 1}`}
        </span>

        {/* Mute */}
        <button
          onClick={() => setMute(track.index, !track.mute)}
          className={`${btnBase} ${track.mute ? 'bg-warning text-bg-base' : 'bg-bg-card text-text-muted'}`}
        >
          M
        </button>

        {/* Solo */}
        <button
          onClick={() => setSolo(track.index, !track.solo)}
          className={`${btnBase} ${track.solo ? 'bg-success text-bg-base' : 'bg-bg-card text-text-muted'}`}
        >
          S
        </button>

        {/* Arm */}
        <button
          onClick={() => setArm(track.index, !track.arm)}
          className={`${btnBase} ${track.arm ? 'bg-danger text-white' : 'bg-bg-card text-text-muted'}`}
        >
          ●
        </button>
      </div>

      {/* Volume fader */}
      <input
        type="range"
        min={0} max={1} step={0.01}
        value={track.volume}
        onChange={handleVolume}
        className="w-full"
        style={{ '--thumb-color': color } as React.CSSProperties}
      />
    </div>
  );
}
