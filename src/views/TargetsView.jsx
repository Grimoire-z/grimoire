import { useEffect, useState } from 'react';
import { makeShortId } from '../state.js';

export default function TargetsView({ targets, setTargets, folders, setFolders }) {
  const [importing, setImporting] = useState(false);

  const addFolder = () => {
    const id = makeShortId('fld');
    setFolders(prev => [...prev, { id, name: 'New Folder' }]);
  };
  const renameFolder = (id, name) => {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, name } : f));
  };
  const deleteFolder = (id) => {
    const folder = folders.find(f => f.id === id);
    if (!folder) return;
    if (!window.confirm(`Delete folder "${folder.name}"?\n\nTargets inside will move to Ungrouped.`)) return;
    setFolders(prev => prev.filter(f => f.id !== id));
    setTargets(prev => prev.map(t => t.folderId === id ? { ...t, folderId: undefined } : t));
  };
  // Drag-and-drop reorder. Drop-target's index becomes the new home
  // for the dragged folder; everything between shifts by one in the
  // appropriate direction. Same array-splice trick the v0.8 vault
  // would use if we ever surface drag-reorder there too.
  const reorderFolder = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    setFolders(prev => {
      if (fromIndex < 0 || fromIndex >= prev.length) return prev;
      if (toIndex < 0   || toIndex >= prev.length)   return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const addTarget = (folderId) => {
    const id = makeShortId('tgt');
    setTargets(prev => [...prev, { id, name: '', folderId }]);
  };
  const renameTarget = (id, name) => {
    setTargets(prev => prev.map(t => t.id === id ? { ...t, name } : t));
  };
  const removeTarget = (id) => {
    setTargets(prev => prev.filter(t => t.id !== id));
  };
  const moveTarget = (id, folderId) => {
    setTargets(prev => prev.map(t => t.id === id ? { ...t, folderId: folderId || undefined } : t));
  };

  // Bulk import: takes a list of names + a folder destination and
  // appends them all as new targets. Folder can be an existing id, a
  // sentinel `__new__:Name` request to create a fresh folder first,
  // or `null`/empty for ungrouped. Optional autoNumber suffixes
  // repeated names (Goblin/Goblin/Goblin → Goblin 1/2/3) so they're
  // distinguishable in selection.
  const bulkImport = ({ names, folderId, newFolderName, autoNumber }) => {
    if (!names.length) return;

    let resolvedFolderId = folderId || undefined;
    let folderToAdd = null;
    if (newFolderName) {
      const fid = makeShortId('fld');
      folderToAdd = { id: fid, name: newFolderName };
      resolvedFolderId = fid;
    }

    const finalNames = autoNumber ? numberDuplicates(names) : names;

    // Each makeShortId() draws fresh random entropy, so bulk-creating N
    // targets in the same tick no longer needs an index suffix to stay
    // collision-free.
    const newTargets = finalNames.map((name) => ({
      id: makeShortId('tgt'),
      name,
      folderId: resolvedFolderId,
    }));

    if (folderToAdd) setFolders(prev => [...prev, folderToAdd]);
    setTargets(prev => [...prev, ...newTargets]);
    setImporting(false);
  };

  // Resolve targets that reference a deleted/missing folder back to ungrouped
  // for display purposes.
  const folderIds = new Set(folders.map(f => f.id));
  const targetsInFolder = (fid) =>
    targets.filter(t => (fid == null ? !folderIds.has(t.folderId) : t.folderId === fid));

  return (
    <main className="relative z-10 px-6 pb-12 max-w-7xl mx-auto mt-4 space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-gold text-sm">FOLDERS</h2>
        <div className="flex gap-2">
          <button onClick={() => setImporting(true)}
                  className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold px-3 py-1.5 hover:bg-active transition">
            ↓ import list
          </button>
          <button onClick={addFolder}
                  className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold px-3 py-1.5 hover:bg-active transition">
            + new folder
          </button>
        </div>
      </div>
      <div className="divider" />

      {folders.map((f, i) => (
        <FolderCard
          key={f.id}
          folder={f}
          index={i}
          targets={targetsInFolder(f.id)}
          allFolders={folders}
          onRename={(name) => renameFolder(f.id, name)}
          onDelete={() => deleteFolder(f.id)}
          onAddTarget={() => addTarget(f.id)}
          onRenameTarget={renameTarget}
          onRemoveTarget={removeTarget}
          onMoveTarget={moveTarget}
          onReorder={reorderFolder}
        />
      ))}

      <UngroupedCard
        targets={targetsInFolder(null)}
        allFolders={folders}
        onAddTarget={() => addTarget(undefined)}
        onRenameTarget={renameTarget}
        onRemoveTarget={removeTarget}
        onMoveTarget={moveTarget}
      />

      {folders.length === 0 && targets.length === 0 && (
        <div className="text-fade italic text-sm text-center py-8">
          empty — click <span className="text-gold">+ new folder</span> to start, or just add ungrouped targets below
        </div>
      )}

      {importing && (
        <ImportListModal
          folders={folders}
          onCancel={() => setImporting(false)}
          onImport={bulkImport}
        />
      )}
    </main>
  );
}

// ─── Bulk-import modal ────────────────────────────────────────────────
// Paste a list of names (newline- and/or comma-separated), pick a
// folder destination (existing / new / ungrouped), optionally turn on
// auto-numbering so duplicate names become Goblin 1, Goblin 2, etc.
// Submit creates them all in one shot via bulkImport in the parent.

const FOLDER_NEW = '__new__';
const FOLDER_UNGROUPED = '';

function ImportListModal({ folders, onCancel, onImport }) {
  const [text, setText] = useState('');
  const [folderChoice, setFolderChoice] = useState(FOLDER_UNGROUPED);
  const [newFolderName, setNewFolderName] = useState('');
  const [autoNumber, setAutoNumber] = useState(true);

  const names = parseNameList(text);
  const preview = autoNumber ? numberDuplicates(names) : names;

  const folderLabel =
    folderChoice === FOLDER_NEW
      ? (newFolderName.trim() ? `new folder "${newFolderName.trim()}"` : 'new folder (name required)')
      : folderChoice === FOLDER_UNGROUPED
        ? 'Ungrouped'
        : folders.find(f => f.id === folderChoice)?.name || '(unknown folder)';

  const canImport =
    names.length > 0 &&
    (folderChoice !== FOLDER_NEW || newFolderName.trim().length > 0);

  const submit = () => {
    if (!canImport) return;
    onImport({
      names: preview,
      folderId: folderChoice === FOLDER_NEW || folderChoice === FOLDER_UNGROUPED ? null : folderChoice,
      newFolderName: folderChoice === FOLDER_NEW ? newFolderName.trim() : null,
      // bulkImport applies autoNumber itself; we've already done it
      // in `preview`, so pass `false` to avoid double-numbering.
      autoNumber: false,
    });
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
      onClick={onCancel}
    >
      <div
        className="bg-card border border-gold-strong rounded-sm max-w-lg w-full p-5 my-auto"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(var(--color-gold-rgb), 0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-display text-lg text-gold uppercase tracking-wider mb-2">
          Import target list
        </h3>
        <p className="text-fade text-sm italic mb-3">
          Paste names — one per line, comma-separated, or even an Avrae <span className="font-cmd text-gold">-t "Name|"</span> command string. The wrapper syntax gets stripped.
        </p>

        <textarea
          className="w-full font-cmd text-sm bg-grimoire border border-gold rounded-sm p-2 text-parchment resize-y"
          rows={6}
          placeholder='Aragorn&#10;Legolas&#10;Gimli&#10;&#10;or: Aragorn, Legolas, Gimli'
          value={text}
          onChange={e => setText(e.target.value)}
          autoFocus
        />

        <div className="mt-3 space-y-2">
          <label className="text-fade text-xs uppercase tracking-wider block">Destination</label>
          <select
            className="lined w-full"
            value={folderChoice}
            onChange={e => setFolderChoice(e.target.value)}
          >
            <option value={FOLDER_UNGROUPED}>(Ungrouped)</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
            <option value={FOLDER_NEW}>+ create new folder…</option>
          </select>
          {folderChoice === FOLDER_NEW && (
            <input
              className="lined w-full"
              placeholder="new folder name"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              autoFocus
            />
          )}
        </div>

        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoNumber}
            onChange={e => setAutoNumber(e.target.checked)}
            className="w-3.5 h-3.5"
          />
          <span className="text-xs text-parchment">
            Auto-number duplicates
            <span className="text-fade italic"> — Goblin/Goblin → Goblin 1, Goblin 2</span>
          </span>
        </label>

        {names.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gold">
            <div className="text-xs text-fade italic mb-1">
              Will create {preview.length} target{preview.length === 1 ? '' : 's'} in {folderLabel}.
            </div>
            <div className="font-cmd text-xs text-parchment max-h-32 overflow-y-auto scrollbar-thin">
              {preview.map((n, i) => (
                <div key={i} className="truncate">· {n}</div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-parchment border border-gold px-3 py-1.5 hover:bg-active transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canImport}
            className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold-strong px-3 py-1.5 hover:bg-active transition disabled:opacity-30"
          >
            ↓ Import {names.length > 0 && `(${preview.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// Extract target names from pasted text. Two input flavors handled:
//
//   1. Plain list — newline- or comma-separated names
//      ("Aragorn\nLegolas\nGimli" or "Aragorn, Legolas, Gimli").
//
//   2. Avrae command syntax — `-t "Name|conditions"` repeated, often
//      on one line (e.g. `-t "Harkul|" -t "Goblin 1|"`). Anything
//      between double-quotes wins when quotes are present; the `-t`,
//      quote marks, and `|...` suffix are all stripped, leaving just
//      the name (with any trailing number intact).
//
// When the text contains any quoted strings we prefer those, since
// they're an explicit marker of intent. Falls back to the plain split
// otherwise. Mixed pastes (some quoted, some bare) take the quoted
// path — bare lines in that case are treated as command-line noise.
function parseNameList(text) {
  const quoted = [...text.matchAll(/"([^"]*)"/g)].map(m => m[1]);
  const raw = quoted.length > 0 ? quoted : text.split(/[\n,]/);

  return raw
    .map(s => {
      let n = s.trim();
      // Strip Avrae `|conditions` suffix — keep what's before the
      // pipe so "Goblin 1|isImmune=fire" becomes "Goblin 1".
      const pipe = n.indexOf('|');
      if (pipe >= 0) n = n.slice(0, pipe);
      return n.trim();
    })
    .filter(s => s.length > 0);
}

// If a name appears more than once, suffix each occurrence with " 1",
// " 2", etc. so the rendered list is distinguishable. Comparison is
// case-sensitive — "Goblin" and "goblin" stay distinct.
function numberDuplicates(names) {
  const counts = new Map();
  for (const n of names) counts.set(n, (counts.get(n) || 0) + 1);
  const seen = new Map();
  return names.map(n => {
    if (counts.get(n) === 1) return n;
    const idx = (seen.get(n) || 0) + 1;
    seen.set(n, idx);
    return `${n} ${idx}`;
  });
}

function FolderCard({ folder, index, targets, allFolders, onRename, onDelete, onAddTarget, onRenameTarget, onRemoveTarget, onMoveTarget, onReorder }) {
  // Drag-state lives locally per card. `dragging` fades the source
  // while it's mid-drag; `dragOver` highlights the drop target.
  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  // Collapse toggle is also local — defaults to expanded so existing
  // workflows are unchanged. Clicking + add target auto-expands so
  // the user can see the new row they're about to fill in.
  const [collapsed, setCollapsed] = useState(false);

  const onAddTargetExpand = () => {
    setCollapsed(false);
    onAddTarget();
  };

  const onDragStart = (e) => {
    // Use the integer index as the dataTransfer payload. The card the
    // drop lands on reads it to know where to insert.
    e.dataTransfer.setData('application/grimoire-folder-index', String(index));
    e.dataTransfer.setData('text/plain', String(index)); // fallback for browsers that ignore custom types
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  };
  const onDragEnd = () => {
    setDragging(false);
    setDragOver(false);
  };
  const onDragOver = (e) => {
    // Only react to drags whose payload looks like ours — text drags
    // out of the rename inputs shouldn't trigger drop-target styling.
    if (![...e.dataTransfer.types].includes('application/grimoire-folder-index')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => {
    setDragOver(false);
    const raw = e.dataTransfer.getData('application/grimoire-folder-index');
    if (raw === '') return;
    const from = parseInt(raw, 10);
    if (Number.isNaN(from)) return;
    e.preventDefault();
    onReorder(from, index);
  };

  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`bg-card border rounded-sm p-4 transition ${
        dragOver ? 'border-gold-strong glow-active' : 'border-gold'
      } ${dragging ? 'opacity-50' : ''}`}
    >
      <div className={`flex items-center justify-between gap-3 ${collapsed ? '' : 'mb-3'}`}>
        {/* Drag handle: only this is `draggable`, so dragging from the
            name input doesn't try to drag the input's text instead.
            Title attr surfaces the affordance on hover. */}
        <div
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="drag to reorder folder"
          className="text-gold hover:text-parchment cursor-grab active:cursor-grabbing select-none px-1 flex-shrink-0 font-cmd text-base leading-none"
          aria-label="drag handle"
        >
          ≡
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'expand folder' : 'collapse folder'}
          className="text-gold hover:text-parchment font-cmd text-sm leading-none px-1 flex-shrink-0"
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <input
          className="lined font-display uppercase tracking-wider text-gold flex-1"
          value={folder.name}
          onChange={e => onRename(e.target.value)}
        />
        {collapsed && (
          <span className="text-xs font-cmd text-fade flex-shrink-0">
            {targets.length}
          </span>
        )}
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={onAddTargetExpand}
                  className="text-xs font-cmd text-gold border border-gold px-2 py-0.5 hover:bg-active rounded-sm">
            + add target
          </button>
          <button onClick={onDelete}
                  className="text-xs font-cmd text-crimson border border-crimson px-2 py-0.5 hover:bg-active rounded-sm">
            ✕ delete
          </button>
        </div>
      </div>
      {!collapsed && (
        <TargetList
          targets={targets}
          allFolders={allFolders}
          currentFolderId={folder.id}
          emptyHint="no targets in this folder yet"
          onRenameTarget={onRenameTarget}
          onRemoveTarget={onRemoveTarget}
          onMoveTarget={onMoveTarget}
        />
      )}
    </section>
  );
}

function UngroupedCard({ targets, allFolders, onAddTarget, onRenameTarget, onRemoveTarget, onMoveTarget }) {
  // Local collapse state — same pattern as FolderCard. Inlined (rather
  // than using SectionCard) so the chevron + count can sit in the
  // header alongside the title.
  const [collapsed, setCollapsed] = useState(false);
  const onAddTargetExpand = () => {
    setCollapsed(false);
    onAddTarget();
  };
  return (
    <section className="bg-card border border-gold rounded-sm p-4">
      <div className={`flex items-center justify-between gap-3 ${collapsed ? '' : 'mb-3'}`}>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'expand section' : 'collapse section'}
            className="text-gold hover:text-parchment font-cmd text-sm leading-none px-1 flex-shrink-0"
          >
            {collapsed ? '▶' : '▼'}
          </button>
          <h3 className="font-display text-gold text-xs uppercase tracking-wider truncate">Ungrouped</h3>
          {collapsed && (
            <span className="text-xs font-cmd text-fade">· {targets.length}</span>
          )}
        </div>
        <button onClick={onAddTargetExpand}
                className="text-xs font-cmd text-gold border border-gold px-2 py-0.5 hover:bg-active rounded-sm flex-shrink-0">
          + add target
        </button>
      </div>
      {!collapsed && (
        <TargetList
          targets={targets}
          allFolders={allFolders}
          currentFolderId={null}
          emptyHint="no ungrouped targets"
          onRenameTarget={onRenameTarget}
          onRemoveTarget={onRemoveTarget}
          onMoveTarget={onMoveTarget}
        />
      )}
    </section>
  );
}

function TargetList({ targets, allFolders, currentFolderId, emptyHint, onRenameTarget, onRemoveTarget, onMoveTarget }) {
  if (targets.length === 0) {
    return <div className="text-fade italic text-sm py-2">{emptyHint}</div>;
  }
  return (
    <div className="space-y-2">
      {targets.map(t => (
        <div key={t.id} className="flex items-center gap-2 bg-grimoire border border-gold rounded-sm px-2 py-1.5">
          <input
            className="lined flex-1 font-cmd"
            placeholder="target name"
            value={t.name}
            onChange={e => onRenameTarget(t.id, e.target.value)}
          />
          <select
            className="lined"
            value={currentFolderId || ''}
            onChange={e => onMoveTarget(t.id, e.target.value || null)}
            title="move to folder"
          >
            <option value="">(ungrouped)</option>
            {allFolders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <button onClick={() => onRemoveTarget(t.id)}
                  className="text-fade hover:text-crimson text-sm">✕</button>
        </div>
      ))}
    </div>
  );
}
