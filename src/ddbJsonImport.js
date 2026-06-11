// D&D Beyond JSON importer.
//
// DDB's character-sheet PDF endpoint (`POST /character/v5/pdf` on the
// character-service host) is interesting: the server isn't generating
// the PDF from a character ID — it's *rendering* a JSON blob that the
// web client assembles and ships in the request body. That JSON
// (`exportData`) contains the entire structured character — attacks
// with toHit/damage, skills with proficiencyLevel+modifier, spells
// with full metadata, spell slots, saves, ability scores, classes,
// etc. Parsing it is dramatically easier than parsing the fillable
// PDF, and the data is already pre-computed.
//
// We capture that blob via a small browser bookmarklet (see
// `DDB_BOOKMARKLET` below) that the user saves as a bookmark; when
// they click it on a DDB character page, it hooks `window.fetch`,
// watches for the next POST to `/character/v5/pdf`, and downloads
// the body as a JSON file the user drops into Grimoire here.
//
// This mapper accepts either of two shapes:
//   1. The wrapper the bookmarklet produces:
//        { grimoireSource, capturedAt, characterId, exportData: {...} }
//   2. A bare `exportData` object (in case the user extracted it some
//      other way — e.g., from a debugger, or by hand).
//
// Both return `{ patch, found, characterId?, capturedAt? }` matching
// the shape `importDdbPdfFile` produces. Consumers (VaultView,
// CharacterView) call `applyCharacterPatch` on the patch just like
// the PDF path.

import { SAVE_DEFS, SKILL_DEFS, signed } from './state.js';

// The bookmarklet itself. One-line `javascript:` URL the user saves as
// a browser bookmark. When invoked on a DDB character page, it hooks
// window.fetch; on the next POST to /character/v5/pdf it captures the
// request body, parses out `exportData`, wraps it with a small header,
// and triggers a JSON download. The original PDF call still goes
// through, so the user gets the PDF too if they want it.
//
// Don't reformat — this is whitespace-sensitive when copied as a
// bookmark URL (some browsers strip newlines, but keeping it on one
// line dodges that entirely).
// One-line `javascript:` URL the user saves as a browser bookmark.
// When invoked on a DDB character page, it hooks BOTH window.fetch
// (handles fetch(url, {body, ...}) and fetch(new Request(url, {body}))
// shapes) AND XMLHttpRequest.send (legacy code paths). On any POST to
// /character/v5/pdf it captures the body, parses out `exportData`,
// wraps it with a small header, and triggers a JSON download. The
// original PDF call still goes through so the user gets the PDF too.
//
// We also log progress to the console so DevTools shows whether the
// hook saw the request — useful when CSP / weird page setups break
// the download path but the interception still works.
//
// Keep on one line — some browsers strip newlines from bookmark URLs.
export const DDB_BOOKMARKLET = `javascript:(function(){if(window.__grimoireDdbHook){alert('Grimoire hook already armed on this page. Click DDB\\'s download button to capture.');return;}window.__grimoireDdbHook=true;function emit(p){try{console.log('[grimoire-hook] captured',p);var e=typeof p.exportData==='string'?JSON.parse(p.exportData):p.exportData;var w={grimoireSource:'ddb-bookmarklet',capturedAt:new Date().toISOString(),characterId:p.characterId,exportData:e};var j=JSON.stringify(w,null,2);try{navigator.clipboard&&navigator.clipboard.writeText(j).then(function(){console.log('[grimoire-hook] copied to clipboard ('+j.length+' chars)');},function(){});}catch(_){}try{var x=new Blob([j],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(x);a.download='grimoire-'+(p.characterId||'character')+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);console.log('[grimoire-hook] download triggered');}catch(dlErr){console.warn('[grimoire-hook] download failed, JSON is on clipboard',dlErr);}alert('Grimoire: captured character data ('+j.length+' chars). JSON downloaded + copied to clipboard.');}catch(err){console.error('[grimoire-hook] emit failed',err);alert('Grimoire hook: emit failed - '+err.message);}}function tryBody(b,src){try{if(!b)return false;if(typeof b==='string'&&b.indexOf('exportData')>=0){var p=JSON.parse(b);if(p&&(p.characterId||p.exportData)){console.log('[grimoire-hook] body matched via '+src);emit(p);return true;}}}catch(_){}return false;}var of=window.fetch;window.fetch=function(i,n){try{var u=typeof i==='string'?i:(i&&i.url)||'';var m=((n&&n.method)||(typeof i==='object'&&i?i.method:'')||'').toUpperCase();var isPdf=u.indexOf('/character/v5/pdf')>=0||u.indexOf('character-service')>=0;if(isPdf&&m==='POST'){console.log('[grimoire-hook] saw POST',u);if(n&&n.body){if(!tryBody(n.body,'init.body')&&typeof i==='object'&&i&&typeof i.clone==='function'){i.clone().text().then(function(t){tryBody(t,'request.clone');});}}else if(typeof i==='object'&&i&&typeof i.clone==='function'){i.clone().text().then(function(t){tryBody(t,'request.clone');});}}}catch(err){console.error('[grimoire-hook] fetch wrap',err);}return of.apply(this,arguments);};var XP=window.XMLHttpRequest&&window.XMLHttpRequest.prototype;if(XP&&XP.open&&XP.send){var oo=XP.open,os=XP.send;XP.open=function(method,url){this.__gHookMethod=method;this.__gHookUrl=url;return oo.apply(this,arguments);};XP.send=function(body){try{var u=this.__gHookUrl||'';var m=(this.__gHookMethod||'').toUpperCase();if((u.indexOf('/character/v5/pdf')>=0||u.indexOf('character-service')>=0)&&m==='POST'){console.log('[grimoire-hook] saw XHR POST',u);tryBody(body,'xhr.send');}}catch(err){console.error('[grimoire-hook] xhr wrap',err);}return os.apply(this,arguments);};}console.log('[grimoire-hook] armed; click DDB Print/Download now');alert('Grimoire hook armed. Now click DDB\\'s "Print to PDF" / "Download" button to capture. (If nothing happens, open DevTools Console for diagnostics.)');})();`;

