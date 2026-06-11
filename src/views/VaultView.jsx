// The vault is the app's launch surface (mode = 'vault'): a grid of
// character cards plus an empty "+ add" card. Clicking a card makes
// that character active and switches into Roll view. The header's
// GRIMOIRE title is the way back here from any other mode.
//
// Each card has a "⋮" overflow menu in its top-right with Rename
// (inline-edit), Duplicate (clones with " (copy)" suffix), and Delete
// (type-DELETE-to-confirm modal). The card itself is a div with
// role="button" — not an actual <button> — so the action buttons inside
// it nest cleanly. Clicks inside the menu / rename input get
// stopPropagation so they don't trigger the card's enter behavior.
//
// Slice 1 scope: render + click-to-enter. Slice 2 (here): rename,
// duplicate, delete. Slice 3 adds portrait upload. Slice 5 replaces
// the blank-on-add behavior with a method picker that includes PDF
// import for new characters.

import { useEffect, useRef, useState } from 'react';
import { makeBlankCharacter, applyCharacterPatch } from '../state.js';
import { PortraitDisplay, ConfirmDeleteModal } from '../components.jsx';
import { importDdbPdfFile } from '../ddbPdfImport.js';
import { importDdbJsonFile, parseDdbJson, DDB_BOOKMARKLET } from '../ddbJsonImport.js';

