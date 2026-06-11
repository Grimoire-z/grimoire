// DM Roll surface. Shows each active monster from the Bestiary as a
// card with clickable buttons that compose Avrae commands. Combat is
// initiative-driven (locked in slice 0 design): each card has a per-
// monster `!init add 1d20 "<name>"` helper to bootstrap the encounter,
// and the action / save / skill buttons emit plain `!attack` / `!save`
// / `!check` since Avrae rolls those against whichever combatant is
// currently active in init. Our cards are reference + button source —
// init bookkeeping happens in Discord chat.
//
// Reuses `RollSidePanel` (targets + modifiers + custom bonuses) and
// `ComposerBar` (composed cmd + history) from `RollChrome.jsx`, so the
// experience is identical to player Roll aside from the central area.

import { useCallback, useState } from 'react';
import { compose } from '../composer.js';
import { SAVE_DEFS, SKILL_DEFS } from '../state.js';
import { ActionCard } from '../components.jsx';
import { RollSidePanel, ComposerBar, useComposerEmit } from './RollChrome.jsx';
import StatBlockModal from './StatBlockModal.jsx';

// Derived from the canonical defs (was two hand-maintained maps). The
// `|| key` fallback at the call sites still covers monsters imported before
// skill keys were normalized to camelCase.
const SAVE_LABELS  = Object.fromEntries(SAVE_DEFS.map(d => [d.id, d.name]));
const SKILL_LABELS = Object.fromEntries(SKILL_DEFS.map(d => [d.id, d.name]));

