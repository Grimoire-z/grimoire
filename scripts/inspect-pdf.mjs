// Diagnostic: dump AcroForm widget names + values from a PDF.
// Usage: node scripts/inspect-pdf.mjs <path-to-pdf>

import { readFile } from 'node:fs/promises';
import { argv } from 'node:process';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

if (argv.length < 3) {
  console.error('usage: node scripts/inspect-pdf.mjs <pdf-path>');
  process.exit(1);
}

const data = new Uint8Array(await readFile(argv[2]));
const pdf = await pdfjs.getDocument({ data, enableXfa: true }).promise;
console.log(`pages=${pdf.numPages}`);

const populated = [];
const all = new Set();

for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const anns = await page.getAnnotations();
  for (const ann of anns) {
    if (ann.subtype !== 'Widget') continue;
    const name = ann.fieldName;
    if (!name) continue;
    all.add(name);
    const v = ann.fieldValue ?? ann.value ?? ann.buttonValue ?? ann.defaultFieldValue;
    if (v == null || v === '' || v === 'Off' || v === false) continue;
    const str = Array.isArray(v) ? v[0] : v;
    if (str === '' || str === false) continue;
    populated.push([name, str]);
  }
}

console.log(`unique-names=${all.size} populated=${populated.length}`);
console.log('---POPULATED---');
for (const [k, v] of populated) {
  const display = typeof v === 'object' ? JSON.stringify(v) : String(v);
  console.log(`${k}\t${display.replace(/\s+/g, ' ').slice(0, 200)}`);
}
console.log('---ALL-NAMES---');
for (const n of [...all].sort()) console.log(n);
