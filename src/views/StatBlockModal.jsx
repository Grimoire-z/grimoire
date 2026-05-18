// Stat block view + editor for a single monster. Read-only by default
// (preserves the classic 5e stat-block reference look during play); an
// `✎ Edit` toggle in the header switches every section to editable
// inputs. Edits write through `setMonster(updater)` immediately — no
// explicit save step — so the underlying state stays in sync as the
// user types.
//
// Extracted from BestiaryView.jsx in v0.9 once the editor expanded the
// file past comfortable. Read mode renders the 5e stat-block layout
// (identity, AC/HP/Speed, six-ability grid with mods, attribute
// summaries, traits / actions / legendary action sections). Edit mode
// renders the same shape with `lined`-style inputs in place of text;
// saves / skills use a full grid (all six abilities, all 18 skills)
// so add / remove is just "type a mod" / "clear it".

import { useEffect, useState } from 'react';

const ABILITIES = [
  { key: 'str', label: 'STR' },
  { key: 'dex', label: 'DEX' },
  { key: 'con', label: 'CON' },
  { key: 'int', label: 'INT' },
  { key: 'wis', label: 'WIS' },
  { key: 'cha', label: 'CHA' },
];

// 18 canonical skills; keys match 5e.tools' snake_case style so imported
// monsters' `monster.skills` populate the right rows without remapping.
const SKILLS = [
  { key: 'acrobatics',      label: 'Acrobatics' },
  { key: 'animal_handling', label: 'Animal Handling' },
  { key: 'arcana',          label: 'Arcana' },
  { key: 'athletics',       label: 'Athletics' },
  { key: 'deception',       label: 'Deception' },
  { key: 'history',         label: 'History' },
  { key: 'insight',         label: 'Insight' },
  { key: 'intimidation',    label: 'Intimidation' },
  { key: 'investigation',   label: 'Investigation' },
  { key: 'medicine',        label: 'Medicine' },
  { key: 'nature',          label: 'Nature' },
  { key: 'perception',      label: 'Perception' },
  { key: 'performance',     label: 'Performance' },
  { key: 'persuasion',      label: 'Persuasion' },
  { key: 'religion',        label: 'Religion' },
  { key: 'sleight_of_hand', label: 'Sleight of Hand' },
  { key: 'stealth',         label: 'Stealth' },
  { key: 'survival',        label: 'Survival' },
];

const SAVE_LABELS  = Object.fromEntries(ABILITIES.map(a => [a.key, a.label]));
const SKILL_LABELS = Object.fromEntries(SKILLS.map(s => [s.key, s.label]));

