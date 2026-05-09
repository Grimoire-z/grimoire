import { useState } from 'react';
import { SAVE_DEFS, SKILL_DEFS } from '../state.js';
import { Checkbox, FieldLabel, SectionCard } from '../components.jsx';
import { importDdbText, mapDdbJson } from '../ddbImport.js';
import { importDdbPdfFile } from '../ddbPdfImport.js';

const SLOT_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function CharacterView({ character, setCharacter }) {
  const patch = (p) => setCharacter(c => ({ ...c, ...p }));
  const patchHp = (p) => setCharacter(c => ({ ...c, hp: { ...c.hp, ...p } }));
  const patchSave = (id, p) =>
    setCharacter(c => ({
      ...c,
      saves: { ...c.saves, [id]: { ...(c.saves[id] || { mod: '', prof: false }), ...p } },
    }));
  const patchSkill = (id, p) =>
    setCharacter(c => ({
      ...c,
      skills: { ...c.skills, [id]: { ...(c.skills[id] || { mod: '', prof: false }), ...p } },
    }));
  const patchAbility = (id, value) =>
    setCharacter(c => ({ ...c, abilities: { ...c.abilities, [id]: value } }));
  const patchSlot = (level, p) =>
    setCharacter(c => ({
      ...c,
      spellSlots: { ...c.spellSlots, [level]: { ...c.spellSlots[level], ...p } },
    }));

  return (
    <main className="relative z-10 px-6 pb-12 max-w-7xl mx-auto mt-4 grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="space-y-5">
        <Identity character={character} patch={patch} />
        <Combat character={character} patch={patch} patchHp={patchHp} />
        <Abilities character={character} patchAbility={patchAbility} />
        <Saves character={character} patchSave={patchSave} />
        <Skills character={character} patchSkill={patchSkill} />
      </div>
      <div className="space-y-5">
        <DdbImport setCharacter={setCharacter} />
        <Attacks character={character} setCharacter={setCharacter} />
        <Spells character={character} setCharacter={setCharacter} patchSlot={patchSlot} />
      </div>
    </main>
  );
}

function Identity({ character, patch }) {
  return (
    <SectionCard title="identity">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <FieldLabel>Name</FieldLabel>
          <input className="lined" value={character.name}
                 onChange={e => patch({ name: e.target.value })} />
        </div>
        <div>
          <FieldLabel>Pronouns</FieldLabel>
          <input className="lined" value={character.pronouns || ''}
                 onChange={e => patch({ pronouns: e.target.value })} />
        </div>
        <div>
          <FieldLabel>Ancestry / Race</FieldLabel>
          <input className="lined" value={character.ancestry || ''}
                 onChange={e => patch({ ancestry: e.target.value })} />
        </div>
        <div>
          <FieldLabel>Class</FieldLabel>
          <input className="lined" value={character.klass || ''}
                 onChange={e => patch({ klass: e.target.value })} />
        </div>
        <div>
          <FieldLabel>Level</FieldLabel>
          <input className="lined" type="number" min="1" max="20"
                 value={character.level}
                 onChange={e => patch({ level: Number(e.target.value) || 1 })} />
        </div>
      </div>
    </SectionCard>
  );
}

