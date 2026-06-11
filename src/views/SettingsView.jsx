import { useEffect, useRef, useState } from 'react';
import { THEMES, FONT_PRESETS } from '../themes.js';
import { SectionCard } from '../components.jsx';
import { downloadExport, parseImport } from '../state.js';

export default function SettingsView({ settings, setSettings, state, replaceState }) {
  return (
    <main className="px-6 pb-12 max-w-5xl mx-auto relative z-10 flex flex-col gap-4">
      <UpdatesSection />

      <BackupRestoreSection state={state} replaceState={replaceState} />

      <SectionCard title="Theme">
        <p className="text-fade text-sm italic mb-4">
          Color palette. Each theme shifts the primary accent and danger hues while preserving role semantics.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {THEMES.map(t => (
            <ThemeCard key={t.id}
              theme={t}
              active={settings.theme === t.id}
              onSelect={() => setSettings(s => ({ ...s, theme: t.id }))}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Fonts">
        <p className="text-fade text-sm italic mb-4">
          Type combinations: display (headings), body (prose), and command output. Click a card to apply.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {FONT_PRESETS.map(p => (
            <FontCard key={p.id}
              preset={p}
              active={settings.fontPreset === p.id}
              onSelect={() => setSettings(s => ({ ...s, fontPreset: p.id }))}
            />
          ))}
        </div>
      </SectionCard>

      <ModeSection settings={settings} setSettings={setSettings} />

      <CreditsSection />
    </main>
  );
}

// ─── Mode (Player ⇄ DM) ──────────────────────────────────────────────────
// Toggles the entire app between Player mode (character vault + per-PC
// surfaces) and DM mode (bestiary + monster-driven Roll). Persisted in
// settings.dmMode so the choice survives reloads. Switching is non-
// destructive — your character vault, modifiers, targets, etc. all stay
// in localStorage when you flip into DM mode and come back exactly as
// you left them.

function ModeSection({ settings, setSettings }) {
  const dmMode = !!settings.dmMode;
  const toggle = () => setSettings(s => ({ ...s, dmMode: !s.dmMode }));
  return (
    <SectionCard title="Mode">
      <p className="text-fade text-sm italic mb-4">
        {dmMode
          ? 'Currently in DM mode — the header shows Bestiary instead of Vault, and Roll operates over active monsters. Switching back restores your character vault.'
          : 'Currently in Player mode — character vault, Roll/Character tabs, and per-character data. Switch to DM mode for the bestiary and monster-driven Roll page.'}
      </p>
      <button
        type="button"
        onClick={toggle}
        className="text-xs font-cmd uppercase tracking-wider border border-gold-strong px-3 py-1.5 hover:bg-active transition"
        style={{ color: 'var(--color-gold)' }}
      >
        {dmMode ? '← Switch to Player mode' : 'Switch to DM mode →'}
      </button>
    </SectionCard>
  );
}

// ─── Credits ──────────────────────────────────────────────────────────────
// Attribution for assets that aren't ours. External links go through the
// main-process shell.openExternal IPC bridge (same one Updates uses for
// the "open releases page" button) so the URL opens in the user's actual
// browser instead of inside the Electron renderer.

function CreditsSection() {
  const openLink = (e, url) => {
    e.preventDefault();
    if (bridge?.openExternal) bridge.openExternal(url);
  };
  return (
    <SectionCard title="Credits">
      <p className="text-fade text-sm italic mb-3">
        Assets and contributions used in Grimoire that aren't ours.
      </p>
      <ul className="text-sm space-y-1.5">
        <li className="flex items-baseline gap-2">
          <span className="text-fade font-cmd text-xs uppercase tracking-wider w-20 flex-shrink-0">App icon</span>
          <span className="text-parchment">
            Photograph of a totally-eclipsed (“blood”) moon by{' '}
            <a
              href="https://x.com/AJamesMcCarthy"
              onClick={e => openLink(e, 'https://x.com/AJamesMcCarthy')}
              className="text-gold hover:text-parchment underline decoration-dotted underline-offset-2 transition cursor-pointer"
            >
              Andrew McCarthy (@AJamesMcCarthy)
            </a>
            {' '}— used with thanks. Cropped + downscaled to multi-resolution ICO for the desktop build.
          </span>
        </li>
      </ul>
    </SectionCard>
  );
}

// ─── Backup & Restore ────────────────────────────────────────────────────
// Manual JSON export / import. Cross-device sync is intentionally manual
// for now (the user moves the file via whatever cloud-storage they
// already use). The exported JSON matches the localStorage payload shape
// plus an `exportedAt` timestamp, so a roundtrip is lossless. Import
// fully replaces all data — there is no merge — gated by a confirm()
// since it's destructive.

function BackupRestoreSection({ state, replaceState }) {
  const [status, setStatus] = useState(null);
  const fileInputRef = useRef(null);

  const onExport = () => {
    try {
      const filename = downloadExport(state);
      setStatus({ ok: true, msg: `exported · ${filename}` });
    } catch (e) {
      setStatus({ ok: false, msg: e.message || String(e) });
    }
  };

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseImport(text);
      const ok = window.confirm(
        `Replace ALL current data with the contents of "${file.name}"?\n\n` +
        `Character, modifiers, targets, folders, and theme/font preferences ` +
        `on this device will be overwritten. This cannot be undone.\n\n` +
        `(Export first if you want to keep what's here.)`
      );
      if (!ok) {
        setStatus({ ok: false, msg: 'import cancelled' });
        return;
      }
      replaceState(parsed);
      // Post-migration the payload is the v4 vault shape (a `characters` map),
      // not the v1 single `character` field — report a count instead.
      const count = Object.keys(parsed.characters || {}).length;
      const noun = count === 1 ? 'character' : 'characters';
      setStatus({ ok: true, msg: `imported ${count} ${noun} from ${file.name}` });
    } catch (err) {
      setStatus({ ok: false, msg: err.message || String(err) });
    }
  };

  return (
    <SectionCard title="Backup & Restore">
      <p className="text-fade text-sm italic mb-4">
        Export everything on this device — character, modifiers, targets, folders, and theme/font preferences — to a JSON file you can stash anywhere (Dropbox, OneDrive, USB, email-to-self). Import on another device to replace its data with the contents of the file.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onExport}
          className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold-strong px-3 py-1.5 hover:bg-active transition"
        >
          ↑ Export to JSON
        </button>
        <button
          onClick={onPickFile}
          className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-parchment border border-gold px-3 py-1.5 hover:bg-active transition"
        >
          ↓ Import from JSON…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={onFileChange}
        />
        {status && (
          <span className={`text-xs font-cmd ${status.ok ? 'text-gold' : 'text-crimson'}`}>
            {status.msg}
          </span>
        )}
      </div>
      <p className="text-fade text-[11px] italic mt-3">
        Import replaces all data — there's no merge. The file's schema version must match this app's.
      </p>
      <SnapshotsPanel replaceState={replaceState} setStatus={setStatus} />
    </SectionCard>
  );
}

