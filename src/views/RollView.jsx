import { useCallback, useState } from 'react';
import { compose } from '../composer.js';
import { SAVE_DEFS, SKILL_DEFS } from '../state.js';
import { onActivate } from '../components.jsx';
import { RollSidePanel, ComposerBar, useComposerEmit } from './RollChrome.jsx';

const SLOT_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function RollView({
  character, updateCharacter, modifiers,
  targets, folders, setFolders, selectedTargets, setSelectedTargets,
  settings, setSettings,
  tab, setTab,
  activeMods, setActiveMods, modParams, setModParams,
  custom, setCustom, castLevel, setCastLevel,
  composed, setComposed, history, setHistory, copied, setCopied,
}) {
  const [spellLevel, setSpellLevel] = useState(null);
  // The most recently fired action OBJECT — drives both the source-row
  // highlight (lastFired.kind/.id) and the ComposerBar re-fire button (which
  // re-runs fire() with the current target/modifier selections). Reset on
  // character switch via App.jsx's `key={activeCharacterId}` remount.
  const [lastFired, setLastFired] = useState(null);
  const emit = useComposerEmit({ setComposed, setHistory, setCopied });

  const fire = useCallback((action) => {
    const targetNames = targets
      .filter(t => selectedTargets[t.id])
      .map(t => t.name);
    const cmd = compose({
      action: { ...action, targets: targetNames },
      activeMods: Object.keys(activeMods),
      modParams, modifiers, custom,
    });
    setLastFired(action);
    emit(action.label, cmd);
    // Auto-expend the slot actually spent (the upcast level). Cantrips
    // (upcastTo 0) are skipped; an already-empty level is left alone rather
    // than blocking the cast — Avrae decrements its own sheet regardless.
    if (action.kind === 'spell' && action.upcastTo >= 1) {
      updateCharacter(ch => {
        const slot = ch.spellSlots?.[action.upcastTo];
        if (!slot || slot.current <= 0) return ch;
        return {
          ...ch,
          spellSlots: { ...ch.spellSlots, [action.upcastTo]: { ...slot, current: slot.current - 1 } },
        };
      });
    }
  }, [activeMods, modParams, modifiers, custom, targets, selectedTargets, emit, updateCharacter]);

  // Re-fire the last action with whatever targets/modifiers are selected
  // NOW — the "same attack, next goblin" loop. Re-expending a slot on a
  // re-fired spell is intentional (it's a real second cast).
  const refire = useCallback(() => {
    if (lastFired) fire(lastFired);
  }, [lastFired, fire]);

  // Avrae's !cast handles spell attacks — so any "attack" whose id matches
  // a spell is redundant in the Attacks tab. Filter at render time so the
  // underlying character data stays intact.
  const spellIds = new Set();
  for (const lvl of SLOT_LEVELS) {
    for (const s of (character.spells?.[lvl] || [])) spellIds.add(s.id);
  }
  const visibleAttacks = character.attacks.filter(a => !spellIds.has(a.id));

  // Apply the prepared-only filter (settings.preparedOnly) once here, so
  // both the level pagination and the spell grid stay in sync. If the
  // filter strands the user on an empty level, ActionsColumn falls back
  // to the first populated one.
  const preparedOnly = !!settings?.preparedOnly;
  const spellsByLevel = {};
  for (const lvl of SLOT_LEVELS) {
    const list = character.spells?.[lvl] || [];
    spellsByLevel[lvl] = preparedOnly ? list.filter(s => s.prepared) : list;
  }
  const populatedSpellLevels = SLOT_LEVELS.filter(lvl => spellsByLevel[lvl].length > 0);

  const togglePreparedOnly = () =>
    setSettings(s => ({ ...s, preparedOnly: !s.preparedOnly }));

  // ── Favorites ── per-character pinned actions. `fav.has(descriptor)`
  // tests membership and `fav.toggle(descriptor)` flips it; descriptors are
  // { kind, id, level? } (level only on spells, since the same spell id can
  // sit at two levels). Drives the star on each CompactRow and the pinned
  // strip above the grid.
  const favorites = character.favorites || [];
  const favKeyOf = (f) => `${f.kind}:${f.id}:${f.level ?? ''}`;
  const favSet = new Set(favorites.map(favKeyOf));
  const toggleFav = useCallback((descriptor) => {
    const k = `${descriptor.kind}:${descriptor.id}:${descriptor.level ?? ''}`;
    updateCharacter(ch => {
      const list = ch.favorites || [];
      const exists = list.some(f => `${f.kind}:${f.id}:${f.level ?? ''}` === k);
      return { ...ch, favorites: exists ? list.filter(f => `${f.kind}:${f.id}:${f.level ?? ''}` !== k) : [...list, descriptor] };
    });
  }, [updateCharacter]);
  const fav = { has: (f) => favSet.has(favKeyOf(f)), toggle: toggleFav };

  return (
    <>
      <main className="relative z-10 px-6 pb-40 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-5 mt-4">
        <section className="lg:col-span-3">
          <FavoritesStrip favorites={favorites} character={character} castLevel={castLevel} fire={fire} />
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-1 space-y-3">
              <SavesColumn
                character={character}
                fire={fire}
                lastFired={lastFired}
                fav={fav}
              />
              <SpellSlotsTracker
                character={character}
                updateCharacter={updateCharacter}
                emit={emit}
              />
            </div>
            <SkillsColumn
              character={character}
              fire={fire}
              lastFired={lastFired}
              fav={fav}
            />
            <ActionsColumn
              tab={tab} setTab={setTab}
              character={character}
              visibleAttacks={visibleAttacks}
              spellsByLevel={spellsByLevel}
              populatedSpellLevels={populatedSpellLevels}
              spellLevel={spellLevel} setSpellLevel={setSpellLevel}
              castLevel={castLevel} setCastLevel={setCastLevel}
              fire={fire}
              lastFired={lastFired}
              fav={fav}
              preparedOnly={preparedOnly}
              onTogglePreparedOnly={togglePreparedOnly}
            />
          </div>
        </section>

        <RollSidePanel
          modifiers={modifiers}
          activeMods={activeMods} setActiveMods={setActiveMods}
          modParams={modParams} setModParams={setModParams}
          targets={targets} folders={folders} setFolders={setFolders}
          selectedTargets={selectedTargets} setSelectedTargets={setSelectedTargets}
          actionAccepts={true}
          custom={custom} setCustom={setCustom}
        />
      </main>

      <ComposerBar
        composed={composed} setComposed={setComposed}
        copied={copied} setCopied={setCopied}
        history={history}
        emit={emit}
        onRefire={lastFired ? refire : null}
      />
    </>
  );
}