// First-letter acronym of a multi-word name, uppercased. Used as the
// combatant identifier in emitted commands so a fight against "Adult
// Silver Dragon" types out as `!i offturnattack "ASD" ...` instead of
// re-typing the full name in every command. Single-word names collapse
// to a single letter (Goblin → G). UI/history labels keep the full
// name; only the command arg is acronymed.
function acronym(name) {
  if (!name) return '';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

// Truncate an action description to a tooltip-friendly length.
function descTooltip(desc) {
  if (!desc) return '';
  const flat = String(desc).replace(/\s+/g, ' ').trim();
  return flat.length > 320 ? `${flat.slice(0, 317)}…` : flat;
}

// "R5" / "R6" recharge badge text (recharge 5 means "recharges on 5-6").
function rechargeLabel(n) {
  return n >= 6 ? 'R6' : `R${n}+`;
}

export default function DmRollView({
  monsters, updateMonster, modifiers,
  targets, folders, setFolders, selectedTargets, setSelectedTargets,
  activeMods, setActiveMods, modParams, setModParams,
  custom, setCustom,
  composed, setComposed, history, setHistory, copied, setCopied,
}) {
  const emit = useComposerEmit({ setComposed, setHistory, setCopied });
  // Full last-fired action, for the ComposerBar re-fire button (recompose
  // with the current targets/modifiers). Ephemeral — resets on tab/mode change.
  const [lastFired, setLastFired] = useState(null);

  const fire = useCallback((action) => {
    const targetNames = targets.filter(t => selectedTargets[t.id]).map(t => t.name);
    const cmd = compose({
      action: { ...action, targets: targetNames },
      activeMods: Object.keys(activeMods),
      modParams, modifiers, custom,
    });
    setLastFired(action);
    emit(action.label, cmd);
  }, [activeMods, modParams, modifiers, custom, targets, selectedTargets, emit]);

  const refire = useCallback(() => { if (lastFired) fire(lastFired); }, [lastFired, fire]);

  // Which monster's stat block is open in the read-only modal (id), opened
  // from a card header so the DM can check details mid-fight.
  const [viewingId, setViewingId] = useState(null);

  // Init-add bypasses the regular composer pipeline — `!i madd` isn't
  // one of the kind-driven commands and doesn't take targets/modifiers.
  // `!i madd "<lookup>"` is Avrae's "monster add" subcommand: looks up
  // the monster in Avrae's bestiary by name, auto-loads stats + actions,
  // rolls init off the monster's Dex mod. The `-name "<cmdName>"` flag
  // registers the combatant under our acronym (`ASD`, `ASD1`, …) so OOT
  // commands later can target the exact instance. We always pass `-name`
  // when an acronym exists so the registered name is predictable —
  // letting Avrae default would name it "Adult Silver Dragon" which we'd
  // then have to retype in every OOT command.
  const fireInitAdd = useCallback((lookupName, cmdName, displayName, count = 1, acro = '') => {
    // count > 1: Avrae's `-n <count> -name "X#"` adds copies auto-numbered
    // X1..Xn (and -rollhp randomizes each one's HP) — replaces the old
    // duplicate-the-card-N-times workaround. Single add keeps the predictable
    // -name "<cmdName>" so OOT commands can target it.
    if (count > 1) {
      const base = acro || acronym(lookupName) || lookupName;
      emit(`${displayName || lookupName} · init add ×${count}`, `!i madd "${lookupName}" -n ${count} -name "${base}#" -rollhp`);
      return;
    }
    const cmd = cmdName && cmdName !== lookupName
      ? `!i madd "${lookupName}" -name "${cmdName}"`
      : `!i madd "${lookupName}"`;
    emit(`${displayName || lookupName} · init add`, cmd);
  }, [emit]);

  // Per-monster "out of turn" toggle. Ephemeral on purpose — OOT is a
  // moment-to-moment combat state (you flip it on for a reaction, off
  // again for the next normal turn), not a stored property of the
  // monster. Resets when DmRollView unmounts (tab/mode change).
  const [outOfTurnIds, setOutOfTurnIds] = useState({});
  const toggleOutOfTurn = useCallback((monsterId) => {
    setOutOfTurnIds(prev => {
      const next = { ...prev };
      if (next[monsterId]) delete next[monsterId];
      else next[monsterId] = true;
      return next;
    });
  }, []);

  // Per-monster card-collapse toggle. Lets a DM keep many monsters
  // active without the action grid swallowing the whole page; only
  // expand the one whose turn it is. Same ephemeral lifetime as the
  // OOT flags — resets on tab/mode change.
  const [collapsedIds, setCollapsedIds] = useState({});
  const toggleCollapsed = useCallback((monsterId) => {
    setCollapsedIds(prev => {
      const next = { ...prev };
      if (next[monsterId]) delete next[monsterId];
      else next[monsterId] = true;
      return next;
    });
  }, []);

  // Per-monster instance number (1–10). When set, gets suffixed onto
  // the monster's name wherever the combatant name appears in a
  // command — init-add, OOT family. Lets a DM keep one Goblin card
  // active and just flip it between Goblin1/Goblin2/Goblin3 as combat
  // rotates through them; or duplicate the card and give each copy a
  // unique number for a true multi-card roster. Ephemeral.
  const [instanceById, setInstanceById] = useState({});
  const setInstance = useCallback((monsterId, number) => {
    setInstanceById(prev => {
      const next = { ...prev };
      if (number == null) delete next[monsterId];
      else next[monsterId] = number;
      return next;
    });
  }, []);

  // Sort active monsters by name for stable layout.
  const sorted = monsters.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Bulk collapse/expand. When everything is collapsed, the button
  // offers expand; otherwise (all-expanded or mixed) the next-most-
  // useful click is collapse. Only shows when there are 2+ active
  // monsters — a single card doesn't need a bulk toggle.
  const allCollapsed = sorted.length > 0 && sorted.every(m => collapsedIds[m.id]);
  const toggleAll = () => {
    if (allCollapsed) setCollapsedIds({});
    else              setCollapsedIds(Object.fromEntries(sorted.map(m => [m.id, true])));
  };

  // Roster-level "add all to init" — one !multiline block with a madd line per
  // active monster, so a whole encounter is one paste instead of N round-trips.
  const addAllToInit = () => {
    if (sorted.length === 0) return;
    const lines = sorted.map(m => {
      const a = acronym(m.name);
      const inst = instanceById[m.id];
      const cn = a ? (inst ? `${a}${inst}` : a) : (m.name || '');
      return cn && cn !== m.name ? `!i madd "${m.name}" -name "${cn}"` : `!i madd "${m.name}"`;
    });
    emit(`Add ${sorted.length} to init`, `!multiline\n${lines.join('\n')}`);
  };

  return (
    <>
      <main className="relative z-10 px-6 pb-40 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-5 mt-4">
        <section className="lg:col-span-3">
          {sorted.length === 0 ? (
            <div className="text-fade italic text-sm text-center py-12 border border-gold rounded-sm">
              no active monsters — head to the <span className="text-gold">Bestiary</span> and check
              the "active" box on any monster you want to surface here.
            </div>
          ) : (
            <div>
              <div className="flex justify-end items-center gap-3 mb-2">
                <button
                  type="button"
                  onClick={addAllToInit}
                  title="compose a !multiline block that adds every active monster to initiative"
                  className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold px-2 py-1 hover:bg-active transition"
                >
                  ⚔ add all to init
                </button>
                {sorted.length > 1 && (
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-parchment transition"
                  >
                    {allCollapsed ? '▼ expand all' : '▶ collapse all'}
                  </button>
                )}
              </div>
              <div className="space-y-5">
                {sorted.map(m => {
                  const instance    = instanceById[m.id] || null;
                  const acro        = acronym(m.name);
                  const cmdName     = acro ? (instance ? `${acro}${instance}` : acro) : (m.name || '');
                  const displayName = instance ? `${m.name} ${instance}` : m.name;
                  return (
                    <MonsterRollCard
                      key={m.id}
                      monster={m}
                      cmdName={cmdName}
                      displayName={displayName}
                      acro={acro}
                      fire={fire}
                      emit={emit}
                      onView={() => setViewingId(m.id)}
                      onInitAdd={(count) => fireInitAdd(m.name, cmdName, displayName, count, acro)}
                      outOfTurn={!!outOfTurnIds[m.id]}
                      onToggleOutOfTurn={() => toggleOutOfTurn(m.id)}
                      collapsed={!!collapsedIds[m.id]}
                      onToggleCollapsed={() => toggleCollapsed(m.id)}
                      instanceNumber={instance}
                      onInstanceNumberChange={(n) => setInstance(m.id, n)}
                    />
                  );
                })}
              </div>
            </div>
          )}
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

      {viewingId && (() => {
        const m = monsters.find(x => x.id === viewingId);
        if (!m) return null;
        return (
          <StatBlockModal
            monster={m}
            setMonster={(updater) => updateMonster(viewingId, updater)}
            onClose={() => setViewingId(null)}
          />
        );
      })()}
    </>
  );
}

function MonsterRollCard({
  monster, cmdName, displayName, acro,
  fire, onInitAdd, onView, emit,
  outOfTurn, onToggleOutOfTurn,
  collapsed, onToggleCollapsed,
  instanceNumber, onInstanceNumberChange,
}) {
  const summary = compactSummary(monster);
  const saveEntries  = monster.saves  ? Object.entries(monster.saves).filter(([, v]) => v != null && v !== '')  : [];
  const skillEntries = monster.skills ? Object.entries(monster.skills).filter(([, v]) => v != null && v !== '') : [];
  const actions          = Array.isArray(monster.actions)          ? monster.actions          : [];
  const bonusActions     = Array.isArray(monster.bonusActions)     ? monster.bonusActions     : [];
  const reactions        = Array.isArray(monster.reactions)        ? monster.reactions        : [];
  const legendaryActions = Array.isArray(monster.legendaryActions) ? monster.legendaryActions : [];
  const spellcasting     = Array.isArray(monster.spellcasting)     ? monster.spellcasting     : [];
  const traits           = Array.isArray(monster.traits)           ? monster.traits           : [];

  // Legendary-resistance count parsed from the "Legendary Resistance (N/Day)"
  // trait name, if present.
  const legResTrait = traits.find(t => /legendary resistance/i.test(t.name || ''));
  const legResMax = legResTrait ? (Number((String(legResTrait.name).match(/\((\d+)\s*\/\s*day\)/i) || [])[1]) || 0) : 0;

  const hasAnyButtons = actions.length || bonusActions.length || reactions.length ||
    legendaryActions.length || spellcasting.length || saveEntries.length || skillEntries.length;

  // ── Card-local combat state (ephemeral, resets on tab/mode change like the
  // parent's OOT/collapse maps) ──
  const [hp, setHp] = useState(monster.hp?.average ?? null);
  const [dmgAmt, setDmgAmt] = useState('');
  const [addCount, setAddCount] = useState(1);
  const [ignoreReqs, setIgnoreReqs] = useState(false);
  const [legUsed, setLegUsed] = useState(0);     // legendary actions spent this round
  const [legResUsed, setLegResUsed] = useState(0); // legendary resistances spent
  const maxHp = monster.hp?.average ?? null;

  // `cmdName` is the acronymed combatant identifier ("ASD"/"ASD1"); the suffix
  // only matters where the combatant NAME appears in a command (init-add, the
  // !i offturn* family, !i hp). In-turn !i a/s/c use Avrae's current-combatant
  // pointer. Avrae looks actions up by name on the loaded combatant, so we
  // pass the action's display name, not the slug id.
  const onAction = (action) => fire({
    kind: 'attack',
    id: action.name,
    label: `${displayName} · ${action.name}${outOfTurn ? ' (OOT)' : ''}`,
    initContext: true,
    outOfTurn,
    combatantName: cmdName,
  });

  // Reactions are out-of-turn BY DEFINITION, so they force the offturn branch
  // regardless of the card's OOT checkbox.
  const onReaction = (action) => fire({
    kind: 'attack',
    id: action.name,
    label: `${displayName} · ${action.name} (reaction)`,
    initContext: true,
    outOfTurn: true,
    combatantName: cmdName,
  });

  const onSpell = (spell) => fire({
    kind: 'spell',
    id: spell.name,
    label: `${displayName} · ${spell.name}${outOfTurn ? ' (OOT)' : ''}`,
    initContext: true,
    outOfTurn,
    combatantName: cmdName,
    ignoreReqs,
  });

  // Legendary action: fire the action AND tick the economy pip counter.
  const onLegendary = (action) => {
    onAction(action);
    setLegUsed(u => Math.min(3, u + 1));
  };

  // HP via Avrae's !i hp <combatant> <±delta>. Local hp mirrors it for display.
  const applyHp = (delta) => {
    if (!cmdName || !delta) return;
    const sign = delta > 0 ? `+${delta}` : `${delta}`;
    emit(`${displayName} · ${delta < 0 ? 'damage' : 'heal'} ${Math.abs(delta)}`, `!i hp "${cmdName}" ${sign}`);
    setHp(h => {
      const base = (h ?? maxHp ?? 0) + delta;
      return Math.max(0, maxHp != null ? Math.min(maxHp, base) : base);
    });
  };
  const onDamage = () => { const n = parseInt(dmgAmt, 10); if (n > 0) { applyHp(-n); setDmgAmt(''); } };
  const onHeal   = () => { const n = parseInt(dmgAmt, 10); if (n > 0) { applyHp(n);  setDmgAmt(''); } };
  const onKill   = () => { if (cmdName) emit(`${displayName} · remove`, `!i remove "${cmdName}"`); };

  // Recharge: roll 1d6 to see if the ability comes back.
  const onRecharge = (action) => emit(`${displayName} · ${action.name} recharge`, '!r 1d6');

  return (
    <div className="border border-gold-strong bg-card rounded-sm overflow-hidden">
      <div className={`flex items-start justify-between gap-3 px-4 py-3 bg-active ${collapsed ? '' : 'border-b border-gold'}`}>
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={onToggleCollapsed}
            title={collapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!collapsed}
            className="text-gold hover:text-parchment text-sm font-cmd leading-none mt-1 flex-shrink-0 transition"
          >
            {collapsed ? '▶' : '▼'}
          </button>
          <div className="min-w-0">
            <button
              type="button"
              onClick={onView}
              title="view stat block"
              className="font-display text-lg text-gold uppercase tracking-wider truncate hover:text-parchment transition text-left block max-w-full"
            >
              {monster.name || '— unnamed —'}
            </button>
            {summary && <div className="text-fade text-xs italic truncate">{summary}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <label
            className="inline-flex items-center gap-1.5 text-xs font-cmd uppercase tracking-wider text-fade cursor-pointer"
            title={
              `Instance number. The monster's name is acronymed in commands (e.g. "Adult Silver Dragon" → "ASD"); ` +
              `this number suffixes it. This card resolves as "${cmdName || '—'}" in init-add and OOT commands.`
            }
          >
            <span className={instanceNumber ? 'text-gold' : ''}>#</span>
            <select
              className="lined"
              value={instanceNumber || ''}
              onChange={e => onInstanceNumberChange(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label
            className="inline-flex items-center gap-2 cursor-pointer select-none"
            title="When checked, every roll button on this card composes the Avrae !i offturn{attack,save,check} variant so this monster acts out of turn (reactions, opportunity attacks, triggered saves, passive checks during another combatant's turn)."
          >
            <span
              className={`w-3.5 h-3.5 border rounded-sm flex items-center justify-center text-xs flex-shrink-0 ${
                outOfTurn ? 'border-gold-strong' : 'border-gold'
              }`}
              style={outOfTurn ? { backgroundColor: 'var(--color-gold)', color: 'var(--color-bg)' } : {}}
            >
              {outOfTurn && '✓'}
            </span>
            <span className={`text-xs font-cmd uppercase tracking-wider ${outOfTurn ? 'text-gold' : 'text-fade'}`}>
              Out of turn
            </span>
            <input
              type="checkbox"
              checked={outOfTurn}
              onChange={onToggleOutOfTurn}
              className="sr-only"
            />
          </label>
          <div className="inline-flex items-center gap-1" title={
            addCount > 1
              ? `!i madd "${monster.name}" -n ${addCount} -name "${acro || cmdName}#" -rollhp`
              : (cmdName && cmdName !== monster.name
                  ? `!i madd "${monster.name}" -name "${cmdName}"`
                  : `!i madd "${monster.name}"`)
          }>
            <select
              className="lined"
              value={addCount}
              onChange={e => setAddCount(Number(e.target.value))}
              title="how many copies to add (auto-numbered G1, G2, …)"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>×{n}</option>)}
            </select>
            <button
              type="button"
              onClick={() => onInitAdd(addCount)}
              className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold px-2 py-1 hover:bg-card-hover transition"
            >
              ↻ init add
            </button>
          </div>
        </div>
      </div>

      {!collapsed && (
      <div className="px-4 py-3 space-y-4">
        {maxHp != null && (
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-display text-gold uppercase tracking-wider">HP</span>
            <span className="font-cmd text-parchment">{hp ?? maxHp}/{maxHp}</span>
            <input
              type="number" min="1"
              value={dmgAmt}
              onChange={e => setDmgAmt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onDamage(); }}
              placeholder="amt"
              className="lined w-16 font-cmd"
            />
            <button type="button" onClick={onDamage} title={`!i hp "${cmdName}" -<amt>`}
              className="font-cmd text-crimson border border-crimson rounded-sm px-2 py-0.5 hover:bg-active transition">− dmg</button>
            <button type="button" onClick={onHeal} title={`!i hp "${cmdName}" +<amt>`}
              className="font-cmd text-gold border border-gold rounded-sm px-2 py-0.5 hover:bg-active transition">+ heal</button>
            <button type="button" onClick={onKill} title={`!i remove "${cmdName}"`}
              className="font-cmd text-fade border border-gold rounded-sm px-2 py-0.5 hover:text-crimson transition ml-auto">💀 remove</button>
          </div>
        )}

        {actions.length > 0 && (
          <ButtonGroup label="Actions">
            {actions.map(a => (
              <ActionCard
                key={a.id}
                title={a.name}
                tooltip={descTooltip(a.description)}
                right={a.recharge != null ? (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onRecharge(a); }}
                    title={`recharge — roll 1d6 (recharges on ${a.recharge >= 6 ? '6' : `${a.recharge}-6`})`}
                    className="font-cmd text-[10px] text-gold border border-gold rounded-sm px-1 hover:bg-active">{rechargeLabel(a.recharge)}</button>
                ) : null}
                onClick={() => onAction(a)}
              />
            ))}
          </ButtonGroup>
        )}

        {bonusActions.length > 0 && (
          <ButtonGroup label="Bonus Actions">
            {bonusActions.map(a => (
              <ActionCard key={a.id} title={a.name} tooltip={descTooltip(a.description)} onClick={() => onAction(a)} />
            ))}
          </ButtonGroup>
        )}

        {reactions.length > 0 && (
          <ButtonGroup label="Reactions · out of turn">
            {reactions.map(a => (
              <ActionCard key={a.id} title={a.name} tooltip={descTooltip(a.description)} onClick={() => onReaction(a)} />
            ))}
          </ButtonGroup>
        )}

        {spellcasting.length > 0 && (
          <SpellcastingGroups
            blocks={spellcasting}
            ignoreReqs={ignoreReqs}
            onToggleIgnoreReqs={() => setIgnoreReqs(v => !v)}
            onSpell={onSpell}
          />
        )}

        {legendaryActions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2 gap-2">
              <h4 className="font-display text-gold uppercase tracking-wider text-xs">Legendary Actions</h4>
              <div className="flex items-center gap-2">
                <Pips used={legUsed} total={3} onSet={setLegUsed} />
                <button type="button" onClick={() => setLegUsed(0)} className="text-[10px] font-cmd text-fade hover:text-gold uppercase tracking-wider">reset</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {legendaryActions.map(a => (
                <ActionCard
                  key={a.id}
                  title={a.name}
                  tooltip={descTooltip(a.description)}
                  right={a.recharge != null ? (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onRecharge(a); }}
                      title="recharge — roll 1d6" className="font-cmd text-[10px] text-gold border border-gold rounded-sm px-1 hover:bg-active">{rechargeLabel(a.recharge)}</button>
                  ) : null}
                  onClick={() => onLegendary(a)}
                />
              ))}
            </div>
            {legResMax > 0 && (
              <div className="flex items-center gap-2 mt-2 text-[11px]">
                <span className="font-cmd text-fade uppercase tracking-wider">Legendary Resistance</span>
                <Pips used={legResUsed} total={legResMax} onSet={setLegResUsed} />
              </div>
            )}
          </div>
        )}

        {saveEntries.length > 0 && (
          <ButtonGroup label="Saves">
            {saveEntries.map(([ability, mod]) => (
              <ActionCard
                key={ability}
                title={SAVE_LABELS[ability] || ability.toUpperCase()}
                right={<span className="font-cmd text-gold text-xs">{mod}</span>}
                onClick={() => fire({
                  kind: 'save',
                  id: ability,
                  label: `${displayName} · ${SAVE_LABELS[ability] || ability.toUpperCase()} save${outOfTurn ? ' (OOT)' : ''}`,
                  initContext: true,
                  outOfTurn,
                  combatantName: cmdName,
                })}
              />
            ))}
          </ButtonGroup>
        )}

        {skillEntries.length > 0 && (
          <ButtonGroup label="Skills">
            {skillEntries.map(([skill, mod]) => (
              <ActionCard
                key={skill}
                title={SKILL_LABELS[skill] || skill}
                right={<span className="font-cmd text-gold text-xs">{mod}</span>}
                onClick={() => fire({
                  kind: 'check',
                  id: skill,
                  label: `${displayName} · ${SKILL_LABELS[skill] || skill}${outOfTurn ? ' (OOT)' : ''}`,
                  initContext: true,
                  outOfTurn,
                  combatantName: cmdName,
                })}
              />
            ))}
          </ButtonGroup>
        )}

        {!hasAnyButtons && (
          <div className="text-fade italic text-sm py-2">
            no rollable actions — this monster has no imported actions, saves, or skills yet.
          </div>
        )}
      </div>
      )}
    </div>
  );
}

