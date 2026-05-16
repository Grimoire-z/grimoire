import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DEFAULT_SETTINGS, DEFAULT_MODIFIERS,
  loadState, saveState, defaultVault,
} from './state.js';
import RollView from './views/RollView.jsx';
import ModifierForgeView from './views/ModifierForgeView.jsx';
import CharacterView from './views/CharacterView.jsx';
import TargetsView from './views/TargetsView.jsx';
import SettingsView from './views/SettingsView.jsx';
import VaultView from './views/VaultView.jsx';
import { D20Icon } from './components.jsx';

// Modes that require an active character. 'vault' and 'settings' don't —
// 'vault' is the character picker / launch page, 'settings' is app-wide.
const MODES = [
  { id: 'roll',      label: 'Roll' },
  { id: 'character', label: 'Character' },
  { id: 'targets',   label: 'Targets' },
  { id: 'modifiers', label: 'Modifiers' },
];

export default function App() {
  // Hydrate from localStorage if available; otherwise seed a fresh vault.
  // loadState handles v1→v2 migration, so existing single-character installs
  // come up as a one-entry vault.
  const initial = useMemo(() => loadState() || defaultVault(), []);

  // Mode is session-only; every launch starts at the vault.
  const [mode, setMode] = useState('vault');

  // Vault + active selection.
  const [characters,        setCharacters]        = useState(initial.characters);
  const [activeCharacterId, setActiveCharacterId] = useState(initial.activeCharacterId);

  // Other persisted slices.
  const [globalModifiers, setGlobalModifiers] = useState(initial.globalModifiers || DEFAULT_MODIFIERS);
  const [targets,         setTargets]         = useState(initial.targets || []);
  const [folders,         setFolders]         = useState(initial.folders || []);
  const [settings,        setSettings]        = useState({ ...DEFAULT_SETTINGS, ...(initial.settings || {}) });

  // Derive the active character object.
  const activeCharacter = characters[activeCharacterId] || null;

  // Setter with the same signature CharacterView and other consumers expect
  // (accepts an updater function or a new object), but writes back into the
  // vault map so the vault stays consistent.
  const setActiveCharacter = useCallback((updater) => {
    setCharacters(cs => {
      const cur = cs[activeCharacterId];
      if (!cur) return cs;
      const next = typeof updater === 'function' ? updater(cur) : updater;
      return { ...cs, [activeCharacterId]: next };
    });
  }, [activeCharacterId]);

  // Ephemeral roll-view state — not persisted, reset on character switch.
  const [tab,             setTab]             = useState('attacks');
  const [activeMods,      setActiveMods]      = useState({});
  const [modParams,       setModParams]       = useState({});
  const [selectedTargets, setSelectedTargets] = useState({});
  const [custom,          setCustom]          = useState({ bonus: '', damage: '' });
  const [castLevel,       setCastLevel]       = useState({});
  const [composed,        setComposed]        = useState('');
  const [history,         setHistory]         = useState([]);
  const [copied,          setCopied]          = useState(false);

  // Reset Roll ephemerals when switching characters. We treat switching like
  // "I just opened the app as character X" — half-composed commands and active
  // mod toggles don't carry over. View-level state (per-spell expansion, etc.)
  // resets too because we re-mount the views via key={activeCharacterId}.
  useEffect(() => {
    setTab('attacks');
    setActiveMods({});
    setModParams({});
    setSelectedTargets({});
    setCustom({ bonus: '', damage: '' });
    setCastLevel({});
    setComposed('');
    setHistory([]);
    setCopied(false);
  }, [activeCharacterId]);

  // Persist whenever the durable bits change.
  useEffect(() => {
    saveState({ characters, activeCharacterId, globalModifiers, targets, folders, settings });
  }, [characters, activeCharacterId, globalModifiers, targets, folders, settings]);

  // Apply theme + font preset to <html> so CSS-var swaps reach every node.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.fontPreset = settings.fontPreset;
  }, [settings.theme, settings.fontPreset]);

  // Bulk-replace all persisted slices from a parsed import payload.
  // Used by SettingsView's Backup & Restore section; matches the shape
  // saveState writes so a round-trip is lossless. Missing slices fall
  // back to current state (defensive — a sane export always carries all).
  const replaceState = (next) => {
    if (next.characters)        setCharacters(next.characters);
    if (next.activeCharacterId) setActiveCharacterId(next.activeCharacterId);
    if (next.globalModifiers)   setGlobalModifiers(next.globalModifiers);
    if (next.targets)           setTargets(next.targets);
    if (next.folders)           setFolders(next.folders);
    if (next.settings)          setSettings(s => ({ ...DEFAULT_SETTINGS, ...next.settings }));
    // Stay on / return to the vault after a bulk replace so the user sees
    // what just landed before diving back into a character.
    setMode('vault');
  };

  // Vault → enter a character: set active, switch into Roll view.
  const enterCharacter = (id) => {
    if (!characters[id]) return;
    setActiveCharacterId(id);
    setMode('roll');
  };

  // Vault → add a character (used by slices 2+5). Returns the new id so
  // callers can immediately switch into it or auto-open the editor.
  const addCharacter = (character) => {
    setCharacters(cs => ({ ...cs, [character.id]: character }));
    return character.id;
  };

  // Slice 1 only needs read/enter on the vault. CRUD (duplicate, rename,
  // delete) lands in slice 2; for now VaultView gets a no-op for those.

  // Force per-character-private views to remount on character switch so any
  // view-internal useState resets without us having to lift it up.
  const charKey = activeCharacterId || 'vault';

  return (
    <div className="bg-grimoire grain font-body text-parchment min-h-screen relative overflow-hidden">
      <Header
        mode={mode} setMode={setMode}
        character={activeCharacter}
      />
      {mode === 'vault' && (
        <VaultView
          characters={characters}
          activeCharacterId={activeCharacterId}
          onEnter={enterCharacter}
          onAdd={addCharacter}
        />
      )}
      {mode === 'roll' && activeCharacter && (
        <RollView
          key={charKey}
          character={activeCharacter}
          modifiers={globalModifiers}
          targets={targets} folders={folders}
          selectedTargets={selectedTargets} setSelectedTargets={setSelectedTargets}
          settings={settings} setSettings={setSettings}
          tab={tab} setTab={setTab}
          activeMods={activeMods} setActiveMods={setActiveMods}
          modParams={modParams} setModParams={setModParams}
          custom={custom} setCustom={setCustom}
          castLevel={castLevel} setCastLevel={setCastLevel}
          composed={composed} setComposed={setComposed}
          history={history} setHistory={setHistory}
          copied={copied} setCopied={setCopied}
        />
      )}
      {mode === 'character' && activeCharacter && (
        <CharacterView
          key={charKey}
          character={activeCharacter}
          setCharacter={setActiveCharacter}
        />
      )}
      {mode === 'targets' && (
        <TargetsView
          targets={targets} setTargets={setTargets}
          folders={folders} setFolders={setFolders}
        />
      )}
      {mode === 'modifiers' && (
        <ModifierForgeView
          key={charKey}
          modifiers={globalModifiers} setModifiers={setGlobalModifiers}
          activeMods={activeMods} setActiveMods={setActiveMods}
        />
      )}
      {mode === 'settings' && (
        <SettingsView
          settings={settings} setSettings={setSettings}
          state={{ characters, activeCharacterId, globalModifiers, targets, folders, settings }}
          replaceState={replaceState}
        />
      )}
    </div>
  );
}