function abilityMod(score) {
  if (typeof score !== 'number') return null;
  return Math.floor((score - 10) / 2);
}
function signedMod(mod) {
  if (mod == null) return '';
  return mod >= 0 ? `+${mod}` : `${mod}`;
}
function formatKeyValueList(obj, labels) {
  if (!obj || typeof obj !== 'object') return '';
  return Object.entries(obj)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${labels[k] || k} ${v}`)
    .join(', ');
}

// Stable id for newly-added entries. Same length as monster ids — not a
// real UUID because the in-monster array index is the real key.
function makeEntryId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function StatBlockModal({ monster, setMonster, onClose }) {
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Tiny patch helper passed to sub-fields so they don't need to spread
  // the whole monster every change.
  const patch = (p) => setMonster(cur => ({ ...cur, ...p }));
  const patchHp        = (p) => setMonster(cur => ({ ...cur, hp:        { ...(cur.hp        || {}), ...p } }));
  const patchAbilities = (p) => setMonster(cur => ({ ...cur, abilities: { ...(cur.abilities || {}), ...p } }));
  const patchSaves     = (p) => setMonster(cur => ({ ...cur, saves:     pruneEmpty({ ...(cur.saves     || {}), ...p }) }));
  const patchSkills    = (p) => setMonster(cur => ({ ...cur, skills:    pruneEmpty({ ...(cur.skills    || {}), ...p }) }));

  const identity = [
    [monster.size, monster.type].filter(Boolean).join(' '),
    monster.alignment,
  ].filter(Boolean).join(', ');

  const savesLine  = formatKeyValueList(monster.saves,  SAVE_LABELS);
  const skillsLine = formatKeyValueList(monster.skills, SKILL_LABELS);

  const sensesParts = [];
  if (monster.senses)                      sensesParts.push(monster.senses);
  if (typeof monster.passive === 'number') sensesParts.push(`passive Perception ${monster.passive}`);
  const sensesLine = sensesParts.join(', ');

  const hasAnyData =
    !!identity || monster.ac != null || monster.hp?.average != null ||
    !!monster.speed || !!monster.cr || (monster.traits?.length || 0) > 0 ||
    (monster.actions?.length || 0) > 0 || (monster.legendaryActions?.length || 0) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
      onClick={onClose}
    >
      <div
        className="bg-card border border-gold-strong rounded-sm max-w-2xl w-full max-h-[85vh] overflow-y-auto scrollbar-thin"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(var(--color-gold-rgb), 0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-gold">
          <div className="min-w-0 flex-1">
            {editing ? (
              <input
                type="text"
                value={monster.name || ''}
                onChange={e => patch({ name: e.target.value })}
                placeholder="Monster name"
                className="lined font-display text-xl text-gold uppercase tracking-wider w-full"
                style={{ borderBottom: '1px solid rgba(var(--color-gold-rgb), 0.6)' }}
              />
            ) : (
              <h3 className="font-display text-xl text-gold uppercase tracking-wider truncate">
                {monster.name || '— unnamed —'}
              </h3>
            )}
            {!editing && identity && (
              <p className="text-fade text-sm italic mt-0.5">{identity}</p>
            )}
            {!editing && monster.source && (
              <p className="text-fade text-[10px] font-cmd uppercase tracking-wider mt-1">source · {monster.source}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setEditing(e => !e)}
              className={`text-xs font-cmd uppercase tracking-wider border px-2 py-1 transition ${
                editing
                  ? 'text-gold border-gold-strong bg-active'
                  : 'text-fade border-gold hover:text-parchment hover:bg-active'
              }`}
              title={editing ? 'Switch back to read-only view' : 'Edit this stat block'}
            >
              {editing ? '✓ Done' : '✎ Edit'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close stat block"
              className="text-fade hover:text-parchment text-lg leading-none px-2 py-1 transition"
            >
              ✕
            </button>
          </div>
        </div>

        {!hasAnyData && !editing ? (
          <div className="px-5 py-8 text-center">
            <p className="text-fade italic text-sm">
              No stat-block data yet. Click <span className="text-gold">✎ Edit</span> to fill it in by hand,
              or use <span className="text-gold">+ Add monster → Import from 5e.tools URL</span> to populate
              an existing creature.
            </p>
          </div>
        ) : editing ? (
          <EditView
            monster={monster}
            setMonster={setMonster}
            patch={patch}
            patchHp={patchHp}
            patchAbilities={patchAbilities}
            patchSaves={patchSaves}
            patchSkills={patchSkills}
          />
        ) : (
          <ReadView
            monster={monster}
            identity={identity}
            savesLine={savesLine}
            skillsLine={skillsLine}
            sensesLine={sensesLine}
          />
        )}
      </div>
    </div>
  );
}

// Drop keys whose values are blank — keeps `saves`/`skills` objects free
// of empty entries so the read-side display + DM Roll buttons only see
// real data.
function pruneEmpty(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v != null && String(v).trim() !== '') out[k] = String(v).trim();
  }
  return out;
}

// ─── Read view ───────────────────────────────────────────────────────────

function ReadView({ monster, identity, savesLine, skillsLine, sensesLine }) {
  return (
    <div className="px-5 py-4 space-y-4 text-sm">
      <div className="space-y-1">
        {monster.ac != null && (
          <div><Label>Armor Class</Label> <span className="text-parchment">{monster.ac}</span></div>
        )}
        {monster.hp && (
          <div>
            <Label>Hit Points</Label>{' '}
            <span className="text-parchment">
              {monster.hp.average != null ? monster.hp.average : '—'}
              {monster.hp.formula ? ` (${monster.hp.formula})` : ''}
            </span>
          </div>
        )}
        {monster.speed && (
          <div><Label>Speed</Label> <span className="text-parchment">{monster.speed}</span></div>
        )}
      </div>

      {monster.abilities && (
        <div className="border-y border-gold py-3">
          <div className="grid grid-cols-6 gap-2 text-center">
            {ABILITIES.map(({ key, label }) => {
              const score = monster.abilities[key];
              const mod = abilityMod(score);
              return (
                <div key={key}>
                  <div className="font-display text-xs text-gold uppercase tracking-wider">{label}</div>
                  <div className="text-parchment text-base font-cmd mt-0.5">{score ?? '—'}</div>
                  <div className="text-fade text-xs font-cmd">{mod != null ? `(${signedMod(mod)})` : ''}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-1">
        {savesLine && (
          <div><Label>Saving Throws</Label> <span className="text-parchment">{savesLine}</span></div>
        )}
        {skillsLine && (
          <div><Label>Skills</Label> <span className="text-parchment">{skillsLine}</span></div>
        )}
        {sensesLine && (
          <div><Label>Senses</Label> <span className="text-parchment">{sensesLine}</span></div>
        )}
        {monster.languages && (
          <div><Label>Languages</Label> <span className="text-parchment">{monster.languages}</span></div>
        )}
        {monster.cr && (
          <div><Label>Challenge</Label> <span className="text-parchment">{monster.cr}</span></div>
        )}
      </div>

      <ReadEntries title="Traits"            items={monster.traits} />
      <ReadEntries title="Actions"           items={monster.actions} />
      <ReadEntries title="Legendary Actions" items={monster.legendaryActions} />
    </div>
  );
}

function Label({ children }) {
  return <span className="font-display text-gold uppercase tracking-wider text-xs">{children}</span>;
}

function ReadEntries({ title, items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="pt-3 border-t border-gold">
      <h4 className="font-display text-gold uppercase tracking-wider text-sm mb-2">{title}</h4>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id || item.name}>
            <span className="font-display text-parchment italic">{item.name}.</span>{' '}
            {(item.description || '').split(/\n\n+/).map((para, i) => (
              <span key={i} className="text-parchment">
                {i === 0 ? para : <><br /><br />{para}</>}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Edit view ───────────────────────────────────────────────────────────

function EditView({ monster, setMonster, patch, patchHp, patchAbilities, patchSaves, patchSkills }) {
  return (
    <div className="px-5 py-4 space-y-5 text-sm">
      <Section title="Identity">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Field label="Size"      value={monster.size}      onChange={v => patch({ size: v })}      placeholder="Medium" />
          <Field label="Type"      value={monster.type}      onChange={v => patch({ type: v })}      placeholder="humanoid (goblinoid)" />
          <Field label="Alignment" value={monster.alignment} onChange={v => patch({ alignment: v })} placeholder="neutral evil" />
          <Field label="Challenge" value={monster.cr}        onChange={v => patch({ cr: v })}        placeholder="1/4" />
          <Field label="Source"    value={monster.source}    onChange={v => patch({ source: v })}    placeholder="MM" />
        </div>
      </Section>

      <Section title="Combat">
        <div className="grid grid-cols-3 gap-2">
          <Field label="Armor Class" value={monster.ac} onChange={v => patch({ ac: v })} type="number" />
          <Field label="HP"          value={monster.hp?.average} onChange={v => patchHp({ average: v })} type="number" />
          <Field label="HP formula"  value={monster.hp?.formula} onChange={v => patchHp({ formula: v })} placeholder="2d6 + 2" />
        </div>
        <Field label="Speed" value={monster.speed} onChange={v => patch({ speed: v })} placeholder="30 ft., fly 60 ft." />
      </Section>

      <Section title="Abilities">
        <div className="grid grid-cols-6 gap-2">
          {ABILITIES.map(({ key, label }) => (
            <div key={key} className="text-center">
              <div className="font-display text-xs text-gold uppercase tracking-wider mb-1">{label}</div>
              <input
                type="number"
                value={monster.abilities?.[key] ?? ''}
                onChange={e => patchAbilities({ [key]: Number(e.target.value) || 0 })}
                className="lined w-full text-center font-cmd"
              />
              <div className="text-fade text-[10px] font-cmd mt-1">
                {(() => { const m = abilityMod(monster.abilities?.[key]); return m != null ? `(${signedMod(m)})` : ''; })()}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Saves" hint="leave a mod blank to remove that save">
        <KeyedModGrid keys={ABILITIES} values={monster.saves} onChange={patchSaves} />
      </Section>

      <Section title="Skills" hint="leave a mod blank to remove that skill">
        <KeyedModGrid keys={SKILLS} values={monster.skills} onChange={patchSkills} />
      </Section>

      <Section title="Senses · Languages">
        <Field label="Senses"   value={monster.senses}    onChange={v => patch({ senses: v })}    placeholder="darkvision 60 ft." />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Passive Perception" value={monster.passive} onChange={v => patch({ passive: v })} type="number" />
          <Field label="Languages"          value={monster.languages} onChange={v => patch({ languages: v })} placeholder="Common, Goblin" />
        </div>
      </Section>

      <EntriesEditor
        title="Traits"
        items={monster.traits || []}
        onChange={(items) => setMonster(cur => ({ ...cur, traits: items }))}
      />
      <EntriesEditor
        title="Actions"
        items={monster.actions || []}
        onChange={(items) => setMonster(cur => ({ ...cur, actions: items }))}
      />
      <EntriesEditor
        title="Legendary Actions"
        items={monster.legendaryActions || []}
        onChange={(items) => setMonster(cur => ({ ...cur, legendaryActions: items }))}
      />
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="font-display text-gold uppercase tracking-wider text-sm">{title}</h4>
        {hint && <span className="text-fade text-[11px] italic">{hint}</span>}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  const handle = (e) => {
    if (type === 'number') {
      const raw = e.target.value;
      onChange(raw === '' ? null : (Number(raw) || 0));
    } else {
      onChange(e.target.value);
    }
  };
  return (
    <label className="block">
      <span className="text-fade text-[10px] font-cmd uppercase tracking-wider block">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={handle}
        placeholder={placeholder}
        className="lined w-full font-cmd"
      />
    </label>
  );
}

// Six- or eighteen-row grid where each row is one ability/skill with a
// mod string input. Blank input = that key is absent from the underlying
// object (handled by `pruneEmpty` in the parent patch helpers).
function KeyedModGrid({ keys, values, onChange }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {keys.map(({ key, label }) => (
        <label key={key} className="flex items-center gap-2 bg-grimoire border border-gold rounded-sm px-2 py-1">
          <span className="text-fade text-[10px] font-cmd uppercase tracking-wider flex-1 truncate">{label}</span>
          <input
            type="text"
            value={values?.[key] ?? ''}
            onChange={e => onChange({ [key]: e.target.value })}
            placeholder="—"
            className="lined w-14 text-right font-cmd"
          />
        </label>
      ))}
    </div>
  );
}

function EntriesEditor({ title, items, onChange }) {
  const updateAt = (idx, patch) => {
    const next = items.map((it, i) => i === idx ? { ...it, ...patch } : it);
    onChange(next);
  };
  const removeAt = (idx) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, { id: makeEntryId(), name: '', description: '' }]);

  return (
    <Section title={title}>
      {items.length === 0 && (
        <div className="text-fade italic text-xs py-1">none yet</div>
      )}
      <div className="space-y-3">
        {items.map((it, idx) => (
          <div key={it.id || idx} className="border border-gold rounded-sm bg-grimoire p-2 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={it.name || ''}
                onChange={e => updateAt(idx, { name: e.target.value })}
                placeholder="Name (e.g. Multiattack)"
                className="lined flex-1 font-display"
              />
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="text-fade hover:text-crimson text-sm flex-shrink-0"
                title="Remove entry"
              >
                ✕
              </button>
            </div>
            <textarea
              value={it.description || ''}
              onChange={e => updateAt(idx, { description: e.target.value })}
              placeholder="Description"
              rows={3}
              className="lined w-full"
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold px-2 py-1 hover:bg-active rounded-sm transition mt-1"
      >
        + add {title.toLowerCase().replace(/s$/, '')}
      </button>
    </Section>
  );
}
