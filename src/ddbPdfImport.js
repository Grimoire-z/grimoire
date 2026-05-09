// D&D Beyond character-sheet PDF importer.
//
// DDB exports two flavors:
//   1. "Print to PDF" — a rendered character sheet whose values live in the
//      visible text layer. We pull those via getTextContent() + heuristics.
//   2. Fillable PDF based on the standard WOTC 5e template — values live in
//      AcroForm widget fields. We pull those via getFieldObjects().
//
// We try form fields first (more reliable when present) and fall back to
// text extraction. Whatever we can't map confidently is left untouched.

import * as pdfjs from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

// ─── Loaders ───────────────────────────────────────────────────────────────

async function extractText(pdf) {
  const items = [];
  let combined = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items) {
      const text = (it.str || '').trim();
      if (!text) continue;
      items.push({
        text,
        x: it.transform[4],
        y: it.transform[5],
        page: p,
      });
      combined += text + '\n';
    }
    combined += '\n';
  }
  return { items, combined };
}

function isUseful(v) {
  if (v == null) return false;
  if (v === '' || v === false || v === 'Off') return false;
  return true;
}

async function extractFormFields(pdf) {
  const fields = {};
  const allWidgetNames = new Set();
  let totalWidgets = 0;

  // Path A: aggregated field objects.
  try {
    const fieldObjects = await pdf.getFieldObjects();
    if (fieldObjects) {
      for (const [name, annotations] of Object.entries(fieldObjects)) {
        allWidgetNames.add(name);
        if (!Array.isArray(annotations)) continue;
        totalWidgets += annotations.length;
        for (const ann of annotations) {
          const v = ann?.value ?? ann?.fieldValue ?? ann?.defaultValue;
          if (!isUseful(v)) continue;
          const str = Array.isArray(v) ? v[0] : v;
          if (!isUseful(str)) continue;
          fields[name] = str;
          break;
        }
      }
    }
  } catch (e) {
    console.warn('[grimoire] getFieldObjects failed', e);
  }

  // Path B: per-page widget annotations. Sometimes catches what (A) misses.
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const anns = await page.getAnnotations();
      for (const ann of anns) {
        if (ann.subtype !== 'Widget') continue;
        totalWidgets++;
        const name = ann.fieldName || ann.alternativeText;
        if (name) allWidgetNames.add(name);
        if (!name) continue;
        const v = ann.fieldValue ?? ann.value ?? ann.buttonValue ?? ann.defaultFieldValue;
        if (!isUseful(v)) continue;
        const str = Array.isArray(v) ? v[0] : v;
        if (!isUseful(str)) continue;
        if (!fields[name]) fields[name] = str;
      }
    }
  } catch (e) {
    console.warn('[grimoire] getAnnotations failed', e);
  }

  return { fields, allWidgetNames: Array.from(allWidgetNames).sort(), totalWidgets };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function profBonusFor(level) {
  return Math.ceil(level / 4) + 1;
}

function parseClassAndLevel(text) {
  if (!text) return { klass: '', level: undefined };
  const totalLevel = [...text.matchAll(/\b(\d{1,2})\b/g)]
    .map(m => Number(m[1]))
    .filter(n => n >= 1 && n <= 20)
    .reduce((a, b) => a + b, 0);
  // Strip level numbers from the display string so the header doesn't
  // double-print level (e.g. "Wizard 6 · Level 6").
  const klass = text.replace(/\b\d{1,2}\b/g, '').replace(/\s+/g, ' ').trim();
  return {
    klass,
    level: totalLevel || undefined,
  };
}

