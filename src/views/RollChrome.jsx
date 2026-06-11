// Shared Roll-view layout chunks used by both player Roll (`RollView`)
// and DM Roll (`DmRollView`). Pulled out of `RollView.jsx` once the
// second consumer arrived in slice 4 of DM mode.
//
// `RollSidePanel` renders the right-hand aside: target picker, modifier
// list, custom-bonus/damage inputs. It owns the small bits of derived
// state (toggleMod, clearMods, validActiveMods) so the parent only has
// to pass state slots.
//
// `ComposerBar` renders the fixed-bottom bar: composed command, copy
// button, history strip. History clicks re-paste the entry to clipboard
// and surface it back in the composed slot, matching the original UX.

import { useCallback, useState } from 'react';
import { ModifierRow, onActivate } from '../components.jsx';
import { useFolderDragReorder, reorderItem } from '../dnd.js';

// Shared compose-emit plumbing. The "fire a command" ritual — push a
// timestamped entry onto the capped history strip, write the clipboard, and
// flash the copied indicator — was triplicated across RollView.fire,
// DmRollView.fire, and DmRollView.fireInitAdd, with the cap (8) and flash
// duration (1500ms) copy-pasted in four places. These two helpers give them
// one home; the per-surface bits (compose() call, lastFired tracking) stay in
// each view's wrapper.
const HISTORY_CAP = 8;
const COPIED_FLASH_MS = 1500;

function copyAndFlash(cmd, setCopied) {
  if (navigator.clipboard) navigator.clipboard.writeText(cmd).catch(() => {});
  setCopied(true);
  setTimeout(() => setCopied(false), COPIED_FLASH_MS);
}

// Returns emit(label, cmd): set the composed slot, prepend a history entry
// (capped), copy + flash. Callers compose the command themselves and pass the
// final string in.
export function useComposerEmit({ setComposed, setHistory, setCopied }) {
  return useCallback((label, cmd) => {
    setComposed(cmd);
    setHistory(prev => [{
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      label, cmd,
    }, ...prev].slice(0, HISTORY_CAP));
    copyAndFlash(cmd, setCopied);
  }, [setComposed, setHistory, setCopied]);
}

export function RollSidePanel({
  modifiers, activeMods, setActiveMods, modParams, setModParams,
  targets, folders, setFolders, selectedTargets, setSelectedTargets, actionAccepts,
  custom, setCustom,
}) {
  const toggleMod = useCallback((modId) => {
    setActiveMods(prev => {
      const next = { ...prev };
      const mod  = modifiers.find(m => m.id === modId);
      if (!mod) return prev;
      if (next[modId]) { delete next[modId]; return next; }
      if (mod.excludes) mod.excludes.forEach(e => delete next[e]);
      next[modId] = true;
      return next;
    });
  }, [modifiers, setActiveMods]);

  const setModParam = (modId, paramId, optionIndex) => {
    setModParams(prev => ({
      ...prev,
      [modId]: { ...(prev[modId] || {}), [paramId]: optionIndex },
    }));
  };

  const clearMods = () => {
    setActiveMods({});
    setCustom({ bonus: '', damage: '' });
  };

  const validActiveMods = Object.fromEntries(
    Object.entries(activeMods).filter(([id]) => modifiers.find(m => m.id === id))
  );

  return (
    <aside className="lg:col-span-2">
      <TargetsPanel
        targets={targets} folders={folders} setFolders={setFolders}
        selectedTargets={selectedTargets} setSelectedTargets={setSelectedTargets}
        actionAccepts={actionAccepts}
      />

      <div className="flex items-baseline justify-between mb-2 mt-5">
        <h2 className="font-display text-gold text-sm">MODIFIERS</h2>
        <button onClick={clearMods}
                className="text-xs text-fade hover:text-parchment font-cmd">
          clear all
        </button>
      </div>
      <div className="divider mb-3" />

      <div className="grid grid-cols-2 gap-2">
        {modifiers.map(m => (
          <ModifierRow key={m.id} mod={m}
            active={!!validActiveMods[m.id]}
            paramSelections={modParams[m.id] || {}}
            onToggle={() => toggleMod(m.id)}
            onParamChange={(pid, idx) => setModParam(m.id, pid, idx)} />
        ))}
        {modifiers.length === 0 && (
          <div className="col-span-2 text-fade italic text-sm text-center py-8">
            no modifiers — open <span className="text-gold">⚙ modifiers</span> in the header to forge some
          </div>
        )}
      </div>

      <div className="divider my-4" />

      <div className="space-y-2 text-sm">
        <div>
          <label className="text-fade text-xs uppercase tracking-wider">Custom bonus to hit</label>
          <input className="lined" placeholder='e.g. 2  or  1d4'
                 value={custom.bonus}
                 onChange={e => setCustom(c => ({ ...c, bonus: e.target.value }))} />
        </div>
        <div>
          <label className="text-fade text-xs uppercase tracking-wider">Custom extra damage</label>
          <input className="lined" placeholder='e.g. 1d6 [fire]'
                 value={custom.damage}
                 onChange={e => setCustom(c => ({ ...c, damage: e.target.value }))} />
        </div>
      </div>
    </aside>
  );
}

