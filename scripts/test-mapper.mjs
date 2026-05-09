// Test harness: extracts form fields from a PDF (legacy build, no worker)
// and dry-runs the mapping logic to print what would be imported.
// Usage: node scripts/test-mapper.mjs <path-to-pdf>

import { readFile } from 'node:fs/promises';
import { argv } from 'node:process';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

if (argv.length < 3) { console.error('usage: node scripts/test-mapper.mjs <pdf-path>'); process.exit(1); }
const data = new Uint8Array(await readFile(argv[2]));
const pdf = await pdfjs.getDocument({ data, enableXfa: true }).promise;

// ─── Replicate the form-field collector ───────────────────────────────────
const fields = {};
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  for (const ann of await page.getAnnotations()) {
    if (ann.subtype !== 'Widget' || !ann.fieldName) continue;
    const v = ann.fieldValue ?? ann.value ?? ann.buttonValue ?? ann.defaultFieldValue;
    if (v == null || v === '' || v === 'Off' || v === false) continue;
    const str = Array.isArray(v) ? v[0] : v;
    if (str === '' || str === false) continue;
    if (!fields[ann.fieldName]) fields[ann.fieldName] = str;
  }
}

// ─── Inline the mapper logic from ddbPdfImport.js (kept in sync manually) ─
const normalizeName = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
const readField = (...aliases) => {
  const lookup = {};
  for (const k of Object.keys(fields)) lookup[normalizeName(k)] = fields[k];
  for (const a of aliases) {
    const v = lookup[normalizeName(a)];
    if (v != null && v !== '') return v;
  }
  return undefined;
};
const asNumber = (v) => {
  if (v == null) return undefined;
  const m = String(v).match(/-?\d+/);
  return m ? Number(m[0]) : undefined;
};
const checkboxTrue = (v) => {
  if (v == null || v === false) return false;
  if (v === true) return true;
  const s = String(v).trim().toLowerCase();
  if (s === '' || s === 'off' || s === 'no' || s === 'false' || s === '0') return false;
  return true;
};
const parseClassAndLevel = (text) => {
  if (!text) return { klass: '', level: undefined };
  const totalLevel = [...text.matchAll(/\b(\d{1,2})\b/g)].map(m => Number(m[1])).filter(n => n >= 1 && n <= 20).reduce((a, b) => a + b, 0);
  const klass = text.replace(/\b\d{1,2}\b/g, '').replace(/\s+/g, ' ').trim();
  return { klass, level: totalLevel || undefined };
};

const DDB_SAVES = {
  str: { mod: ['ST Strength'], prof: ['StrProf'] },
  dex: { mod: ['ST Dexterity'], prof: ['DexProf'] },
  con: { mod: ['ST Constitution'], prof: ['ConProf'] },
  int: { mod: ['ST Intelligence'], prof: ['IntProf'] },
  wis: { mod: ['ST Wisdom'], prof: ['WisProf'] },
  cha: { mod: ['ST Charisma'], prof: ['ChaProf'] },
};
const DDB_SKILLS = {
  acrobatics: { mod: ['Acrobatics'], prof: ['AcrobaticsProf'] },
  animalHandling: { mod: ['Animal'], prof: ['AnimalHandlingProf'] },
  arcana: { mod: ['Arcana'], prof: ['ArcanaProf'] },
  athletics: { mod: ['Athletics'], prof: ['AthleticsProf'] },
  deception: { mod: ['Deception'], prof: ['DeceptionProf'] },
  history: { mod: ['History'], prof: ['HistoryProf'] },
  insight: { mod: ['Insight'], prof: ['InsightProf'] },
  intimidation: { mod: ['Intimidation'], prof: ['IntimidationProf'] },
  investigation: { mod: ['Investigation'], prof: ['InvestigationProf'] },
  medicine: { mod: ['Medicine'], prof: ['MedicineProf'] },
  nature: { mod: ['Nature'], prof: ['NatureProf'] },
  perception: { mod: ['Perception'], prof: ['PerceptionProf'] },
  performance: { mod: ['Performance'], prof: ['PerformanceProf'] },
  persuasion: { mod: ['Persuasion'], prof: ['PersuasionProf'] },
  religion: { mod: ['Religion'], prof: ['ReligionProf'] },
  sleightOfHand: { mod: ['SleightofHand'], prof: ['SleightOfHandProf'] },
  stealth: { mod: ['Stealth'], prof: ['StealthProf'] },
  survival: { mod: ['Survival'], prof: ['SurvivalProf'] },
};