// ─── DDB shape helpers ────────────────────────────────────────────────


// DDB skill names use display casing/spaces ("Sleight of Hand",
// "Animal Handling"); SKILL_DEFS use camelCase ids. Build the lookup
// once.
const SKILL_NAME_TO_ID = Object.fromEntries(
  SKILL_DEFS.map(def => [def.name.toLowerCase(), def.id])
);

// DDB encodes proficiency on both saves and skills as a numeric tier:
//   1 — untrained (mod is just the ability mod)
//   2 — half-prof (uncommon; treat as untrained for our boolean schema)
//   3 — proficient
//   4 — expertise
function profFromLevel(lvl) {
  if (lvl == null) return { prof: false, expertise: false };
  if (lvl >= 4) return { prof: true, expertise: true };
  if (lvl >= 3) return { prof: true, expertise: false };
  return { prof: false, expertise: false };
}

// ─── exportData → patch ──────────────────────────────────────────────

function mapAbilities(exportData) {
  const out = {};
  for (const s of exportData.stats || []) {
    if (s.key && typeof s.score === 'number') {
      out[s.key.toLowerCase()] = s.score;
    }
  }
  return Object.keys(out).length ? out : null;
}

function mapSaves(exportData) {
  const out = {};
  for (const s of exportData.stats || []) {
    if (!s.key) continue;
    const id = s.key.toLowerCase();
    const { prof } = profFromLevel(s.savingThrowProficiencyLevel);
    out[id] = {
      mod: signed(s.savingThrow),
      prof,
    };
  }
  return Object.keys(out).length ? out : null;
}

