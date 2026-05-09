import { useCallback } from 'react';
import { compose } from '../composer.js';
import { SAVE_DEFS, SKILL_DEFS } from '../state.js';
import { TabBar, ActionCard, ModifierRow } from '../components.jsx';

const SLOT_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function RollView({
  character, modifiers,
  tab, setTab,
  activeMods, setActiveMods, modParams, setModParams,
  custom, setCustom, castLevel, setCastLevel,
  composed, setComposed, history, setHistory, copied, setCopied, channel,
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

  const fire = useCallback((action) => {
    const cmd = compose({
      action,
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
  }, [activeMods, modParams, modifiers, custom, setComposed, setHistory, setCopied]);

  const clearMods = () => {
    setActiveMods({});
    setCustom({ bonus: '', damage: '' });
  };

  const validActiveMods = Object.fromEntries(
    Object.entries(activeMods).filter(([id]) => modifiers.find(m => m.id === id))
  );

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
            character.attacks.length === 0 ? (
              <EmptyState text="no attacks defined — open the Character tab to add some" />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {character.attacks.map(a => (
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
              <div className="space-y-5">
                {populatedSpellLevels.map(level => (
                  <div key={level}>
                    <SpellLevelHeader
                      level={level}
                      slots={character.spellSlots?.[level]}
                      castLevel={castLevel[level] || level}
                      onCastLevelChange={(v) => setCastLevel(p => ({ ...p, [level]: v }))} />
                    <div className="grid grid-cols-2 gap-3">
                      {character.spells[level].map(s => (
                        <ActionCard key={s.id} title={s.name} sub={s.sub}
                          right={(castLevel[level] || level) > level
                            ? <span className="text-gold font-cmd text-xs">L{castLevel[level]}</span>
                            : null}
                          onClick={() => fire({
                            kind: 'spell', id: s.id, label: s.name,
                            level, upcastTo: castLevel[level] || level,
                            phrase: s.phrase,
                          })} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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
                const s = character.skills[def.id] || { mod: '', prof: false };
                return (
                  <ActionCard key={def.id} title={def.name}
                    sub={`${def.ability.toUpperCase()}${s.prof ? ' · proficient' : ''}`}
                    right={<span className="font-cmd text-gold">{s.mod || '—'}</span>}
                    onClick={() => fire({ kind: 'check', id: def.id, label: def.name })} />
                );
              })}
            </div>
          )}
        </section>

        <aside className="lg:col-span-2">
          <div className="flex items-baseline justify-between mb-2">
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
              <>
                <button
                  onClick={() => { navigator.clipboard?.writeText(composed); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold px-3 py-1.5 hover:bg-active transition"
                >
                  {copied ? '✓ copied' : '📋 copy'}
                </button>
                <button
                  onClick={() => alert(`Phase 2: would relay to ${channel} via browser extension.\n\nFor now, the command is on your clipboard — paste into Discord.`)}
                  className="text-xs font-cmd uppercase tracking-wider text-parchment bg-active border border-gold px-3 py-1.5 hover:bg-card-hover transition"
                  title="Phase 2: browser-extension relay"
                >
                  ↗ send to {channel}
                </button>
              </>
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
