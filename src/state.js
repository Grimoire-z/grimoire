// Persistent app state: character sheet + modifier library.
// localStorage with a versioned schema so we can migrate later.

export const SCHEMA_VERSION = 1;

const STORAGE_KEY = 'grimoire.state.v1';

// ─── Standard 5e tables ────────────────────────────────────────────────────
// Saves are always the 6 ability ones; skills are the canonical 18.
// Each row is editable for prof + mod string, but the rows themselves are fixed.

export const SAVE_DEFS = [
  { id: 'str', name: 'STR' },
  { id: 'dex', name: 'DEX' },
  { id: 'con', name: 'CON' },
  { id: 'int', name: 'INT' },
  { id: 'wis', name: 'WIS' },
  { id: 'cha', name: 'CHA' },
];

export const SKILL_DEFS = [
  { id: 'acrobatics',     name: 'Acrobatics',      ability: 'dex' },
  { id: 'animalHandling', name: 'Animal Handling', ability: 'wis' },
  { id: 'arcana',         name: 'Arcana',          ability: 'int' },
  { id: 'athletics',      name: 'Athletics',       ability: 'str' },
  { id: 'deception',      name: 'Deception',       ability: 'cha' },
  { id: 'history',        name: 'History',         ability: 'int' },
  { id: 'insight',        name: 'Insight',         ability: 'wis' },
  { id: 'intimidation',   name: 'Intimidation',    ability: 'cha' },
  { id: 'investigation',  name: 'Investigation',   ability: 'int' },
  { id: 'medicine',       name: 'Medicine',        ability: 'wis' },
  { id: 'nature',         name: 'Nature',          ability: 'int' },
  { id: 'perception',     name: 'Perception',      ability: 'wis' },
  { id: 'performance',    name: 'Performance',     ability: 'cha' },
  { id: 'persuasion',     name: 'Persuasion',      ability: 'cha' },
  { id: 'religion',       name: 'Religion',        ability: 'int' },
  { id: 'sleightOfHand',  name: 'Sleight of Hand', ability: 'dex' },
  { id: 'stealth',        name: 'Stealth',         ability: 'dex' },
  { id: 'survival',       name: 'Survival',        ability: 'wis' },
];

// ─── Default character ─────────────────────────────────────────────────────

export const DEFAULT_CHARACTER = {
  name: 'Thora Stormhold',
  pronouns: 'she/her',
  ancestry: 'Half-Orc',
  klass: 'Oath of Vengeance Paladin',
  level: 5,
  hp: { current: 47, max: 47, temp: 0 },
  ac: 18,
  speed: 30,
  profBonus: 3,
  inspiration: false,
  abilities: { str: 18, dex: 12, con: 14, int: 8, wis: 10, cha: 16 },
  attacks: [
    { id: 'longsword',    name: 'Longsword',      sub: '1d8+4 slash · versatile' },
    { id: 'longsword2h',  name: 'Longsword (2H)', sub: '1d10+4 slash' },
    { id: 'javelin',      name: 'Javelin',        sub: '1d6+4 pierce · 30/120 ft' },
    { id: 'shield bash',  name: 'Shield Bash',    sub: 'unarmed · 1+4 bldg' },
  ],
  spells: {
    0: [
      { id: 'sacred flame', name: 'Sacred Flame', sub: 'DEX save · 1d8 radiant' },
      { id: 'thaumaturgy',  name: 'Thaumaturgy',  sub: 'minor magic effect · 1 min' },
    ],
    1: [
      { id: 'cure wounds',     name: 'Cure Wounds',     sub: 'touch · 1d8+CHA hp' },
      { id: 'bless',           name: 'Bless',           sub: '3 targets · +1d4 atk/save' },
      { id: 'shield of faith', name: 'Shield of Faith', sub: '+2 AC · 10 min · conc' },
      { id: 'compelled duel',  name: 'Compelled Duel',  sub: 'WIS save · conc' },
    ],
    2: [
      { id: 'lesser restoration', name: 'Lesser Restoration', sub: 'cure 1 condition' },
      { id: 'branding smite',     name: 'Branding Smite',     sub: '+2d6 radiant · conc' },
      { id: 'aid',                name: 'Aid',                sub: '+5 max & current HP · 8h' },
      { id: 'misty step',         name: 'Misty Step',         sub: '30 ft teleport · bonus' },
    ],
    3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [],
  },
  // Cantrips (level 0) are at-will; no slot tracking.
  spellSlots: {
    1: { current: 4, max: 4 },
    2: { current: 3, max: 3 },
    3: { current: 0, max: 0 },
    4: { current: 0, max: 0 },
    5: { current: 0, max: 0 },
    6: { current: 0, max: 0 },
    7: { current: 0, max: 0 },
    8: { current: 0, max: 0 },
    9: { current: 0, max: 0 },
  },
  // Saves and skills store overrides; lookups go through SAVE_DEFS / SKILL_DEFS.
  // Each entry: { mod: '+8', prof: true }. Missing entries => unproficient & blank mod.
  saves: {
    str: { mod: '+6', prof: false },
    dex: { mod: '+1', prof: false },
    con: { mod: '+3', prof: false },
    int: { mod: '−1', prof: false },
    wis: { mod: '+5', prof: true },
    cha: { mod: '+8', prof: true },
  },
  skills: {
    athletics:    { mod: '+6', prof: true },
    intimidation: { mod: '+8', prof: true },
    persuasion:   { mod: '+8', prof: true },
    insight:      { mod: '+5', prof: true },
    religion:     { mod: '+2', prof: false },
    perception:   { mod: '+2', prof: false },
    investigation:{ mod: '−1', prof: false },
    history:      { mod: '+2', prof: false },
  },
};

