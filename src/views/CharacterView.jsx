import { useState } from 'react';
import { SAVE_DEFS, SKILL_DEFS } from '../state.js';
import { Checkbox, FieldLabel, SectionCard } from '../components.jsx';
import { importDdbText, mapDdbJson } from '../ddbImport.js';
import { importDdbPdfFile } from '../ddbPdfImport.js';

const SLOT_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function CharacterView({ character, setCharacter }) {
  const patch = (p) => setCharacter(c => ({ ...c, ...p }));
  const patchHp = (p) => setCharacter(c => ({ ...c, hp: { ...c.hp, ...p } }));
  const patchSave = (id, p) =>
    setCharacter(c => ({
      ...c,
      saves: { ...c.saves, [id]: { ...(c.saves[id] || { mod: '', prof: false }), ...p } },
    }));
  const patchSkill = (id, p) =>
    setCharacter(c => ({
      ...c,
      skills: { ...c.skills, [id]: { ...(c.skills[id] || { mod: '', prof: false }), ...p } },
    }));
  const patchAbility = (id, value) =>
    setCharacter(c => ({ ...c, abilities: { ...c.abilities, [id]: value } }));
  const patchSlot = (level, p) =>
    setCharacter(c => ({
      ...c,
      spellSlots: { ...c.spellSlots, [level]: { ...c.spellSlots[level], ...p } },
    }));

  return (
    <main className="relative z-10 px-6 pb-12 max-w-7xl mx-auto mt-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="space-y-5">
        <Identity character={character} patch={patch} />
        <Combat character={character} patch={patch} patchHp={patchHp} />
        <Abilities character={character} patchAbility={patchAbility} />
        <Saves character={character} patchSave={patchSave} />
        <Skills character={character} patchSkill={patchSkill} />
      </div>
      <div className="space-y-5">
        <DdbImport setCharacter={setCharacter} />
        <Attacks character={character} setCharacter={setCharacter} />
        <Spells character={character} setCharacter={setCharacter} patchSlot={patchSlot} />
      </div>
    </main>
  );
}

function Identity({ character, patch }) {
  return (
    <SectionCard title="identity">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>Name</FieldLabel>
          <input className="lined" value={character.name}
                 onChange={e => patch({ name: e.target.value })} />
        </div>
        <div>
          <FieldLabel>Pronouns</FieldLabel>
          <input className="lined" value={character.pronouns || ''}
                 onChange={e => patch({ pronouns: e.target.value })} />
        </div>
        <div>
          <FieldLabel>Ancestry / Race</FieldLabel>
          <input className="lined" value={character.ancestry || ''}
                 onChange={e => patch({ ancestry: e.target.value })} />
        </div>
        <div>
          <FieldLabel>Class</FieldLabel>
          <input className="lined" value={character.klass || ''}
                 onChange={e => patch({ klass: e.target.value })} />
        </div>
        <div>
          <FieldLabel>Level</FieldLabel>
          <input className="lined" type="number" min="1" max="20"
                 value={character.level}
                 onChange={e => patch({ level: Number(e.target.value) || 1 })} />
        </div>
      </div>
    </SectionCard>
  );
}