// Normalize for matching: lowercase + collapse whitespace.
// DDB field names sometimes have trailing or doubled spaces (e.g. "DEXmod ",
// "Wpn3 AtkBonus  ", "CLASS  LEVEL") — we want all of those to compare equal
// to the cleanly-spelled alias.
function normalizeName(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

// Case- and whitespace-insensitive form-field lookup; accepts multiple aliases.
function readField(fields, ...aliases) {
  const lookup = {};
  for (const k of Object.keys(fields)) lookup[normalizeName(k)] = fields[k];
  for (const a of aliases) {
    const v = lookup[normalizeName(a)];
    if (v != null && v !== '') return v;
  }
  return undefined;
}

function asNumber(v) {
  if (v == null) return undefined;
  const m = String(v).match(/-?\d+/);
  return m ? Number(m[0]) : undefined;
}

// ─── Form-field mapper (fillable PDFs) ─────────────────────────────────────

// Permissive proficiency check. Different fillable PDFs use different
// markers — WOTC uses 'Yes'/'On', DDB uses '•' (saves) and 'P'/'E' (skills,
// where E means Expertise). Anything non-empty other than explicit "off"
// signals counts as proficient.
function checkboxTrue(v) {
  if (v == null || v === false) return false;
  if (v === true) return true;
  const s = String(v).trim().toLowerCase();
  if (s === '' || s === 'off' || s === 'no' || s === 'false' || s === '0') return false;
  return true;
}

// DDB field structure: each save has a mod field "ST <Ability>" and a
// proficiency marker "<Abbr>Prof" (value '•' or 'P' when proficient).
const DDB_SAVES = {
  str: { mod: ['ST Strength',     'Save_Strength'],     prof: ['StrProf', 'CB_ST_Strength'] },
  dex: { mod: ['ST Dexterity',    'Save_Dexterity'],    prof: ['DexProf', 'CB_ST_Dexterity'] },
  con: { mod: ['ST Constitution', 'Save_Constitution'], prof: ['ConProf', 'CB_ST_Constitution'] },
  int: { mod: ['ST Intelligence', 'Save_Intelligence'], prof: ['IntProf', 'CB_ST_Intelligence'] },
  wis: { mod: ['ST Wisdom',       'Save_Wisdom'],       prof: ['WisProf', 'CB_ST_Wisdom'] },
  cha: { mod: ['ST Charisma',     'Save_Charisma'],     prof: ['ChaProf', 'CB_ST_Charisma'] },
};

// DDB field structure: each skill has a mod field at the bare skill name and
// a proficiency marker at "<Skill>Prof". The big quirk: Animal Handling
// stores its mod under "Animal" (not "AnimalHandling") while its prof flag
// is at "AnimalHandlingProf" — and Sleight of Hand uses mixed casing across
// the two fields ("SleightofHand" vs "SleightOfHandProf").
const DDB_SKILLS = {
  acrobatics:     { mod: ['Acrobatics'],                    prof: ['AcrobaticsProf'] },
  animalHandling: { mod: ['Animal', 'Animal_Handling'],     prof: ['AnimalHandlingProf'] },
  arcana:         { mod: ['Arcana'],                        prof: ['ArcanaProf'] },
  athletics:      { mod: ['Athletics'],                     prof: ['AthleticsProf'] },
  deception:      { mod: ['Deception'],                     prof: ['DeceptionProf'] },
  history:        { mod: ['History'],                       prof: ['HistoryProf'] },
  insight:        { mod: ['Insight'],                       prof: ['InsightProf'] },
  intimidation:   { mod: ['Intimidation'],                  prof: ['IntimidationProf'] },
  investigation:  { mod: ['Investigation'],                 prof: ['InvestigationProf'] },
  medicine:       { mod: ['Medicine'],                      prof: ['MedicineProf'] },
  nature:         { mod: ['Nature'],                        prof: ['NatureProf'] },
  perception:     { mod: ['Perception'],                    prof: ['PerceptionProf'] },
  performance:    { mod: ['Performance'],                   prof: ['PerformanceProf'] },
  persuasion:     { mod: ['Persuasion'],                    prof: ['PersuasionProf'] },
  religion:       { mod: ['Religion'],                      prof: ['ReligionProf'] },
  sleightOfHand:  { mod: ['SleightofHand', 'SleightOfHand'], prof: ['SleightOfHandProf'] },
  stealth:        { mod: ['Stealth'],                       prof: ['StealthProf'] },
  survival:       { mod: ['Survival'],                      prof: ['SurvivalProf'] },
};

function mapFormFields(fields) {
  const patch = {};
  const found = [];

  // Identity
  const name = readField(fields, 'CharacterName', 'Character Name', 'character_name', 'Name');
  if (name) { patch.name = String(name).trim(); found.push('name'); }

  const race = readField(fields, 'Race', 'Species', 'Ancestry');
  if (race) { patch.ancestry = String(race).trim(); found.push('ancestry'); }

  const classLevel = readField(fields,
    'ClassLevel', 'Class & Level', 'class_level', 'ClassAndLevel',
    'CharacterClassLevel', 'Class Level', 'CL', 'Class',
    'CLASS  LEVEL', 'CLASS LEVEL', 'CLASSLEVEL',  // DDB 2024 PDF (two spaces)
  );
  if (classLevel) {
    const parsed = parseClassAndLevel(String(classLevel));
    if (parsed.klass)               { patch.klass = parsed.klass; found.push('klass'); }
    if (parsed.level !== undefined) { patch.level = parsed.level; found.push('level'); }
  }

  // Ability scores
  const abilities = {};
  for (const k of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
    const v = readField(fields, k, k.toLowerCase());
    const n = asNumber(v);
    if (n != null && n > 0) abilities[k.toLowerCase()] = n;
  }
  if (Object.keys(abilities).length) {
    patch.abilities = abilities;
    found.push('abilities');
  }

  // Combat block
  const ac = asNumber(readField(fields, 'AC', 'ArmorClass', 'Armor Class'));
  if (ac != null) { patch.ac = ac; found.push('ac'); }

  const speed = asNumber(readField(fields, 'Speed'));
  if (speed != null) { patch.speed = speed; found.push('speed'); }

  const profBonusFromField = asNumber(readField(fields,
    'ProfBonus', 'ProficiencyBonus', 'Proficiency Bonus', 'ProfBonusValue'));
  if (profBonusFromField != null) {
    patch.profBonus = profBonusFromField;
    found.push('profBonus');
  } else if (patch.level !== undefined) {
    patch.profBonus = profBonusFor(patch.level);
    found.push('profBonus');
  }

  // HP
  const hpMax     = asNumber(readField(fields, 'MaxHP', 'HPMax', 'HP Max', 'Max HP'));
  const hpCurrent = asNumber(readField(fields, 'CurrentHP', 'HPCurrent', 'HP Current', 'HP', 'Current HP'));
  const hpTemp    = asNumber(readField(fields, 'TempHP', 'HPTemp', 'HP Temp', 'Temp HP'));
  if (hpMax != null || hpCurrent != null) {
    const max = hpMax ?? hpCurrent ?? 0;
    patch.hp = {
      max,
      current: hpCurrent ?? max,
      temp: hpTemp ?? 0,
    };
    found.push('hp');
  }

  // Saving throws
  const saves = {};
  for (const [key, def] of Object.entries(DDB_SAVES)) {
    const mod  = readField(fields, ...def.mod);
    const prof = readField(fields, ...def.prof);
    if (mod != null || prof != null) {
      saves[key] = {
        mod: mod != null ? String(mod).trim() : '',
        prof: checkboxTrue(prof),
      };
    }
  }
  if (Object.keys(saves).length) {
    patch.saves = saves;
    found.push('saves');
  }

  // Skills — DDB encodes proficiency as 'P' and expertise as 'E' in the
  // <Skill>Prof field. Anything truthy is at least prof; 'E' upgrades to
  // expertise.
  const skills = {};
  for (const [key, def] of Object.entries(DDB_SKILLS)) {
    const mod  = readField(fields, ...def.mod);
    const prof = readField(fields, ...def.prof);
    if (mod != null || prof != null) {
      const profStr = prof != null ? String(prof).trim().toUpperCase() : '';
      skills[key] = {
        mod: mod != null ? String(mod).trim() : '',
        prof: checkboxTrue(prof),
        expertise: profStr === 'E',
      };
    }
  }
  if (Object.keys(skills).length) {
    patch.skills = skills;
    found.push('skills');
  }

  // Weapons → attacks
  const attacks = mapWeapons(fields);
  if (attacks.length) {
    patch.attacks = attacks;
    found.push('attacks');
  }

  // Spells (requires annotation order, handled in the caller and merged in)

  return { patch, found };
}

function mapWeapons(fields) {
  const attacks = [];
  const seen = new Set();
  for (let i = 1; i <= 6; i++) {
    // First weapon's name field has no number; the rest are " 2", " 3", ...
    const nameField  = i === 1 ? 'Wpn Name' : `Wpn Name ${i}`;
    const name       = readField(fields, nameField);
    if (!name) continue;
    const display = String(name).trim();
    const id = display.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);

    const bonus = readField(fields, `Wpn${i} AtkBonus`);
    const dmg   = readField(fields, `Wpn${i} Damage`);
    const notes = readField(fields, `Wpn Notes ${i}`);
    const subParts = [];
    if (dmg)   subParts.push(String(dmg).trim());
    if (bonus) subParts.push(`${String(bonus).trim()} to hit`);
    if (notes) subParts.push(String(notes).trim());
    attacks.push({
      id,
      name: display,
      sub: subParts.join(' · '),
    });
  }
  return attacks;
}