// ─── Default modifier library ──────────────────────────────────────────────

export const DEFAULT_MODIFIERS = [
  { id: 'adv', name: 'Advantage', sub: 'roll twice, take higher',
    applies: ['attack', 'save', 'check'], excludes: ['dis', 'reckless'],
    effects: [{ type: 'adv' }], params: [] },
  { id: 'dis', name: 'Disadvantage', sub: 'roll twice, take lower',
    applies: ['attack', 'save', 'check'], excludes: ['adv', 'reckless'],
    effects: [{ type: 'dis' }], params: [] },
  { id: 'bless', name: 'Bless',
    sub: '+1d4 to attacks & saves · concentration',
    applies: ['attack', 'save'], excludes: [],
    effects: [
      { type: 'bonus',  value: '1d4' },
      { type: 'phrase', value: 'blessed by the divine' },
    ], params: [] },
  { id: 'reckless', name: 'Reckless Attack',
    sub: 'advantage on STR melee · attacks vs you have adv',
    applies: ['attack'], excludes: ['dis'],
    effects: [{ type: 'adv' }], params: [] },
  { id: 'sacred', name: 'Sacred Weapon',
    sub: 'channel divinity · +CHA to attacks · 1 minute',
    applies: ['attack'], excludes: [],
    effects: [{ type: 'bonus', value: '5' }], params: [] },
  { id: 'inspire', name: 'Bardic Inspiration', sub: '+1d8 to one roll',
    applies: ['attack', 'save', 'check'], excludes: [],
    effects: [{ type: 'bonus', value: '1d8' }], params: [] },
  { id: 'smite', name: 'Divine Smite',
    sub: 'extra radiant damage · burns spell slot',
    applies: ['attack'], excludes: [],
    effects: [
      { type: 'damage', value: '{slot}d8 [radiant]' },
      { type: 'phrase', value: 'DIVINE SMITE!' },
    ],
    params: [
      { id: 'slot', label: 'Lvl', defaultIndex: 0,
        options: [
          { label: 'Lvl 1', value: '2' },
          { label: 'Lvl 2', value: '3' },
          { label: 'Lvl 3', value: '4' },
          { label: 'Lvl 4', value: '5' },
        ] },
    ] },
  { id: 'branding', name: 'Branding Smite (cast)',
    sub: '+2d6 radiant · concentration',
    applies: ['attack'], excludes: [],
    effects: [{ type: 'damage', value: '2d6 [radiant]' }], params: [] },
];

export const APPLIES_KINDS = ['attack', 'spell', 'save', 'check'];

export const EFFECT_LABELS = {
  bonus: 'Bonus to hit', damage: 'Extra damage',
  adv: 'Advantage', dis: 'Disadvantage',
  phrase: 'Flavor phrase', raw: 'Raw arg',
};
export const EFFECT_PLACEHOLDERS = {
  bonus: '1d4   or   2',
  damage: '2d6 [fire]',
  phrase: 'critical strike!',
  raw: '-rr 2   or   -h',
};
export const EFFECT_HAS_VALUE = (t) =>
  t === 'bonus' || t === 'damage' || t === 'phrase' || t === 'raw';

// ─── Persistence ───────────────────────────────────────────────────────────

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.schemaVersion !== SCHEMA_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      ...state,
    }));
  } catch (err) {
    console.warn('grimoire: failed to persist state', err);
  }
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}