function Combat({ character, patch, patchHp }) {
  return (
    <SectionCard title="combat">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <FieldLabel>HP current</FieldLabel>
          <input className="lined" type="number" value={character.hp.current}
                 onChange={e => patchHp({ current: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <FieldLabel>HP max</FieldLabel>
          <input className="lined" type="number" value={character.hp.max}
                 onChange={e => patchHp({ max: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <FieldLabel>HP temp</FieldLabel>
          <input className="lined" type="number" value={character.hp.temp}
                 onChange={e => patchHp({ temp: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <FieldLabel>AC</FieldLabel>
          <input className="lined" type="number" value={character.ac}
                 onChange={e => patch({ ac: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <FieldLabel>Speed</FieldLabel>
          <input className="lined" type="number" value={character.speed}
                 onChange={e => patch({ speed: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <FieldLabel>Prof bonus</FieldLabel>
          <input className="lined" type="number" value={character.profBonus}
                 onChange={e => patch({ profBonus: Number(e.target.value) || 0 })} />
        </div>
      </div>
    </SectionCard>
  );
}

function Abilities({ character, patchAbility }) {
  const abilities = character.abilities || {};
  return (
    <SectionCard title="ability scores">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {SAVE_DEFS.map(def => {
          const val = abilities[def.id] ?? 10;
          const mod = Math.floor((val - 10) / 2);
          const sign = mod >= 0 ? '+' : '';
          return (
            <div key={def.id} className="text-center bg-grimoire border border-gold rounded-sm py-2">
              <div className="text-fade text-xs uppercase tracking-wider">{def.name}</div>
              <input
                className="lined text-center font-cmd text-base"
                style={{ textAlign: 'center' }}
                type="number" value={val}
                onChange={e => patchAbility(def.id, Number(e.target.value) || 0)} />
              <div className="text-gold font-cmd text-xs">{sign}{mod}</div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function Saves({ character, patchSave }) {
  return (
    <SectionCard title="saving throws">
      <div className="grid grid-cols-2 gap-2">
        {SAVE_DEFS.map(def => {
          const s = character.saves[def.id] || { mod: '', prof: false };
          return (
            <div key={def.id} className="flex items-center gap-2 bg-grimoire border border-gold rounded-sm px-2 py-1.5">
              <Checkbox label="" checked={s.prof}
                        onChange={() => patchSave(def.id, { prof: !s.prof })} />
              <span className="font-display text-xs text-parchment uppercase tracking-wide w-10">{def.name}</span>
              <input className="lined flex-1 text-right font-cmd" placeholder="+0"
                     value={s.mod}
                     onChange={e => patchSave(def.id, { mod: e.target.value })} />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function Skills({ character, patchSkill }) {
  const cycle = (s) => {
    // none → prof → expertise → none
    if (s.expertise) return { prof: false, expertise: false };
    if (s.prof)      return { prof: true,  expertise: true  };
    return                   { prof: true,  expertise: false };
  };
  return (
    <SectionCard title="skills">
      <div className="text-fade text-xs italic mb-2">
        click the box to cycle untrained → proficient (✓) → expertise (★)
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SKILL_DEFS.map(def => {
          const s = character.skills[def.id] || { mod: '', prof: false, expertise: false };
          return (
            <div key={def.id} className="flex items-center gap-2 bg-grimoire border border-gold rounded-sm px-2 py-1.5">
              <ProfTriState skill={s} onCycle={() => patchSkill(def.id, cycle(s))} />
              <span className="text-xs text-fade font-cmd w-8 uppercase">{def.ability}</span>
              <span className="text-sm text-parchment flex-1 truncate">{def.name}</span>
              <input className="lined w-14 text-right font-cmd" placeholder="+0"
                     value={s.mod}
                     onChange={e => patchSkill(def.id, { mod: e.target.value })} />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// Small chip-shaped toggle for the per-spell "prepared" flag. Filled gold
// when prepared; outlined when not. Mirrors the visual vocabulary of the
// prof checkboxes but uses a "Prep" label so it isn't visually confused
// with the prof ✓ / expertise ★ symbols.
function PreparedToggle({ prepared, onToggle }) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); onToggle(); }}
      title={prepared ? 'prepared — click to unprepare' : 'not prepared — click to prepare'}
      className={`col-span-1 inline-flex items-center justify-center h-5 px-1.5 border rounded-sm font-cmd text-[10px] font-bold uppercase tracking-wider transition ${
        prepared ? 'border-gold-strong' : 'border-gold text-fade hover:text-parchment'
      }`}
      style={prepared ? { backgroundColor: 'var(--color-gold)', color: 'var(--color-bg)' } : {}}
    >
      Prep
    </button>
  );
}

function ProfTriState({ skill, onCycle }) {
  const filled = skill.prof || skill.expertise;
  const symbol = skill.expertise ? '★' : skill.prof ? '✓' : '';
  const title = skill.expertise
    ? 'expertise (click to clear)'
    : skill.prof
      ? 'proficient (click for expertise)'
      : 'untrained (click for proficient)';
  return (
    <button
      onClick={(e) => { e.preventDefault(); onCycle(); }}
      title={title}
      className={`w-3.5 h-3.5 border rounded-sm flex items-center justify-center text-xs flex-shrink-0 transition ${
        filled ? 'border-gold-strong' : 'border-gold'
      }`}
      style={filled ? { backgroundColor: '#d4a644', color: '#14100c' } : {}}
    >
      {symbol}
    </button>
  );
}

function Attacks({ character, setCharacter }) {
  const update = (i, patch) =>
    setCharacter(c => ({
      ...c,
      attacks: c.attacks.map((a, idx) => idx === i ? { ...a, ...patch } : a),
    }));
  const add = () =>
    setCharacter(c => ({
      ...c,
      attacks: [...c.attacks, { id: '', name: '', sub: '' }],
    }));
  const remove = (i) =>
    setCharacter(c => ({ ...c, attacks: c.attacks.filter((_, idx) => idx !== i) }));

  return (
    <SectionCard title="attacks"
      right={<button onClick={add} className="text-xs font-cmd text-gold border border-gold px-2 py-0.5 hover:bg-active rounded-sm">+ add</button>}>
      {character.attacks.length === 0 && (
        <div className="text-fade italic text-sm py-2">none — click + add</div>
      )}
      <div className="space-y-2">
        {character.attacks.map((a, i) => (
          <div key={i} className="bg-grimoire border border-gold rounded-sm px-2 py-1.5 space-y-1.5">
            <div className="grid grid-cols-12 gap-2 items-center">
              <input className="lined col-span-4 font-cmd" placeholder="id (Avrae name)"
                     value={a.id}
                     onChange={e => update(i, { id: e.target.value })} />
              <input className="lined col-span-3" placeholder="display name"
                     value={a.name}
                     onChange={e => update(i, { name: e.target.value })} />
              <input className="lined col-span-4" placeholder="subtitle"
                     value={a.sub}
                     onChange={e => update(i, { sub: e.target.value })} />
              <button onClick={() => remove(i)} className="text-fade hover:text-crimson text-sm col-span-1">✕</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-fade text-xs uppercase tracking-wider w-14">phrase</span>
              <input className="lined flex-1" placeholder='flavor text · e.g. "for the oath!"'
                     value={a.phrase || ''}
                     onChange={e => update(i, { phrase: e.target.value })} />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function Spells({ character, setCharacter, patchSlot }) {
  // Session-only UI state: which levels are expanded, which individual
  // spells are open for editing. Not persisted — defaulting to all
  // collapsed each session is what makes the spellbook compact again.
  const [openLevels, setOpenLevels] = useState({});
  const [openSpells, setOpenSpells] = useState({}); // key: `${level}.${idx}`

  const toggleLevel = (level) =>
    setOpenLevels(o => ({ ...o, [level]: !o[level] }));
  const toggleSpell = (level, i) =>
    setOpenSpells(o => ({ ...o, [`${level}.${i}`]: !o[`${level}.${i}`] }));

  const updateSpell = (level, i, patch) =>
    setCharacter(c => ({
      ...c,
      spells: {
        ...c.spells,
        [level]: c.spells[level].map((s, idx) => idx === i ? { ...s, ...patch } : s),
      },
    }));

  // Newly-added spells start blank, so auto-open them for editing and
  // make sure the containing level is expanded too.
  const addSpell = (level) => {
    const newIdx = (character.spells[level] || []).length;
    setCharacter(c => ({
      ...c,
      spells: { ...c.spells, [level]: [...(c.spells[level] || []), { id: '', name: '', sub: '' }] },
    }));
    setOpenLevels(o => ({ ...o, [level]: true }));
    setOpenSpells(o => ({ ...o, [`${level}.${newIdx}`]: true }));
  };

  // On removal, shift openSpells keys for the same level down by one for
  // any index above the removed one, so the open/closed state stays
  // pinned to the right spell instead of drifting to its neighbor.
  const removeSpell = (level, idx) => {
    setCharacter(c => ({
      ...c,
      spells: { ...c.spells, [level]: c.spells[level].filter((_, i) => i !== idx) },
    }));
    setOpenSpells(o => {
      const next = {};
      Object.entries(o).forEach(([k, v]) => {
        const [l, i] = k.split('.').map(Number);
        if (l !== level)  next[k] = v;
        else if (i < idx) next[k] = v;
        else if (i > idx) next[`${level}.${i - 1}`] = v;
        // i === idx → drop
      });
      return next;
    });
  };

  return (
    <SectionCard title="spells">
      <div className="space-y-1.5">
        {SLOT_LEVELS.map(level => {
          const spells = character.spells[level] || [];
          const slots  = character.spellSlots?.[level] || { current: 0, max: 0 };
          const preparedCount = spells.filter(s => s.prepared).length;
          const isOpen = !!openLevels[level];
          return (
            <div key={level} className="bg-grimoire border border-gold rounded-sm">
              <div className="flex items-center justify-between px-2 py-1.5 gap-2">
                <button
                  onClick={() => toggleLevel(level)}
                  className="flex items-center gap-2 flex-1 text-left min-w-0"
                  aria-expanded={isOpen}
                  title={isOpen ? 'collapse level' : 'expand level'}
                >
                  <span
                    aria-hidden="true"
                    className="text-gold font-cmd text-xs inline-block transition-transform"
                    style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  >
                    ▶
                  </span>
                  <span className="font-display text-sm text-gold uppercase tracking-wide flex-shrink-0">
                    {level === 0 ? 'Cantrips' : `Level ${level}`}
                  </span>
                  {spells.length > 0 && (
                    <span className="text-fade font-cmd text-xs normal-case truncate">
                      · {preparedCount}/{spells.length} prepared
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-2 text-xs text-fade flex-shrink-0">
                  {level === 0 ? (
                    <span className="italic">at will</span>
                  ) : (
                    <>
                      <span>slots</span>
                      <input className="lined w-10 text-right font-cmd" type="number" min="0"
                             value={slots.current}
                             onChange={e => patchSlot(level, { current: Number(e.target.value) || 0 })} />
                      <span>/</span>
                      <input className="lined w-10 text-right font-cmd" type="number" min="0"
                             value={slots.max}
                             onChange={e => patchSlot(level, { max: Number(e.target.value) || 0 })} />
                    </>
                  )}
                  <button onClick={() => addSpell(level)}
                          className="text-xs font-cmd text-gold border border-gold px-2 py-0.5 hover:bg-active rounded-sm">
                    + add
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className="border-t border-gold px-2 py-2">
                  {spells.length === 0 ? (
                    <div className="text-fade text-xs italic">no spells — click + add</div>
                  ) : (
                    <div className="space-y-1.5">
                      {spells.map((s, i) => (
                        <SpellRow
                          key={i}
                          spell={s}
                          expanded={!!openSpells[`${level}.${i}`]}
                          onToggleExpand={() => toggleSpell(level, i)}
                          onUpdate={(patch) => updateSpell(level, i, patch)}
                          onRemove={() => removeSpell(level, i)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function SpellRow({ spell, expanded, onToggleExpand, onUpdate, onRemove }) {
  const display = spell.name || spell.id || '(unnamed)';
  const isPlaceholder = !spell.name && !spell.id;
  return (
    <div className="bg-card border border-gold rounded-sm">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <span className={`text-sm flex-1 truncate ${isPlaceholder ? 'italic text-fade' : 'text-parchment'}`}>
          {display}
        </span>
        <PreparedToggle
          prepared={!!spell.prepared}
          onToggle={() => onUpdate({ prepared: !spell.prepared })}
        />
        <button
          onClick={onToggleExpand}
          title={expanded ? 'close editor' : 'edit spell'}
          aria-label={expanded ? 'close editor' : 'edit spell'}
          aria-expanded={expanded}
          className={`inline-flex items-center justify-center w-6 h-6 border rounded-sm transition ${
            expanded ? 'text-gold border-gold-strong bg-active'
                     : 'text-fade border-gold hover:text-parchment hover:bg-active'
          }`}
        >
          <GearIcon size={12} />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-gold px-2 py-2 space-y-2">
          <div className="grid grid-cols-12 gap-2 items-center">
            <span className="text-fade text-xs uppercase tracking-wider col-span-2">id</span>
            <input className="lined col-span-10 font-cmd" placeholder="id (Avrae name)"
                   value={spell.id}
                   onChange={e => onUpdate({ id: e.target.value })} />
          </div>
          <div className="grid grid-cols-12 gap-2 items-center">
            <span className="text-fade text-xs uppercase tracking-wider col-span-2">name</span>
            <input className="lined col-span-10" placeholder="display name"
                   value={spell.name}
                   onChange={e => onUpdate({ name: e.target.value })} />
          </div>
          <div className="grid grid-cols-12 gap-2 items-center">
            <span className="text-fade text-xs uppercase tracking-wider col-span-2">sub</span>
            <input className="lined col-span-10" placeholder="subtitle"
                   value={spell.sub || ''}
                   onChange={e => onUpdate({ sub: e.target.value })} />
          </div>
          <div className="grid grid-cols-12 gap-2 items-center">
            <span className="text-fade text-xs uppercase tracking-wider col-span-2">phrase</span>
            <input className="lined col-span-10" placeholder='flavor text · e.g. "by the radiant dawn!"'
                   value={spell.phrase || ''}
                   onChange={e => onUpdate({ phrase: e.target.value })} />
          </div>
          <div className="flex justify-end pt-1">
            <button onClick={onRemove}
                    className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-crimson border border-gold hover:border-crimson px-2 py-0.5 rounded-sm transition">
              ✕ remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Lucide-style cog. Sized by the surrounding button.
function GearIcon({ size = 12 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}
         fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function DdbImport({ setCharacter }) {
  const [source,      setSource]      = useState('jsonPaste');
  const [text,        setText]        = useState('');
  const [pdfFile,     setPdfFile]     = useState(null);
  const [busy,        setBusy]        = useState(false);
  const [status,      setStatus]      = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);

  // Overwrites character fields the import provides; modifiers are
  // separate top-level state and intentionally untouched.
  // - Sub-objects (hp, abilities, saves, skills, spellSlots) are merged so a
  //   partial import doesn't wipe untouched entries.
  // - Lists/dicts that should fully replace (attacks, spells) are taken
  //   straight from the patch via `...patch`.
  const applyPatch = (patch) => {
    setCharacter(c => ({
      ...c,
      ...patch,
      hp:         patch.hp         ? { ...c.hp,         ...patch.hp }         : c.hp,
      abilities:  patch.abilities  ? { ...c.abilities,  ...patch.abilities }  : c.abilities,
      saves:      patch.saves      ? { ...c.saves,      ...patch.saves }      : c.saves,
      skills:     patch.skills     ? { ...c.skills,     ...patch.skills }     : c.skills,
      spellSlots: patch.spellSlots ? { ...c.spellSlots, ...patch.spellSlots } : c.spellSlots,
    }));
  };

  const reportSuccess = (patch, extra = '') => {
    const fields = Object.keys(patch).filter(k => patch[k] !== undefined);
    setStatus({ ok: true, msg: `imported${extra}: ${fields.join(', ')}` });
  };

  const importPasted = () => {
    try {
      const patch = importDdbText(text);
      applyPatch(patch);
      reportSuccess(patch);
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    }
  };

  const importJsonFile = async (file) => {
    setBusy(true);
    setStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const patch = mapDdbJson(parsed);
      applyPatch(patch);
      reportSuccess(patch, ` from ${file.name}`);
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const importPdfFile = async () => {
    if (!pdfFile) return;
    console.log('[grimoire] importPdfFile click, file=', pdfFile.name, pdfFile.size, 'bytes');
    setBusy(true);
    setStatus(null);
    setDiagnostics(null);
    try {
      const result = await importDdbPdfFile(pdfFile);
      console.log('[grimoire] importPdfFile result=', result);
      const { patch, found, itemCount, rawText, fieldCount, fieldNames, fieldValues, totalWidgets, allWidgetNames, xfaPresent } = result;
      setDiagnostics({
        fileName: pdfFile.name,
        itemCount, fieldCount, fieldNames, fieldValues,
        totalWidgets, allWidgetNames, xfaPresent,
        found, rawText,
      });
      if (found.length) {
        applyPatch(patch);
        reportSuccess(patch, ` from ${pdfFile.name}`);
        setPdfFile(null);
      } else {
        setStatus({
          ok: false,
          msg: `read ${itemCount} text items, ${fieldCount} populated form fields — but no known mappings matched. see diagnostics below`,
        });
      }
    } catch (e) {
      console.error('[grimoire] importPdfFile error:', e);
      setStatus({ ok: false, msg: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="import from D&D Beyond"
      right={
        <select className="lined" value={source}
                onChange={e => { setSource(e.target.value); setStatus(null); }}>
          <option value="jsonPaste">JSON · paste</option>
          <option value="jsonFile">JSON · file</option>
          <option value="pdfFile">PDF · file</option>
        </select>
      }>

      {source === 'jsonPaste' && (
        <>
          <div className="text-xs text-fade italic mb-2">
            paste the response from <span className="font-cmd text-gold">character-service.dndbeyond.com/character/v5/character/&lt;id&gt;</span>
          </div>
          <textarea className="lined" rows="5"
                    placeholder='{"data": {...}}'
                    value={text}
                    onChange={e => setText(e.target.value)} />
          <div className="flex items-center gap-3 mt-2">
            <button onClick={importPasted}
                    className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold px-3 py-1.5 hover:bg-active transition">
              ↓ import
            </button>
            <ImportStatus status={status} />
          </div>
        </>
      )}

      {source === 'jsonFile' && (
        <>
          <div className="text-xs text-fade italic mb-2">
            select a saved <span className="font-cmd text-gold">.json</span> dump of the DDB character endpoint
          </div>
          <FilePicker accept=".json,application/json"
                      busy={busy} onFile={importJsonFile} />
          <ImportStatus status={status} className="mt-2" />
        </>
      )}

      {source === 'pdfFile' && (
        <>
          <div className="text-xs text-fade italic mb-2">
            select a D&amp;D Beyond character-sheet <span className="font-cmd text-gold">.pdf</span> export — best-effort field extraction.
            importing will overwrite character info (ability scores, HP, AC, etc.) — modifiers are left alone.
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <FilePicker accept="application/pdf,.pdf"
                        busy={busy}
                        label={pdfFile ? '↻ choose different file' : '↓ choose file'}
                        onFile={(f) => { setPdfFile(f); setStatus(null); }} />
            {pdfFile && (
              <>
                <span className="text-xs font-cmd text-parchment truncate max-w-xs" title={pdfFile.name}>
                  {pdfFile.name}
                </span>
                <button onClick={importPdfFile}
                        disabled={busy}
                        className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold-strong px-3 py-1.5 hover:bg-active transition disabled:opacity-50">
                  {busy ? '… importing' : '↓ import & overwrite'}
                </button>
                <button onClick={() => { setPdfFile(null); setStatus(null); }}
                        disabled={busy}
                        className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-crimson disabled:opacity-50">
                  ✕ cancel
                </button>
              </>
            )}
          </div>
          <ImportStatus status={status} className="mt-2 block" />
        </>
      )}

      <div className="text-xs text-fade italic mt-3 pt-2 border-t border-gold">
        currently fills: name · race · class · level · prof bonus · AC · max HP · ability scores. attacks &amp; spells stay manual.
      </div>

      {diagnostics && (
        <div className="mt-3 pt-2 border-t border-gold">
          <div className="text-xs font-cmd text-fade mb-1">
            pdf diagnostics — {diagnostics.fileName}
            <br/>
            {diagnostics.totalWidgets} widget annotations · {diagnostics.allWidgetNames?.length || 0} unique names · {diagnostics.fieldCount} populated · {diagnostics.itemCount} text items · {diagnostics.found.length} fields mapped
            {diagnostics.xfaPresent && <> · <span className="text-gold">XFA present</span></>}
            {diagnostics.found.length > 0 && <> ({diagnostics.found.join(', ')})</>}
          </div>

          {diagnostics.fieldCount > 0 && (
            <details className="text-xs font-cmd mt-2" open={diagnostics.found.length === 0}>
              <summary className="text-gold cursor-pointer hover:text-parchment">show populated form-field values ({diagnostics.fieldCount})</summary>
              <FieldFilter entries={Object.entries(diagnostics.fieldValues)} />
            </details>
          )}

          {(diagnostics.allWidgetNames?.length || 0) > 0 && (
            <details className="text-xs font-cmd mt-2" open={diagnostics.fieldCount === 0 && diagnostics.allWidgetNames.length > 0}>
              <summary className="text-gold cursor-pointer hover:text-parchment">show all widget names ({diagnostics.allWidgetNames.length})</summary>
              <FieldFilter entries={diagnostics.allWidgetNames.map(n => [n, ''])} />
            </details>
          )}

          <details className="text-xs font-cmd mt-2">
            <summary className="text-gold cursor-pointer hover:text-parchment">show extracted text</summary>
            <textarea
              className="lined mt-2"
              rows="10"
              readOnly
              value={diagnostics.rawText}
            />
          </details>
        </div>
      )}
    </SectionCard>
  );
}

function FieldFilter({ entries }) {
  const [q, setQ] = useState('');
  const filtered = q
    ? entries.filter(([k, v]) =>
        k.toLowerCase().includes(q.toLowerCase()) ||
        String(v).toLowerCase().includes(q.toLowerCase()))
    : entries;
  const lines = filtered
    .map(([k, v]) => v === '' ? k : `${k} = ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n');
  return (
    <div className="mt-2">
      <input className="lined mb-1" placeholder="filter by name or value…"
             value={q} onChange={e => setQ(e.target.value)} />
      <textarea className="lined" rows="12" readOnly value={lines} />
      <div className="text-fade text-xs mt-1">{filtered.length} of {entries.length} entries</div>
    </div>
  );
}

function FilePicker({ accept, busy, label = '↓ choose file', onFile }) {
  return (
    <label className={`inline-flex items-center gap-2 text-xs font-cmd uppercase tracking-wider px-3 py-1.5 border transition cursor-pointer ${
      busy ? 'text-fade border-gold opacity-60' : 'text-gold border-gold hover:bg-active'
    }`}>
      {busy ? '… reading' : label}
      <input type="file" accept={accept} disabled={busy}
             className="hidden"
             onChange={e => {
               const f = e.target.files?.[0];
               if (f) onFile(f);
               e.target.value = '';
             }} />
    </label>
  );
}

function ImportStatus({ status, className = '' }) {
  if (!status) return null;
  return (
    <span className={`text-xs font-cmd ${status.ok ? 'text-gold' : 'text-crimson'} ${className}`}>
      {status.msg}
    </span>
  );
}