function mapSkills(exportData) {
  const out = {};
  for (const sk of exportData.skills || []) {
    const id = SKILL_NAME_TO_ID[(sk.name || '').toLowerCase()];
    if (!id) continue; // unknown / custom skill — skip
    const { prof, expertise } = profFromLevel(sk.proficiencyLevel);
    out[id] = {
      mod: signed(sk.modifier),
      prof,
      expertise,
    };
  }
  return Object.keys(out).length ? out : null;
}

function mapAttacks(exportData) {
  const seen = new Set();
  const out = [];
  for (const a of exportData.attacks || []) {
    const name = (a.name || '').trim();
    if (!name) continue;
    const id = name.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);

    const subParts = [];
    if (a.damageString) subParts.push(String(a.damageString).trim());
    if (typeof a.toHit === 'number') subParts.push(`${signed(a.toHit)} to hit`);
    // Notes can be long ("Simple, Finesse, Light, Thrown, Nick, Range (20/60)"); keep them
    // since the player view truncates with overflow.
    if (a.notes) {
      const trimmed = String(a.notes).trim();
      if (trimmed) subParts.push(trimmed);
    }

    out.push({ id, name, sub: subParts.join(' · ') });
  }
  return out;
}

// `exportData.spells` is an array of arrays — outer index = level (0-9),
// inner = list of spells at that level. Each spell carries `name`,
// `canPrepare`, `alwaysPrepared`, components/range/duration etc.
//
// We mirror the PDF importer's prepared-flag convention:
//   - cantrips (level 0) → always prepared:true (they're at-will)
//   - leveled, alwaysPrepared:true (P) → prepared:true
//   - leveled, canPrepare:true only (O) → prepared:false (user toggles
//     day-to-day in CharacterView)
function mapSpells(exportData) {
  const spellsByLevel = {};
  const arr = exportData.spells || [];
  for (let lvl = 0; lvl < arr.length && lvl <= 9; lvl++) {
    const seen = new Set();
    const list = [];
    for (const s of (arr[lvl] || [])) {
      const name = (s.name || '').trim();
      if (!name) continue;
      const id = name.toLowerCase();
      if (seen.has(id)) continue;
      seen.add(id);

      // Compact `sub` summary: components · range · duration. Most
      // useful for at-a-glance scanning in the spell list; full
      // metadata stays accessible via the character sheet editor if
      // we ever surface it there.
      const subParts = [];
      if (s.components) subParts.push(String(s.components));
      if (s.range)      subParts.push(String(s.range));
      if (s.duration)   subParts.push(String(s.duration));

      list.push({
        id,
        name,
        sub: subParts.join(' · '),
        prepared: lvl === 0 ? true : !!s.alwaysPrepared,
      });
    }
    // Sort alphabetically (case-insensitive) so a long spellbook is
    // scannable. Matches the PDF importer's behavior.
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    spellsByLevel[lvl] = list;
  }
  // Fill in any missing levels up to 9 so the schema stays uniform.
  for (let lvl = 0; lvl <= 9; lvl++) {
    if (!spellsByLevel[lvl]) spellsByLevel[lvl] = [];
  }
  return spellsByLevel;
}

// `exportData.spellSlots` is `[{ combined: [...], spell: N, pactMagic: N }, ...]`
// indexed 0-9. The combined array holds separate pools (spell + pact);
// we sum them for our simple `{current, max}` schema since the user
// just needs to track availability. Current defaults to max on import.
function mapSpellSlots(exportData) {
  const out = {};
  const arr = exportData.spellSlots || [];
  for (let lvl = 1; lvl <= 9; lvl++) {
    const slot = arr[lvl];
    if (!slot) continue;
    const total = Array.isArray(slot.combined)
      ? slot.combined.reduce((sum, n) => sum + (Number(n) || 0), 0)
      : (Number(slot.spell) || 0) + (Number(slot.pactMagic) || 0);
    if (total > 0) {
      out[lvl] = { current: total, max: total };
    }
  }
  return Object.keys(out).length ? out : null;
}

