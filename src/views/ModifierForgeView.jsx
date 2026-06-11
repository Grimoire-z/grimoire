// Modifier forge — edits both the active character's private modifier
// library and the global library that's shared across all characters.
// A modifier lives in exactly one of the two lists; the editor's "Global"
// checkbox moves a modifier between them. The library list shows both
// stacks together with a CHAR / GLOBAL tag per row so it's obvious at a
// glance which is which.
//
// New modifiers default to character-private — the global library is
// reserved for things you actually want shared across every character
// (Advantage, Disadvantage, Bardic Inspiration, Bless by default).

import { useMemo, useState } from 'react';
import { composeFromMod } from '../composer.js';
import { APPLIES_KINDS, EFFECT_LABELS, EFFECT_PLACEHOLDERS, EFFECT_HAS_VALUE, EFFECT_DESCRIPTIONS, EFFECT_NO_VALUE_BLURB, makeShortId } from '../state.js';
import { Checkbox } from '../components.jsx';

export default function ModifierForgeView({
  characterModifiers, setCharacterModifiers,
  globalModifiers,    setGlobalModifiers,
  activeMods, setActiveMods,
  // When dmMode is on, the editor is operating on the DM library
  // (dmModifiers passed in via globalModifiers slot). There's no
  // character context, so character-private modifiers, the Global
  // scope toggle, and the character ScopeGroup all hide; + new
  // creates directly in the DM library instead of in characterMods.
  dmMode = false,
}) {
  // Tag each mod with its scope and merge for display. Character first so
  // the library list groups visually by scope when scrolled.
  const tagged = useMemo(() => ([
    ...characterModifiers.map(m => ({ mod: m, scope: 'character' })),
    ...globalModifiers.map(m => ({ mod: m, scope: 'global' })),
  ]), [characterModifiers, globalModifiers]);

  const allMods = useMemo(() => tagged.map(t => t.mod), [tagged]);

  const [selectedId, setSelectedId] = useState(tagged[0]?.mod.id || null);
  const selectedEntry = tagged.find(t => t.mod.id === selectedId) || null;
  const selected      = selectedEntry?.mod || null;
  const selectedScope = selectedEntry?.scope || null;

  // Apply a patch to whichever list owns the selected modifier.
  const update = (patch) => {
    if (!selected) return;
    const setter = selectedScope === 'character' ? setCharacterModifiers : setGlobalModifiers;
    setter(prev => prev.map(m => m.id === selectedId ? { ...m, ...patch } : m));
  };

  // New mods default to character-private in player mode (promote via
  // the Global toggle in the editor). In DM mode there's no character
  // scope, so + new lands directly in the DM library.
  const newModifier = () => {
    const id = makeShortId('mod');
    const fresh = {
      id, name: 'New Modifier', sub: '',
      applies: ['attack'], excludes: [],
      effects: [{ type: 'bonus', value: '' }],
      params: [],
    };
    const setter = dmMode ? setGlobalModifiers : setCharacterModifiers;
    setter(prev => [...prev, fresh]);
    setSelectedId(id);
  };

  // Delete from the owning list; clear from activeMods so the Roll view
  // doesn't keep a phantom toggle.
  const deleteSelected = () => {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.name}"?\n\nThis cannot be undone.`)) return;
    const setter = selectedScope === 'character' ? setCharacterModifiers : setGlobalModifiers;
    setter(prev => prev.filter(m => m.id !== selectedId));
    setActiveMods(prev => {
      const next = { ...prev };
      delete next[selectedId];
      return next;
    });
    // Pick the next entry in whatever's left of the same scope, else any.
    const survivors = tagged.filter(t => t.mod.id !== selectedId);
    setSelectedId(survivors[0]?.mod.id || null);
  };

  // Duplicate stays in the same scope as the source.
  const duplicateSelected = () => {
    if (!selected) return;
    const id = makeShortId('mod');
    const copy = JSON.parse(JSON.stringify(selected));
    copy.id = id;
    copy.name = `${selected.name} (copy)`;
    const setter = selectedScope === 'character' ? setCharacterModifiers : setGlobalModifiers;
    setter(prev => [...prev, copy]);
    setSelectedId(id);
  };

  // Move the selected modifier between character.modifiers and
  // globalModifiers. Preserves the id, which means any active-mods toggle
  // and any references in other mods' `excludes` lists keep working.
  const toggleScope = () => {
    if (!selected) return;
    if (selectedScope === 'character') {
      setCharacterModifiers(prev => prev.filter(m => m.id !== selectedId));
      setGlobalModifiers(prev => [...prev, selected]);
    } else {
      setGlobalModifiers(prev => prev.filter(m => m.id !== selectedId));
      setCharacterModifiers(prev => [...prev, selected]);
    }
  };

  return (
    <main className="relative z-10 px-6 pb-12 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-5 mt-4">

      <section className="lg:col-span-2">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-display text-gold text-sm">LIBRARY</h2>
          <button onClick={newModifier}
                  className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold px-2 py-1 hover:bg-active transition"
                  title="creates a character-private modifier — promote via the Global toggle in the editor">
            + new
          </button>
        </div>
        <div className="divider mb-3" />
        {!dmMode && (
          <>
            <ScopeGroup label="This character" entries={tagged.filter(t => t.scope === 'character')}
                        selectedId={selectedId} onSelect={setSelectedId} emptyHint="no per-character modifiers yet" />
            <div className="mt-4" />
          </>
        )}
        <ScopeGroup
          label={dmMode ? 'DM library' : 'Global'}
          entries={tagged.filter(t => t.scope === 'global')}
          selectedId={selectedId}
          onSelect={setSelectedId}
          emptyHint={dmMode ? 'no DM modifiers yet — click + new to add one' : 'no global modifiers'} />
      </section>

      <section className="lg:col-span-3">
        {!selected ? (
          <div className="text-fade italic text-sm text-center py-12 border border-gold rounded-sm">
            select a modifier from the library, or create a new one
          </div>
        ) : (
          <ModifierEditor
            mod={selected}
            scope={selectedScope}
            allMods={allMods}
            update={update}
            onToggleScope={toggleScope}
            onDelete={deleteSelected}
            onDuplicate={duplicateSelected}
            dmMode={dmMode}
          />
        )}
      </section>
    </main>
  );
}

