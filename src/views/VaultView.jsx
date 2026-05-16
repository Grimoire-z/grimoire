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
import { makeBlankCharacter } from '../state.js';

export default function VaultView({
  characters, activeCharacterId,
  onEnter, onAdd, onRename, onDuplicate, onDelete,
}) {
  // Sort by name for stable display; "recently active" sort would need
  // an updatedAt per character — punt to a later polish.
  const list = Object.values(characters).slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const [pendingDelete, setPendingDelete] = useState(null); // character object | null

  // Slice-5 replaces this with a method picker (PDF / Start blank).
  // For now the empty card always adds a blank character and enters it.
  const onAddBlank = () => {
    const c = makeBlankCharacter('New Character');
    const id = onAdd(c);
    if (id) onEnter(id);
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
        <AddCard onAdd={onAddBlank} />
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
      <PortraitPlaceholder />
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

// Simple silhouette placeholder — a faded bust outline that fits the
// theme. Replaced in slice 3 with the actual character portrait when one
// has been uploaded; this placeholder is the fallback otherwise.
function PortraitPlaceholder() {
  return (
    <div
      className="flex-shrink-0 w-20 h-20 rounded-sm border border-gold flex items-center justify-center"
      style={{ backgroundColor: 'var(--color-bg)' }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width="40" height="40" fill="none"
           stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
           strokeLinejoin="round" className="text-fade">
        <circle cx="12" cy="8" r="3.6" />
        <path d="M5 21c0-3.6 3.1-6.4 7-6.4s7 2.8 7 6.4" />
      </svg>
    </div>
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
