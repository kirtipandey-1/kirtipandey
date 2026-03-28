import useStore from '../store/useStore';

export default function ConnectionBanner() {
  const wsStatus = useStore(s => s.wsStatus);
  const abletonConnected = useStore(s => s.abletonConnected);

  if (wsStatus === 'connected' && abletonConnected) return null;

  const isWsIssue = wsStatus !== 'connected';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/90 backdrop-blur-sm">
      <div className="bg-bg-card rounded-2xl px-8 py-6 text-center max-w-xs w-full mx-4 border border-bg-elevated">
        <div className="w-12 h-12 rounded-full bg-bg-elevated flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">{isWsIssue ? '📡' : '🎹'}</span>
        </div>
        <p className="text-text-primary font-semibold text-lg mb-1">
          {isWsIssue ? 'Connecting to server...' : 'Ableton not responding'}
        </p>
        <p className="text-text-muted text-sm">
          {isWsIssue
            ? 'Make sure the bridge server is running on your computer.'
            : 'Open Ableton Live and make sure AbletonOSC is loaded under Preferences → MIDI.'}
        </p>
        {wsStatus === 'failed' && (
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-accent rounded-xl text-sm font-semibold active:scale-95 transition-transform"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
