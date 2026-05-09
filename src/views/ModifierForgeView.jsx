import { useState } from 'react';
import { composeFromMod } from '../composer.js';
import { APPLIES_KINDS, EFFECT_LABELS, EFFECT_PLACEHOLDERS, EFFECT_HAS_VALUE } from '../state.js';
import { Checkbox } from '../components.jsx';

export default function ModifierForgeView({ modifiers, setModifiers, activeMods, setActiveMods }) {
  const [selectedId, setSelectedId] = useState(modifiers[0]?.id || null);
  const selected = modifiers.find(m => m.id === selectedId);

  const update = (patch) => {
    setModifiers(prev => prev.map(m => m.id === selectedId ? { ...m, ...patch } : m));
  };

  const newModifier = () => {
    const id = `mod_${Date.now().toString(36)}`;
    const fresh = {
      id, name: 'New Modifier', sub: '',
      applies: ['attack'], excludes: [],
      effects: [{ type: 'bonus', value: '' }],
      params: [],
    };
    setModifiers(prev => [...prev, fresh]);
    setSelectedId(id);
  };

  const deleteSelected = () => {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.name}"?\n\nThis cannot be undone.`)) return;
    setModifiers(prev => prev.filter(m => m.id !== selectedId));
    setActiveMods(prev => {
      const next = { ...prev };
      delete next[selectedId];
      return next;
    });
    const remaining = modifiers.filter(m => m.id !== selectedId);
    setSelectedId(remaining[0]?.id || null);
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const id = `mod_${Date.now().toString(36)}`;
    const copy = JSON.parse(JSON.stringify(selected));
    copy.id = id;
    copy.name = `${selected.name} (copy)`;
    setModifiers(prev => [...prev, copy]);
    setSelectedId(id);
  };

  return (
    <main className="relative z-10 px-6 pb-12 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-5 mt-4">

      <section className="lg:col-span-2">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-display text-gold text-sm">LIBRARY</h2>
          <button onClick={newModifier}
                  className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold px-2 py-1 hover:bg-active transition">
            + new
          </button>
        </div>
        <div className="divider mb-3" />
        <div className="space-y-2">
          {modifiers.map(m => (
            <button key={m.id} onClick={() => setSelectedId(m.id)}
              className={`w-full text-left border rounded-sm p-2.5 transition ${
                selectedId === m.id
                  ? 'bg-active border-gold-strong glow-active'
                  : 'bg-card border-gold hover:bg-card-hover'
              }`}>
              <div className="flex justify-between items-baseline gap-2">
                <span className={`font-display text-sm uppercase tracking-wide ${
                  selectedId === m.id ? 'text-gold' : 'text-parchment'
                }`}>{m.name}</span>
                <span className="text-xs text-fade font-cmd flex-shrink-0">
                  {m.applies.map(a => a[0]).join('').toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-fade italic truncate mt-0.5">{m.sub || <em>no description</em>}</div>
            </button>
          ))}
          {modifiers.length === 0 && (
            <div className="text-fade italic text-sm text-center py-8">
              empty — click <span className="text-gold">+ new</span> to forge one
            </div>
          )}
        </div>
      </section>

      <section className="lg:col-span-3">
        {!selected ? (
          <div className="text-fade italic text-sm text-center py-12 border border-gold rounded-sm">
            select a modifier from the library, or create a new one
          </div>
        ) : (
          <ModifierEditor
            mod={selected}
            allMods={modifiers}
            update={update}
            onDelete={deleteSelected}
            onDuplicate={duplicateSelected}
          />
        )}
      </section>
    </main>
  );
}

function ModifierEditor({ mod, allMods, update, onDelete, onDuplicate }) {
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
        <span className="text-fade italic flex-1 text-sm">— rolls the d20 with {effect.type === 'adv' ? 'advantage' : 'disadvantage'} —</span>
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
              style={param.defaultIndex === i ? { backgroundColor: '#d4a644' } : {}}
              title="mark as default">
              {param.defaultIndex === i && <span className="block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#14100c' }} />}
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
