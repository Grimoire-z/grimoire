import { useCallback, useState } from 'react';
import { compose } from '../composer.js';
import { SAVE_DEFS, SKILL_DEFS } from '../state.js';
import { TabBar, ActionCard, ModifierRow } from '../components.jsx';

const SLOT_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function RollView({
  character, modifiers,
  targets, folders, selectedTargets, setSelectedTargets,
  tab, setTab,
  activeMods, setActiveMods, modParams, setModParams,
  custom, setCustom, castLevel, setCastLevel,
  composed, setComposed, history, setHistory, copied, setCopied,
}) {
  const [spellLevel, setSpellLevel] = useState(null);

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

  const fire = useCallback((action) => {
    const targetNames = targets
      .filter(t => selectedTargets[t.id])
      .map(t => t.name);
    const cmd = compose({
      action: { ...action, targets: targetNames },
      activeMods: Object.keys(activeMods),
      modParams, modifiers, custom,
    });
    setComposed(cmd);
    setHistory(prev => [{
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      label: action.label, cmd,
    }, ...prev].slice(0, 8));
    if (navigator.clipboard) navigator.clipboard.writeText(cmd).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [activeMods, modParams, modifiers, custom, targets, selectedTargets, setComposed, setHistory, setCopied]);

  const clearMods = () => {
    setActiveMods({});
    setCustom({ bonus: '', damage: '' });
  };

  const validActiveMods = Object.fromEntries(
    Object.entries(activeMods).filter(([id]) => modifiers.find(m => m.id === id))
  );

  // Avrae's !cast handles spell attacks — so any "attack" whose id matches
  // a spell is redundant in the Attacks tab. Filter at render time so the
  // underlying character data stays intact.
  const spellIds = new Set();
  for (const lvl of SLOT_LEVELS) {
    for (const s of (character.spells?.[lvl] || [])) spellIds.add(s.id);
  }
  const visibleAttacks = character.attacks.filter(a => !spellIds.has(a.id));

  const tabs = [
    { id: 'attacks', label: 'Attacks' },
    { id: 'spells',  label: 'Spells'  },
    { id: 'saves',   label: 'Saves'   },
    { id: 'skills',  label: 'Skills'  },
  ];

  // Spell levels with at least one prepared/known spell, in order.
  const populatedSpellLevels = SLOT_LEVELS
    .filter(lvl => (character.spells?.[lvl] || []).length > 0);

  return (
    <>
      <main className="relative z-10 px-6 pb-40 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-5 mt-4">
        <section className="lg:col-span-3">
          <TabBar tabs={tabs} current={tab} onChange={setTab} />

          {tab === 'attacks' && (
            visibleAttacks.length === 0 ? (
              <EmptyState text={
                character.attacks.length === 0
                  ? 'no attacks defined — open the Character tab to add some'
                  : 'all attacks are spells — see the Spells tab'
              } />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {visibleAttacks.map(a => (
                  <ActionCard key={a.id} title={a.name} sub={a.sub}
                    onClick={() => fire({ kind: 'attack', id: a.id, label: a.name, phrase: a.phrase })} />
                ))}
              </div>
            )
          )}

          {tab === 'spells' && (
            populatedSpellLevels.length === 0 ? (
              <EmptyState text="no spells prepared — open the Character tab to add some" />
            ) : (
              <SpellsPage
                character={character}
                populatedSpellLevels={populatedSpellLevels}
                spellLevel={spellLevel} setSpellLevel={setSpellLevel}
                castLevel={castLevel} setCastLevel={setCastLevel}
                fire={fire}
              />
            )
          )}

          {tab === 'saves' && (
            <div className="grid grid-cols-3 gap-3">
              {SAVE_DEFS.map(def => {
                const s = character.saves[def.id] || { mod: '', prof: false };
                return (
                  <ActionCard key={def.id} title={def.name}
                    sub={s.prof ? 'proficient' : 'untrained'}
                    right={<span className="font-cmd text-gold">{s.mod || '—'}</span>}
                    onClick={() => fire({ kind: 'save', id: def.id, label: `${def.name} save` })} />
                );
              })}
            </div>
          )}

          {tab === 'skills' && (
            <div className="grid grid-cols-2 gap-3">
              {SKILL_DEFS.map(def => {
                const s = character.skills[def.id] || { mod: '', prof: false, expertise: false };
                const tag = s.expertise ? ' · expertise' : s.prof ? ' · proficient' : '';
                return (
                  <ActionCard key={def.id} title={def.name}
                    sub={`${def.ability.toUpperCase()}${tag}`}
                    right={<span className="font-cmd text-gold">{s.mod || '—'}</span>}
                    onClick={() => fire({ kind: 'check', id: def.id, label: def.name })} />
                );
              })}
            </div>
          )}
        </section>

        <aside className="lg:col-span-2">
          <TargetsPanel
            targets={targets} folders={folders}
            selectedTargets={selectedTargets} setSelectedTargets={setSelectedTargets}
            actionAccepts={tab === 'attacks' || tab === 'spells'}
          />

          <div className="flex items-baseline justify-between mb-2 mt-5">
            <h2 className="font-display text-gold text-sm">MODIFIERS</h2>
            <button onClick={clearMods}
                    className="text-xs text-fade hover:text-parchment font-cmd">
              clear all
            </button>
          </div>
          <div className="divider mb-3" />

          <div className="space-y-2">
            {modifiers.map(m => (
              <ModifierRow key={m.id} mod={m}
                active={!!validActiveMods[m.id]}
                paramSelections={modParams[m.id] || {}}
                onToggle={() => toggleMod(m.id)}
                onParamChange={(pid, idx) => setModParam(m.id, pid, idx)} />
            ))}
            {modifiers.length === 0 && (
              <div className="text-fade italic text-sm text-center py-8">
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
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-cmd border-t border-gold-strong z-20">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="font-display text-gold text-xs uppercase tracking-widest">cmd</span>
            <code className={`font-cmd text-sm flex-1 truncate ${composed ? 'text-parchment' : 'text-fade'} ${copied ? 'flash' : ''}`}>
              {composed || 'click an action to compose a command…'}
            </code>
            {composed && (
              <button
                onClick={() => { navigator.clipboard?.writeText(composed); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
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
                  onClick={() => { navigator.clipboard?.writeText(h.cmd); setComposed(h.cmd); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
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
    </>
  );
}

function SpellsPage({ character, populatedSpellLevels, spellLevel, setSpellLevel, castLevel, setCastLevel, fire }) {
  // Resolve the level to display: use the user's selection if it's still
  // populated, otherwise fall back to the first populated level. We don't
  // need useEffect — derived values respond to data changes naturally.
  const activeLevel = (spellLevel != null && populatedSpellLevels.includes(spellLevel))
    ? spellLevel
    : populatedSpellLevels[0];

  const idx = populatedSpellLevels.indexOf(activeLevel);
  const canPrev = idx > 0;
  const canNext = idx >= 0 && idx < populatedSpellLevels.length - 1;
  const goPrev = () => canPrev && setSpellLevel(populatedSpellLevels[idx - 1]);
  const goNext = () => canNext && setSpellLevel(populatedSpellLevels[idx + 1]);

  const upcastTo = castLevel[activeLevel] || activeLevel;
  const upcasting = activeLevel > 0 && upcastTo > activeLevel;

  return (
    <div>
      <SpellLevelNav
        levels={populatedSpellLevels}
        current={activeLevel}
        onChange={setSpellLevel}
        onPrev={goPrev} onNext={goNext}
        canPrev={canPrev} canNext={canNext}
      />
      <SpellLevelHeader
        level={activeLevel}
        slots={character.spellSlots?.[activeLevel]}
        castLevel={upcastTo}
        onCastLevelChange={(v) => setCastLevel(p => ({ ...p, [activeLevel]: v }))}
      />
      <div className="grid grid-cols-2 gap-3">
        {character.spells[activeLevel].map(s => (
          <ActionCard key={s.id} title={s.name} sub={s.sub}
            right={upcasting
              ? <span className="text-gold font-cmd text-xs">L{upcastTo}</span>
              : null}
            onClick={() => fire({
              kind: 'spell', id: s.id, label: s.name,
              level: activeLevel, upcastTo,
              phrase: s.phrase,
            })} />
        ))}
      </div>
    </div>
  );
}

function SpellLevelNav({ levels, current, onChange, onPrev, onNext, canPrev, canNext }) {
  const labelFor = (lvl) => lvl === 0 ? 'Cantrips' : `L${lvl}`;
  return (
    <div className="flex items-center gap-2 mb-4 border-b border-gold pb-2">
      <button onClick={onPrev} disabled={!canPrev}
              className="text-gold disabled:opacity-30 hover:text-parchment text-lg font-cmd px-2 transition"
              title="previous level">
        ←
      </button>
      <div className="flex gap-1 flex-wrap justify-center flex-1">
        {levels.map(lvl => {
          const active = current === lvl;
          return (
            <button key={lvl} onClick={() => onChange(lvl)}
              className={`px-3 py-1 font-display text-xs uppercase tracking-wider transition border rounded-sm ${
                active
                  ? 'bg-active text-gold border-gold-strong glow-active'
                  : 'bg-card text-fade border-gold hover:text-parchment hover:bg-card-hover'
              }`}>
              {labelFor(lvl)}
            </button>
          );
        })}
      </div>
      <button onClick={onNext} disabled={!canNext}
              className="text-gold disabled:opacity-30 hover:text-parchment text-lg font-cmd px-2 transition"
              title="next level">
        →
      </button>
    </div>
  );
}

function SpellLevelHeader({ level, slots, castLevel, onCastLevelChange }) {
  if (level === 0) {
    return (
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-display text-sm text-gold uppercase tracking-wider">
          Cantrips · at will
        </h3>
      </div>
    );
  }
  const max = slots?.max ?? 0;
  const cur = slots?.current ?? 0;
  return (
    <div className="flex items-baseline justify-between mb-2">
      <h3 className="font-display text-sm text-gold uppercase tracking-wider">
        Level {level}{max > 0 && <> · {cur}/{max} slots</>}
      </h3>
      <div className="flex items-center gap-2 text-xs text-fade">
        <span>cast at:</span>
        <select className="lined" value={castLevel}
                onChange={e => onCastLevelChange(Number(e.target.value))}>
          {[level, level + 1, level + 2, level + 3].filter(n => n <= 9).map(n => (
            <option key={n} value={n}>L{n}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="text-fade italic text-sm text-center py-12 border border-gold rounded-sm">
      {text}
    </div>
  );
}

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
                     style={active ? { backgroundColor: '#d4a644', color: '#14100c' } : {}}>
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
