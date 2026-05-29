// Persistent app state: character vault + bestiary + per-character + global slices + UI settings.
// localStorage with a versioned schema; v1 (single character) auto-migrates to v2
// (vault of N characters), and v2 auto-migrates to v3 (adds bestiary slices for
// DM mode). STORAGE_KEY keeps its historical "v1" suffix for backwards-compat
// with existing installs; the inner `schemaVersion` field is the canonical version marker.

import { DEFAULT_THEME_ID, DEFAULT_FONT_PRESET_ID } from './themes.js';

export const SCHEMA_VERSION = 4;

export const DEFAULT_SETTINGS = {
  theme: DEFAULT_THEME_ID,
  fontPreset: DEFAULT_FONT_PRESET_ID,
  preparedOnly: false,
  dmMode: false,
};

const STORAGE_KEY = 'grimoire.state.v1';

// 8-char base36 id, ~47 bits of entropy. Collision-safe for personal vault
// sizes; not a real UUID because we don't need globally-unique identifiers.
// Shared by makeCharacterId and makeMonsterId — both pools live in different
// maps so a cross-pool collision is harmless either way.
function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

export function makeCharacterId() {
  return makeId();
}

export function makeMonsterId() {
  return makeId();
}

// Minimal monster shape for slice 1 — name + active + optional folderId.
// Richer fields (AC, HP, abilities, actions, legendary actions, …) land in
// later slices as the 5e.tools importer and DM Roll view land.
export function makeBlankMonster(name = 'New Monster') {
  return {
    id: makeMonsterId(),
    name,
    active: false,
    folderId: null,
  };
}

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
      { id: 'sacred flame', name: 'Sacred Flame', sub: 'DEX save · 1d8 radiant',         prepared: true },
      { id: 'thaumaturgy',  name: 'Thaumaturgy',  sub: 'minor magic effect · 1 min',     prepared: true },
    ],
    1: [
      { id: 'cure wounds',     name: 'Cure Wounds',     sub: 'touch · 1d8+CHA hp',        prepared: true },
      { id: 'bless',           name: 'Bless',           sub: '3 targets · +1d4 atk/save', prepared: true },
      { id: 'shield of faith', name: 'Shield of Faith', sub: '+2 AC · 10 min · conc',     prepared: false },
      { id: 'compelled duel',  name: 'Compelled Duel',  sub: 'WIS save · conc',           prepared: false },
    ],
    2: [
      { id: 'lesser restoration', name: 'Lesser Restoration', sub: 'cure 1 condition',     prepared: false },
      { id: 'branding smite',     name: 'Branding Smite',     sub: '+2d6 radiant · conc',  prepared: true },
      { id: 'aid',                name: 'Aid',                sub: '+5 max & current HP · 8h', prepared: false },
      { id: 'misty step',         name: 'Misty Step',         sub: '30 ft teleport · bonus', prepared: true },
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
  // Per-character slices added in schema v2 (vault). Portrait is a base64
  // data URL (downscaled to ~256px); modifiers is the character's private
  // modifier library, separate from globalModifiers at the top level.
  portrait: null,
  modifiers: [],
  // DDB character URL (e.g., https://www.dndbeyond.com/characters/12345).
  // When set, CharacterView's "Refresh from DDB" button opens this URL
  // in an embedded BrowserWindow and intercepts the /pdf POST body via
  // session.webRequest. Empty string means the refresh button is hidden
  // until the user pastes their URL.
  ddbUrl: '',
};

// Factory for a fresh character with a unique id. `name` lets callers
// pass a starter label (e.g. "New Character" for blank, the imported
// name for PDF imports).
export function makeBlankCharacter(name = 'New Character') {
  return {
    ...DEFAULT_CHARACTER,
    id: makeCharacterId(),
    name,
    portrait: null,
    modifiers: [],
  };
}

