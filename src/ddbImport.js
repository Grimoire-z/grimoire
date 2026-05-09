// Best-effort D&D Beyond character JSON importer.
//
// Source: https://character-service.dndbeyond.com/character/v5/character/{id}
// Open the URL in a tab while logged in (or for a public char), copy the JSON.
//
// We map the well-known fields and skip anything weird. The user can fix up
// the rest in the Character editor afterwards.

const ABILITY_BY_INDEX = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

function abilityScores(payload) {
  const stats = payload?.stats || [];
  const bonus = payload?.bonusStats || [];
  const ovr   = payload?.overrideStats || [];
  const out   = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  stats.forEach((s, i) => {
    const key = ABILITY_BY_INDEX[i];
    if (!key) return;
    const override = ovr[i]?.value;
    if (override != null) { out[key] = override; return; }
    const base  = s?.value ?? 10;
    const extra = bonus[i]?.value ?? 0;
    out[key] = base + extra;
  });
  return out;
}

function totalLevel(payload) {
  const classes = payload?.classes || [];
  return classes.reduce((sum, c) => sum + (c?.level || 0), 0);
}

function classSummary(payload) {
  const classes = payload?.classes || [];
  return classes
    .map(c => {
      const subclass = c?.subclassDefinition?.name;
      const klass = c?.definition?.name || 'Class';
      const lvl = c?.level || 0;
      return subclass ? `${subclass} ${klass} ${lvl}` : `${klass} ${lvl}`;
    })
    .join(' / ');
}

function profBonusFor(level) {
  return Math.ceil(level / 4) + 1;
}

// Pick a representative max HP if the JSON has it, otherwise 0.
function maxHp(payload) {
  return payload?.baseHitPoints ?? 0;
}

// Maps DDB JSON onto a partial character object — missing fields are left
// undefined so the caller can merge over an existing sheet.
export function mapDdbJson(raw) {
  let payload = raw;
  // The /character/v5 endpoint wraps the actual char in { data: {...} }.
  if (raw && typeof raw === 'object' && 'data' in raw && raw.data) {
    payload = raw.data;
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('JSON did not look like a D&D Beyond character payload');
  }

  const level     = totalLevel(payload);
  const abilities = abilityScores(payload);
  const hpMax     = maxHp(payload);

  return {
    name:     payload.name || '',
    pronouns: payload.gender || '',
    ancestry: payload.race?.fullName || payload.race?.baseName || '',
    klass:    classSummary(payload),
    level,
    profBonus: level ? profBonusFor(level) : 2,
    ac:        payload.armorClass ?? undefined,
    hp: hpMax ? { current: hpMax, max: hpMax, temp: 0 } : undefined,
    abilities,
  };
}

// Convenience: parse + map. Throws on bad JSON.
export function importDdbText(text) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('empty input');
  let parsed;
  try { parsed = JSON.parse(trimmed); }
  catch (e) { throw new Error('not valid JSON: ' + e.message); }
  return mapDdbJson(parsed);
}
