// Small shared sub-components used by multiple views.

import { useEffect, useRef, useState } from 'react';
import { THEMES, FONT_PRESETS } from './themes.js';

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
        style={checked ? { backgroundColor: 'var(--color-gold)', color: 'var(--color-bg)' } : {}}
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
          style={current === t.id ? { borderBottomColor: 'var(--color-gold)' } : {}}>
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
          style={active ? { backgroundColor: 'var(--color-gold)', color: 'var(--color-bg)' } : {}}
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

// ─── Settings menu (toggleable from header) ─────────────────────────────

// d20 silhouette: outer hexagon with internal triangle subdivisions and a
// "20" in the visible top face. Sized by the surrounding font/box.
export function D20Icon({ size = 18 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}
         fill="none" stroke="currentColor" strokeWidth="1.4"
         strokeLinejoin="round" aria-hidden="true">
      <path d="M12 1.8 L21.6 7 L21.6 17 L12 22.2 L2.4 17 L2.4 7 Z" />
      <path d="M12 1.8 L21.6 7 L12 12 Z" />
      <path d="M12 1.8 L2.4 7 L12 12 Z" />
      <path d="M21.6 7 L21.6 17 L12 12 Z" />
      <path d="M2.4 7 L2.4 17 L12 12 Z" />
      <path d="M12 22.2 L21.6 17 L12 12 Z" />
      <path d="M12 22.2 L2.4 17 L12 12 Z" />
      <text x="12" y="11.2" textAnchor="middle" fontSize="4.5"
            fill="currentColor" stroke="none"
            fontFamily="var(--font-cmd)" fontWeight="600">20</text>
    </svg>
  );
}

export function SettingsMenu({ settings, setSettings }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDocDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="popover-anchor">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Settings"
        aria-label="Settings"
        aria-expanded={open}
        className={`flex items-center justify-center w-8 h-8 border rounded-sm transition ${
          open ? 'text-gold border-gold-strong bg-active'
               : 'text-fade border-gold hover:text-parchment hover:bg-active'
        }`}
      >
        <D20Icon size={18} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-card border border-gold-strong rounded-sm shadow-2xl z-50 p-4 scrollbar-thin"
             style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(var(--color-gold-rgb),0.15)' }}>
          <h4 className="font-display text-gold text-xs uppercase tracking-wider mb-2">Theme</h4>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {THEMES.map(t => (
              <ThemeSwatch key={t.id} theme={t}
                active={settings.theme === t.id}
                onSelect={() => setSettings(s => ({ ...s, theme: t.id }))} />
            ))}
          </div>
          <h4 className="font-display text-gold text-xs uppercase tracking-wider mb-2">Fonts</h4>
          <div className="flex flex-col gap-2">
            {FONT_PRESETS.map(p => (
              <FontSwatch key={p.id} preset={p}
                active={settings.fontPreset === p.id}
                onSelect={() => setSettings(s => ({ ...s, fontPreset: p.id }))} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeSwatch({ theme, active, onSelect }) {
  return (
    <button type="button" onClick={onSelect}
      className={`text-left p-2 border rounded-sm transition ${
        active ? 'border-gold-strong bg-active' : 'border-gold hover:bg-card-hover'
      }`}
      title={theme.sub}
    >
      <div className="flex gap-1 mb-1.5">
        <span className="w-4 h-4 rounded-sm border" style={{ backgroundColor: theme.swatch.bg,    borderColor: 'rgba(255,255,255,0.1)' }} />
        <span className="w-4 h-4 rounded-sm border" style={{ backgroundColor: theme.swatch.card,  borderColor: 'rgba(255,255,255,0.1)' }} />
        <span className="w-4 h-4 rounded-sm border" style={{ backgroundColor: theme.swatch.accent, borderColor: 'rgba(0,0,0,0.2)' }} />
        <span className="w-4 h-4 rounded-sm border" style={{ backgroundColor: theme.swatch.danger, borderColor: 'rgba(0,0,0,0.2)' }} />
      </div>
      <div className={`font-display text-xs uppercase tracking-wider ${active ? 'text-gold' : 'text-parchment'}`}>
        {theme.name}
      </div>
      <div className="text-fade text-[10px] italic truncate">{theme.sub}</div>
    </button>
  );
}

function FontSwatch({ preset, active, onSelect }) {
  return (
    <button type="button" onClick={onSelect}
      className={`text-left p-2 border rounded-sm transition flex items-baseline justify-between gap-2 ${
        active ? 'border-gold-strong bg-active' : 'border-gold hover:bg-card-hover'
      }`}
      title={preset.sub}
    >
      <div className="min-w-0">
        <div className={`text-xs uppercase tracking-wider ${active ? 'text-gold' : 'text-parchment'}`}
             style={{ fontFamily: preset.sample.display, letterSpacing: '0.06em' }}>
          {preset.name}
        </div>
        <div className="text-fade text-[10px] italic truncate" style={{ fontFamily: preset.sample.body }}>
          {preset.sub}
        </div>
      </div>
      <span className="text-2xl leading-none flex-shrink-0"
            style={{ fontFamily: preset.sample.display, color: active ? 'var(--color-gold)' : 'var(--color-fade)' }}>
        Aa
      </span>
    </button>
  );
}