function ButtonGroup({ label, children }) {
  return (
    <div>
      <h4 className="font-display text-gold uppercase tracking-wider text-xs mb-2">{label}</h4>
      <div className="grid grid-cols-2 gap-2">
        {children}
      </div>
    </div>
  );
}

// Clickable pip row for tracking a limited economy (legendary actions per
// round, legendary resistances per day). Filled = spent. Clicking pip i marks
// i+1 spent; clicking the last-spent pip frees one back, so a misclick is
// correctable. Ephemeral — purely a play aid, no command emitted.
function Pips({ used, total, onSet }) {
  return (
    <span className="inline-flex gap-1 items-center">
      {Array.from({ length: total }, (_, i) => {
        const filled = i < used;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSet(filled && i === used - 1 ? i : i + 1)}
            title={filled ? 'spent — click to free one' : 'available — click to spend'}
            className="w-2.5 h-2.5 rounded-full border flex-shrink-0"
            style={{ borderColor: 'var(--color-gold)', backgroundColor: filled ? 'var(--color-gold)' : 'transparent' }}
          />
        );
      })}
    </span>
  );
}

// Monster spellcasting blocks → button groups. Each spell fires !i cast; the
// per-card "ignore reqs (-i)" toggle covers at-will / X-per-day innate casting
// where Avrae's slot validation would otherwise refuse.
function SpellcastingGroups({ blocks, ignoreReqs, onToggleIgnoreReqs, onSpell }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <h4 className="font-display text-gold uppercase tracking-wider text-xs">Spells</h4>
        <label
          className="inline-flex items-center gap-1.5 cursor-pointer text-[10px] font-cmd uppercase tracking-wider select-none"
          title="append -i so Avrae ignores cast requirements — needed for a monster's at-will / X-per-day innate spells"
        >
          <span
            className={`w-3 h-3 border rounded-sm inline-flex items-center justify-center text-[8px] ${ignoreReqs ? 'border-gold-strong' : 'border-gold'}`}
            style={ignoreReqs ? { backgroundColor: 'var(--color-gold)', color: 'var(--color-bg)' } : {}}
          >
            {ignoreReqs && '✓'}
          </span>
          <span className={ignoreReqs ? 'text-gold' : 'text-fade'}>ignore reqs (-i)</span>
          <input type="checkbox" checked={ignoreReqs} onChange={onToggleIgnoreReqs} className="sr-only" />
        </label>
      </div>
      {blocks.map((block, bi) => (
        <div key={bi} className="mb-2 last:mb-0">
          {block.header && <div className="text-fade text-[11px] italic mb-1">{block.header}</div>}
          <div className="grid grid-cols-2 gap-2">
            {block.spells.map((sp, si) => (
              <ActionCard
                key={si}
                title={sp.name}
                right={sp.freq ? <span className="font-cmd text-fade text-[10px]">{sp.freq}</span> : null}
                onClick={() => onSpell(sp)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function compactSummary(m) {
  const idParts = [m.size, m.type].filter(Boolean).join(' ');
  const combat = [];
  if (m.cr != null && m.cr !== '')  combat.push(`CR ${m.cr}`);
  if (typeof m.ac === 'number')     combat.push(`AC ${m.ac}`);
  if (m.hp?.average != null)        combat.push(`HP ${m.hp.average}`);
  return [idParts, combat.join(' · ')].filter(Boolean).join(' · ');
}