// ─── Text-layer mapper (rendered PDFs) ─────────────────────────────────────

function findNearestAbove(items, labelItem, maxDistance = 60) {
  let best = null;
  let bestDist = Infinity;
  for (const it of items) {
    if (it.page !== labelItem.page) continue;
    if (it === labelItem) continue;
    const dx = Math.abs(it.x - labelItem.x);
    const dy = it.y - labelItem.y;
    if (dy <= 0 || dy > maxDistance) continue;
    if (dx > 100) continue;
    const dist = dy + dx * 0.5;
    if (dist < bestDist) { bestDist = dist; best = it; }
  }
  return best?.text || null;
}

function findLabel(items, labelText) {
  return items.find(it => it.text.toUpperCase() === labelText.toUpperCase());
}

const ABILITY_LABELS = {
  str: ['STRENGTH'], dex: ['DEXTERITY'], con: ['CONSTITUTION'],
  int: ['INTELLIGENCE'], wis: ['WISDOM'], cha: ['CHARISMA'],
};

function abilitiesFromItems(items) {
  const out = {};
  for (const [key, labels] of Object.entries(ABILITY_LABELS)) {
    for (const l of labels) {
      const lab = findLabel(items, l);
      if (!lab) continue;
      const candidates = items
        .filter(it => it.page === lab.page && Math.abs(it.x - lab.x) < 30)
        .filter(it => /^\d{1,2}$/.test(it.text))
        .map(it => Number(it.text))
        .filter(n => n >= 1 && n <= 30);
      if (candidates.length) {
        out[key] = Math.max(...candidates);
      }
      break;
    }
  }
  return out;
}