// Apply a partial character patch (as produced by ddbPdfImport.js) over
// an existing character. Top-level scalars overwrite; sub-objects merge
// so a partial import doesn't wipe untouched entries; lists & dicts
// (attacks, spells) are replaced wholesale because import sources
// represent the full intended state for those fields.
//
// Used by:
//   - CharacterView "Import Character sheet" card: applies patch to the
//     active character, overwriting fields that came in.
//   - VaultView empty-card "Import from PDF" flow: applies patch to a
//     fresh blank character, producing a brand-new vault entry instead
//     of mutating the active character.
export function applyCharacterPatch(character, patch) {
  return {
    ...character,
    ...patch,
    hp:         patch.hp         ? { ...character.hp,         ...patch.hp }         : character.hp,
    abilities:  patch.abilities  ? { ...character.abilities,  ...patch.abilities }  : character.abilities,
    saves:      patch.saves      ? { ...character.saves,      ...patch.saves }      : character.saves,
    skills:     patch.skills     ? { ...character.skills,     ...patch.skills }     : character.skills,
    spellSlots: patch.spellSlots ? { ...character.spellSlots, ...patch.spellSlots } : character.spellSlots,
  };
}

// ─── Default global modifier library ──────────────────────────────────────
// Seed list for the global modifier library on first launch. Trimmed in v2
// to four universally-applicable modifiers (the rest were character-specific
// like Sacred Weapon for paladins — those now belong in a character's
// private modifier library). Membership in `globalModifiers` is what makes
// a modifier global; modifiers themselves don't carry a `global` flag.

export const DEFAULT_MODIFIERS = [
  { id: 'adv', name: 'Advantage', sub: 'roll twice, take higher',
    applies: ['attack', 'save', 'check'], excludes: ['dis'],
    effects: [{ type: 'adv' }], params: [] },
  { id: 'dis', name: 'Disadvantage', sub: 'roll twice, take lower',
    applies: ['attack', 'save', 'check'], excludes: ['adv'],
    effects: [{ type: 'dis' }], params: [] },
  { id: 'bless', name: 'Bless',
    sub: '+1d4 to attacks & saves · concentration',
    applies: ['attack', 'save'], excludes: [],
    effects: [
      { type: 'bonus',  value: '1d4' },
      { type: 'phrase', value: 'blessed by the divine' },
    ], params: [] },
  { id: 'inspire', name: 'Bardic Inspiration', sub: '+1d8 to one roll',
    applies: ['attack', 'save', 'check'], excludes: [],
    effects: [{ type: 'bonus', value: '1d8' }], params: [] },
];

export const APPLIES_KINDS = ['attack', 'spell', 'save', 'check'];

