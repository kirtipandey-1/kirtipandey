import { useEffect } from 'react';
import { Sliders, Grid3x3 } from 'lucide-react';
import ws from './ws';
import useStore from './store/useStore';
import ConnectionBanner from './components/ConnectionBanner';
import Transport from './components/Transport';
import TempoControl from './components/TempoControl';
import MasterVolume from './components/MasterVolume';
import TrackList from './components/TrackList';
import ClipGrid from './components/ClipGrid';

export default function App() {
  const applyServerState = useStore(s => s.applyServerState);
  const setWsStatus      = useStore(s => s.setWsStatus);
  const activeView       = useStore(s => s.activeView);
  const setActiveView    = useStore(s => s.setActiveView);
  const isPlaying        = useStore(s => s.isPlaying);
  const tempo            = useStore(s => s.tempo);
  const abletonConnected = useStore(s => s.abletonConnected);

  useEffect(() => {
    const offMsg    = ws.onMessage(applyServerState);
    const offStatus = ws.onStatusChange(setWsStatus);
    ws.connect();
    return () => { offMsg(); offStatus(); };
  }, []);

  const tabs = [
    { id: 'mixer',   label: 'Mixer',   Icon: Sliders },
    { id: 'session', label: 'Session', Icon: Grid3x3 },
  ];

  return (
    <div className="flex flex-col h-full bg-bg-base safe-top safe-bottom">
      <ConnectionBanner />

      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-2 pb-3 flex-shrink-0">
        <div>
          <h1 className="text-lg font-bold text-text-primary leading-none">Ableton Remote</h1>
          {abletonConnected && (
            <p className="text-text-muted text-xs mt-0.5 tabular-nums">
              {tempo.toFixed(1)} BPM · {isPlaying ? '▶ Playing' : '■ Stopped'}
            </p>
          )}
        </div>
        <div className={`w-2.5 h-2.5 rounded-full ${abletonConnected ? 'bg-success' : 'bg-danger'}`} />
      </header>

      {/* Scrollable content */}
      <main className="flex-1 scroll-area no-scrollbar px-4 pb-2 flex flex-col gap-3">
        {activeView === 'mixer' ? (
          <>
            <Transport />
            <TempoControl />
            <MasterVolume />
            <TrackList />
          </>
        ) : (
          <ClipGrid />
        )}
      </main>

      {/* Bottom tab bar */}
      <nav className="flex border-t border-bg-elevated flex-shrink-0 safe-bottom">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveView(id)}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 text-xs font-medium transition-colors
              ${activeView === id ? 'text-accent' : 'text-text-muted'}`}
          >
            <Icon size={20} strokeWidth={activeView === id ? 2.5 : 1.8} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