function Header({ mode, setMode, character }) {
  const subhead =
    mode === 'vault'     ? 'choose a character to play, or add a new one' :
    mode === 'character' ? 'authoring · changes save automatically' :
    mode === 'targets'   ? 'organize encounter targets into folders' :
    mode === 'modifiers' ? 'forge toggleable buffs, debuffs, and conditions that stack onto your rolls' :
    mode === 'settings'  ? 'theme & typography · more options to come' :
    null;

  // Nav tabs are hidden in vault mode (no active character to drive them).
  const showNav = mode !== 'vault';

  return (
    <header className="relative z-10 px-6 pt-6 pb-3 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between mb-1 gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => setMode('vault')}
          title={mode === 'vault' ? 'already at the vault' : 'back to vault'}
          aria-label="back to vault"
          className="font-display text-gold text-2xl font-bold hover:text-parchment transition cursor-pointer"
        >
          GRIMOIRE
        </button>
        {showNav && (
          <nav className="flex items-center gap-1">
            {MODES.map(m => (
              <button key={m.id}
                      onClick={() => setMode(m.id)}
                      className={`text-xs font-cmd uppercase tracking-wider px-3 py-1.5 border transition ${
                        mode === m.id
                          ? 'text-gold border-gold-strong bg-active'
                          : 'text-fade border-gold hover:bg-active hover:text-parchment'
                      }`}>
                {m.label}
              </button>
            ))}
          </nav>
        )}
        <button
          type="button"
          onClick={() => setMode('settings')}
          title="Settings"
          aria-label="Settings"
          aria-pressed={mode === 'settings'}
          className={`flex items-center justify-center w-8 h-8 border rounded-sm transition ${
            mode === 'settings'
              ? 'text-gold border-gold-strong bg-active'
              : 'text-fade border-gold hover:text-parchment hover:bg-active'
          }`}
        >
          <D20Icon size={18} />
        </button>
      </div>
      <div className="divider mb-3" />
      {mode === 'roll' && character ? (
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div>
            <div className="font-display text-xl">{character.name || '— unnamed —'}</div>
            <div className="text-fade text-sm">
              {[character.ancestry, character.klass, `Level ${character.level}`]
                .filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="text-right text-xs text-fade font-cmd">
            <div>HP {character.hp.current}/{character.hp.max}{character.hp.temp ? ` (+${character.hp.temp})` : ''} · AC {character.ac} · Spd {character.speed}</div>
            <div>PB +{character.profBonus} · Insp {character.inspiration ? '●' : '◯'}</div>
          </div>
        </div>
      ) : (
        <div>
          <div className="font-display text-xl text-gold">
            {mode === 'vault'     ? 'VAULT'
              : mode === 'character' ? 'CHARACTER SHEET'
              : mode === 'targets'   ? 'TARGET BOOK'
              : mode === 'settings'  ? 'SETTINGS'
              : 'MODIFIER FORGE'}
          </div>
          {subhead && <div className="text-fade text-sm italic">{subhead}</div>}
        </div>
      )}
    </header>
  );
}
