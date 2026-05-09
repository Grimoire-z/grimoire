import { THEMES, FONT_PRESETS } from '../themes.js';
import { SectionCard } from '../components.jsx';

export default function SettingsView({ settings, setSettings }) {
  return (
    <main className="px-6 pb-12 max-w-5xl mx-auto relative z-10 flex flex-col gap-4">
      <SectionCard title="Theme">
        <p className="text-fade text-sm italic mb-4">
          Color palette. Each theme shifts the primary accent and danger hues while preserving role semantics.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {THEMES.map(t => (
            <ThemeCard key={t.id}
              theme={t}
              active={settings.theme === t.id}
              onSelect={() => setSettings(s => ({ ...s, theme: t.id }))}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Fonts">
        <p className="text-fade text-sm italic mb-4">
          Type combinations: display (headings), body (prose), and command output. Click a card to apply.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {FONT_PRESETS.map(p => (
            <FontCard key={p.id}
              preset={p}
              active={settings.fontPreset === p.id}
              onSelect={() => setSettings(s => ({ ...s, fontPreset: p.id }))}
            />
          ))}
        </div>
      </SectionCard>
    </main>
  );
}

function ThemeCard({ theme, active, onSelect }) {
  return (
    <button type="button" onClick={onSelect}
      className={`text-left p-4 border rounded-sm transition btn-action ${
        active ? 'border-gold-strong bg-active glow-active'
               : 'border-gold bg-card hover:bg-card-hover'
      }`}
    >
      <div className="flex gap-1.5 mb-3">
        <span className="w-9 h-9 rounded-sm border border-gold" style={{ backgroundColor: theme.swatch.bg }}     title="background" />
        <span className="w-9 h-9 rounded-sm border border-gold" style={{ backgroundColor: theme.swatch.card }}   title="card" />
        <span className="w-9 h-9 rounded-sm border border-gold" style={{ backgroundColor: theme.swatch.accent }} title="accent" />
        <span className="w-9 h-9 rounded-sm border border-gold" style={{ backgroundColor: theme.swatch.danger }} title="danger" />
      </div>
      <div className={`font-display text-sm uppercase tracking-wider mb-0.5 ${active ? 'text-gold' : 'text-parchment'}`}>
        {theme.name}
      </div>
      <div className="text-fade text-xs italic">{theme.sub}</div>
      {active && (
        <div className="mt-2 text-gold text-[10px] font-cmd uppercase tracking-wider">● active</div>
      )}
    </button>
  );
}

function FontCard({ preset, active, onSelect }) {
  return (
    <button type="button" onClick={onSelect}
      className={`text-left p-4 border rounded-sm transition btn-action flex flex-col gap-3 ${
        active ? 'border-gold-strong bg-active glow-active'
               : 'border-gold bg-card hover:bg-card-hover'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className={`text-sm uppercase tracking-wider truncate ${active ? 'text-gold' : 'text-parchment'}`}
             style={{ fontFamily: preset.sample.display, letterSpacing: '0.06em' }}>
          {preset.name}
        </div>
        <span className="text-3xl leading-none flex-shrink-0"
              style={{
                fontFamily: preset.sample.display,
                color: active ? 'var(--color-gold)' : 'var(--color-fade)',
              }}>
          Aa
        </span>
      </div>
      <div className="text-parchment text-sm leading-snug" style={{ fontFamily: preset.sample.body }}>
        The quick brown fox jumps over the lazy dog.
      </div>
      <div className="text-fade text-[11px] italic truncate">{preset.sub}</div>
      {active && (
        <div className="text-gold text-[10px] font-cmd uppercase tracking-wider">● active</div>
      )}
    </button>
  );
}
