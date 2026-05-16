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
import { PortraitDisplay } from '../components.jsx';
import { importDdbPdfFile } from '../ddbPdfImport.js';

export default function VaultView({
  characters, activeCharacterId,
  onEnter, onAdd, onAddAndEnter, onRename, onDuplicate, onDelete,
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
          character={pendingDelete}
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

// ─── Confirm-delete modal ────────────────────────────────────────────────
// Destructive action gated by typing "DELETE" exactly. Backdrop click or
// Escape cancels. Auto-focuses the input. The Delete button is disabled
// until the input matches; muscle-memory ENTER on a half-typed string
// also won't fire.

function ConfirmDeleteModal({ character, onCancel, onConfirm }) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef(null);
  const ready = typed === 'DELETE';

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
      onClick={onCancel}
    >
      <div
        className="bg-card border border-crimson rounded-sm max-w-md w-full p-5"
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(var(--color-crimson-rgb), 0.3)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-display text-lg text-crimson uppercase tracking-wider mb-2">
          Delete character?
        </h3>
        <p className="text-parchment text-sm mb-3">
          You're about to permanently delete{' '}
          <span className="text-gold font-display">{character.name || '— unnamed —'}</span>{' '}
          — their sheet, attacks, spells, and per-character modifiers.
        </p>
        <p className="text-fade text-xs italic mb-4">
          This cannot be undone. To confirm, type <span className="font-cmd text-crimson">DELETE</span> below.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={typed}
          onChange={e => setTyped(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && ready) onConfirm(); }}
          placeholder="type DELETE"
          className="lined w-full font-cmd mb-4"
          style={{ borderBottomColor: ready ? 'var(--color-crimson)' : undefined }}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-cmd uppercase tracking-wider text-fade hover:text-parchment border border-gold px-3 py-1.5 hover:bg-active transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!ready}
            className={`text-xs font-cmd uppercase tracking-wider border px-3 py-1.5 transition ${
              ready
                ? 'text-parchment border-crimson hover:bg-active cursor-pointer'
                : 'text-fade border-gold opacity-50 cursor-not-allowed'
            }`}
            style={ready ? { backgroundColor: 'var(--color-crimson)', color: 'var(--color-bg)' } : {}}
          >
            ✕ Delete
          </button>
        </div>
      </div>
    </div>
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

function AddCharacterPicker({ onCancel, onBlank, onPdf }) {
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const onPickFile = () => fileRef.current?.click();
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file after an error
    if (!file) return;
    setBusy(true); setError(null);
    try {
      await onPdf(file);
      // onPdf calls onAddAndEnter which switches mode to 'roll' and
      // unmounts this modal alongside the rest of VaultView — we don't
      // need to setPicking(false) here, but if the import errors we
      // stay in the modal so the user can try a different file.
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.65)' }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="bg-card border border-gold-strong rounded-sm max-w-md w-full p-5"
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
            onClick={onPickFile}
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
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={onFile}
          />
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
