import { useState, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import useStore from '../store/useStore';

export default function TempoControl() {
  const tempo    = useStore(s => s.tempo);
  const setTempo = useStore(s => s.setTempo);
  const tapTempo = useStore(s => s.tapTempo);
  const tapTimes = useStore(s => s.tapTempoTimes);
  const abletonConnected = useStore(s => s.abletonConnected);

  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const debounceRef = useRef(null);

  const disabled = !abletonConnected;

  function nudge(delta) {
    const next = Math.max(20, Math.min(999, Math.round((tempo + delta) * 10) / 10));
    setTempo(next);
  }

  function commitInput() {
    const val = parseFloat(inputVal);
    if (!isNaN(val) && val >= 20 && val <= 999) {
      setTempo(Math.round(val * 10) / 10);
    }
    setEditing(false);
  }

  const tapCount = tapTimes.filter(t => Date.now() - t < 4000).length;

  return (
    <div className="bg-bg-card rounded-2xl p-4">
      <p className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-3">Tempo</p>

      <div className="flex items-center gap-3">
        {/* Nudge down */}
        <button
          onClick={() => nudge(-1)}
          onContextMenu={(e) => { e.preventDefault(); nudge(-0.1); }}
          disabled={disabled}
          className="w-12 h-12 rounded-xl bg-bg-elevated flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
        >
          <Minus size={18} />
        </button>

        {/* BPM display / editor */}
        <div className="flex-1 text-center">
          {editing ? (
            <input
              autoFocus
              type="number"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onBlur={commitInput}
              onKeyDown={e => { if (e.key === 'Enter') commitInput(); if (e.key === 'Escape') setEditing(false); }}
              className="w-full text-center text-3xl font-bold bg-bg-elevated rounded-xl py-2 text-text-primary outline-none border border-accent"
              min={20} max={999} step={0.1}
            />
          ) : (
            <button
              onClick={() => { setInputVal(String(tempo)); setEditing(true); }}
              disabled={disabled}
              className="w-full py-2 rounded-xl active:bg-bg-elevated transition-colors disabled:opacity-40"
            >
              <span className="text-3xl font-bold text-text-primary tabular-nums">
                {tempo.toFixed(1)}
              </span>
              <span className="text-text-muted text-sm ml-1">BPM</span>
            </button>
          )}
        </div>

        {/* Nudge up */}
        <button
          onClick={() => nudge(1)}
          onContextMenu={(e) => { e.preventDefault(); nudge(0.1); }}
          disabled={disabled}
          className="w-12 h-12 rounded-xl bg-bg-elevated flex items-center justify-center active:scale-95 transition-transform disabled:opacity-40"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Tap tempo */}
      <button
        onClick={tapTempo}
        disabled={disabled}
        className="w-full mt-3 h-14 rounded-xl bg-bg-elevated text-text-primary font-semibold text-base active:bg-accent/30 active:scale-[0.98] transition-all disabled:opacity-40 select-none"
      >
        {tapCount >= 2
          ? `Tap  ·  ${tempo.toFixed(1)} BPM`
          : 'Tap Tempo'}
      </button>
    </div>
  );
}