export function ComposerBar({ composed, setComposed, copied, setCopied, history, emit, onRefire }) {
  // Re-copy doesn't push history (it's re-firing an existing entry), so it
  // uses copyAndFlash directly rather than the full emit().
  const recopy = (cmd) => copyAndFlash(cmd, setCopied);

  // Quick ad-hoc dice — composes a raw `!r <expr>` for the percentile checks,
  // recharge dice, group re-rolls etc. that don't belong to any character
  // action. Reuses the shared emit so it lands in history + clipboard like
  // any other fire.
  const [dice, setDice] = useState('');
  const rollDice = (expr) => {
    const e = String(expr).trim();
    if (e && emit) emit('roll', `!r ${e}`);
  };
  const submitDice = () => { rollDice(dice); setDice(''); };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-cmd border-t border-gold-strong z-20">
      <div className="max-w-7xl mx-auto px-6 py-3">
        {emit && (
          <div className="flex items-center gap-2 mb-2">
            <span className="font-display text-gold text-xs uppercase tracking-widest">roll</span>
            <input
              value={dice}
              onChange={e => setDice(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitDice(); }}
              placeholder="4d6kh3 · 1d20+5 · 2d6[fire]"
              className="lined font-cmd text-sm w-48"
            />
            {['1d20', '1d100', '1d6'].map(d => (
              <button key={d} type="button" onClick={() => rollDice(d)}
                className="text-[11px] font-cmd text-fade hover:text-gold border border-gold rounded-sm px-2 py-0.5 transition">
                {d}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className="font-display text-gold text-xs uppercase tracking-widest">cmd</span>
          <code className={`font-cmd text-sm flex-1 truncate ${composed ? 'text-parchment' : 'text-fade'} ${copied ? 'flash' : ''}`}>
            {composed || 'click an action to compose a command…'}
          </code>
          {onRefire && (
            <button
              onClick={onRefire}
              title="re-fire the last action with the current targets & modifiers"
              className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-gold border border-gold px-3 py-1.5 hover:bg-active transition"
            >
              ↻ re-fire
            </button>
          )}
          {composed && (
            <button
              onClick={() => recopy(composed)}
              className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold px-3 py-1.5 hover:bg-active transition"
            >
              {copied ? '✓ copied' : '📋 copy'}
            </button>
          )}
        </div>

        {history.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gold flex gap-3 overflow-x-auto scrollbar-thin">
            {history.map((h, i) => (
              <button key={i}
                onClick={() => { setComposed(h.cmd); recopy(h.cmd); }}
                className="text-left flex-shrink-0 text-xs font-cmd text-fade hover:text-parchment whitespace-nowrap"
                title={h.cmd}
              >
                <span className="text-gold">{h.time}</span> {h.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Targets panel ──────────────────────────────────────────────────────
// Right-aside section that surfaces the global targets list (organized
// into folder groups, with an Ungrouped fallback). Selection state is
// ephemeral — clicked rows toggle into the parent's `selectedTargets`
// map, which the composer reads when building `-t "<name>"` args. When
// the active tab doesn't take targets (saves, checks), a hint replaces
// the silent dropping of `-t` flags so users aren't surprised.

function TargetsPanel({ targets, folders, setFolders, selectedTargets, setSelectedTargets, actionAccepts }) {
  const toggle = (id) => {
    setSelectedTargets(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  // Per-folder bulk helpers — `onSelectAll`/`onClear` on each TargetGroup
  // closes over the folder's filtered target list so we never accidentally
  // touch targets that belong to other folders.
  const selectAllIn = (folderTargets) => {
    setSelectedTargets(prev => {
      const next = { ...prev };
      for (const t of folderTargets) next[t.id] = true;
      return next;
    });
  };
  const clearAllIn = (folderTargets) => {
    setSelectedTargets(prev => {
      const next = { ...prev };
      for (const t of folderTargets) delete next[t.id];
      return next;
    });
  };

  // Drag-and-drop reorder for real folders. Same array-splice trick
  // TargetsView uses; the result writes back through `setFolders` so
  // the new order persists immediately. Ungrouped isn't a folder in
  // the array — it stays pinned where it is and isn't draggable.
  const reorderFolder = (fromIndex, toIndex) => {
    if (!setFolders) return;
    setFolders(prev => reorderItem(prev, fromIndex, toIndex));
  };

  const selectedCount = targets.filter(t => selectedTargets[t.id]).length;
  const folderIds = new Set(folders.map(f => f.id));
  const targetsInFolder = (fid) =>
    targets.filter(t => (fid == null ? !folderIds.has(t.folderId) : t.folderId === fid));
  const ungrouped = targetsInFolder(null);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="font-display text-gold text-sm">
          TARGETS{selectedCount > 0 && <span className="text-fade font-cmd"> · {selectedCount} selected</span>}
        </h2>
        {selectedCount > 0 && (
          <button onClick={() => setSelectedTargets({})}
                  className="text-xs text-fade hover:text-parchment font-cmd">
            clear selection
          </button>
        )}
      </div>
      <div className="divider mb-3" />

      {!actionAccepts && targets.length > 0 && (
        <div className="text-fade italic text-xs mb-2">
          targets are ignored for saves &amp; skill checks
        </div>
      )}

      {/* Folder list is capped at ~half the viewport height. When the
          contents (many folders, big folders, or both) exceed the cap,
          the container scrolls internally so the modifier list below
          stays anchored where the user expects it. Folders sit two-up
          in a grid; `items-start` keeps each at its natural height so
          a one-target folder beside a ten-target folder doesn't get
          stretched and create dead space. Avrae shortens names in
          init anyway, so narrower folder cards stay readable. */}
      <div className="grid grid-cols-2 gap-2 items-start overflow-y-auto scrollbar-thin max-h-[29vh] pr-1">
        {folders.map((f, i) => {
          const inFolder = targetsInFolder(f.id);
          return (
            <TargetGroup
              key={f.id}
              label={f.name || '(unnamed folder)'}
              targets={inFolder}
              selectedTargets={selectedTargets}
              onToggle={toggle}
              onSelectAll={() => selectAllIn(inFolder)}
              onClear={() => clearAllIn(inFolder)}
              index={i}
              onReorder={setFolders ? reorderFolder : null}
            />
          );
        })}
        {ungrouped.length > 0 && (
          <TargetGroup
            label="Ungrouped"
            targets={ungrouped}
            selectedTargets={selectedTargets}
            onToggle={toggle}
            onSelectAll={() => selectAllIn(ungrouped)}
            onClear={() => clearAllIn(ungrouped)}
            mutedHeader
          />
        )}
        {targets.length === 0 && (
          <div className="col-span-2 text-fade italic text-sm text-center py-4">
            no targets — open the <span className="text-gold">Targets</span> tab to create some
          </div>
        )}
      </div>
    </div>
  );
}

function TargetGroup({ label, targets, selectedTargets, onToggle, onSelectAll, onClear, mutedHeader, index, onReorder }) {
  const [collapsed, setCollapsed] = useState(false);
  const { dragging, dragOver, enabled: isDraggable, handleProps, dropZoneProps } = useFolderDragReorder({ index, onReorder });
  const selCount = targets.filter(t => selectedTargets[t.id]).length;
  const allSelected = targets.length > 0 && selCount === targets.length;

  return (
    <div
      {...dropZoneProps}
      className={`border rounded-sm bg-card transition ${
        dragOver ? 'border-gold-strong glow-active' : 'border-gold'
      } ${dragging ? 'opacity-50' : ''}`}
    >
      {/* Header row: drag handle (real folders only) + chevron+label
          (collapse toggle) + per-folder bulk action buttons + count.
          Multiple sibling buttons rather than nesting since HTML
          doesn't allow nested <button>. */}
      <div className="flex items-center gap-1 px-2 py-1.5">
        {isDraggable && (
          <div
            {...handleProps}
            title="drag to reorder folder"
            aria-label="drag handle"
            className="text-fade hover:text-gold cursor-grab active:cursor-grabbing select-none font-cmd text-xs leading-none px-0.5 flex-shrink-0"
          >
            ≡
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80 transition"
        >
          <span className="text-gold font-cmd text-xs w-3">{collapsed ? '▶' : '▼'}</span>
          <span className={`font-display text-xs uppercase tracking-wider truncate ${mutedHeader ? 'text-fade' : 'text-gold'}`}>
            {label}
          </span>
        </button>
        <button
          type="button"
          onClick={onSelectAll}
          disabled={allSelected || targets.length === 0}
          title="select all in this folder"
          className="text-[10px] font-cmd uppercase tracking-wider text-fade hover:text-gold disabled:opacity-30 disabled:hover:text-fade transition px-1"
        >
          all
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={selCount === 0}
          title="clear selections in this folder"
          className="text-[10px] font-cmd uppercase tracking-wider text-fade hover:text-gold disabled:opacity-30 disabled:hover:text-fade transition px-1"
        >
          reset
        </button>
        <span className="text-xs font-cmd text-fade ml-1">
          {targets.length}{selCount > 0 && ` · ${selCount}`}
        </span>
      </div>
      {!collapsed && (
        <div className="space-y-1 px-2 pb-2 pt-1">
          {targets.map(t => {
            const active = !!selectedTargets[t.id];
            return (
              <div key={t.id}
                   role="button"
                   tabIndex={0}
                   aria-pressed={active}
                   onClick={() => onToggle(t.id)}
                   onKeyDown={onActivate(() => onToggle(t.id))}
                   className={`flex items-center gap-2 border rounded-sm px-2 py-1 cursor-pointer transition ${
                     active ? 'bg-active glow-active border-gold-strong' : 'bg-grimoire border-gold hover:bg-card-hover'
                   }`}>
                <div className={`w-3.5 h-3.5 border rounded-sm flex-shrink-0 flex items-center justify-center text-xs ${
                       active ? 'border-gold-strong' : 'border-gold'
                     }`}
                     style={active ? { backgroundColor: 'var(--color-gold)', color: 'var(--color-bg)' } : {}}>
                  {active && '✓'}
                </div>
                <span className={`flex-1 text-sm font-cmd truncate ${active ? 'text-parchment' : 'text-fade'}`}>
                  {t.name || <em className="italic">unnamed</em>}
                </span>
              </div>
            );
          })}
          {targets.length === 0 && (
            <div className="text-fade italic text-xs px-1 py-1">empty</div>
          )}
        </div>
      )}
    </div>
  );
}
