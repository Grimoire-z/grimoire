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
  const [viewing,       setViewing]       = useState(null);  // monster being shown in StatBlockModal

  // Keep the open modal's contents fresh if the underlying monster gets
  // edited (rename, folder move) while it's displayed.
  const liveViewing = viewing ? (monsters[viewing.id] || null) : null;

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
          onView={(m) => setViewing(m)}
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
          onView={(m) => setViewing(m)}
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

      {liveViewing && (
        <StatBlockModal
          monster={liveViewing}
          onClose={() => setViewing(null)}
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
  onToggleActive, onRename, onDuplicate, onRequestDelete, onMoveToFolder, onView,
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
                onView={() => onView(m)}
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
// Active toggle on the left, name + compact summary + folder picker in
// the body, overflow menu (Rename / Duplicate / Delete) in the top-right.
// Card visually pops when active (gold-strong border + glow + bg-active).
// Clicking the card body (not the interactive children — checkbox,
// folder picker, menu, rename input) opens the StatBlockModal. Children
// that should swallow card clicks carry `data-card-action`, mirroring
// the pattern from VaultView.

function MonsterCard({ monster, folders, onToggleActive, onRename, onDuplicate, onRequestDelete, onMoveToFolder, onView }) {
  const [renaming, setRenaming] = useState(false);
  const summary = compactSummary(monster);

  const openIfClean = (e) => {
    if (renaming) return;
    if (e.target.closest('[data-card-action]')) return;
    onView();
  };
  const onKeyDown = (e) => {
    if (renaming) return;
    if (e.target.closest('[data-card-action]')) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView(); }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openIfClean}
      onKeyDown={onKeyDown}
      title="Click to view stat block"
      className={`relative p-3 pl-4 border rounded-sm transition cursor-pointer ${
        monster.active
          ? 'border-gold-strong glow-active bg-active'
          : 'border-gold bg-card hover:bg-card-hover'
      }`}
    >
      <div className="flex items-start gap-3">
        <span data-card-action><ActiveCheckbox checked={!!monster.active} onChange={onToggleActive} /></span>
        <div className="min-w-0 flex-1 pr-7">
          {renaming ? (
            <span data-card-action>
              <MonsterRenameInput
                value={monster.name || ''}
                onCommit={(name) => { onRename(name); setRenaming(false); }}
                onCancel={() => setRenaming(false)}
              />
            </span>
          ) : (
            <div className={`font-display text-base truncate ${monster.active ? 'text-gold' : 'text-parchment'}`}>
              {monster.name || '— unnamed —'}
            </div>
          )}
          {summary.line1 && (
            <div className="text-fade text-xs italic mt-0.5 truncate">{summary.line1}</div>
          )}
          {summary.line2 && (
            <div className="text-fade text-xs font-cmd mt-0.5 truncate">{summary.line2}</div>
          )}
          {!summary.line1 && !summary.line2 && (
            <div className="text-fade text-xs italic mt-0.5">no stat block — import from 5e.tools</div>
          )}
          <div className="mt-2 flex items-center gap-2" data-card-action>
            <span className="text-fade text-[10px] font-cmd uppercase tracking-wider">folder</span>
            <FolderPicker
              value={monster.folderId || ''}
              folders={folders}
              onChange={(folderId) => onMoveToFolder(folderId || null)}
            />
          </div>
        </div>
      </div>
      <span data-card-action>
        <CardActions
          onRename={() => setRenaming(true)}
          onDuplicate={onDuplicate}
          onDelete={onRequestDelete}
        />
      </span>
    </div>
  );
}

// Pulls the two summary lines that appear under the monster name on the
// card: identity (size+type+alignment) and combat (CR · AC · HP). Returns
// `{ line1, line2 }` with whichever pieces exist; empty strings when the
// monster has no stat-block data yet.
function compactSummary(m) {
  const idParts = [m.size, m.type].filter(Boolean).join(' ');
  const line1 = [idParts, m.alignment].filter(Boolean).join(', ');
  const combatParts = [];
  if (m.cr != null && m.cr !== '') combatParts.push(`CR ${m.cr}`);
  if (typeof m.ac === 'number')    combatParts.push(`AC ${m.ac}`);
  if (m.hp?.average != null)       combatParts.push(`HP ${m.hp.average}`);
  return { line1, line2: combatParts.join(' · ') };
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

// ─── Stat block modal ────────────────────────────────────────────────────
// Read-only view of a single monster's full stat block. Layout mirrors the
// classic D&D 5e stat-block conventions: identity line, combat line,
// ability score grid, attribute summaries (saves / skills / senses /
// languages / CR), then traits / actions / legendary actions sections.
// Backdrop click + Escape + X button all close. Cap the height so big
// stat blocks (dragons, archmages) scroll inside the modal rather than
// blowing out the viewport.

const ABILITIES = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
];

const SKILL_LABELS = {
  acrobatics: 'Acrobatics', animal_handling: 'Animal Handling',
  arcana: 'Arcana', athletics: 'Athletics', deception: 'Deception',
  history: 'History', insight: 'Insight', intimidation: 'Intimidation',
  investigation: 'Investigation', medicine: 'Medicine', nature: 'Nature',
  perception: 'Perception', performance: 'Performance', persuasion: 'Persuasion',
  religion: 'Religion', sleight_of_hand: 'Sleight of Hand',
  stealth: 'Stealth', survival: 'Survival',
};

const SAVE_LABELS = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