function formatClasses(classes) {
  if (!Array.isArray(classes) || classes.length === 0) return null;
  return classes
    .map(c => c.name && c.level ? `${c.name} ${c.level}` : (c.name || ''))
    .filter(Boolean)
    .join(' / ');
}

// ─── Public API ───────────────────────────────────────────────────────

export function parseDdbJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`not valid JSON: ${e.message}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('expected a JSON object at the top level');
  }

  // Accept three input shapes:
  //   1. Bookmarklet wrapper: { characterId, exportData: <object> }
  //   2. Raw DevTools payload: { characterId, exportData: "<json string>" }
  //      — when copied directly out of the Network tab's Payload view,
  //      exportData is still a JSON-encoded string the server would
  //      have parsed itself.
  //   3. Bare exportData object: { stats, attacks, spells, ... }
  let exportData;
  if (typeof parsed.exportData === 'string') {
    try {
      exportData = JSON.parse(parsed.exportData);
    } catch (e) {
      throw new Error(`the exportData field is a string but not valid JSON: ${e.message}`);
    }
  } else if (parsed.exportData && typeof parsed.exportData === 'object') {
    exportData = parsed.exportData;
  } else {
    exportData = parsed;
  }

  // Crude sanity check — if this doesn't look like exportData, surface
  // a helpful error rather than producing an empty patch.
  if (!exportData.stats && !exportData.name && !exportData.attacks && !exportData.spells) {
    throw new Error(
      'this JSON doesn\'t look like a DDB character export — expected fields like `stats`, `name`, `attacks`, or `spells`'
    );
  }

  const patch = {};
  const found = [];

  if (exportData.name) { patch.name = String(exportData.name).trim(); found.push('name'); }

  const classes = formatClasses(exportData.classes);
  if (classes) { patch.klass = classes; found.push('class'); }

  if (exportData.race) { patch.ancestry = String(exportData.race).trim(); found.push('race'); }

  if (typeof exportData.level === 'number') { patch.level = exportData.level; found.push('level'); }
  if (typeof exportData.proficiencyBonus === 'number') {
    patch.profBonus = exportData.proficiencyBonus;
    found.push('profBonus');
  }
  if (typeof exportData.armorClass === 'number') { patch.ac = exportData.armorClass; found.push('ac'); }

  if (typeof exportData.hitPointMax === 'number') {
    patch.hp = { current: exportData.hitPointMax, max: exportData.hitPointMax, temp: 0 };
    found.push('hp');
  }

  // Walking speed sits in the speeds array as type=1 (walking). Bail
  // if it's not there; default character speed stays untouched.
  const walk = (exportData.speeds || []).find(s => s.type === 1 && typeof s.distance === 'number');
  if (walk && walk.distance > 0) { patch.speed = walk.distance; found.push('speed'); }

  const abilities = mapAbilities(exportData);
  if (abilities) { patch.abilities = abilities; found.push('abilities'); }

  const saves = mapSaves(exportData);
  if (saves) { patch.saves = saves; found.push('saves'); }

  const skills = mapSkills(exportData);
  if (skills) { patch.skills = skills; found.push('skills'); }

  const attacks = mapAttacks(exportData);
  if (attacks.length) { patch.attacks = attacks; found.push('attacks'); }

  const spells = mapSpells(exportData);
  // Only include if there's at least one populated level — preserves
  // the blank-character defaults otherwise.
  const totalSpells = Object.values(spells).reduce((sum, arr) => sum + arr.length, 0);
  if (totalSpells > 0) { patch.spells = spells; found.push('spells'); }

  const spellSlots = mapSpellSlots(exportData);
  if (spellSlots) { patch.spellSlots = spellSlots; found.push('spellSlots'); }

  return {
    patch,
    found,
    characterId: parsed.characterId || null,
    capturedAt: parsed.capturedAt || null,
  };
}

export async function importDdbJsonFile(file) {
  const text = await file.text();
  return parseDdbJson(text);
}