function mapTextItems(items) {
  const patch = {};
  const found = [];

  const tryAbove = (label, key, transform = (s) => s) => {
    const lab = findLabel(items, label);
    if (!lab) return;
    const value = findNearestAbove(items, lab);
    if (value) {
      patch[key] = transform(value);
      found.push(key);
    }
  };

  tryAbove('CHARACTER NAME', 'name');
  tryAbove('RACE', 'ancestry');
  tryAbove('CLASS & LEVEL', '_classLine');

  if (patch._classLine) {
    const { klass, level } = parseClassAndLevel(patch._classLine);
    if (klass) patch.klass = klass;
    if (level) patch.level = level;
    if (klass) found.push('klass');
    if (level) found.push('level');
    delete patch._classLine;
  }

  const abilities = abilitiesFromItems(items);
  if (Object.keys(abilities).length) {
    patch.abilities = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...abilities };
    found.push('abilities');
  }

  const acLabel = findLabel(items, 'ARMOR CLASS');
  if (acLabel) {
    const value = findNearestAbove(items, acLabel, 40);
    const n = asNumber(value);
    if (n != null) { patch.ac = n; found.push('ac'); }
  }

  const speedLabel = findLabel(items, 'SPEED');
  if (speedLabel) {
    const value = findNearestAbove(items, speedLabel, 40);
    const n = asNumber(value);
    if (n != null) { patch.speed = n; found.push('speed'); }
  }

  if (patch.level) {
    patch.profBonus = profBonusFor(patch.level);
    found.push('profBonus');
  }

  const hpLabel = findLabel(items, 'HIT POINT MAXIMUM');
  if (hpLabel) {
    const value = findNearestAbove(items, hpLabel, 40);
    const n = asNumber(value);
    if (n != null) { patch.hp = { current: n, max: n, temp: 0 }; found.push('hp'); }
  }

  return { patch, found };
}

