import { Volume2 } from 'lucide-react';
import { useRef } from 'react';
import useStore from '../store/useStore';

export default function MasterVolume() {
  const masterVolume    = useStore(s => s.masterVolume);
  const setMasterVolume = useStore(s => s.setMasterVolume);
  const abletonConnected = useStore(s => s.abletonConnected);
  const debounceRef = useRef(null);

  function handleChange(e) {
    const value = parseFloat(e.target.value);
    // Optimistic update immediately in store
    useStore.setState({ masterVolume: value });
    // Debounce OSC send
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setMasterVolume(value), 150);
  }

  return (
    <div className="bg-bg-card rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-text-muted text-xs font-semibold uppercase tracking-wider">Master Volume</p>
        <div className="flex items-center gap-1 text-text-muted text-xs">
          <Volume2 size={14} />
          <span>{Math.round(masterVolume * 100)}%</span>
        </div>
      </div>
      <input
        type="range"
        min={0} max={1} step={0.01}
        value={masterVolume}
        onChange={handleChange}
        disabled={!abletonConnected}
        className="w-full disabled:opacity-40"
      />
    </div>
  );
}
