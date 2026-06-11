// Last-resort recovery surface. A render-time throw anywhere in the tree
// (a hand-edited backup missing `attacks`, a malformed imported monster,
// an inline stat-block edit gone wrong) would otherwise unmount React and
// leave a blank window in the packaged app with devtools closed. This
// boundary catches that and offers two escape hatches: download a raw
// backup of the saved data (read straight from localStorage, so it works
// even when the app state is the thing that's broken) and reload.
//
// Intentionally self-contained — it imports nothing from the app's own
// modules so it stays functional regardless of what broke. The storage key
// mirrors STORAGE_KEY in state.js (stable: it keeps its historical "v1"
// suffix for backwards-compat and won't change).

import { Component } from 'react';

const STORAGE_KEY = 'grimoire.state.v1';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // In a packaged build this is effectively the only place the stack
    // lands, so keep it even though it's noisy in dev.
    console.error('[grimoire] render error caught by boundary:', error, info);
  }

  downloadBackup = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        alert('No saved Grimoire data found to back up.');
        return;
      }
      const blob = new Blob([raw], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `grimoire-recovery-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Could not read saved data: ' + (e?.message || e));
    }
  };

  reload = () => window.location.reload();

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        className="flex items-center justify-center p-6"
        style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg)' }}
      >
        <div className="max-w-lg w-full bg-card border border-crimson rounded-sm p-6">
          <h1 className="font-display text-gold text-xl uppercase tracking-wider mb-2">
            Something broke
          </h1>
          <p className="text-fade text-sm mb-4 leading-relaxed">
            Grimoire hit a rendering error. Your saved data is still on disk —
            download a backup before reloading, just in case the reload lands
            on the same bad data.
          </p>
          <pre className="font-cmd text-xs text-crimson bg-grimoire border border-gold rounded-sm p-2 mb-4 overflow-x-auto whitespace-pre-wrap">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={this.downloadBackup}
              className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold-strong px-3 py-1.5 hover:bg-active transition"
            >
              ⬇ download backup
            </button>
            <button
              onClick={this.reload}
              className="text-xs font-cmd uppercase tracking-wider text-parchment border border-gold px-3 py-1.5 hover:bg-active transition"
            >
              ↻ reload
            </button>
          </div>
          <p className="text-fade text-[11px] italic mt-4">
            If a reload keeps landing here, the saved data itself is likely the
            problem — import a known-good backup from Settings, or move the
            downloaded file aside and clear the app's storage.
          </p>
        </div>
      </div>
    );
  }
}