// Effect-type registry. The shape used to be three parallel objects;
// keeping that to avoid churn but new types should land here so the
// editor's button row, the composer, and the EffectRow input copy all
// stay in sync. `EFFECT_DESCRIPTIONS` shows on hover for each button.
// Effect-type registry. The shape used to be three parallel objects;
// keeping that to avoid churn but new types should land here so the
// editor's button row, the composer, and the EffectRow input copy all
// stay in sync. `EFFECT_DESCRIPTIONS` shows on hover for each button.
export const EFFECT_LABELS = {
  bonus:  'Bonus to hit',
  damage: 'Extra damage',
  crit:   'Crit damage',
  adv:    'Advantage',
  dis:    'Disadvantage',
  ro:     'Reroll once',
  rr:     'Reroll repeatedly',
  mi:     'Min die value',
  max:    'Maximize damage',
  dtype:  'Damage type swap',
  hide:   'Hidden roll',
  phrase: 'Flavor phrase',
  raw:    'Raw arg',
};
export const EFFECT_PLACEHOLDERS = {
  bonus:  '1d4   or   2',
  damage: '2d6 [fire]',
  crit:   '2d6 [radiant]',
  ro:     '2',
  rr:     '2',
  mi:     '2',
  dtype:  'radiant   or   slashing>radiant',
  phrase: 'critical strike!',
  raw:    '-rr 2   or   -h',
};
// Tooltip shown when hovering each + add button; keeps the buttons
// themselves compact while still teaching the user what each maps to.
export const EFFECT_DESCRIPTIONS = {
  bonus:  '-b <value> · extra to hit (Bless, Bardic Inspiration, etc.)',
  damage: '-d <value> · extra damage on a hit (Sneak Attack, Hex, Hunter’s Mark)',
  crit:   '-c <value> · extra damage on a crit (Improved Divine Smite, vorpal weapons)',
  adv:    'adv · advantage on the d20',
  dis:    'dis · disadvantage on the d20',
  ro:     '-ro <N> · reroll each damage die once if it rolls ≤ N (Great Weapon Fighting uses 2)',
  rr:     '-rr <N> · reroll each damage die repeatedly until it rolls > N',
  mi:     '-mi <N> · minimum die value, used by some metamagics',
  max:    '-max · maximize every damage die (Empowered Evocation, Vorpal crits)',
  dtype:  '-dtype <new> · change damage type (e.g. Divine Smite turns slashing into radiant)',
  hide:   '-h · hidden roll (DM screen — result is private)',
  phrase: '-phrase "<text>" · flavor text appended to the result',
  raw:    'pass-through · any arbitrary Avrae arg',
};
// Effects whose flag takes a value (gets the text input). The rest are
// boolean-style flags that just emit a marker (adv, dis, hide, max).
const VALUE_TYPES = new Set(['bonus', 'damage', 'crit', 'ro', 'rr', 'mi', 'dtype', 'phrase', 'raw']);
export const EFFECT_HAS_VALUE = (t) => VALUE_TYPES.has(t);
// Short blurb shown in the EffectRow when the effect doesn't take a
// value — replaces the input field with a faded explanation.
export const EFFECT_NO_VALUE_BLURB = {
  adv:  'rolls the d20 with advantage',
  dis:  'rolls the d20 with disadvantage',
  hide: 'roll result is hidden — DM-only',
  max:  'every damage die maxes out',
};

// ─── Fresh-install initial state ──────────────────────────────────────────

