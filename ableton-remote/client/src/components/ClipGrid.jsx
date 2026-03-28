import { RefreshCw } from 'lucide-react';
import useStore from '../store/useStore';

const TRACK_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

const NUM_CLIPS = 8; // rows per track

function ClipCell({ clip, trackIndex, clipIndex }) {
  const fireClip = useStore(s => s.fireClip);
  const stopClip = useStore(s => s.stopClip);
  const color    = TRACK_COLORS[trackIndex % TRACK_COLORS.length];

  if (!clip || clip.state === 'empty') {
    return (
      <div className="w-14 h-14 rounded-lg bg-bg-base border border-bg-elevated/50 flex-shrink-0" />
    );
  }

  const isPlaying    = clip.state === 'playing';
  const isTriggered  = clip.state === 'triggered';

  return (
    <button
      onClick={() => isPlaying ? stopClip(trackIndex, clipIndex) : fireClip(trackIndex, clipIndex)}
      className={`w-14 h-14 rounded-lg flex-shrink-0 flex items-end justify-start p-1.5 active:scale-90 transition-transform select-none
        ${isPlaying   ? 'clip-playing'   : ''}
        ${isTriggered ? 'clip-triggered' : ''}
      `}
      style={{
        backgroundColor: isPlaying || isTriggered
          ? color
          : `${color}33`,  // 20% opacity when stopped
        border: `2px solid ${color}`,
      }}
    >
      <span className="text-white text-[9px] leading-tight line-clamp-2 text-left font-medium drop-shadow">
        {clip.name || ''}
      </span>
    </button>
  );
}

export default function ClipGrid() {
  const tracks        = useStore(s => s.tracks);
  const clips         = useStore(s => s.clips);
  const clipsLoaded   = useStore(s => s.clipsLoaded);
  const clipsLoading  = useStore(s => s.clipsLoading);
  const refreshClips  = useStore(s => s.refreshClips);
  const abletonConnected = useStore(s => s.abletonConnected);

  if (!abletonConnected) return null;

  if (clipsLoading) {
    return (
      <div className="bg-bg-card rounded-2xl p-6 text-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-text-muted text-sm">Loading clips…</p>
      </div>
    );
  }

  if (!clipsLoaded) {
    return (
      <div className="bg-bg-card rounded-2xl p-6 text-center">
        <p className="text-text-muted text-sm mb-3">Clips not yet loaded</p>
        <button
          onClick={refreshClips}
          className="px-4 py-2 bg-accent rounded-xl text-sm font-semibold active:scale-95 transition-transform"
        >
          Load Clips
        </button>
      </div>
    );
  }

  // Build a quick lookup: "trackIndex_clipIndex" -> clip
  const clipMap = {};
  for (const c of clips) {
    clipMap[`${c.trackIndex}_${c.clipIndex}`] = c;
  }

  return (
    <div className="bg-bg-card rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-text-muted text-xs font-semibold uppercase tracking-wider">Session View</p>
        <button
          onClick={refreshClips}
          className="w-8 h-8 rounded-lg bg-bg-elevated flex items-center justify-center active:scale-90 transition-transform"
        >
          <RefreshCw size={14} className="text-text-muted" />
        </button>
      </div>

      {/* Grid: columns = tracks, rows = clip slots */}
      <div className="scroll-x no-scrollbar">
        <div className="flex gap-2 pb-2" style={{ width: 'max-content' }}>
          {tracks.map(track => (
            <div key={track.index} className="flex flex-col gap-2">
              {/* Track label */}
              <div
                className="w-14 text-center text-[10px] font-semibold truncate px-0.5"
                style={{ color: TRACK_COLORS[track.index % TRACK_COLORS.length] }}
              >
                {track.name || `T${track.index + 1}`}
              </div>

              {/* Clip cells */}
              {Array.from({ length: NUM_CLIPS }, (_, ci) => (
                <ClipCell
                  key={ci}
                  clip={clipMap[`${track.index}_${ci}`]}
                  trackIndex={track.index}
                  clipIndex={ci}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
