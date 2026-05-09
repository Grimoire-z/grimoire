// Theme & font-preset registry. Pure data — the actual CSS variables that
// drive each theme live in src/index.css, keyed by [data-theme=...] /
// [data-font-preset=...]. To add a new preset: add a CSS block there and
// register it here.

export const THEMES = [
  {
    id: 'grimoire',
    name: 'Grimoire',
    sub: 'parchment & old gold',
    swatch: { bg: '#14100c', card: '#1e1813', accent: '#d4a644', danger: '#b8434c' },
  },
  {
    id: 'necromancer',
    name: 'Necromancer',
    sub: 'eggplant & violet pearl',
    swatch: { bg: '#0e0a18', card: '#1a1230', accent: '#c4a8e8', danger: '#a83a5a' },
  },
  {
    id: 'sylvan',
    name: 'Sylvan Codex',
    sub: 'forest & copper bronze',
    swatch: { bg: '#0c1410', card: '#152018', accent: '#c08840', danger: '#b8434c' },
  },
  {
    id: 'crimson-bound',
    name: 'Crimson Bound',
    sub: 'blood & tarnished silver',
    swatch: { bg: '#16080a', card: '#241016', accent: '#c5c0a8', danger: '#d04050' },
  },
];

export const FONT_PRESETS = [
  {
    id: 'manuscript',
    name: 'Manuscript',
    sub: 'Cinzel · Crimson Pro · JetBrains Mono',
    sample: { display: 'Cinzel, serif', body: '"Crimson Pro", serif' },
  },
  {
    id: 'antique',
    name: 'Antique Press',
    sub: 'IM Fell English SC · IM Fell English',
    sample: { display: '"IM Fell English SC", serif', body: '"IM Fell English", serif' },
  },
  {
    id: 'modern',
    name: 'Modern Tome',
    sub: 'Inter · Inter · JetBrains Mono',
    sample: { display: 'Inter, sans-serif', body: 'Inter, sans-serif' },
  },
];

export const DEFAULT_THEME_ID = 'grimoire';
export const DEFAULT_FONT_PRESET_ID = 'manuscript';