// ─── Saves column ──────────────────────────────────────────────────────
// Compact list of the six ability saves. Each row: proficiency dot,
// ability code, modifier value. Whole row is clickable → !save.

function SavesColumn({ character, fire, lastFired, fav }) {
  return (
    <div>
      <ColumnHeader>Saving Throws</ColumnHeader>
      <div className="border border-gold rounded-sm bg-card divide-gold">
        {SAVE_DEFS.map(def => {
          const s = character.saves[def.id] || { mod: '', prof: false };
          const active = lastFired?.kind === 'save' && lastFired?.id === def.id;
          return (
            <CompactRow key={def.id} active={active}
              fav={fav} favDescriptor={{ kind: 'save', id: def.id }}
              onClick={() => fire({ kind: 'save', id: def.id, label: `${def.name} save` })}>
              <ProfDot prof={s.prof} />
              <span className="font-display text-xs tracking-wide text-parchment">{def.name}</span>
              <span className="ml-auto font-cmd text-sm text-gold">{s.mod || '+0'}</span>
            </CompactRow>
          );
        })}
      </div>
    </div>
  );
}

// ─── Spell slots tracker ──────────────────────────────────────────────
// Lives under the saves column. One row per leveled slot the character
// owns (skip cantrips — they're at-will). Each row shows the level and
// a row of dots representing slots; filled = available, hollow = spent.
// Clicking a filled dot expends one (current--); clicking an empty dot
// restores one (current++). Mutates character.spellSlots, so the
// SpellLevelHeader on the Spells tab and the character sheet itself
// pick the change up automatically.