export function defaultVault() {
  const seed = makeBlankCharacter('Default Character');
  return {
    characters: { [seed.id]: seed },
    activeCharacterId: seed.id,
    globalModifiers: DEFAULT_MODIFIERS,
    targets: [],
    folders: [],
    monsters: {},
    monsterFolders: [],
    // DM-mode slices live alongside the player-mode ones; the active
    // mode picks which the views read/write. Fresh installs seed the
    // DM modifier library with the same defaults the player side gets
    // (Advantage / Disadvantage / Bless / Bardic Inspiration) so the
    // base buffs are present in both modes from day one. Targets and
    // folders start empty since they're typically session-specific.
    dmModifiers: JSON.parse(JSON.stringify(DEFAULT_MODIFIERS)),
    dmTargets: [],
    dmFolders: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

// ─── Migration ────────────────────────────────────────────────────────────
// v1 → v2: wraps a single character into a one-entry vault. The v1
// `modifiers` library becomes `globalModifiers` (preserves the previous
// shared-across-everything semantics). Each character gets a portrait and
// per-character modifiers slot (empty by default).
// v2 → v3: adds empty bestiary slices (`monsters`, `monsterFolders`) and
// the new `settings.dmMode` flag. Existing player-mode state is untouched.
// v3 → v4: separates DM-mode targets and modifiers from player-mode.
// `dmModifiers` is seeded with a deep clone of the current
// `globalModifiers` so DM mode keeps access to whatever the user had
// shared before; they're independent thereafter and edits don't leak.
// `dmTargets` / `dmFolders` start empty (targets tend to be session-
// specific anyway — copying the player set into DM would just need
// pruning).
// `migrate()` chains the migrators in sequence so installs from any prior
// version land on the current schema in one pass.

function migrateV1ToV2(v1) {
  const character = {
    ...v1.character,
    id: v1.character?.id || makeCharacterId(),
    portrait: null,
    modifiers: [],
  };
  return {
    schemaVersion: 2,
    characters: { [character.id]: character },
    activeCharacterId: character.id,
    globalModifiers: Array.isArray(v1.modifiers) ? v1.modifiers : DEFAULT_MODIFIERS,
    targets: v1.targets || [],
    folders: v1.folders || [],
    settings: { ...DEFAULT_SETTINGS, ...(v1.settings || {}) },
  };
}

function migrateV2ToV3(v2) {
  return {
    ...v2,
    schemaVersion: 3,
    monsters: {},
    monsterFolders: [],
    // DEFAULT_SETTINGS spread ensures dmMode (and any future settings keys)
    // land with their defaults; user-set values from v2 win on overlap.
    settings: { ...DEFAULT_SETTINGS, ...(v2.settings || {}) },
  };
}

function migrateV3ToV4(v3) {
  return {
    ...v3,
    schemaVersion: 4,
    // Deep-clone globalModifiers so the new DM library starts with the
    // same set the user already had access to, but is functionally
    // independent — editing a mod on the DM side from here forward
    // doesn't touch the player-side copy.
    dmModifiers: JSON.parse(JSON.stringify(v3.globalModifiers || DEFAULT_MODIFIERS)),
    dmTargets: [],
    dmFolders: [],
  };
}

function migrate(payload) {
  let s = payload;
  if (s?.schemaVersion === 1) s = migrateV1ToV2(s);
  if (s?.schemaVersion === 2) s = migrateV2ToV3(s);
  if (s?.schemaVersion === 3) s = migrateV3ToV4(s);
  return s;
}

// ─── Persistence ───────────────────────────────────────────────────────────

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const migrated = migrate(parsed);
    if (migrated?.schemaVersion === SCHEMA_VERSION) return migrated;
    return null; // unknown schema — fall back to defaults rather than corrupt state
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

// ─── Backup & Restore ─────────────────────────────────────────────────────
// Same shape as the localStorage payload (`{ schemaVersion, characters,
// activeCharacterId, globalModifiers, targets, folders, settings }`) with
// an extra `exportedAt` ISO timestamp. A round-trip through these helpers
// is lossless: importing what you just exported reproduces state.
// v1 exports (single character) auto-migrate on import via the same path
// `loadState` uses, so older backup files keep working forward.

export function downloadExport(state) {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    ...state,
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  // Pick a filename slug. With one character, use its name (preserves the
  // old "grimoire-thora-stormhold-…" feel). With multiple, use "vault".
  const chars = Object.values(state.characters || {});
  const slug = chars.length === 1
    ? (chars[0].name || 'export').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'export'
    : 'vault';
  const date = new Date().toISOString().slice(0, 10);

  const a = document.createElement('a');
  a.href = url;
  a.download = `grimoire-${slug}-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return a.download; // filename, for status feedback
}

// Parses + validates an exported JSON string. Throws on malformed input
// or unknown schema versions. On success returns a v2 state slice that
// the caller splats into React state via replaceState. v1 export files
// are auto-migrated to v2 here so older backups keep working forward.
export function parseImport(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('not a Grimoire export file');
  }

  // v1 export validation — the migrator chain handles the rest.
  if (parsed.schemaVersion === 1) {
    if (!parsed.character || typeof parsed.character !== 'object') {
      throw new Error('v1 export is missing the character section');
    }
  }

  // Auto-migrate older payloads forward (v1 → v2 → v3 → v4) so backups
  // from any prior version stay importable.
  const migrated = migrate(parsed);

  if (migrated?.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `incompatible schema version (file is v${parsed.schemaVersion ?? '?'}, app is v${SCHEMA_VERSION})`
    );
  }

  // Loose shape check — enough to reject unrelated JSON without being so
  // strict that future small additions to the payload would block import.
  if (!migrated.characters || typeof migrated.characters !== 'object') {
    throw new Error('export is missing the characters section');
  }
  return migrated;
}

export function resetState() {
  localStorage.removeItem(STORAGE_KEY);
}
