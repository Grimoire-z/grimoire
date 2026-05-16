// The vault is the app's launch surface (mode = 'vault'): a grid of
// character cards plus an empty "+ add" card. Clicking a character card
// makes that character active and switches into Roll view. The header's
// GRIMOIRE title is the way back here from any other mode.
//
// Slice 1 scope: render + click-to-enter only. CRUD (rename, duplicate,
// delete) lands in slice 2; portraits in slice 3; "+ add" empty-card
// flow (PDF / Start blank) in slice 5. For now the empty card is a
// disabled placeholder so the layout slot is visible.

import { makeBlankCharacter } from '../state.js';

export default function VaultView({ characters, activeCharacterId, onEnter, onAdd }) {
  const list = Object.values(characters);

  // Sort by name for stable display; switching to "most recently active"
  // is a slice-2+ polish (needs an updatedAt field per character).
  list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Slice-5 will replace this with a method picker (PDF / Start blank).
  // For slice 1, the "+ add" card just adds a blank character so the
  // vault is exercisable end-to-end while the prompt is being built.
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
          />
        ))}
        <AddCard onAdd={onAddBlank} />
      </div>
    </main>
  );
}

function CharacterCard({ character, active, onEnter }) {
  // Portrait slot is reserved here but uses a silhouette placeholder until
  // slice 3 wires real portraits in. Sized to feel solid in the grid.
  return (
    <button
      type="button"
      onClick={onEnter}
      className={`btn-action group text-left flex gap-4 p-4 border rounded-sm transition bg-card hover:bg-card-hover ${
        active ? 'border-gold-strong glow-active' : 'border-gold'
      }`}
    >
      <PortraitPlaceholder />
      <div className="min-w-0 flex-1">
        <div className="font-display text-lg text-parchment group-hover:text-gold transition truncate">
          {character.name || '— unnamed —'}
        </div>
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
    </button>
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
