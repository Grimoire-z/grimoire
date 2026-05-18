// Bestiary — DM mode's analogue of the character vault. Holds imported
// monster stat blocks. Each card has an "active" checkbox that surfaces
// the monster on the DM Roll page for an encounter (multi-select; unlike
// the character vault's single `activeCharacterId`, multiple monsters
// can be active at once).
//
// Layout: monsters render as cards, grouped into collapsible folder
// sections. An "Ungrouped" section sits at the top for monsters with no
// folderId. Top-of-page bar exposes "+ Add monster" and "+ New folder".
//
// Slice 2 (here): cards + active toggle + rename / duplicate / delete +
// folder organization. Slice 3 will add the 5e.tools URL importer
// (button on the Add menu). Slice 4 surfaces active monsters on Roll.

import { useEffect, useRef, useState } from 'react';
import { makeBlankMonster } from '../state.js';
import { ConfirmDeleteModal } from '../components.jsx';

const bridge = typeof window !== 'undefined' ? window.grimoire : null;

export default function BestiaryView({
  monsters, monsterFolders,
  onAddMonster, onRenameMonster, onDuplicateMonster, onDeleteMonster,
  onToggleMonsterActive, onMoveMonsterToFolder,
  onAddFolder, onRenameFolder, onDeleteFolder,
}) {
  const [pendingDelete, setPendingDelete] = useState(null);
  const [picking,       setPicking]       = useState(false); // open Add-monster picker

  // Bucket monsters by folder for the grouped render. Monsters whose
  // folderId references a non-existent folder (e.g. after a folder
  // delete from elsewhere) fall through to ungrouped — matches the
  // resilience pattern from TargetsView.
  const folderById = Object.fromEntries(monsterFolders.map(f => [f.id, f]));
  const bucketed = { __ungrouped: [] };
  for (const f of monsterFolders) bucketed[f.id] = [];
  for (const m of Object.values(monsters)) {
    const key = m.folderId && folderById[m.folderId] ? m.folderId : '__ungrouped';
    bucketed[key].push(m);
  }
  // Sort each bucket by name for stable display.
  for (const k of Object.keys(bucketed)) {
    bucketed[k].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  const totalCount  = Object.keys(monsters).length;
  const activeCount = Object.values(monsters).filter(m => m.active).length;

  // "+ Add monster" branch — picker modal with two creation paths.
  const onPickBlank = () => {
    setPicking(false);
    onAddMonster(makeBlankMonster('New Monster'));
  };

  // "Import from 5e.tools" branch — IPC to main, errors propagate up
  // to the modal so they show inline without closing it.
  const onPick5etools = async (url) => {
    if (!bridge?.importMonsterFrom5etools) {
      throw new Error('5e.tools import requires the desktop app build');
    }
    const result = await bridge.importMonsterFrom5etools(url);
    if (!result.ok) throw new Error(result.error);
    // Mapped shape has the stat-block fields but no id/active/folderId;
    // overlay onto a blank so the bestiary invariants stay intact.
    const monster = {
      ...makeBlankMonster(result.monster.name || 'Imported Monster'),
      ...result.monster,
    };
    setPicking(false);
    onAddMonster(monster);
  };

  // Folder-section "+ add here" stays blank-only — quick action for
  // organizing. Use the top-level picker to import.
  const onAddBlankToFolder = (folderId) => {
    const m = makeBlankMonster('New Monster');
    m.folderId = folderId;
    onAddMonster(m);
  };

  return (
    <main className="px-6 pb-12 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold-strong px-3 py-1.5 hover:bg-active transition"
        >
          + Add monster
        </button>
        <button
          type="button"
          onClick={() => onAddFolder('New Folder')}
          className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-parchment border border-gold px-3 py-1.5 hover:bg-active transition"
        >
          + New folder
        </button>
        <div className="ml-auto text-xs font-cmd text-fade">
          {totalCount === 0
            ? 'empty bestiary'
            : `${totalCount} monster${totalCount === 1 ? '' : 's'} · ${activeCount} active`}
        </div>
      </div>

      {totalCount === 0 && monsterFolders.length === 0 && (
        <div className="border border-gold rounded-sm p-8 text-center bg-card">
          <p className="text-fade italic text-sm max-w-xl mx-auto">
            Add a monster to get started. Slice 3 will bring 5e.tools URL
            import so you can paste a bestiary link straight in.
          </p>
        </div>
      )}

      {bucketed.__ungrouped.length > 0 && (
        <FolderSection
          label="Ungrouped"
          monsters={bucketed.__ungrouped}
          folders={monsterFolders}
          onToggleActive={onToggleMonsterActive}
          onRename={onRenameMonster}
          onDuplicate={onDuplicateMonster}
          onRequestDelete={(m) => setPendingDelete(m)}
          onMoveToFolder={onMoveMonsterToFolder}
        />
      )}

      {monsterFolders.map(f => (
        <FolderSection
          key={f.id}
          folder={f}
          label={f.name || '(unnamed folder)'}
          monsters={bucketed[f.id] || []}
          folders={monsterFolders}
          onRenameFolder={(name) => onRenameFolder(f.id, name)}
          onDeleteFolder={() => {
            if (window.confirm(`Delete folder "${f.name || '(unnamed)'}"? Monsters inside will move to Ungrouped.`)) {
              onDeleteFolder(f.id);
            }
          }}
          onAddMonsterHere={() => onAddBlankToFolder(f.id)}
          onToggleActive={onToggleMonsterActive}
          onRename={onRenameMonster}
          onDuplicate={onDuplicateMonster}
          onRequestDelete={(m) => setPendingDelete(m)}
          onMoveToFolder={onMoveMonsterToFolder}
        />
      ))}

      {pendingDelete && (
        <ConfirmDeleteModal
          kind="monster"
          name={pendingDelete.name}
          details="its stat block and active-encounter status"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            onDeleteMonster(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}

      {picking && (
        <AddMonsterPicker
          onCancel={() => setPicking(false)}
          onBlank={onPickBlank}
          on5etools={onPick5etools}
        />
      )}
    </main>
  );
}

// ─── Add-monster method picker ───────────────────────────────────────────
// Two creation paths: blank monster, or 5e.tools URL import. The
// 5e.tools path expands the modal to show a URL input + Import button.
// Errors from main's importer surface inline so the user can edit the
// URL without losing modal state. Backdrop + Escape cancel (unless a
// fetch is mid-flight — would leak the work).
//
// New monsters land ungrouped by default; the user can move them via
// the card's folder picker after.

function AddMonsterPicker({ onCancel, onBlank, on5etools }) {
  const [mode,  setMode]  = useState('choose');  // 'choose' | 'url'
  const [url,   setUrl]   = useState('');
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);
  const urlRef = useRef(null);

  useEffect(() => {
    if (mode === 'url') urlRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  const submitUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await on5etools(trimmed);
      // on5etools calls setPicking(false) on success, which unmounts us.
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="bg-card border border-gold-strong rounded-sm max-w-md w-full p-5"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(var(--color-gold-rgb), 0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-display text-lg text-gold uppercase tracking-wider mb-2">
          Add monster
        </h3>
        <p className="text-fade text-sm italic mb-4">
          How do you want to create this monster?
        </p>

        {mode === 'choose' && (
          <div className="space-y-2 mb-4">
            <button
              type="button"
              onClick={onBlank}
              className="btn-action w-full text-left p-3 border rounded-sm transition border-gold bg-grimoire hover:bg-card-hover"
            >
              <div className="font-display text-sm text-gold uppercase tracking-wider mb-1">
                Start blank
              </div>
              <div className="text-fade text-xs italic">
                Fresh entry — fill in name and (later) stat block by hand.
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMode('url')}
              className="btn-action w-full text-left p-3 border rounded-sm transition border-gold bg-grimoire hover:bg-card-hover"
            >
              <div className="font-display text-sm text-gold uppercase tracking-wider mb-1">
                Import from 5e.tools URL
              </div>
              <div className="text-fade text-xs italic">
                Paste a bestiary link like{' '}
                <span className="font-cmd">5e.tools/bestiary.html#goblin_mm</span> — main process fetches the JSON, normalizes the stat block, stores it.
              </div>
            </button>
          </div>
        )}

        {mode === 'url' && (
          <div className="space-y-3 mb-4">
            <label className="block">
              <span className="text-fade text-xs uppercase tracking-wider block mb-1">5e.tools bestiary URL</span>
              <input
                ref={urlRef}
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !busy) { e.preventDefault(); submitUrl(); }
                }}
                placeholder="https://5e.tools/bestiary.html#goblin_mm"
                className="lined w-full font-cmd"
                disabled={busy}
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submitUrl}
                disabled={busy || !url.trim()}
                className="text-xs font-cmd uppercase tracking-wider border border-gold-strong px-3 py-1.5 hover:bg-active transition disabled:opacity-40"
                style={{ color: 'var(--color-gold)' }}
              >
                {busy ? '… importing' : '↓ Import'}
              </button>
              <button
                type="button"
                onClick={() => { setMode('choose'); setError(null); }}
                disabled={busy}
                className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-parchment transition disabled:opacity-50"
              >
                ← back
              </button>
            </div>
            {error && (
              <div className="text-crimson text-xs italic leading-relaxed">
                {error}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-parchment border border-gold px-3 py-1.5 hover:bg-active transition disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Folder section ─────────────────────────────────────────────────────
// Collapsible group header + monster grid. Used for both real folders
// (with rename/delete/add controls) and the synthetic "Ungrouped"
// section (no folder controls). The `folder` prop is null for ungrouped.

function FolderSection({
  folder, label, monsters, folders,
  onRenameFolder, onDeleteFolder, onAddMonsterHere,
  onToggleActive, onRename, onDuplicate, onRequestDelete, onMoveToFolder,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);

  const activeCount = monsters.filter(m => m.active).length;
  const isFolder = !!folder;

  return (
    <section className="mb-4">
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gold">
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="text-gold font-cmd text-sm w-5 leading-none hover:text-parchment transition"
          title={collapsed ? 'expand' : 'collapse'}
          aria-expanded={!collapsed}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        {isFolder && renaming ? (
          <FolderRenameInput
            value={folder.name || ''}
            onCommit={(name) => { onRenameFolder(name); setRenaming(false); }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            onClick={isFolder ? () => setRenaming(true) : undefined}
            className={`font-display text-base uppercase tracking-wider transition text-left ${
              isFolder ? 'text-gold hover:text-parchment cursor-text' : 'text-fade cursor-default'
            }`}
            title={isFolder ? 'click to rename' : undefined}
          >
            {label}
          </button>
        )}
        <span className="text-xs font-cmd text-fade">
          {monsters.length}{activeCount > 0 ? ` · ${activeCount} active` : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {isFolder && (
            <>
              <button
                type="button"
                onClick={onAddMonsterHere}
                className="text-xs font-cmd text-gold border border-gold px-2 py-0.5 hover:bg-active rounded-sm transition"
              >
                + add here
              </button>
              <button
                type="button"
                onClick={onDeleteFolder}
                title="delete folder (monsters move to Ungrouped)"
                className="text-fade hover:text-crimson text-sm"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>
      {!collapsed && (
        monsters.length === 0 ? (
          <div className="text-fade italic text-xs py-3">empty</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {monsters.map(m => (
              <MonsterCard
                key={m.id}
                monster={m}
                folders={folders}
                onToggleActive={() => onToggleActive(m.id)}
                onRename={(name) => onRename(m.id, name)}
                onDuplicate={() => onDuplicate(m.id)}
                onRequestDelete={() => onRequestDelete(m)}
                onMoveToFolder={(folderId) => onMoveToFolder(m.id, folderId)}
              />
            ))}
          </div>
        )
      )}
    </section>
  );
}

function FolderRenameInput({ value, onCommit, onCancel }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const commit = () => onCommit((draft || '').trim() || 'Folder');
  return (
    <input
      ref={ref}
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      onBlur={commit}
      className="lined font-display text-base uppercase tracking-wider"
      style={{ borderBottom: '1px solid rgba(var(--color-gold-rgb), 0.6)' }}
    />
  );
}

// ─── Monster card ───────────────────────────────────────────────────────
// Active toggle on the left, name + folder pill in the body, overflow
// menu (Rename / Duplicate / Delete / Move to folder) in the top-right.
// Card visually pops when active (gold-strong border + glow + bg-active).

function MonsterCard({ monster, folders, onToggleActive, onRename, onDuplicate, onRequestDelete, onMoveToFolder }) {
  const [renaming, setRenaming] = useState(false);

  return (
    <div
      className={`relative p-3 pl-4 border rounded-sm transition ${
        monster.active
          ? 'border-gold-strong glow-active bg-active'
          : 'border-gold bg-card hover:bg-card-hover'
      }`}
    >
      <div className="flex items-start gap-3">
        <ActiveCheckbox checked={!!monster.active} onChange={onToggleActive} />
        <div className="min-w-0 flex-1 pr-7">
          {renaming ? (
            <MonsterRenameInput
              value={monster.name || ''}
              onCommit={(name) => { onRename(name); setRenaming(false); }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <div className={`font-display text-base truncate ${monster.active ? 'text-gold' : 'text-parchment'}`}>
              {monster.name || '— unnamed —'}
            </div>
          )}
          <div className="text-fade text-xs italic mt-0.5">
            stat block details land in slice 3
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-fade text-[10px] font-cmd uppercase tracking-wider">folder</span>
            <FolderPicker
              value={monster.folderId || ''}
              folders={folders}
              onChange={(folderId) => onMoveToFolder(folderId || null)}
            />
          </div>
        </div>
      </div>
      <CardActions
        onRename={() => setRenaming(true)}
        onDuplicate={onDuplicate}
        onDelete={onRequestDelete}
      />
    </div>
  );
}

function ActiveCheckbox({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      title={checked ? 'active — click to deactivate' : 'inactive — click to activate'}
      aria-pressed={checked}
      className={`w-5 h-5 border rounded-sm flex items-center justify-center flex-shrink-0 transition text-xs ${
        checked ? 'border-gold-strong' : 'border-gold hover:border-gold-strong'
      }`}
      style={checked ? { backgroundColor: 'var(--color-gold)', color: 'var(--color-bg)' } : {}}
    >
      {checked && '✓'}
    </button>
  );
}

function FolderPicker({ value, folders, onChange }) {
  return (
    <select
      className="lined"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      title="move to folder"
    >
      <option value="">(ungrouped)</option>
      {folders.map(f => (
        <option key={f.id} value={f.id}>{f.name || '(unnamed)'}</option>
      ))}
    </select>
  );
}

function CardActions({ onRename, onDuplicate, onDelete }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (fn) => () => { setOpen(false); fn(); };

  return (
    <div ref={rootRef} className="absolute top-2 right-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Monster actions"
        aria-label="Monster actions"
        aria-expanded={open}
        className={`flex items-center justify-center w-6 h-6 border rounded-sm transition leading-none ${
          open ? 'text-gold border-gold-strong bg-active'
               : 'text-fade border-gold hover:text-parchment hover:bg-active'
        }`}
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-card border border-gold-strong rounded-sm shadow-2xl z-30 py-1"
             style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(var(--color-gold-rgb),0.15)' }}>
          <ActionMenuItem onClick={choose(onRename)}>Rename</ActionMenuItem>
          <ActionMenuItem onClick={choose(onDuplicate)}>Duplicate</ActionMenuItem>
          <ActionMenuItem onClick={choose(onDelete)} danger>Delete…</ActionMenuItem>
        </div>
      )}
    </div>
  );
}

function ActionMenuItem({ onClick, children, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full text-left text-xs font-cmd uppercase tracking-wider px-3 py-1.5 transition ${
        danger ? 'text-crimson hover:bg-active' : 'text-parchment hover:bg-active hover:text-gold'
      }`}
    >
      {children}
    </button>
  );
}

function MonsterRenameInput({ value, onCommit, onCancel }) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const commit = () => onCommit((draft || '').trim() || '— unnamed —');
  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      onBlur={commit}
      className="lined font-display text-base w-full"
      style={{ borderBottom: '1px solid rgba(var(--color-gold-rgb), 0.6)' }}
    />
  );
}
