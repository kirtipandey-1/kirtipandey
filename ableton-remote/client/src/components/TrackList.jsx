import useStore from '../store/useStore';
import TrackRow from './TrackRow';

export default function TrackList() {
  const tracks = useStore(s => s.tracks);
  const abletonConnected = useStore(s => s.abletonConnected);

  if (!abletonConnected) return null;

  if (tracks.length === 0) {
    return (
      <div className="bg-bg-card rounded-2xl p-6 text-center">
        <p className="text-text-muted text-sm">No tracks found.<br />Make sure you have tracks in your Ableton session.</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card rounded-2xl p-4">
      <p className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-3">
        Tracks ({tracks.length})
      </p>
      <div className="flex flex-col gap-2">
        {tracks.map(track => (
          <TrackRow key={track.index} track={track} />
        ))}
      </div>
    </div>
  );
}
