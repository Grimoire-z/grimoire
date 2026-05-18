import { useCallback, useState } from 'react';
import { compose } from '../composer.js';
import { SAVE_DEFS, SKILL_DEFS } from '../state.js';
import { TabBar, ActionCard } from '../components.jsx';
import { RollSidePanel, ComposerBar } from './RollChrome.jsx';

const SLOT_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function RollView({
  character, modifiers,
  targets, folders, selectedTargets, setSelectedTargets,
  settings, setSettings,
  tab, setTab,
  activeMods, setActiveMods, modParams, setModParams,
  custom, setCustom, castLevel, setCastLevel,
  composed, setComposed, history, setHistory, copied, setCopied,
}) {
  const [spellLevel, setSpellLevel] = useState(null);

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

  // Apply the prepared-only filter (settings.preparedOnly) once here, so
  // both the level pagination and the spell grid stay in sync. If the
  // filter strands the user on an empty level, SpellsPage falls back to
  // the first populated one.
  const preparedOnly = !!settings?.preparedOnly;
  const spellsByLevel = {};
  for (const lvl of SLOT_LEVELS) {
    const list = character.spells?.[lvl] || [];
    spellsByLevel[lvl] = preparedOnly ? list.filter(s => s.prepared) : list;
  }
  const populatedSpellLevels = SLOT_LEVELS.filter(lvl => spellsByLevel[lvl].length > 0);

  const togglePreparedOnly = () =>
    setSettings(s => ({ ...s, preparedOnly: !s.preparedOnly }));

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
              <EmptyState text={
                preparedOnly
                  ? 'no spells are marked prepared — toggle the filter off, or mark some prepared in the Character tab'
                  : 'no spells in this character — open the Character tab to add some'
              } />
            ) : (
              <SpellsPage
                character={character}
                spellsByLevel={spellsByLevel}
                populatedSpellLevels={populatedSpellLevels}
                spellLevel={spellLevel} setSpellLevel={setSpellLevel}
                castLevel={castLevel} setCastLevel={setCastLevel}
                fire={fire}
                preparedOnly={preparedOnly}
                onTogglePreparedOnly={togglePreparedOnly}
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

        <RollSidePanel
          modifiers={modifiers}
          activeMods={activeMods} setActiveMods={setActiveMods}
          modParams={modParams} setModParams={setModParams}
          targets={targets} folders={folders}
          selectedTargets={selectedTargets} setSelectedTargets={setSelectedTargets}
          actionAccepts={tab === 'attacks' || tab === 'spells'}
          custom={custom} setCustom={setCustom}
        />
      </main>

      <ComposerBar
        composed={composed} setComposed={setComposed}
        copied={copied} setCopied={setCopied}
        history={history}
      />
    </>
  );
}

function SpellsPage({ character, spellsByLevel, populatedSpellLevels, spellLevel, setSpellLevel, castLevel, setCastLevel, fire, preparedOnly, onTogglePreparedOnly }) {
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
  const activeSpells = spellsByLevel[activeLevel] || [];

  return (
    <div>
      <div className="flex justify-end mb-1">
        <PreparedOnlyToggle preparedOnly={preparedOnly} onToggle={onTogglePreparedOnly} />
      </div>
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
        {activeSpells.map(s => (
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

function PreparedOnlyToggle({ preparedOnly, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={preparedOnly ? 'showing prepared spells only — click to show all' : 'showing all spells — click to filter to prepared only'}
      aria-pressed={preparedOnly}
      className={`inline-flex items-center gap-2 px-2 py-1 border rounded-sm text-[11px] font-cmd uppercase tracking-wider transition ${
        preparedOnly
          ? 'border-gold-strong text-gold bg-active'
          : 'border-gold text-fade hover:text-parchment hover:bg-card-hover'
      }`}
    >
      <span
        className={`w-3.5 h-3.5 border rounded-sm inline-flex items-center justify-center text-[10px] ${
          preparedOnly ? 'border-gold-strong' : 'border-gold'
        }`}
        style={preparedOnly ? { backgroundColor: 'var(--color-gold)', color: 'var(--color-bg)' } : {}}
      >
        {preparedOnly && '✓'}
      </span>
      Prepared only
    </button>
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