// Local automatic snapshots (Electron only). Same-machine crash protection —
// the main process writes a timestamped copy of the state every ~10 min and
// on close, keeping the newest 10. Restoring funnels through the same
// parseImport → replaceState path as a JSON import.
function SnapshotsPanel({ replaceState, setStatus }) {
  const [snaps, setSnaps] = useState(null);

  const refresh = async () => {
    if (!window.grimoire?.listSnapshots) return;
    const res = await window.grimoire.listSnapshots();
    if (res?.ok) setSnaps(res.snapshots);
  };

  useEffect(() => { refresh(); }, []);

  if (!window.grimoire?.listSnapshots) return null; // hidden outside Electron

  const restore = async (name) => {
    try {
      const res = await window.grimoire.readSnapshot(name);
      if (!res?.ok) throw new Error(res?.error || 'could not read snapshot');
      const parsed = parseImport(res.json);
      const ok = window.confirm(
        `Restore this snapshot?\n\nIt replaces ALL current data on this device. ` +
        `Export first if you want to keep what's here.`
      );
      if (!ok) return;
      replaceState(parsed);
      const count = Object.keys(parsed.characters || {}).length;
      setStatus({ ok: true, msg: `restored ${count} character${count === 1 ? '' : 's'} from snapshot` });
    } catch (e) {
      setStatus({ ok: false, msg: e.message || String(e) });
    }
  };

  return (
    <div className="mt-4 pt-3 border-t border-gold">
      <div className="flex items-baseline justify-between mb-1 gap-2">
        <div className="font-display text-xs text-gold uppercase tracking-wider">Snapshots on this machine</div>
        <button onClick={refresh} className="text-[10px] font-cmd uppercase tracking-wider text-fade hover:text-gold transition">
          refresh
        </button>
      </div>
      <p className="text-fade text-[11px] italic mb-2">
        Automatic local backups (every ~10 min and on close; newest 10 kept) — crash protection, separate from the JSON export above.
      </p>
      {snaps == null ? (
        <div className="text-fade italic text-xs">loading…</div>
      ) : snaps.length === 0 ? (
        <div className="text-fade italic text-xs">no snapshots yet — they start appearing after ~10 minutes of use</div>
      ) : (
        <div className="space-y-1 max-h-44 overflow-y-auto scrollbar-thin">
          {snaps.map(s => (
            <div key={s.name} className="flex items-center gap-2 text-xs font-cmd">
              <span className="text-parchment flex-1 truncate">{new Date(s.mtime).toLocaleString()}</span>
              <span className="text-fade flex-shrink-0">{Math.max(1, Math.round(s.size / 1024))} KB</span>
              <button
                onClick={() => restore(s.name)}
                className="text-gold border border-gold px-2 py-0.5 rounded-sm hover:bg-active transition flex-shrink-0"
              >
                restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Updates ─────────────────────────────────────────────────────────────
// Pulls the latest GitHub release via the user's locally-installed gh CLI
// (no token shipped in the binary). Shows current vs. latest, downloads
// the Setup installer on demand, then opens it so Windows runs the
// installer over the existing install.

function formatBytes(n) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const RELEASES_URL = 'https://github.com/Grimoire-z/grimoire/releases';
const bridge = typeof window !== 'undefined' ? window.grimoire : null;

function UpdatesSection() {
  const [current,  setCurrent]  = useState(null);
  const [result,   setResult]   = useState(null);  // result of check-for-update
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState(null);  // {received, total} during download
  const [phase,    setPhase]    = useState('idle'); // idle | checking | downloading | launched | error
  const [error,    setError]    = useState(null);

  // Load current version on mount.
  useEffect(() => {
    if (!bridge?.getVersion) return;
    bridge.getVersion().then(setCurrent).catch(() => {});
  }, []);

  // Subscribe to download progress events.
  useEffect(() => {
    if (!bridge?.onDownloadProgress) return undefined;
    return bridge.onDownloadProgress((data) => setProgress(data));
  }, []);

  const check = async () => {
    if (!bridge?.checkForUpdate) { setError('Updates require the desktop app build.'); return; }
    setChecking(true); setError(null); setResult(null); setPhase('checking');
    const r = await bridge.checkForUpdate();
    setChecking(false);
    if (r.ok) {
      setResult(r);
      setPhase('idle');
      if (!current && r.current) setCurrent(r.current);
    } else {
      setError(r.error || 'check failed');
      setPhase('error');
    }
  };

  const install = async () => {
    if (!result?.asset) return;
    setPhase('downloading'); setProgress(null); setError(null);
    const r = await bridge.downloadAndInstall(result.asset);
    if (r.ok) {
      setPhase('launched');
    } else {
      setError(r.error || 'install failed');
      setPhase('error');
    }
  };

  const openReleases = () =>
    bridge?.openExternal ? bridge.openExternal(RELEASES_URL) : window.open(RELEASES_URL, '_blank');

  const openReleaseNotes = () =>
    result?.releaseUrl && (bridge?.openExternal ? bridge.openExternal(result.releaseUrl) : window.open(result.releaseUrl, '_blank'));

  return (
    <SectionCard title="Updates"
      right={
        <span className="text-fade text-xs font-cmd">
          v{current || '—'}
        </span>
      }
    >
      <p className="text-fade text-sm italic mb-4">
        Pulls the latest release from <span className="font-cmd text-gold">github.com/Grimoire-z/grimoire</span>.
        Uses your local <span className="font-cmd">gh</span> CLI for auth — no token stored in the app.
      </p>

      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={check}
          disabled={checking || phase === 'downloading'}
          className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold px-3 py-1.5 hover:bg-active transition disabled:opacity-50"
        >
          {checking ? '… checking' : '↻ check for updates'}
        </button>

        {result?.hasUpdate && result.asset && phase !== 'downloading' && phase !== 'launched' && (
          <>
            <button
              onClick={install}
              className="text-xs font-cmd uppercase tracking-wider border border-gold-strong bg-active px-3 py-1.5 hover:bg-card-hover transition"
              style={{ color: 'var(--color-gold)' }}
            >
              ↓ download &amp; install v{result.latest.replace(/^v/, '')}
            </button>
            <button
              onClick={openReleaseNotes}
              className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-parchment transition"
            >
              view release notes
            </button>
          </>
        )}

        {phase === 'downloading' && progress && (
          <ProgressIndicator received={progress.received} total={progress.total} />
        )}

        {phase === 'error' && (
          <button
            onClick={openReleases}
            className="text-xs font-cmd text-fade hover:text-parchment transition ml-auto"
            title="Open the GitHub releases page in your browser"
          >
            ↗ open releases page
          </button>
        )}
      </div>

      {result && phase === 'idle' && (
        <div className="mt-3 text-sm">
          {result.hasUpdate ? (
            <span className="text-gold">
              v{result.latest.replace(/^v/, '')} is available — you're on v{result.current}.
            </span>
          ) : (
            <span className="text-fade">✓ you're on the latest (v{result.current}).</span>
          )}
        </div>
      )}

      {phase === 'launched' && (
        <div className="mt-3 text-sm text-gold">
          ✓ Installer launched. Approve the UAC prompt, then close Grimoire so the installer can upgrade.
        </div>
      )}

      {error && (
        <div className="mt-3 text-sm text-crimson font-cmd">
          ✕ {error}
        </div>
      )}
    </SectionCard>
  );
}

function ProgressIndicator({ received, total }) {
  const pct = total ? Math.round((received / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs font-cmd text-fade">
      <span>downloading</span>
      <div className="w-40 h-2 border border-gold rounded-sm overflow-hidden bg-grimoire">
        <div className="h-full transition-all"
             style={{ width: `${pct}%`, backgroundColor: 'var(--color-gold)' }} />
      </div>
      <span className="text-parchment">{formatBytes(received)} / {formatBytes(total)}</span>
    </div>
  );
}

function ThemeCard({ theme, active, onSelect }) {
  return (
    <button type="button" onClick={onSelect}
      className={`text-left p-4 border rounded-sm transition btn-action ${
        active ? 'border-gold-strong bg-active glow-active'
               : 'border-gold bg-card hover:bg-card-hover'
      }`}
    >
      <div className="flex gap-1.5 mb-3">
        <span className="w-9 h-9 rounded-sm border border-gold" style={{ backgroundColor: theme.swatch.bg }}     title="background" />
        <span className="w-9 h-9 rounded-sm border border-gold" style={{ backgroundColor: theme.swatch.card }}   title="card" />
        <span className="w-9 h-9 rounded-sm border border-gold" style={{ backgroundColor: theme.swatch.accent }} title="accent" />
        <span className="w-9 h-9 rounded-sm border border-gold" style={{ backgroundColor: theme.swatch.danger }} title="danger" />
      </div>
      <div className={`font-display text-sm uppercase tracking-wider mb-0.5 ${active ? 'text-gold' : 'text-parchment'}`}>
        {theme.name}
      </div>
      <div className="text-fade text-xs italic">{theme.sub}</div>
      {active && (
        <div className="mt-2 text-gold text-[10px] font-cmd uppercase tracking-wider">● active</div>
      )}
    </button>
  );
}

function FontCard({ preset, active, onSelect }) {
  return (
    <button type="button" onClick={onSelect}
      className={`text-left p-4 border rounded-sm transition btn-action flex flex-col gap-3 ${
        active ? 'border-gold-strong bg-active glow-active'
               : 'border-gold bg-card hover:bg-card-hover'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className={`text-sm uppercase tracking-wider truncate ${active ? 'text-gold' : 'text-parchment'}`}
             style={{ fontFamily: preset.sample.display, letterSpacing: '0.06em' }}>
          {preset.name}
        </div>
        <span className="text-3xl leading-none flex-shrink-0"
              style={{
                fontFamily: preset.sample.display,
                color: active ? 'var(--color-gold)' : 'var(--color-fade)',
              }}>
          Aa
        </span>
      </div>
      <div className="text-parchment text-sm leading-snug" style={{ fontFamily: preset.sample.body }}>
        The quick brown fox jumps over the lazy dog.
      </div>
      <div className="text-fade text-[11px] italic truncate">{preset.sub}</div>
      {active && (
        <div className="text-gold text-[10px] font-cmd uppercase tracking-wider">● active</div>
      )}
    </button>
  );
}