// ─── Public entry ──────────────────────────────────────────────────────────

// Walk page widgets in document order (top-down per page) so we can
// associate `spellName<N>` entries with the most recent `spellHeader<H>`.
async function spellsInDocumentOrder(pdf) {
  const ordered = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const anns = await page.getAnnotations();
    const widgets = anns
      .filter(a => a.subtype === 'Widget' && a.fieldName)
      .map(a => ({
        fieldName: a.fieldName,
        value: a.fieldValue ?? a.value,
        // PDF rect is [x_lo, y_lo, x_hi, y_hi]; sorting by y_lo descending
        // walks widgets top-to-bottom (PDF origin is bottom-left).
        x: a.rect?.[0] ?? 0,
        y: a.rect?.[1] ?? 0,
      }));
    widgets.sort((a, b) => (b.y - a.y) || (a.x - b.x));
    ordered.push(...widgets);
  }
  return ordered;
}

function levelFromHeaderText(text) {
  const upper = String(text || '').toUpperCase();
  if (/CANTRIP/.test(upper)) return 0;
  const m = upper.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

async function mapSpells(pdf, fields) {
  const ordered = await spellsInDocumentOrder(pdf);

  // Pass 1: derive spell index → level using doc order.
  const indexToLevel = {};
  let currentLevel = null;
  for (const w of ordered) {
    const headerMatch = w.fieldName.match(/^spellHeader(\d+)$/i);
    if (headerMatch) {
      const lvl = levelFromHeaderText(w.value);
      if (lvl != null) currentLevel = lvl;
      continue;
    }
    const nameMatch = w.fieldName.match(/^spellName(\d+)$/i);
    if (nameMatch && currentLevel != null) {
      indexToLevel[Number(nameMatch[1])] = currentLevel;
    }
  }

  // Pass 2: gather each spell's full row data from the field map.
  // DDB sometimes lists a spell twice (e.g. an "always prepared" entry plus
  // its native list entry); we de-dup by id within each level.
  const spellsByLevel = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [] };
  const seenByLevel   = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set(), 5: new Set(), 6: new Set(), 7: new Set(), 8: new Set(), 9: new Set() };
  const indices = Object.keys(indexToLevel).map(Number).sort((a, b) => a - b);
  for (const i of indices) {
    const name  = readField(fields, `spellName${i}`);
    if (!name) continue;
    const level = indexToLevel[i];
    if (level < 0 || level > 9) continue;

    const display = String(name).trim();
    const id = display.toLowerCase();
    if (seenByLevel[level].has(id)) continue;
    seenByLevel[level].add(id);

    const range = readField(fields, `spellRange${i}`);
    const time  = readField(fields, `spellCastingTime${i}`);
    const comps = readField(fields, `spellComponents${i}`);
    const dur   = readField(fields, `spellDuration${i}`);
    const subParts = [time, range, dur, comps].filter(Boolean).map(s => String(s).trim());

    spellsByLevel[level].push({
      id,
      name: display,
      sub: subParts.join(' · '),
    });
  }

  // Slot counts: spellSlotHeader<L> is e.g. "4 Slots OOOO".
  const spellSlots = {};
  for (let lvl = 1; lvl <= 9; lvl++) {
    const slotHeader = readField(fields, `spellSlotHeader${lvl}`);
    if (!slotHeader) continue;
    const m = String(slotHeader).match(/(\d+)\s*Slots?/i);
    if (m) {
      const max = Number(m[1]);
      spellSlots[lvl] = { current: max, max };
    }
  }

  return { spellsByLevel, spellSlots };
}

