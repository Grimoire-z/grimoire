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
import { ModifierRow } from '../components.jsx';

export function RollSidePanel({
  modifiers, activeMods, setActiveMods, modParams, setModParams,
  targets, folders, selectedTargets, setSelectedTargets, actionAccepts,
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
        targets={targets} folders={folders}
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

export function ComposerBar({ composed, setComposed, copied, setCopied, history }) {
  const recopy = (cmd) => {
    navigator.clipboard?.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-cmd border-t border-gold-strong z-20">
      <div className="max-w-7xl mx-auto px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-display text-gold text-xs uppercase tracking-widest">cmd</span>
          <code className={`font-cmd text-sm flex-1 truncate ${composed ? 'text-parchment' : 'text-fade'} ${copied ? 'flash' : ''}`}>
            {composed || 'click an action to compose a command…'}
          </code>
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

function TargetsPanel({ targets, folders, selectedTargets, setSelectedTargets, actionAccepts }) {
  const toggle = (id) => {
    setSelectedTargets(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
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

      <div className="space-y-2">
        {folders.map(f => (
          <TargetGroup
            key={f.id}
            label={f.name || '(unnamed folder)'}
            targets={targetsInFolder(f.id)}
            selectedTargets={selectedTargets}
            onToggle={toggle}
          />
        ))}
        {ungrouped.length > 0 && (
          <TargetGroup
            label="Ungrouped"
            targets={ungrouped}
            selectedTargets={selectedTargets}
            onToggle={toggle}
            mutedHeader
          />
        )}
        {targets.length === 0 && (
          <div className="text-fade italic text-sm text-center py-4">
            no targets — open the <span className="text-gold">Targets</span> tab to create some
          </div>
        )}
      </div>
    </div>
  );
}

function TargetGroup({ label, targets, selectedTargets, onToggle, mutedHeader }) {
  const [collapsed, setCollapsed] = useState(false);
  const selCount = targets.filter(t => selectedTargets[t.id]).length;

  return (
    <div className="border border-gold rounded-sm bg-card">
      <button
        type="button"
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-card-hover transition text-left"
      >
        <span className="text-gold font-cmd text-xs w-3">{collapsed ? '▶' : '▼'}</span>
        <span className={`font-display text-xs uppercase tracking-wider flex-1 ${mutedHeader ? 'text-fade' : 'text-gold'}`}>
          {label}
        </span>
        <span className="text-xs font-cmd text-fade">
          {targets.length}{selCount > 0 && ` · ${selCount} sel`}
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-1 px-2 pb-2 pt-1">
          {targets.map(t => {
            const active = !!selectedTargets[t.id];
            return (
              <div key={t.id}
                   onClick={() => onToggle(t.id)}
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