function Combat({ character, patch, patchHp }) {
  return (
    <SectionCard title="combat">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <FieldLabel>HP current</FieldLabel>
          <input className="lined" type="number" value={character.hp.current}
                 onChange={e => patchHp({ current: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <FieldLabel>HP max</FieldLabel>
          <input className="lined" type="number" value={character.hp.max}
                 onChange={e => patchHp({ max: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <FieldLabel>HP temp</FieldLabel>
          <input className="lined" type="number" value={character.hp.temp}
                 onChange={e => patchHp({ temp: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <FieldLabel>AC</FieldLabel>
          <input className="lined" type="number" value={character.ac}
                 onChange={e => patch({ ac: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <FieldLabel>Speed</FieldLabel>
          <input className="lined" type="number" value={character.speed}
                 onChange={e => patch({ speed: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <FieldLabel>Prof bonus</FieldLabel>
          <input className="lined" type="number" value={character.profBonus}
                 onChange={e => patch({ profBonus: Number(e.target.value) || 0 })} />
        </div>
      </div>
    </SectionCard>
  );
}

function Abilities({ character, patchAbility }) {
  const abilities = character.abilities || {};
  return (
    <SectionCard title="ability scores">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {SAVE_DEFS.map(def => {
          const val = abilities[def.id] ?? 10;
          const mod = Math.floor((val - 10) / 2);
          const sign = mod >= 0 ? '+' : '';
          return (
            <div key={def.id} className="text-center bg-grimoire border border-gold rounded-sm py-2">
              <div className="text-fade text-xs uppercase tracking-wider">{def.name}</div>
              <input
                className="lined text-center font-cmd text-base"
                style={{ textAlign: 'center' }}
                type="number" value={val}
                onChange={e => patchAbility(def.id, Number(e.target.value) || 0)} />
              <div className="text-gold font-cmd text-xs">{sign}{mod}</div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function Saves({ character, patchSave }) {
  return (
    <SectionCard title="saving throws">
      <div className="grid grid-cols-2 gap-2">
        {SAVE_DEFS.map(def => {
          const s = character.saves[def.id] || { mod: '', prof: false };
          return (
            <div key={def.id} className="flex items-center gap-2 bg-grimoire border border-gold rounded-sm px-2 py-1.5">
              <Checkbox label="" checked={s.prof}
                        onChange={() => patchSave(def.id, { prof: !s.prof })} />
              <span className="font-display text-xs text-parchment uppercase tracking-wide w-10">{def.name}</span>
              <input className="lined flex-1 text-right font-cmd" placeholder="+0"
                     value={s.mod}
                     onChange={e => patchSave(def.id, { mod: e.target.value })} />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function Skills({ character, patchSkill }) {
  return (
    <SectionCard title="skills">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SKILL_DEFS.map(def => {
          const s = character.skills[def.id] || { mod: '', prof: false };
          return (
            <div key={def.id} className="flex items-center gap-2 bg-grimoire border border-gold rounded-sm px-2 py-1.5">
              <Checkbox label="" checked={s.prof}
                        onChange={() => patchSkill(def.id, { prof: !s.prof })} />
              <span className="text-xs text-fade font-cmd w-8 uppercase">{def.ability}</span>
              <span className="text-sm text-parchment flex-1 truncate">{def.name}</span>
              <input className="lined w-14 text-right font-cmd" placeholder="+0"
                     value={s.mod}
                     onChange={e => patchSkill(def.id, { mod: e.target.value })} />
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function Attacks({ character, setCharacter }) {
  const update = (i, patch) =>
    setCharacter(c => ({
      ...c,
      attacks: c.attacks.map((a, idx) => idx === i ? { ...a, ...patch } : a),
    }));
  const add = () =>
    setCharacter(c => ({
      ...c,
      attacks: [...c.attacks, { id: '', name: '', sub: '' }],
    }));
  const remove = (i) =>
    setCharacter(c => ({ ...c, attacks: c.attacks.filter((_, idx) => idx !== i) }));

  return (
    <SectionCard title="attacks"
      right={<button onClick={add} className="text-xs font-cmd text-gold border border-gold px-2 py-0.5 hover:bg-active rounded-sm">+ add</button>}>
      {character.attacks.length === 0 && (
        <div className="text-fade italic text-sm py-2">none — click + add</div>
      )}
      <div className="space-y-2">
        {character.attacks.map((a, i) => (
          <div key={i} className="bg-grimoire border border-gold rounded-sm px-2 py-1.5 space-y-1.5">
            <div className="grid grid-cols-12 gap-2 items-center">
              <input className="lined col-span-4 font-cmd" placeholder="id (Avrae name)"
                     value={a.id}
                     onChange={e => update(i, { id: e.target.value })} />
              <input className="lined col-span-3" placeholder="display name"
                     value={a.name}
                     onChange={e => update(i, { name: e.target.value })} />
              <input className="lined col-span-4" placeholder="subtitle"
                     value={a.sub}
                     onChange={e => update(i, { sub: e.target.value })} />
              <button onClick={() => remove(i)} className="text-fade hover:text-crimson text-sm col-span-1">✕</button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-fade text-xs uppercase tracking-wider w-14">phrase</span>
              <input className="lined flex-1" placeholder='flavor text · e.g. "for the oath!"'
                     value={a.phrase || ''}
                     onChange={e => update(i, { phrase: e.target.value })} />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function Spells({ character, setCharacter, patchSlot }) {
  const updateSpell = (level, i, patch) =>
    setCharacter(c => ({
      ...c,
      spells: {
        ...c.spells,
        [level]: c.spells[level].map((s, idx) => idx === i ? { ...s, ...patch } : s),
      },
    }));
  const addSpell = (level) =>
    setCharacter(c => ({
      ...c,
      spells: { ...c.spells, [level]: [...(c.spells[level] || []), { id: '', name: '', sub: '' }] },
    }));
  const removeSpell = (level, i) =>
    setCharacter(c => ({
      ...c,
      spells: { ...c.spells, [level]: c.spells[level].filter((_, idx) => idx !== i) },
    }));

  return (
    <SectionCard title="spells">
      <div className="space-y-4">
        {SLOT_LEVELS.map(level => {
          const spells = character.spells[level] || [];
          const slots  = character.spellSlots?.[level] || { current: 0, max: 0 };
          return (
            <div key={level}>
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="font-display text-sm text-gold uppercase">
                  {level === 0 ? 'Cantrips' : `Level ${level}`}
                </h4>
                <div className="flex items-center gap-2 text-xs text-fade">
                  {level === 0 ? (
                    <span className="italic">at will</span>
                  ) : (
                    <>
                      <span>slots</span>
                      <input className="lined w-10 text-right font-cmd" type="number" min="0"
                             value={slots.current}
                             onChange={e => patchSlot(level, { current: Number(e.target.value) || 0 })} />
                      <span>/</span>
                      <input className="lined w-10 text-right font-cmd" type="number" min="0"
                             value={slots.max}
                             onChange={e => patchSlot(level, { max: Number(e.target.value) || 0 })} />
                    </>
                  )}
                  <button onClick={() => addSpell(level)}
                          className="text-xs font-cmd text-gold border border-gold px-2 py-0.5 hover:bg-active rounded-sm ml-2">
                    + add
                  </button>
                </div>
              </div>
              {spells.length > 0 && (
                <div className="space-y-1.5">
                  {spells.map((s, i) => (
                    <div key={i} className="bg-grimoire border border-gold rounded-sm px-2 py-1.5 space-y-1.5">
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <input className="lined col-span-4 font-cmd" placeholder="id (Avrae name)"
                               value={s.id}
                               onChange={e => updateSpell(level, i, { id: e.target.value })} />
                        <input className="lined col-span-3" placeholder="display name"
                               value={s.name}
                               onChange={e => updateSpell(level, i, { name: e.target.value })} />
                        <input className="lined col-span-4" placeholder="subtitle"
                               value={s.sub}
                               onChange={e => updateSpell(level, i, { sub: e.target.value })} />
                        <button onClick={() => removeSpell(level, i)}
                                className="text-fade hover:text-crimson text-sm col-span-1">✕</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-fade text-xs uppercase tracking-wider w-14">phrase</span>
                        <input className="lined flex-1" placeholder='flavor text · e.g. "by the radiant dawn!"'
                               value={s.phrase || ''}
                               onChange={e => updateSpell(level, i, { phrase: e.target.value })} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function DdbImport({ setCharacter }) {
  const [source,      setSource]      = useState('jsonPaste');
  const [text,        setText]        = useState('');
  const [pdfFile,     setPdfFile]     = useState(null);
  const [busy,        setBusy]        = useState(false);
  const [status,      setStatus]      = useState(null);
  const [diagnostics, setDiagnostics] = useState(null);

  // Overwrites character fields the import provides; modifiers are
  // separate top-level state and intentionally untouched.
  // - Sub-objects (hp, abilities, saves, skills, spellSlots) are merged so a
  //   partial import doesn't wipe untouched entries.
  // - Lists/dicts that should fully replace (attacks, spells) are taken
  //   straight from the patch via `...patch`.
  const applyPatch = (patch) => {
    setCharacter(c => ({
      ...c,
      ...patch,
      hp:         patch.hp         ? { ...c.hp,         ...patch.hp }         : c.hp,
      abilities:  patch.abilities  ? { ...c.abilities,  ...patch.abilities }  : c.abilities,
      saves:      patch.saves      ? { ...c.saves,      ...patch.saves }      : c.saves,
      skills:     patch.skills     ? { ...c.skills,     ...patch.skills }     : c.skills,
      spellSlots: patch.spellSlots ? { ...c.spellSlots, ...patch.spellSlots } : c.spellSlots,
    }));
  };

  const reportSuccess = (patch, extra = '') => {
    const fields = Object.keys(patch).filter(k => patch[k] !== undefined);
    setStatus({ ok: true, msg: `imported${extra}: ${fields.join(', ')}` });
  };

  const importPasted = () => {
    try {
      const patch = importDdbText(text);
      applyPatch(patch);
      reportSuccess(patch);
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    }
  };

  const importJsonFile = async (file) => {
    setBusy(true);
    setStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const patch = mapDdbJson(parsed);
      applyPatch(patch);
      reportSuccess(patch, ` from ${file.name}`);
    } catch (e) {
      setStatus({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  };

  const importPdfFile = async () => {
    if (!pdfFile) return;
    console.log('[grimoire] importPdfFile click, file=', pdfFile.name, pdfFile.size, 'bytes');
    setBusy(true);
    setStatus(null);
    setDiagnostics(null);
    try {
      const result = await importDdbPdfFile(pdfFile);
      console.log('[grimoire] importPdfFile result=', result);
      const { patch, found, itemCount, rawText, fieldCount, fieldNames, fieldValues, totalWidgets, allWidgetNames, xfaPresent } = result;
      setDiagnostics({
        fileName: pdfFile.name,
        itemCount, fieldCount, fieldNames, fieldValues,
        totalWidgets, allWidgetNames, xfaPresent,
        found, rawText,
      });
      if (found.length) {
        applyPatch(patch);
        reportSuccess(patch, ` from ${pdfFile.name}`);
        setPdfFile(null);
      } else {
        setStatus({
          ok: false,
          msg: `read ${itemCount} text items, ${fieldCount} populated form fields — but no known mappings matched. see diagnostics below`,
        });
      }
    } catch (e) {
      console.error('[grimoire] importPdfFile error:', e);
      setStatus({ ok: false, msg: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="import from D&D Beyond"
      right={
        <select className="lined" value={source}
                onChange={e => { setSource(e.target.value); setStatus(null); }}>
          <option value="jsonPaste">JSON · paste</option>
          <option value="jsonFile">JSON · file</option>
          <option value="pdfFile">PDF · file</option>
        </select>
      }>

      {source === 'jsonPaste' && (
        <>
          <div className="text-xs text-fade italic mb-2">
            paste the response from <span className="font-cmd text-gold">character-service.dndbeyond.com/character/v5/character/&lt;id&gt;</span>
          </div>
          <textarea className="lined" rows="5"
                    placeholder='{"data": {...}}'
                    value={text}
                    onChange={e => setText(e.target.value)} />
          <div className="flex items-center gap-3 mt-2">
            <button onClick={importPasted}
                    className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold px-3 py-1.5 hover:bg-active transition">
              ↓ import
            </button>
            <ImportStatus status={status} />
          </div>
        </>
      )}

      {source === 'jsonFile' && (
        <>
          <div className="text-xs text-fade italic mb-2">
            select a saved <span className="font-cmd text-gold">.json</span> dump of the DDB character endpoint
          </div>
          <FilePicker accept=".json,application/json"
                      busy={busy} onFile={importJsonFile} />
          <ImportStatus status={status} className="mt-2" />
        </>
      )}

      {source === 'pdfFile' && (
        <>
          <div className="text-xs text-fade italic mb-2">
            select a D&amp;D Beyond character-sheet <span className="font-cmd text-gold">.pdf</span> export — best-effort field extraction.
            importing will overwrite character info (ability scores, HP, AC, etc.) — modifiers are left alone.
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <FilePicker accept="application/pdf,.pdf"
                        busy={busy}
                        label={pdfFile ? '↻ choose different file' : '↓ choose file'}
                        onFile={(f) => { setPdfFile(f); setStatus(null); }} />
            {pdfFile && (
              <>
                <span className="text-xs font-cmd text-parchment truncate max-w-xs" title={pdfFile.name}>
                  {pdfFile.name}
                </span>
                <button onClick={importPdfFile}
                        disabled={busy}
                        className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold-strong px-3 py-1.5 hover:bg-active transition disabled:opacity-50">
                  {busy ? '… importing' : '↓ import & overwrite'}
                </button>
                <button onClick={() => { setPdfFile(null); setStatus(null); }}
                        disabled={busy}
                        className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-crimson disabled:opacity-50">
                  ✕ cancel
                </button>
              </>
            )}
          </div>
          <ImportStatus status={status} className="mt-2 block" />
        </>
      )}

      <div className="text-xs text-fade italic mt-3 pt-2 border-t border-gold">
        currently fills: name · race · class · level · prof bonus · AC · max HP · ability scores. attacks &amp; spells stay manual.
      </div>

      {diagnostics && (
        <div className="mt-3 pt-2 border-t border-gold">
          <div className="text-xs font-cmd text-fade mb-1">
            pdf diagnostics — {diagnostics.fileName}
            <br/>
            {diagnostics.totalWidgets} widget annotations · {diagnostics.allWidgetNames?.length || 0} unique names · {diagnostics.fieldCount} populated · {diagnostics.itemCount} text items · {diagnostics.found.length} fields mapped
            {diagnostics.xfaPresent && <> · <span className="text-gold">XFA present</span></>}
            {diagnostics.found.length > 0 && <> ({diagnostics.found.join(', ')})</>}
          </div>

          {diagnostics.fieldCount > 0 && (
            <details className="text-xs font-cmd mt-2" open={diagnostics.found.length === 0}>
              <summary className="text-gold cursor-pointer hover:text-parchment">show populated form-field values ({diagnostics.fieldCount})</summary>
              <FieldFilter entries={Object.entries(diagnostics.fieldValues)} />
            </details>
          )}

          {(diagnostics.allWidgetNames?.length || 0) > 0 && (
            <details className="text-xs font-cmd mt-2" open={diagnostics.fieldCount === 0 && diagnostics.allWidgetNames.length > 0}>
              <summary className="text-gold cursor-pointer hover:text-parchment">show all widget names ({diagnostics.allWidgetNames.length})</summary>
              <FieldFilter entries={diagnostics.allWidgetNames.map(n => [n, ''])} />
            </details>
          )}

          <details className="text-xs font-cmd mt-2">
            <summary className="text-gold cursor-pointer hover:text-parchment">show extracted text</summary>
            <textarea
              className="lined mt-2"
              rows="10"
              readOnly
              value={diagnostics.rawText}
            />
          </details>
        </div>
      )}
    </SectionCard>
  );
}

function FieldFilter({ entries }) {
  const [q, setQ] = useState('');
  const filtered = q
    ? entries.filter(([k, v]) =>
        k.toLowerCase().includes(q.toLowerCase()) ||
        String(v).toLowerCase().includes(q.toLowerCase()))
    : entries;
  const lines = filtered
    .map(([k, v]) => v === '' ? k : `${k} = ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join('\n');
  return (
    <div className="mt-2">
      <input className="lined mb-1" placeholder="filter by name or value…"
             value={q} onChange={e => setQ(e.target.value)} />
      <textarea className="lined" rows="12" readOnly value={lines} />
      <div className="text-fade text-xs mt-1">{filtered.length} of {entries.length} entries</div>
    </div>
  );
}

function FilePicker({ accept, busy, label = '↓ choose file', onFile }) {
  return (
    <label className={`inline-flex items-center gap-2 text-xs font-cmd uppercase tracking-wider px-3 py-1.5 border transition cursor-pointer ${
      busy ? 'text-fade border-gold opacity-60' : 'text-gold border-gold hover:bg-active'
    }`}>
      {busy ? '… reading' : label}
      <input type="file" accept={accept} disabled={busy}
             className="hidden"
             onChange={e => {
               const f = e.target.files?.[0];
               if (f) onFile(f);
               e.target.value = '';
             }} />
    </label>
  );
}

function ImportStatus({ status, className = '' }) {
  if (!status) return null;
  return (
    <span className={`text-xs font-cmd ${status.ok ? 'text-gold' : 'text-crimson'} ${className}`}>
      {status.msg}
    </span>
  );
}