function ScopeGroup({ label, entries, selectedId, onSelect, emptyHint }) {
  return (
    <>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-display text-xs text-fade uppercase tracking-wider">{label}</h3>
        <span className="text-fade text-[10px] font-cmd">{entries.length}</span>
      </div>
      <div className="space-y-2">
        {entries.length === 0 && (
          <div className="text-fade italic text-xs text-center py-2 border border-dashed border-gold rounded-sm">
            {emptyHint}
          </div>
        )}
        {entries.map(({ mod }) => (
          <ModifierRow key={mod.id} mod={mod}
            active={selectedId === mod.id}
            onSelect={() => onSelect(mod.id)} />
        ))}
      </div>
    </>
  );
}

function ModifierRow({ mod, active, onSelect }) {
  return (
    <button onClick={onSelect}
      className={`w-full text-left border rounded-sm p-2.5 transition ${
        active
          ? 'bg-active border-gold-strong glow-active'
          : 'bg-card border-gold hover:bg-card-hover'
      }`}>
      <div className="flex justify-between items-baseline gap-2">
        <span className={`font-display text-sm uppercase tracking-wide ${active ? 'text-gold' : 'text-parchment'}`}>
          {mod.name}
        </span>
        <span className="text-xs text-fade font-cmd flex-shrink-0">
          {mod.applies.map(a => a[0]).join('').toUpperCase()}
        </span>
      </div>
      <div className="text-xs text-fade italic truncate mt-0.5">{mod.sub || <em>no description</em>}</div>
    </button>
  );
}

