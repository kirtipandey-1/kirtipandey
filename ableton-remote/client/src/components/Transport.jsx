import { Play, Square, Circle } from 'lucide-react';
import useStore from '../store/useStore';

export default function Transport() {
  const isPlaying    = useStore(s => s.isPlaying);
  const isRecording  = useStore(s => s.isRecording);
  const play         = useStore(s => s.play);
  const stop         = useStore(s => s.stop);
  const record       = useStore(s => s.record);
  const abletonConnected = useStore(s => s.abletonConnected);

  const disabled = !abletonConnected;

  return (
    <div className="bg-bg-card rounded-2xl p-4">
      <p className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-3">Transport</p>
      <div className="flex gap-3">
        {/* Play */}
        <button
          onClick={play}
          disabled={disabled}
          className={`flex-1 flex items-center justify-center gap-2 h-14 rounded-xl font-semibold text-sm transition-all active:scale-95
            ${isPlaying
              ? 'bg-success text-white'
              : 'bg-bg-elevated text-text-primary hover:bg-accent/20'}
            disabled:opacity-40`}
        >
          <Play size={20} fill={isPlaying ? 'white' : 'none'} />
          <span>Play</span>
        </button>

        {/* Stop */}
        <button
          onClick={stop}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-2 h-14 rounded-xl bg-bg-elevated text-text-primary font-semibold text-sm transition-all active:scale-95 hover:bg-white/10 disabled:opacity-40"
        >
          <Square size={20} />
          <span>Stop</span>
        </button>

        {/* Record */}
        <button
          onClick={record}
          disabled={disabled}
          className={`flex-1 flex items-center justify-center gap-2 h-14 rounded-xl font-semibold text-sm transition-all active:scale-95
            ${isRecording
              ? 'bg-danger text-white'
              : 'bg-bg-elevated text-text-primary hover:bg-danger/20'}
            disabled:opacity-40`}
        >
          <Circle size={20} fill={isRecording ? 'white' : 'none'} />
          <span>Rec</span>
        </button>
      </div>
    </div>
  );
}
