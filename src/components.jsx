// Small shared sub-components used by multiple views.

export function Checkbox({ label, checked, onChange, compact }) {
  return (
    <label
      className={`inline-flex items-center gap-2 cursor-pointer ${compact ? 'px-2 py-1 border rounded-sm bg-grimoire' : ''} ${
        compact && checked ? 'border-gold-strong' : compact ? 'border-gold' : ''
      }`}
      onClick={(e) => { e.preventDefault(); onChange(); }}
    >
      <span
        className={`w-3.5 h-3.5 border rounded-sm flex items-center justify-center text-xs flex-shrink-0 ${
          checked ? 'border-gold-strong' : 'border-gold'
        }`}
        style={checked ? { backgroundColor: '#d4a644', color: '#14100c' } : {}}
      >
        {checked && '✓'}
      </span>
      <span className={`text-sm ${checked ? 'text-parchment' : 'text-fade'} capitalize`}>
        {label}
      </span>
    </label>
  );
}

export function TabBar({ tabs, current, onChange }) {
  return (
    <div className="flex gap-1 mb-4 border-b border-gold">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`px-4 py-2 font-display text-xs uppercase tracking-wider transition ${
            current === t.id ? 'text-gold border-b-2 -mb-px' : 'text-fade hover:text-parchment'
          }`}
          style={current === t.id ? { borderBottomColor: '#d4a644' } : {}}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function ActionCard({ title, sub, right, onClick }) {
  return (
    <button onClick={onClick}
      className="btn-action bg-card hover:bg-card-hover border border-gold rounded-sm p-3 text-left flex justify-between items-start gap-2 group">
      <div className="min-w-0 flex-1">
        <div className="font-display text-base text-parchment group-hover:text-gold transition">{title}</div>
        <div className="text-xs text-fade italic mt-0.5 truncate">{sub}</div>
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </button>
  );
}

export function ModifierRow({ mod, active, paramSelections, onToggle, onParamChange }) {
  return (
    <div
      className={`border rounded-sm p-2.5 cursor-pointer transition ${
        active ? 'bg-active glow-active border-gold-strong' : 'bg-card border-gold hover:bg-card-hover'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center gap-2.5">
        <div
          className={`w-3.5 h-3.5 border rounded-sm flex-shrink-0 flex items-center justify-center text-xs ${
            active ? 'border-gold-strong' : 'border-gold'
          }`}
          style={active ? { backgroundColor: '#d4a644', color: '#14100c' } : {}}
        >
          {active && '✓'}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-display text-sm uppercase tracking-wide ${active ? 'text-gold' : 'text-parchment'}`}>
            {mod.name}
          </div>
          <div className="text-xs text-fade italic truncate">{mod.sub}</div>
        </div>
        {active && mod.params.length > 0 && (
          <div onClick={e => e.stopPropagation()} className="flex gap-2 items-center flex-shrink-0">
            {mod.params.map(p => (
              <div key={p.id} className="flex items-center gap-1">
                <span className="text-xs text-fade">{p.label}</span>
                <select className="lined" value={paramSelections[p.id] ?? p.defaultIndex}
                        onChange={e => onParamChange(p.id, Number(e.target.value))}>
                  {p.options.map((o, i) => <option key={i} value={i}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function FieldLabel({ children }) {
  return <label className="text-fade text-xs uppercase tracking-wider block">{children}</label>;
}

export function SectionCard({ title, children, right }) {
  return (
    <section className="bg-card border border-gold rounded-sm p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-display text-gold text-xs uppercase tracking-wider">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}
