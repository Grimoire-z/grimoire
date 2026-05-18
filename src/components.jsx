// Small shared sub-components used by multiple views.

import { useEffect, useRef, useState } from 'react';

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

// Character portrait. Renders the stored data-URL image if present, or
// a faded bust silhouette as the fallback. Square aspect ratio; `size`
// is the rendered edge in pixels. Wherever a portrait appears (vault
// card, Roll-view header, Character-editor identity section) this is
// the single source of truth — keep the appearance consistent.
export function PortraitDisplay({ portrait, size = 80, alt = 'character portrait' }) {
  const px = `${size}px`;
  if (portrait) {
    return (
      <img
        src={portrait}
        alt={alt}
        className="flex-shrink-0 rounded-sm border border-gold object-cover"
        style={{ width: px, height: px, backgroundColor: 'var(--color-bg)' }}
      />
    );
  }
  // Inner icon scales with the slot — keep silhouette readable at the
  // small Roll-header size (≈40px) and pleasant at the Character-editor
  // size (≈120px).
  const icon = Math.round(size * 0.5);
  return (
    <div
      className="flex-shrink-0 rounded-sm border border-gold flex items-center justify-center"
      style={{ width: px, height: px, backgroundColor: 'var(--color-bg)' }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={icon} height={icon} fill="none"
           stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
           strokeLinejoin="round" className="text-fade">
        <circle cx="12" cy="8" r="3.6" />
        <path d="M5 21c0-3.6 3.1-6.4 7-6.4s7 2.8 7 6.4" />
      </svg>
    </div>
  );
}

// Resize an arbitrary user-uploaded image to a square 256×256 base64 JPEG
// data URL suitable for persisting in localStorage. Center-crops to a
// square, downscales via canvas, and emits JPEG at q=0.85 — typical
// output is 15–60KB, well under any localStorage budget. Throws on
// non-image files or files larger than 10MB raw.
export async function fileToPortraitDataUrl(file, targetSize = 256, quality = 0.85) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('not an image file');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error(`image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB) — please pick something under 10MB`);
  }
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload  = () => resolve(el);
      el.onerror = () => reject(new Error('could not decode image'));
      el.src = blobUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width  = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Center-crop the source to the largest square that fits.
    const src = Math.min(img.naturalWidth, img.naturalHeight);
    const sx  = (img.naturalWidth  - src) / 2;
    const sy  = (img.naturalHeight - src) / 2;
    ctx.drawImage(img, sx, sy, src, src, 0, 0, targetSize, targetSize);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

// ─── ConfirmDeleteModal ──────────────────────────────────────────────────
// Generic typed-confirm modal for destructive actions. Lifted from
// VaultView once a second use case (monster deletion in DM mode's
// Bestiary) arrived. Backdrop click + Escape cancel; the Delete button
// stays disabled until the input matches `DELETE` exactly so a muscle-
// memory Enter on a half-typed string can't fire it. Caller passes:
//   - `kind`: lowercase noun for the title ("character", "monster", …)
//   - `name`: gold-styled display name
//   - `details`: optional JSX appended after "permanently delete <name> —"
// Importers: see VaultView.jsx (character delete) and BestiaryView.jsx
// (monster delete).
export function ConfirmDeleteModal({ kind = 'item', name, details, onCancel, onConfirm }) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef(null);
  const ready = typed === 'DELETE';

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
      onClick={onCancel}
    >
      <div
        className="bg-card border border-crimson rounded-sm max-w-md w-full p-5"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(var(--color-crimson-rgb), 0.3)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-display text-lg text-crimson uppercase tracking-wider mb-2">
          Delete {kind}?
        </h3>
        <p className="text-parchment text-sm mb-3">
          You're about to permanently delete{' '}
          <span className="text-gold font-display">{name || '— unnamed —'}</span>
          {details ? <> — {details}</> : null}.
        </p>
        <p className="text-fade text-xs italic mb-4">
          This cannot be undone. To confirm, type <span className="font-cmd text-crimson">DELETE</span> below.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={typed}
          onChange={e => setTyped(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && ready) onConfirm(); }}
          placeholder="type DELETE"
          className="lined w-full font-cmd mb-4"
          style={{ borderBottomColor: ready ? 'var(--color-crimson)' : undefined }}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-parchment border border-gold px-3 py-1.5 hover:bg-active transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!ready}
            className={`text-xs font-cmd uppercase tracking-wider border px-3 py-1.5 transition ${
              ready
                ? 'text-parchment border-crimson hover:bg-active cursor-pointer'
                : 'text-fade border-gold opacity-50 cursor-not-allowed'
            }`}
            style={ready ? { backgroundColor: 'var(--color-crimson)', color: 'var(--color-bg)' } : {}}
          >
            ✕ Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// d20 silhouette used as the Settings nav button. Sized by the surrounding box.
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
