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
import { ActionCard } from '../components.jsx';
import { RollSidePanel, ComposerBar } from './RollChrome.jsx';

const SAVE_LABELS = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

// 5e.tools skill keys come in two flavors (snake and camel) depending
// on the source; we hand the raw key to Avrae's `!check` (its matcher
// is forgiving) but display them readably.
const SKILL_LABELS = {
  acrobatics:      'Acrobatics',
  animalHandling:  'Animal Handling',
  animal_handling: 'Animal Handling',
  arcana:          'Arcana',
  athletics:       'Athletics',
  deception:       'Deception',
  history:         'History',
  insight:         'Insight',
  intimidation:    'Intimidation',
  investigation:   'Investigation',
  medicine:        'Medicine',
  nature:          'Nature',
  perception:      'Perception',
  performance:     'Performance',
  persuasion:      'Persuasion',
  religion:        'Religion',
  sleightOfHand:   'Sleight of Hand',
  sleight_of_hand: 'Sleight of Hand',
  stealth:         'Stealth',
  survival:        'Survival',
};

export default function DmRollView({
  monsters, modifiers,
  targets, folders, selectedTargets, setSelectedTargets,
  activeMods, setActiveMods, modParams, setModParams,
  custom, setCustom,
  composed, setComposed, history, setHistory, copied, setCopied,
}) {
  const fire = useCallback((action) => {
    const targetNames = targets.filter(t => selectedTargets[t.id]).map(t => t.name);
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

  // Init-add bypasses the regular composer pipeline — `!i madd` isn't
  // one of the kind-driven commands and doesn't take targets/modifiers.
  // `!i madd "<name>"` is Avrae's "monster add" subcommand: looks up
  // the monster in Avrae's bestiary, auto-loads stats + actions, rolls
  // init off the monster's Dex mod. That makes downstream `!attack
  // "<action>"` calls land against a populated action list — much
  // richer than a generic `!init add`-only combatant.
  const fireInitAdd = useCallback((monster) => {
    const cmd = `!i madd "${monster.name}"`;
    setComposed(cmd);
    setHistory(prev => [{
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      label: `${monster.name} · init add`, cmd,
    }, ...prev].slice(0, 8));
    if (navigator.clipboard) navigator.clipboard.writeText(cmd).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [setComposed, setHistory, setCopied]);

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

  // Sort active monsters by name for stable layout.
  const sorted = monsters.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));

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
            <div className="space-y-5">
              {sorted.map(m => (
                <MonsterRollCard
                  key={m.id}
                  monster={m}
                  fire={fire}
                  onInitAdd={() => fireInitAdd(m)}
                  outOfTurn={!!outOfTurnIds[m.id]}
                  onToggleOutOfTurn={() => toggleOutOfTurn(m.id)}
                />
              ))}
            </div>
          )}
        </section>

        <RollSidePanel
          modifiers={modifiers}
          activeMods={activeMods} setActiveMods={setActiveMods}
          modParams={modParams} setModParams={setModParams}
          targets={targets} folders={folders}
          selectedTargets={selectedTargets} setSelectedTargets={setSelectedTargets}
          actionAccepts={true}
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

function MonsterRollCard({ monster, fire, onInitAdd, outOfTurn, onToggleOutOfTurn }) {
  const summary = compactSummary(monster);
  const saveEntries  = monster.saves  ? Object.entries(monster.saves).filter(([, v]) => v != null && v !== '')  : [];
  const skillEntries = monster.skills ? Object.entries(monster.skills).filter(([, v]) => v != null && v !== '') : [];
  const actions          = Array.isArray(monster.actions)          ? monster.actions          : [];
  const legendaryActions = Array.isArray(monster.legendaryActions) ? monster.legendaryActions : [];

  const hasAnyButtons = actions.length || legendaryActions.length || saveEntries.length || skillEntries.length;

  // Avrae's `!i a` looks up by name on the current combatant's loaded
  // actions — pass the original action name (e.g. "Tail Slap"), not the
  // slugified id, so the lookup succeeds. `initContext: true` flips
  // compose() from the player `!attack` form to the init-aware `!i a`.
  // When the per-card `outOfTurn` checkbox is on, compose() further
  // flips to `!i offturnattack "<combatant>" "<action>"` so a specific
  // monster can attack while another combatant is current in init.
  const onAction = (action) => fire({
    kind: 'attack',
    id: action.name,
    label: `${monster.name} · ${action.name}${outOfTurn ? ' (OOT)' : ''}`,
    initContext: true,
    outOfTurn,
    combatantName: monster.name,
  });

  return (
    <div className="border border-gold-strong bg-card rounded-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gold bg-active">
        <div className="min-w-0">
          <div className="font-display text-lg text-gold uppercase tracking-wider truncate">
            {monster.name || '— unnamed —'}
          </div>
          {summary && <div className="text-fade text-xs italic truncate">{summary}</div>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
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
          <button
            type="button"
            onClick={onInitAdd}
            title={`!i madd "${monster.name}"`}
            className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold px-2 py-1 hover:bg-card-hover transition"
          >
            ↻ init add
          </button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-4">
        {actions.length > 0 && (
          <ButtonGroup label="Actions">
            {actions.map(a => (
              <ActionCard
                key={a.id}
                title={a.name}
                onClick={() => onAction(a)}
              />
            ))}
          </ButtonGroup>
        )}

        {legendaryActions.length > 0 && (
          <ButtonGroup label="Legendary Actions">
            {legendaryActions.map(a => (
              <ActionCard
                key={a.id}
                title={a.name}
                onClick={() => onAction(a)}
              />
            ))}
          </ButtonGroup>
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
                  label: `${monster.name} · ${SAVE_LABELS[ability] || ability.toUpperCase()} save${outOfTurn ? ' (OOT)' : ''}`,
                  initContext: true,
                  outOfTurn,
                  combatantName: monster.name,
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
                  label: `${monster.name} · ${SKILL_LABELS[skill] || skill}${outOfTurn ? ' (OOT)' : ''}`,
                  initContext: true,
                  outOfTurn,
                  combatantName: monster.name,
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

function compactSummary(m) {
  const idParts = [m.size, m.type].filter(Boolean).join(' ');
  const combat = [];
  if (m.cr != null && m.cr !== '')  combat.push(`CR ${m.cr}`);
  if (typeof m.ac === 'number')     combat.push(`AC ${m.ac}`);
  if (m.hp?.average != null)        combat.push(`HP ${m.hp.average}`);
  return [idParts, combat.join(' · ')].filter(Boolean).join(' · ');
}