export default function VaultView({
  characters, activeCharacterId,
  onEnter, onAddAndEnter, onRename, onDuplicate, onDelete,
}) {
  // Sort by name for stable display; "recently active" sort would need
  // an updatedAt per character — punt to a later polish.
  const list = Object.values(characters).slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const [pendingDelete, setPendingDelete] = useState(null); // character object | null
  const [picking,       setPicking]       = useState(false); // open the add-method modal

  // "Start blank" branch from the picker — fresh character with a
  // generic name, immediately entered.
  const onPickBlank = () => {
    setPicking(false);
    onAddAndEnter(makeBlankCharacter('New Character'));
  };

  // "Import from PDF" branch — run the file through the existing
  // pdfjs-backed importer, build a fresh blank seeded with the imported
  // patch, add + enter. Errors propagate up to the modal so they show
  // inline without closing it.
  const onPickPdf = async (file) => {
    const result = await importDdbPdfFile(file);
    if (!result.found?.length) {
      throw new Error(
        `read ${result.itemCount} text items, ${result.fieldCount} populated form fields — but no known mappings matched`
      );
    }
    const name = result.patch?.name || 'Imported Character';
    const character = applyCharacterPatch(makeBlankCharacter(name), result.patch);
    setPicking(false);
    onAddAndEnter(character);
  };

  // "Import from DDB JSON" branch — same shape as the PDF path but
  // backed by the bookmarklet-captured exportData blob. Accepts either
  // a .json file (file picker) or raw text (textarea paste).
  const onPickJson = async ({ file, text }) => {
    const result = file ? await importDdbJsonFile(file) : parseDdbJson(text);
    if (!result.found?.length) {
      throw new Error('no recognizable character fields found in this JSON');
    }
    const name = result.patch?.name || 'Imported Character';
    const character = applyCharacterPatch(makeBlankCharacter(name), result.patch);
    setPicking(false);
    onAddAndEnter(character);
  };

  return (
    <main className="px-6 pb-12 max-w-7xl mx-auto relative z-10">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map(c => (
          <CharacterCard
            key={c.id}
            character={c}
            active={c.id === activeCharacterId}
            onEnter={() => onEnter(c.id)}
            onRename={(name) => onRename(c.id, name)}
            onDuplicate={() => onDuplicate(c.id)}
            onRequestDelete={() => setPendingDelete(c)}
          />
        ))}
        <AddCard onAdd={() => setPicking(true)} />
      </div>
      {pendingDelete && (
        <ConfirmDeleteModal
          kind="character"
          name={pendingDelete.name}
          details="their sheet, attacks, spells, and per-character modifiers"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            onDelete(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
      {picking && (
        <AddCharacterPicker
          onCancel={() => setPicking(false)}
          onBlank={onPickBlank}
          onPdf={onPickPdf}
          onJson={onPickJson}
        />
      )}
    </main>
  );
}

function CharacterCard({ character, active, onEnter, onRename, onDuplicate, onRequestDelete }) {
  const [renaming, setRenaming] = useState(false);

  // Card is a <div> (not <button>) so the action menu's buttons can nest.
  // Enter on click or Enter/Space key when focused — but only when no
  // child interaction is happening.
  const enterIfClean = (e) => {
    if (renaming) return;
    if (e.target.closest('[data-card-action]')) return;
    onEnter();
  };
  const onKeyDown = (e) => {
    if (renaming) return;
    if (e.target.closest('[data-card-action]')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEnter();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={enterIfClean}
      onKeyDown={onKeyDown}
      className={`btn-action group relative flex gap-4 p-4 border rounded-sm transition bg-card hover:bg-card-hover cursor-pointer ${
        active ? 'border-gold-strong glow-active' : 'border-gold'
      }`}
    >
      <PortraitDisplay portrait={character.portrait} size={80} />
      <div className="min-w-0 flex-1">
        {renaming ? (
          <RenameInput
            value={character.name || ''}
            onCommit={(name) => { onRename(name); setRenaming(false); }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <div className="font-display text-lg text-parchment group-hover:text-gold transition truncate">
            {character.name || '— unnamed —'}
          </div>
        )}
        <div className="text-fade text-sm italic truncate">
          {[character.klass || 'Class unknown', character.ancestry].filter(Boolean).join(' · ')}
        </div>
        <div className="text-fade text-xs font-cmd uppercase tracking-wider mt-2">
          Level {character.level || 1}
        </div>
        {active && (
          <div className="text-gold text-[10px] font-cmd uppercase tracking-wider mt-2">
            ● last played
          </div>
        )}
      </div>
      <CardActions
        onRename={() => setRenaming(true)}
        onDuplicate={onDuplicate}
        onDelete={onRequestDelete}
      />
    </div>
  );
}

function CardActions({ onRename, onDuplicate, onDelete }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (fn) => () => { setOpen(false); fn(); };

  return (
    <div ref={rootRef} data-card-action className="absolute top-2 right-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Character actions"
        aria-label="Character actions"
        aria-expanded={open}
        className={`flex items-center justify-center w-7 h-7 border rounded-sm transition leading-none ${
          open ? 'text-gold border-gold-strong bg-active'
               : 'text-fade border-gold hover:text-parchment hover:bg-active'
        }`}
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-36 bg-card border border-gold-strong rounded-sm shadow-2xl z-30 py-1"
             style={{ boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(var(--color-gold-rgb),0.15)' }}>
          <ActionMenuItem onClick={choose(onRename)}>Rename</ActionMenuItem>
          <ActionMenuItem onClick={choose(onDuplicate)}>Duplicate</ActionMenuItem>
          <ActionMenuItem onClick={choose(onDelete)} danger>Delete…</ActionMenuItem>
        </div>
      )}
    </div>
  );
}

function ActionMenuItem({ onClick, children, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full text-left text-xs font-cmd uppercase tracking-wider px-3 py-1.5 transition ${
        danger ? 'text-crimson hover:bg-active' : 'text-parchment hover:bg-active hover:text-gold'
      }`}
    >
      {children}
    </button>
  );
}

function RenameInput({ value, onCommit, onCancel }) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  const commit = () => onCommit((draft || '').trim() || '— unnamed —');
  return (
    <input
      ref={inputRef}
      data-card-action
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      onBlur={commit}
      onClick={e => e.stopPropagation()}
      className="lined font-display text-lg w-full"
      style={{ borderBottom: '1px solid rgba(var(--color-gold-rgb), 0.6)' }}
    />
  );
}

function AddCard({ onAdd }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      title="Add a new character (slice 5 will offer PDF import or blank)"
      className="btn-action flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed border-gold rounded-sm bg-grimoire hover:bg-card-hover text-fade hover:text-gold transition min-h-[136px]"
    >
      <div className="text-3xl font-cmd leading-none">+</div>
      <div className="text-xs font-cmd uppercase tracking-wider">Add Character</div>
    </button>
  );
}

// ─── Add-character method picker ─────────────────────────────────────────
// Opens when the "+ Add Character" empty card is clicked. Offers two
// creation paths today: a blank sheet, or an import-from-PDF flow that
// runs the file through `importDdbPdfFile` and seeds a fresh character
// with the resulting patch. Extra import sources can be added as more
// buttons in this modal later (DDB JSON was removed in v0.5+ — see
// CLAUDE.md). The CharacterView "Import Character sheet" card is still
// the way to *overwrite* the active character; this picker is exclusively
// for *creating* new vault entries.
//
// Errors from the PDF importer surface inline so the user can pick a
// different file without the modal closing. Backdrop click and Escape
// cancel (but not while a PDF is mid-parse, since we'd leak the work).

function AddCharacterPicker({ onCancel, onBlank, onPdf, onJson }) {
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);
  // `mode` controls which secondary surface is open below the buttons.
  //   null      → just the path buttons
  //   'json'    → JSON paste/upload surface
  //   'help'    → DDB bookmarklet copy + setup steps
  const [mode,  setMode]  = useState(null);
  const [jsonText, setJsonText] = useState('');
  const [copied, setCopied] = useState(false);
  const pdfFileRef  = useRef(null);
  const jsonFileRef = useRef(null);

  const onPickPdfFile = () => pdfFileRef.current?.click();
  const onPdfFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true); setError(null);
    try {
      await onPdf(file);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onPickJsonFile = () => jsonFileRef.current?.click();
  // Load-file is a convenience that just fills the textarea so the
  // user can review before submitting — matches AddMonsterPicker's
  // JSON path and the Backup-and-Restore confirm-before-applying
  // pattern. Submitting still goes through `onJson({ text })`.
  const onJsonFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      setJsonText(await file.text());
    } catch (err) {
      setError(err.message || String(err));
    }
  };

  const onSubmitJson = async () => {
    if (!jsonText.trim()) {
      setError('paste the JSON or load a .json file first');
      return;
    }
    setBusy(true); setError(null);
    try {
      await onJson({ text: jsonText });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const onCopyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(DDB_BOOKMARKLET);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('clipboard write failed — select the textarea below and copy manually');
    }
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 overflow-y-auto"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="bg-card border border-gold-strong rounded-sm max-w-lg w-full p-5 my-auto"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(var(--color-gold-rgb), 0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-display text-lg text-gold uppercase tracking-wider mb-2">
          Add character
        </h3>
        <p className="text-fade text-sm italic mb-4">
          How do you want to create this character?
        </p>
        <div className="space-y-2 mb-4">
          <button
            type="button"
            onClick={onBlank}
            disabled={busy}
            className="btn-action w-full text-left p-3 border rounded-sm transition border-gold bg-grimoire hover:bg-card-hover disabled:opacity-50"
          >
            <div className="font-display text-sm text-gold uppercase tracking-wider mb-1">
              Start blank
            </div>
            <div className="text-fade text-xs italic">
              Fresh sheet — fill in identity, attacks, and spells by hand.
            </div>
          </button>
          <button
            type="button"
            onClick={onPickPdfFile}
            disabled={busy}
            className="btn-action w-full text-left p-3 border rounded-sm transition border-gold bg-grimoire hover:bg-card-hover disabled:opacity-50"
          >
            <div className="font-display text-sm text-gold uppercase tracking-wider mb-1">
              {busy ? '… importing' : 'Import from PDF'}
            </div>
            <div className="text-fade text-xs italic">
              D&amp;D Beyond character-sheet <span className="font-cmd text-gold">.pdf</span> export — best-effort field extraction.
            </div>
          </button>
          <input
            ref={pdfFileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={onPdfFile}
          />

          <button
            type="button"
            onClick={() => setMode(mode === 'json' ? null : 'json')}
            disabled={busy}
            aria-expanded={mode === 'json'}
            className={`btn-action w-full text-left p-3 border rounded-sm transition disabled:opacity-50 ${
              mode === 'json' ? 'border-gold-strong bg-active' : 'border-gold bg-grimoire hover:bg-card-hover'
            }`}
          >
            <div className="font-display text-sm text-gold uppercase tracking-wider mb-1">
              Import from DDB JSON
            </div>
            <div className="text-fade text-xs italic">
              Paste or upload a JSON file captured from D&amp;D Beyond via the bookmarklet — much richer than the PDF path.
            </div>
          </button>

          {mode === 'json' && (
            <div className="border border-gold rounded-sm p-3 bg-grimoire space-y-2">
              <textarea
                className="w-full font-cmd text-xs bg-card border border-gold rounded-sm p-2 text-parchment resize-y"
                rows={5}
                placeholder='paste the JSON here (or load a .json file →)'
                value={jsonText}
                onChange={e => setJsonText(e.target.value)}
                disabled={busy}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onPickJsonFile}
                  disabled={busy}
                  className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-parchment border border-gold px-3 py-1.5 hover:bg-active transition disabled:opacity-50"
                >
                  📁 Load .json file
                </button>
                <button
                  type="button"
                  onClick={() => setMode('help')}
                  disabled={busy}
                  className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-parchment border border-gold px-3 py-1.5 hover:bg-active transition disabled:opacity-50"
                >
                  How to capture from DDB
                </button>
                <button
                  type="button"
                  onClick={onSubmitJson}
                  disabled={busy || !jsonText.trim()}
                  className="ml-auto text-xs font-cmd uppercase tracking-wider text-gold border border-gold-strong px-3 py-1.5 hover:bg-active transition disabled:opacity-30"
                >
                  {busy ? '… importing' : 'Import'}
                </button>
              </div>
              <input
                ref={jsonFileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={onJsonFile}
              />
            </div>
          )}

          {mode === 'help' && (
            <div className="border border-gold rounded-sm p-3 bg-grimoire space-y-3">
              <div>
                <div className="font-display text-xs text-gold uppercase tracking-wider mb-1">
                  Recommended: DevTools copy
                </div>
                <div className="text-fade text-[11px] italic mb-1">
                  Always works. ~30 seconds.
                </div>
                <ol className="text-fade text-xs italic space-y-1 list-decimal pl-4">
                  <li>Open your character on D&amp;D Beyond.</li>
                  <li>Open DevTools (<span className="text-parchment not-italic font-cmd">F12</span>) → <span className="text-parchment not-italic">Network</span> tab.</li>
                  <li>Click DDB's <span className="text-parchment not-italic">Print to PDF</span> / <span className="text-parchment not-italic">Download</span> button.</li>
                  <li>In Network, find the request to <span className="font-cmd text-gold not-italic">/character/v5/pdf</span> → click it.</li>
                  <li>Switch to the <span className="text-parchment not-italic">Payload</span> tab → click <span className="text-parchment not-italic">view source</span> at the top → select all + copy.</li>
                  <li>Paste back here in the JSON textarea and click Import.</li>
                </ol>
              </div>
              <div className="border-t border-gold pt-2">
                <div className="font-display text-xs text-gold uppercase tracking-wider mb-1">
                  Fallback: bookmarklet
                </div>
                <div className="text-fade text-[11px] italic mb-1">
                  May not work on all browsers — DDB's bundler caches <span className="font-cmd">fetch</span> at module load, so our intercept arrives too late on some setups. If the bookmarklet doesn't trigger a download or copy to clipboard, fall back to DevTools above.
                </div>
                <ol className="text-fade text-xs italic space-y-1 list-decimal pl-4 mt-1">
                  <li>Click <span className="text-gold not-italic font-cmd">Copy bookmarklet</span> below.</li>
                  <li>Open the bookmarks bar (Ctrl+Shift+B), right-click → <span className="text-parchment not-italic">Add page</span>; name it <span className="text-gold not-italic font-cmd">Grimoire DDB</span>, paste into URL.</li>
                  <li>On the DDB character page, click the bookmarklet, then click DDB's Print button.</li>
                </ol>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onCopyBookmarklet}
                    className="text-xs font-cmd uppercase tracking-wider text-gold border border-gold-strong px-3 py-1.5 hover:bg-active transition"
                  >
                    {copied ? '✓ copied' : '📋 Copy bookmarklet'}
                  </button>
                </div>
              </div>
              <div className="border-t border-gold pt-2">
                <button
                  type="button"
                  onClick={() => setMode('json')}
                  className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-parchment border border-gold px-3 py-1.5 hover:bg-active transition"
                >
                  ← back to import
                </button>
              </div>
            </div>
          )}
        </div>
        {error && (
          <div className="text-crimson text-xs italic mb-4 leading-relaxed">
            {error}
          </div>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-parchment border border-gold px-3 py-1.5 hover:bg-active transition disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