function SpellSlotsTracker({ character, updateCharacter, emit }) {
  const slots = character.spellSlots || {};
  const usedLevels = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    .filter(lvl => (slots[lvl]?.max ?? 0) > 0);

  if (usedLevels.length === 0) return null;

  const setCurrent = (level, next) => {
    updateCharacter(ch => {
      const cur = ch.spellSlots?.[level] || { current: 0, max: 0 };
      const clamped = Math.max(0, Math.min(cur.max, next));
      return {
        ...ch,
        spellSlots: {
          ...(ch.spellSlots || {}),
          [level]: { ...cur, current: clamped },
        },
      };
    });
  };

  // Long rest: emit !g lr AND refill every dot — the common case (you rest,
  // Avrae resets, the tracker resets in one gesture).
  const longRest = () => {
    updateCharacter(ch => {
      const next = { ...(ch.spellSlots || {}) };
      for (const lvl of usedLevels) {
        const slot = next[lvl];
        if (slot) next[lvl] = { ...slot, current: slot.max };
      }
      return { ...ch, spellSlots: next };
    });
    emit?.('Long Rest', '!g lr');
  };

  // Short rest: emit !g sr only, dots untouched. CLAUDE.md documents that the
  // tracker sums wizard + pact slots into one {current,max}; short rest
  // restores only pact slots, so a blanket dot-refill would drift for every
  // non-warlock caster.
  const shortRest = () => emit?.('Short Rest', '!g sr');

  return (
    <div>
      <ColumnHeader right={
        <span className="flex gap-2">
          <button
            type="button"
            onClick={shortRest}
            title="short rest — copies !g sr (slot dots unchanged; pact slots restore in Avrae)"
            className="font-cmd text-[10px] uppercase tracking-wider text-fade hover:text-gold transition"
          >
            SR
          </button>
          <button
            type="button"
            onClick={longRest}
            title="long rest — copies !g lr and refills all slot dots"
            className="font-cmd text-[10px] uppercase tracking-wider text-fade hover:text-gold transition"
          >
            ↻ LR
          </button>
        </span>
      }>
        Spell Slots
      </ColumnHeader>
      <div className="border border-gold rounded-sm bg-card divide-gold">
        {usedLevels.map(level => {
          const { current, max } = slots[level];
          return (
            <div key={level} className="flex items-center gap-2 px-2 py-1.5">
              <span className="font-display text-xs text-parchment flex-shrink-0">L{level}</span>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: max }, (_, i) => {
                  const filled = i < current;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCurrent(level, filled ? current - 1 : current + 1)}
                      title={filled ? 'click to expend a slot' : 'click to restore a slot'}
                      className="w-3 h-3 rounded-full border flex-shrink-0 cursor-pointer transition hover:opacity-80"
                      style={{
                        borderColor: 'var(--color-gold)',
                        backgroundColor: filled ? 'var(--color-gold)' : 'transparent',
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Skills column ──────────────────────────────────────────────────────
// Compact list of all 18 skills. Each row: proficiency dot, ability
// tag, skill name, modifier. Click → !check.

function SkillsColumn({ character, fire, lastFired, fav }) {
  return (
    <div className="md:col-span-2 min-w-0">
      <ColumnHeader>Skills</ColumnHeader>
      <div className="border border-gold rounded-sm bg-card divide-gold">
        {SKILL_DEFS.map(def => {
          const s = character.skills[def.id] || { mod: '', prof: false, expertise: false };
          const active = lastFired?.kind === 'check' && lastFired?.id === def.id;
          return (
            <CompactRow key={def.id} active={active}
              fav={fav} favDescriptor={{ kind: 'check', id: def.id }}
              onClick={() => fire({ kind: 'check', id: def.id, label: def.name })}>
              <ProfDot prof={s.prof} expertise={s.expertise} />
              <span className="font-display text-[10px] tracking-wider text-fade uppercase w-7 flex-shrink-0">
                {def.ability}
              </span>
              <span className="text-sm text-parchment truncate">{def.name}</span>
              <span className="ml-auto font-cmd text-sm text-gold">{s.mod || '+0'}</span>
            </CompactRow>
          );
        })}
      </div>
    </div>
  );
}

// ─── Actions column (Attacks / Spells) ─────────────────────────────────
// Internal tab toggle between attacks and spells. Spell tab keeps the
// per-level pagination since slot tracking + upcast picker live per
// level — packing all levels into one stack would lose the slot UI.

function ActionsColumn({
  tab, setTab,
  character, visibleAttacks,
  spellsByLevel, populatedSpellLevels,
  spellLevel, setSpellLevel,
  castLevel, setCastLevel,
  fire, lastFired, fav,
  preparedOnly, onTogglePreparedOnly,
}) {
  // Only attacks and spells live in this column; the old saves/skills
  // tab values shouldn't reach this side, but coerce defensively.
  const current = tab === 'spells' ? 'spells' : 'attacks';

  return (
    <div className="md:col-span-3 min-w-0">
      <div className="flex items-center gap-1 mb-2">
        <PillTab active={current === 'attacks'} onClick={() => setTab('attacks')}>Attacks</PillTab>
        <PillTab active={current === 'spells'}  onClick={() => setTab('spells')}>Spells</PillTab>
        {current === 'spells' && (
          <div className="ml-auto">
            <PreparedOnlyToggle preparedOnly={preparedOnly} onToggle={onTogglePreparedOnly} />
          </div>
        )}
      </div>

      {current === 'attacks' && (
        visibleAttacks.length === 0 ? (
          <EmptyState text={
            character.attacks.length === 0
              ? 'no attacks defined — open the Character tab to add some'
              : 'all attacks are spells — see the Spells tab'
          } />
        ) : (
          <div className="border border-gold rounded-sm bg-card divide-gold">
            {visibleAttacks.map(a => {
              const active = lastFired?.kind === 'attack' && lastFired?.id === a.id;
              return (
                <CompactRow key={a.id} active={active} stacked
                  fav={fav} favDescriptor={{ kind: 'attack', id: a.id }}
                  onClick={() => fire({ kind: 'attack', id: a.id, label: a.name, phrase: a.phrase })}>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-sm uppercase tracking-wide text-parchment truncate">{a.name}</div>
                    {a.sub && <div className="text-[11px] text-fade italic truncate">{a.sub}</div>}
                  </div>
                </CompactRow>
              );
            })}
          </div>
        )
      )}

      {current === 'spells' && (
        populatedSpellLevels.length === 0 ? (
          <EmptyState text={
            preparedOnly
              ? 'no spells are marked prepared — toggle the filter off, or mark some prepared in the Character tab'
              : 'no spells in this character — open the Character tab to add some'
          } />
        ) : (
          <SpellsPane
            character={character}
            spellsByLevel={spellsByLevel}
            populatedSpellLevels={populatedSpellLevels}
            spellLevel={spellLevel} setSpellLevel={setSpellLevel}
            castLevel={castLevel} setCastLevel={setCastLevel}
            fire={fire}
            lastFired={lastFired}
            fav={fav}
          />
        )
      )}
    </div>
  );
}

function SpellsPane({ character, spellsByLevel, populatedSpellLevels, spellLevel, setSpellLevel, castLevel, setCastLevel, fire, lastFired, fav }) {
  const activeLevel = (spellLevel != null && populatedSpellLevels.includes(spellLevel))
    ? spellLevel
    : populatedSpellLevels[0];
  const activeSpells = spellsByLevel[activeLevel] || [];
  const isCantrip = activeLevel === 0;

  // Cast-at for a spell defaults to its native level (the level bucket
  // it sits in). Dropdown options run from that native level up to L9,
  // so Fireball (L3) shows L3-L9, Magic Missile (L1) shows L1-L9, etc.
  // Cantrips don't upcast — no dropdown is rendered for them.
  //
  // The castLevel map is keyed by `${level}:${id}`, NOT bare id: DDB only
  // dedups spell ids within a level, so the same id can appear at two
  // levels (Invisibility at L2 and an upcast-prepared copy at L4). A bare
  // id would share one slot between them, leaving one dropdown showing a
  // value outside its own option range and firing the wrong upcastTo.
  const castKey  = (spell) => `${activeLevel}:${spell.id}`;
  const castAtFor = (spell) => castLevel[castKey(spell)] ?? activeLevel;

  return (
    <div>
      <SpellLevelNav
        levels={populatedSpellLevels}
        current={activeLevel}
        onChange={setSpellLevel}
      />
      <SpellLevelHeader
        level={activeLevel}
        slots={character.spellSlots?.[activeLevel]}
      />
      <div className="border border-gold rounded-sm bg-card divide-gold">
        {activeSpells.map(s => {
          const active = lastFired?.kind === 'spell' && lastFired?.id === s.id;
          const upcastTo = castAtFor(s);
          return (
            <CompactRow key={s.id} active={active} stacked
              fav={fav} favDescriptor={{ kind: 'spell', id: s.id, level: activeLevel }}
              onClick={() => fire({
                kind: 'spell', id: s.id, label: s.name,
                level: activeLevel, upcastTo,
                phrase: s.phrase,
              })}>
              <div className="min-w-0 flex-1">
                <div className="font-display text-sm uppercase tracking-wide text-parchment truncate">{s.name}</div>
                {s.sub && <div className="text-[11px] text-fade italic truncate">{s.sub}</div>}
              </div>
              {!isCantrip && (
                <select
                  onClick={e => e.stopPropagation()}
                  className="lined flex-shrink-0 text-[10px]"
                  value={upcastTo}
                  onChange={e => setCastLevel(p => ({ ...p, [castKey(s)]: Number(e.target.value) }))}
                  title="cast at level"
                >
                  {Array.from({ length: 10 - activeLevel }, (_, i) => activeLevel + i).map(n => (
                    <option key={n} value={n}>L{n}</option>
                  ))}
                </select>
              )}
            </CompactRow>
          );
        })}
      </div>
    </div>
  );
}

// ─── Favorites ─────────────────────────────────────────────────────────
// Resolve a stored favorite descriptor { kind, id, level? } back to a
// fire-able action by looking it up in the live character, so renames,
// edits, and the current upcast selection are reflected. Returns null if
// the source action no longer exists (deleted spell/attack) — the strip
// just drops it.
function resolveFavorite(f, character, castLevel) {
  if (f.kind === 'save') {
    const def = SAVE_DEFS.find(d => d.id === f.id);
    return def ? { label: def.name, action: { kind: 'save', id: def.id, label: `${def.name} save` } } : null;
  }
  if (f.kind === 'check') {
    const def = SKILL_DEFS.find(d => d.id === f.id);
    return def ? { label: def.name, action: { kind: 'check', id: def.id, label: def.name } } : null;
  }
  if (f.kind === 'attack') {
    const a = (character.attacks || []).find(x => x.id === f.id);
    return a ? { label: a.name || a.id, action: { kind: 'attack', id: a.id, label: a.name, phrase: a.phrase } } : null;
  }
  if (f.kind === 'spell') {
    const lvl = f.level ?? 0;
    const s = (character.spells?.[lvl] || []).find(x => x.id === f.id);
    if (!s) return null;
    const upcastTo = castLevel[`${lvl}:${s.id}`] ?? lvl;
    return { label: s.name || s.id, action: { kind: 'spell', id: s.id, label: s.name, level: lvl, upcastTo, phrase: s.phrase } };
  }
  return null;
}

function FavoritesStrip({ favorites, character, castLevel, fire }) {
  const resolved = favorites.map(f => resolveFavorite(f, character, castLevel)).filter(Boolean);
  if (resolved.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="font-display text-gold text-[10px] uppercase tracking-wider mr-1">★ favorites</span>
      {resolved.map((r, i) => (
        <button
          key={i}
          type="button"
          onClick={() => fire(r.action)}
          className="text-xs font-cmd text-parchment border border-gold rounded-sm px-2 py-1 hover:bg-active hover:text-gold transition"
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

// ─── Reusable column bits ──────────────────────────────────────────────

function ColumnHeader({ children, right }) {
  return (
    <div className="flex items-baseline justify-between mb-2 px-1 gap-2">
      <h2 className="font-display text-gold text-xs uppercase tracking-wider">{children}</h2>
      {right}
    </div>
  );
}

// A single compact clickable row used by all three columns. `stacked`
// gives a bit more vertical breathing room for two-line entries
// (attacks/spells) while saves/skills stay tight on one line.
function CompactRow({ children, active, onClick, stacked, fav, favDescriptor }) {
  const faved = fav && favDescriptor ? fav.has(favDescriptor) : false;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onActivate(onClick)}
      className={`group flex items-center gap-2 cursor-pointer transition ${stacked ? 'px-2 py-1.5' : 'px-2 py-1'} ${
        active ? 'bg-active glow-active' : 'hover:bg-card-hover'
      }`}
    >
      {children}
      {fav && favDescriptor && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); fav.toggle(favDescriptor); }}
          title={faved ? 'unpin from favorites' : 'pin to favorites'}
          className={`flex-shrink-0 text-sm leading-none transition ${
            faved ? 'text-gold' : 'text-fade opacity-0 group-hover:opacity-100 hover:text-gold'
          }`}
        >
          {faved ? '★' : '☆'}
        </button>
      )}
    </div>
  );
}

// Proficiency indicator. Three visually distinct states:
//   untrained  → hollow ring (gold outline only)
//   proficient → solid filled disk
//   expertise  → outer ring + inner filled dot (donut/target look)
function ProfDot({ prof, expertise }) {
  if (expertise) {
    return (
      <span
        className="w-3 h-3 rounded-full border flex-shrink-0 flex items-center justify-center"
        style={{ borderColor: 'var(--color-gold)' }}
        title="expertise"
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: 'var(--color-gold)' }}
        />
      </span>
    );
  }
  if (prof) {
    return (
      <span
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: 'var(--color-gold)' }}
        title="proficient"
      />
    );
  }
  return (
    <span
      className="w-3 h-3 rounded-full border flex-shrink-0"
      style={{ borderColor: 'var(--color-gold)' }}
      title="untrained"
    />
  );
}

function PillTab({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 font-display text-xs uppercase tracking-wider border rounded-sm transition ${
        active
          ? 'bg-active text-gold border-gold-strong glow-active'
          : 'bg-card text-fade border-gold hover:text-parchment hover:bg-card-hover'
      }`}>
      {children}
    </button>
  );
}

function PreparedOnlyToggle({ preparedOnly, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={preparedOnly ? 'showing prepared spells only — click to show all' : 'showing all spells — click to filter to prepared only'}
      aria-pressed={preparedOnly}
      className={`inline-flex items-center gap-1.5 px-2 py-1 border rounded-sm text-[10px] font-cmd uppercase tracking-wider transition ${
        preparedOnly
          ? 'border-gold-strong text-gold bg-active'
          : 'border-gold text-fade hover:text-parchment hover:bg-card-hover'
      }`}
    >
      <span
        className={`w-3 h-3 border rounded-sm inline-flex items-center justify-center text-[9px] ${
          preparedOnly ? 'border-gold-strong' : 'border-gold'
        }`}
        style={preparedOnly ? { backgroundColor: 'var(--color-gold)', color: 'var(--color-bg)' } : {}}
      >
        {preparedOnly && '✓'}
      </span>
      Prepared
    </button>
  );
}

function SpellLevelNav({ levels, current, onChange }) {
  const labelFor = (lvl) => lvl === 0 ? 'C' : `L${lvl}`;
  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {levels.map(lvl => {
        const active = current === lvl;
        return (
          <button key={lvl} onClick={() => onChange(lvl)}
            className={`px-2 py-0.5 font-display text-[11px] uppercase tracking-wider transition border rounded-sm ${
              active
                ? 'bg-active text-gold border-gold-strong glow-active'
                : 'bg-card text-fade border-gold hover:text-parchment hover:bg-card-hover'
            }`}>
            {labelFor(lvl)}
          </button>
        );
      })}
    </div>
  );
}

function SpellLevelHeader({ level, slots }) {
  if (level === 0) {
    return (
      <div className="mb-1.5 px-1">
        <h3 className="font-display text-[11px] text-gold uppercase tracking-wider">
          Cantrips · at will
        </h3>
      </div>
    );
  }
  const max = slots?.max ?? 0;
  const cur = slots?.current ?? 0;
  return (
    <div className="mb-1.5 px-1">
      <h3 className="font-display text-[11px] text-gold uppercase tracking-wider truncate">
        L{level}{max > 0 && <> · {cur}/{max}</>}
      </h3>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="text-fade italic text-xs text-center py-6 px-2 border border-gold rounded-sm">
      {text}
    </div>
  );
}