function abilityMod(score) {
  if (typeof score !== 'number') return null;
  return Math.floor((score - 10) / 2);
}

function signedMod(mod) {
  if (mod == null) return '';
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function formatKeyValueList(obj, labels) {
  if (!obj || typeof obj !== 'object') return '';
  return Object.entries(obj)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${labels[k] || k} ${v}`)
    .join(', ');
}

function StatBlockModal({ monster, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const identity = [
    [monster.size, monster.type].filter(Boolean).join(' '),
    monster.alignment,
  ].filter(Boolean).join(', ');

  const savesLine  = formatKeyValueList(monster.saves,  SAVE_LABELS);
  const skillsLine = formatKeyValueList(monster.skills, SKILL_LABELS);

  const sensesParts = [];
  if (monster.senses)             sensesParts.push(monster.senses);
  if (typeof monster.passive === 'number') sensesParts.push(`passive Perception ${monster.passive}`);
  const sensesLine = sensesParts.join(', ');

  const hasAnyData =
    !!identity || monster.ac != null || monster.hp?.average != null ||
    !!monster.speed || !!monster.cr || (monster.traits?.length || 0) > 0 ||
    (monster.actions?.length || 0) > 0 || (monster.legendaryActions?.length || 0) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
      onClick={onClose}
    >
      <div
        className="bg-card border border-gold-strong rounded-sm max-w-2xl w-full max-h-[85vh] overflow-y-auto scrollbar-thin"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(var(--color-gold-rgb), 0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-gold">
          <div className="min-w-0">
            <h3 className="font-display text-xl text-gold uppercase tracking-wider truncate">
              {monster.name || '— unnamed —'}
            </h3>
            {identity && (
              <p className="text-fade text-sm italic mt-0.5">{identity}</p>
            )}
            {monster.source && (
              <p className="text-fade text-[10px] font-cmd uppercase tracking-wider mt-1">source · {monster.source}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close stat block"
            className="text-fade hover:text-parchment text-lg leading-none px-2 py-1 transition flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {!hasAnyData ? (
          <div className="px-5 py-8 text-center">
            <p className="text-fade italic text-sm">
              No stat-block data yet. Use <span className="text-gold">+ Add monster → Import from 5e.tools URL</span> to populate
              an existing monster, or wait for the manual editor (slice 5).
            </p>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4 text-sm">
            {/* Combat line */}
            <div className="space-y-1">
              {monster.ac != null && (
                <div><span className="font-display text-gold uppercase tracking-wider text-xs">Armor Class</span> <span className="text-parchment">{monster.ac}</span></div>
              )}
              {monster.hp && (
                <div>
                  <span className="font-display text-gold uppercase tracking-wider text-xs">Hit Points</span>{' '}
                  <span className="text-parchment">
                    {monster.hp.average != null ? monster.hp.average : '—'}
                    {monster.hp.formula ? ` (${monster.hp.formula})` : ''}
                  </span>
                </div>
              )}
              {monster.speed && (
                <div><span className="font-display text-gold uppercase tracking-wider text-xs">Speed</span> <span className="text-parchment">{monster.speed}</span></div>
              )}
            </div>

            {/* Ability score grid */}
            {monster.abilities && (
              <div className="border-y border-gold py-3">
                <div className="grid grid-cols-6 gap-2 text-center">
                  {ABILITIES.map(({ key, label }) => {
                    const score = monster.abilities[key];
                    const mod = abilityMod(score);
                    return (
                      <div key={key}>
                        <div className="font-display text-xs text-gold uppercase tracking-wider">{label}</div>
                        <div className="text-parchment text-base font-cmd mt-0.5">{score ?? '—'}</div>
                        <div className="text-fade text-xs font-cmd">{mod != null ? `(${signedMod(mod)})` : ''}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Attribute summaries */}
            <div className="space-y-1">
              {savesLine && (
                <div><span className="font-display text-gold uppercase tracking-wider text-xs">Saving Throws</span> <span className="text-parchment">{savesLine}</span></div>
              )}
              {skillsLine && (
                <div><span className="font-display text-gold uppercase tracking-wider text-xs">Skills</span> <span className="text-parchment">{skillsLine}</span></div>
              )}
              {sensesLine && (
                <div><span className="font-display text-gold uppercase tracking-wider text-xs">Senses</span> <span className="text-parchment">{sensesLine}</span></div>
              )}
              {monster.languages && (
                <div><span className="font-display text-gold uppercase tracking-wider text-xs">Languages</span> <span className="text-parchment">{monster.languages}</span></div>
              )}
              {monster.cr && (
                <div><span className="font-display text-gold uppercase tracking-wider text-xs">Challenge</span> <span className="text-parchment">{monster.cr}</span></div>
              )}
            </div>

            <StatBlockEntries title="Traits"            items={monster.traits} />
            <StatBlockEntries title="Actions"           items={monster.actions} />
            <StatBlockEntries title="Legendary Actions" items={monster.legendaryActions} />
          </div>
        )}
      </div>
    </div>
  );
}

function StatBlockEntries({ title, items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="pt-3 border-t border-gold">
      <h4 className="font-display text-gold uppercase tracking-wider text-sm mb-2">{title}</h4>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id || item.name}>
            <span className="font-display text-parchment italic">{item.name}.</span>{' '}
            {(item.description || '').split(/\n\n+/).map((para, i) => (
              <span key={i} className="text-parchment">
                {i === 0 ? para : <><br /><br />{para}</>}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