// Extract embedded XFA form data (Adobe LiveCycle) when present.
// XFA is an XML stream separate from AcroForm; some D&D Beyond PDFs use it.
async function extractXfaFields(pdf) {
  try {
    const xfa = await pdf.getXFADatasets?.();
    if (xfa && typeof xfa === 'object') {
      console.log('[grimoire] pdf: XFA datasets present');
      return { xfaPresent: true, xfa };
    }
  } catch (e) {
    console.warn('[grimoire] getXFADatasets failed', e);
  }
  return { xfaPresent: false, xfa: null };
}

export async function importDdbPdfFile(file) {
  const buf = await file.arrayBuffer();
  console.log('[grimoire] pdf: getDocument start, bytes=', buf.byteLength);
  // enableXfa surfaces XFA-form text in some PDFs; harmless when not present.
  const pdf = await pdfjs.getDocument({ data: buf, enableXfa: true }).promise;
  console.log('[grimoire] pdf: numPages=', pdf.numPages);

  const { fields, allWidgetNames, totalWidgets } = await extractFormFields(pdf);
  const fieldNames = Object.keys(fields);
  console.log('[grimoire] pdf: total widgets=', totalWidgets, 'unique names=', allWidgetNames.length, 'with values=', fieldNames.length);
  console.log('[grimoire] pdf: widget names=', allWidgetNames);

  const { xfaPresent } = await extractXfaFields(pdf);

  const { items, combined } = await extractText(pdf);
  console.log('[grimoire] pdf: text items=', items.length, 'chars=', combined.length);

  const { patch: formPatch, found: formFound } = fieldNames.length
    ? mapFormFields(fields)
    : { patch: {}, found: [] };
  const { patch: textPatch, found: textFound } = mapTextItems(items);

  const patch = { ...textPatch, ...formPatch };
  const found = Array.from(new Set([...textFound, ...formFound]));

  // Spells need annotation order to partition by level header.
  let spellResult = null;
  if (fieldNames.length) {
    try {
      spellResult = await mapSpells(pdf, fields);
      const totalSpells = Object.values(spellResult.spellsByLevel).reduce((a, b) => a + b.length, 0);
      if (totalSpells > 0) {
        patch.spells = spellResult.spellsByLevel;
        found.push('spells');
      }
      if (Object.keys(spellResult.spellSlots).length) {
        patch.spellSlots = spellResult.spellSlots;
        found.push('spellSlots');
      }
      console.log('[grimoire] pdf: spells', totalSpells, 'slots', spellResult.spellSlots);
    } catch (e) {
      console.warn('[grimoire] mapSpells failed', e);
    }
  }

  console.log('[grimoire] pdf: form found=', formFound, 'text found=', textFound);

  return {
    patch,
    found,
    rawTextLength: combined.length,
    rawText: combined,
    itemCount: items.length,
    fieldCount: fieldNames.length,
    fieldNames,
    fieldValues: fields,
    allWidgetNames,
    totalWidgets,
    xfaPresent,
    sampleItems: items.slice(0, 40).map(it => ({ text: it.text, x: Math.round(it.x), y: Math.round(it.y), page: it.page })),
  };
}