console.log('--- Identity ---');
console.log('name        =', readField('CharacterName'));
console.log('race        =', readField('Race', 'RACE'));
const cl = parseClassAndLevel(readField('CLASS  LEVEL', 'ClassLevel') || '');
console.log('class       =', cl.klass);
console.log('level       =', cl.level);

console.log('\n--- Combat ---');
console.log('AC          =', asNumber(readField('AC')));
console.log('Speed       =', asNumber(readField('Speed')));
console.log('ProfBonus   =', asNumber(readField('ProfBonus')));
console.log('MaxHP       =', asNumber(readField('MaxHP')));
console.log('CurrentHP   =', asNumber(readField('CurrentHP')));
console.log('TempHP      =', asNumber(readField('TempHP')));

console.log('\n--- Abilities ---');
for (const k of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
  console.log(`${k.padEnd(4)}        =`, asNumber(readField(k)));
}

console.log('\n--- Saves ---');
for (const [k, def] of Object.entries(DDB_SAVES)) {
  const mod = readField(...def.mod);
  const prof = readField(...def.prof);
  console.log(`${k.padEnd(4)}: mod=${String(mod).padEnd(5)} prof=${String(prof).padEnd(5)} → ${checkboxTrue(prof)}`);
}

console.log('\n--- Skills ---');
for (const [k, def] of Object.entries(DDB_SKILLS)) {
  const mod = readField(...def.mod);
  const prof = readField(...def.prof);
  console.log(`${k.padEnd(16)}: mod=${String(mod).padEnd(5)} prof=${String(prof).padEnd(5)} → ${checkboxTrue(prof)}`);
}

console.log('\n--- Weapons ---');
for (let i = 1; i <= 6; i++) {
  const nameField = i === 1 ? 'Wpn Name' : `Wpn Name ${i}`;
  const name = readField(nameField);
  if (!name) continue;
  console.log(`#${i}: ${name} | ${readField(`Wpn${i} AtkBonus`)} | ${readField(`Wpn${i} Damage`)} | ${readField(`Wpn Notes ${i}`)}`);
}

console.log('\n--- Spells (with annotation order) ---');
const widgets = [];
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const anns = (await page.getAnnotations()).filter(a => a.subtype === 'Widget' && a.fieldName);
  anns.sort((a, b) => ((b.rect?.[1] ?? 0) - (a.rect?.[1] ?? 0)) || ((a.rect?.[0] ?? 0) - (b.rect?.[0] ?? 0)));
  widgets.push(...anns.map(a => ({ fieldName: a.fieldName, value: a.fieldValue })));
}
const indexToLevel = {};
let curLevel = null;
for (const w of widgets) {
  const hm = w.fieldName.match(/^spellHeader(\d+)$/i);
  if (hm) {
    const text = String(w.value || readField(w.fieldName) || '').toUpperCase();
    if (/CANTRIP/.test(text)) curLevel = 0;
    else { const m = text.match(/(\d+)/); if (m) curLevel = Number(m[1]); }
    continue;
  }
  const nm = w.fieldName.match(/^spellName(\d+)$/i);
  if (nm && curLevel != null) indexToLevel[Number(nm[1])] = curLevel;
}
const byLevel = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [], 9: [] };
for (const i of Object.keys(indexToLevel).map(Number).sort((a, b) => a - b)) {
  const name = readField(`spellName${i}`);
  if (!name) continue;
  byLevel[indexToLevel[i]].push(`[${i}] ${String(name).trim()}`);
}
for (const lvl of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
  if (byLevel[lvl].length === 0) continue;
  console.log(`Level ${lvl}: ${byLevel[lvl].length} spells`);
  for (const s of byLevel[lvl]) console.log('  ' + s);
}

console.log('\n--- Slots ---');
for (let lvl = 0; lvl <= 9; lvl++) {
  const sh = readField(`spellSlotHeader${lvl}`);
  if (sh) console.log(`Level ${lvl}: ${sh}`);
}