function ModifierEditor({ mod, scope, allMods, update, onToggleScope, onDelete, onDuplicate, dmMode }) {
  const toggleApplies = (kind) => {
    const next = mod.applies.includes(kind)
      ? mod.applies.filter(k => k !== kind)
      : [...mod.applies, kind];
    update({ applies: next });
  };

  const toggleExcludes = (otherId) => {
    const next = mod.excludes.includes(otherId)
      ? mod.excludes.filter(id => id !== otherId)
      : [...mod.excludes, otherId];
    update({ excludes: next });
  };

  const addEffect = (type) => {
    const eff = EFFECT_HAS_VALUE(type) ? { type, value: '' } : { type };
    update({ effects: [...mod.effects, eff] });
  };
  const updateEffect = (i, patch) => {
    const next = mod.effects.map((e, idx) => idx === i ? { ...e, ...patch } : e);
    update({ effects: next });
  };
  const deleteEffect = (i) => {
    update({ effects: mod.effects.filter((_, idx) => idx !== i) });
  };

  const addParam = () => {
    const id = `p${mod.params.length + 1}`;
    update({ params: [...mod.params, {
      id, label: 'Lvl', defaultIndex: 0,
      options: [{ label: 'Option 1', value: '' }],
    }] });
  };
  const updateParam = (i, patch) => {
    const next = mod.params.map((p, idx) => idx === i ? { ...p, ...patch } : p);
    update({ params: next });
  };
  const deleteParam = (i) => {
    update({ params: mod.params.filter((_, idx) => idx !== i) });
  };

  const previewArgs = composeFromMod(mod, {});
  const isGlobal = scope === 'global';

  return (
    <div className="space-y-5">
      <div className="bg-card border border-gold rounded-sm p-4">
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-fade text-xs uppercase tracking-wider">Name</label>
            <input className="lined" value={mod.name}
                   onChange={e => update({ name: e.target.value })} />
          </div>
          <div>
            <label className="text-fade text-xs uppercase tracking-wider">Subtitle / description</label>
            <input className="lined" value={mod.sub}
                   onChange={e => update({ sub: e.target.value })}
                   placeholder="e.g. +1d4 to attacks · concentration" />
          </div>
          {!dmMode && (
            <div className="flex items-center justify-between gap-3 mt-1 pt-3 border-t border-gold">
              <div className="min-w-0">
                <div className="text-fade text-xs uppercase tracking-wider">Scope</div>
                <div className="text-xs text-fade italic">
                  {isGlobal
                    ? 'shared across every character'
                    : 'only available to this character'}
                </div>
              </div>
              <Checkbox label="Global" checked={isGlobal} onChange={onToggleScope} compact />
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border border-gold rounded-sm p-4">
        <h3 className="font-display text-gold text-xs uppercase tracking-wider mb-2">applies to</h3>
        <div className="flex gap-3 flex-wrap">
          {APPLIES_KINDS.map(kind => (
            <Checkbox key={kind} label={kind}
              checked={mod.applies.includes(kind)}
              onChange={() => toggleApplies(kind)} />
          ))}
        </div>
      </div>

      <div className="bg-card border border-gold rounded-sm p-4">
        <h3 className="font-display text-gold text-xs uppercase tracking-wider mb-1">mutually exclusive with</h3>
        <div className="text-xs text-fade italic mb-2">turning this on will deactivate any of these</div>
        <div className="flex gap-2 flex-wrap">
          {allMods.filter(other => other.id !== mod.id).map(other => (
            <Checkbox key={other.id} label={other.name}
              checked={mod.excludes.includes(other.id)}
              onChange={() => toggleExcludes(other.id)} compact />
          ))}
          {allMods.length <= 1 && <span className="text-fade italic text-xs">no other modifiers exist yet</span>}
        </div>
      </div>

      <div className="bg-card border border-gold rounded-sm p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="font-display text-gold text-xs uppercase tracking-wider">effects</h3>
          <span className="text-xs text-fade italic">use {`{paramId}`} to pull in parameters</span>
        </div>

        {mod.effects.length === 0 && (
          <div className="text-fade italic text-sm py-2">no effects — add one below</div>
        )}

        <div className="space-y-2">
          {mod.effects.map((eff, i) => (
            <EffectRow key={i} effect={eff}
              onChange={patch => updateEffect(i, patch)}
              onDelete={() => deleteEffect(i)} />
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-gold flex gap-1.5 flex-wrap items-center">
          <span className="text-fade text-xs uppercase tracking-wider mr-1">+ add:</span>
          {Object.entries(EFFECT_LABELS).map(([type, label]) => (
            <button key={type} onClick={() => addEffect(type)}
              title={EFFECT_DESCRIPTIONS[type] || ''}
              className="text-xs font-cmd text-gold border border-gold px-2 py-0.5 hover:bg-active transition rounded-sm">
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-gold rounded-sm p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="font-display text-gold text-xs uppercase tracking-wider">parameters</h3>
          <button onClick={addParam}
                  className="text-xs font-cmd text-gold border border-gold px-2 py-0.5 hover:bg-active transition rounded-sm">
            + add parameter
          </button>
        </div>

        {mod.params.length === 0 ? (
          <div className="text-fade italic text-sm py-2">
            none — parameters become dropdowns when this modifier is toggled on
          </div>
        ) : (
          <div className="space-y-3">
            {mod.params.map((p, i) => (
              <ParameterEditor key={i} param={p}
                onChange={patch => updateParam(i, patch)}
                onDelete={() => deleteParam(i)} />
            ))}
          </div>
        )}
      </div>

      <div className="bg-cmd border border-gold-strong rounded-sm p-4">
        <h3 className="font-display text-gold text-xs uppercase tracking-wider mb-2">preview · with default param values</h3>
        <code className="font-cmd text-sm text-parchment block break-all">
          {previewArgs || <span className="text-fade italic">[no args — modifier is empty]</span>}
        </code>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onDelete}
                className="text-xs font-cmd uppercase tracking-wider text-crimson border border-crimson px-3 py-1.5 hover:bg-active transition">
          ✕ delete
        </button>
        <button onClick={onDuplicate}
                className="text-xs font-cmd uppercase tracking-wider text-parchment border border-gold px-3 py-1.5 hover:bg-active transition">
          ⎘ duplicate
        </button>
      </div>
    </div>
  );
}

function EffectRow({ effect, onChange, onDelete }) {
  const hasValue = EFFECT_HAS_VALUE(effect.type);
  const blurb = EFFECT_NO_VALUE_BLURB[effect.type] || '';
  return (
    <div className="flex gap-3 items-center bg-grimoire border border-gold rounded-sm px-3 py-2">
      <span className="font-display text-xs text-gold uppercase tracking-wider w-28 flex-shrink-0">
        {EFFECT_LABELS[effect.type]}
      </span>
      {hasValue ? (
        <input className="lined flex-1" value={effect.value || ''}
               onChange={e => onChange({ value: e.target.value })}
               placeholder={EFFECT_PLACEHOLDERS[effect.type]} />
      ) : (
        <span className="text-fade italic flex-1 text-sm">— {blurb} —</span>
      )}
      <button onClick={onDelete} className="text-fade hover:text-crimson text-sm">✕</button>
    </div>
  );
}

function ParameterEditor({ param, onChange, onDelete }) {
  const updateOption = (i, patch) => {
    const next = param.options.map((o, idx) => idx === i ? { ...o, ...patch } : o);
    onChange({ options: next });
  };
  const addOption = () => {
    onChange({ options: [...param.options, { label: '', value: '' }] });
  };
  const removeOption = (i) => {
    const next = param.options.filter((_, idx) => idx !== i);
    let def = param.defaultIndex;
    if (def >= next.length) def = Math.max(0, next.length - 1);
    if (def > i) def -= 1;
    onChange({ options: next, defaultIndex: def });
  };

  return (
    <div className="bg-grimoire border border-gold rounded-sm p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 items-end">
        <div>
          <label className="text-fade text-xs uppercase tracking-wider">
            id <span className="lowercase">(used as <span className="font-cmd text-gold normal-case">{`{${param.id || 'id'}}`}</span> in effects)</span>
          </label>
          <input className="lined" value={param.id}
                 onChange={e => onChange({ id: e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })} />
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-fade text-xs uppercase tracking-wider">display label</label>
            <input className="lined" value={param.label}
                   onChange={e => onChange({ label: e.target.value })}
                   placeholder="e.g. Lvl" />
          </div>
          <button onClick={onDelete} className="text-fade hover:text-crimson pb-1.5 text-sm">✕</button>
        </div>
      </div>

      <div className="text-fade text-xs uppercase tracking-wider mb-1.5">
        options <span className="lowercase italic normal-case">— click ⊙ to mark as default</span>
      </div>
      <div className="space-y-1.5">
        {param.options.map((opt, i) => (
          <div key={i} className="flex gap-2 items-center text-sm">
            <button onClick={() => onChange({ defaultIndex: i })}
              className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition ${
                param.defaultIndex === i ? 'border-gold-strong' : 'border-gold'
              }`}
              style={param.defaultIndex === i ? { backgroundColor: 'var(--color-gold)' } : {}}
              title="mark as default">
              {param.defaultIndex === i && <span className="block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-bg)' }} />}
            </button>
            <input className="lined flex-1" value={opt.label} placeholder="label (e.g. Lvl 1)"
                   onChange={e => updateOption(i, { label: e.target.value })} />
            <span className="text-fade font-cmd">→</span>
            <input className="lined flex-1" value={opt.value} placeholder="value (e.g. 2)"
                   onChange={e => updateOption(i, { value: e.target.value })} />
            <button onClick={() => removeOption(i)} className="text-fade hover:text-crimson text-sm">✕</button>
          </div>
        ))}
      </div>
      <button onClick={addOption}
              className="text-xs font-cmd text-gold hover:text-parchment mt-2">
        + add option
      </button>
    </div>
  );
}
