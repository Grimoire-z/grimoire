import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DEFAULT_SETTINGS, DEFAULT_MODIFIERS,
  loadState, saveState, defaultVault,
  makeCharacterId, makeBlankCharacter,
  makeMonsterId, makeBlankMonster,
} from './state.js';
import RollView from './views/RollView.jsx';
import ModifierForgeView from './views/ModifierForgeView.jsx';
import CharacterView from './views/CharacterView.jsx';
import TargetsView from './views/TargetsView.jsx';
import SettingsView from './views/SettingsView.jsx';
import VaultView from './views/VaultView.jsx';
import BestiaryView from './views/BestiaryView.jsx';
import DmRollView from './views/DmRollView.jsx';
import { D20Icon, PortraitDisplay } from './components.jsx';

// Header nav lists. Player mode requires an active character for the four
// tabs; DM mode is character-free — Bestiary is the home surface and Roll
// will operate over active monsters once slice 4 lands.
const MODES_PLAYER = [
  { id: 'roll',      label: 'Roll' },
  { id: 'character', label: 'Character' },
  { id: 'targets',   label: 'Targets' },
  { id: 'modifiers', label: 'Modifiers' },
];
const MODES_DM = [
  { id: 'roll',      label: 'Roll' },
  { id: 'bestiary',  label: 'Bestiary' },
  { id: 'targets',   label: 'Targets' },
  { id: 'modifiers', label: 'Modifiers' },
];

export default function App() {
  // Hydrate from localStorage if available; otherwise seed a fresh vault.
  // loadState handles v1→v2 migration, so existing single-character installs
  // come up as a one-entry vault.
  const initial = useMemo(() => loadState() || defaultVault(), []);

  // Mode is session-only; every launch starts at the home surface for
  // whichever mode (player vs DM) the persisted settings are in.
  const initialDmMode = !!initial.settings?.dmMode;
  const [mode, setMode] = useState(initialDmMode ? 'bestiary' : 'vault');

  // Vault + active selection.
  const [characters,        setCharacters]        = useState(initial.characters);
  const [activeCharacterId, setActiveCharacterId] = useState(initial.activeCharacterId);

  // Bestiary (DM mode). Same shape pattern as the character vault — a map
  // keyed by stable id + a sibling folders array. Stays inert in player
  // mode; only consumed when settings.dmMode is on.
  const [monsters,       setMonsters]       = useState(initial.monsters || {});
  const [monsterFolders, setMonsterFolders] = useState(initial.monsterFolders || []);

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

  // Per-character modifier list helpers. Splits scope from globalModifiers
  // (see CLAUDE.md → Character vault → modifier scopes). The merged list
  // is what RollView consumes; ModifierForge takes both lists individually
  // so it can route edits to the right place and surface the Global toggle.
  const characterModifiers = activeCharacter?.modifiers || [];

  const setCharacterModifiers = useCallback((updater) => {
    setActiveCharacter(cur => {
      const nextList = typeof updater === 'function' ? updater(cur.modifiers || []) : updater;
      return { ...cur, modifiers: nextList };
    });
  }, [setActiveCharacter]);

  // Roll-view modifier source: character-private first so id collisions
  // (rare but possible — a user could promote/demote a mod whose id
  // matches one in the other list) resolve character-wins.
  const mergedModifiers = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const m of characterModifiers) { if (!seen.has(m.id)) { seen.add(m.id); out.push(m); } }
    for (const m of globalModifiers)    { if (!seen.has(m.id)) { seen.add(m.id); out.push(m); } }
    return out;
  }, [characterModifiers, globalModifiers]);

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
    saveState({ characters, activeCharacterId, globalModifiers, targets, folders, monsters, monsterFolders, settings });
  }, [characters, activeCharacterId, globalModifiers, targets, folders, monsters, monsterFolders, settings]);

  // Mode-toggle safety: keep `mode` valid as dmMode flips. Player-only
  // modes (vault, character) auto-route to bestiary on flip-to-DM;
  // DM-only modes (bestiary) auto-route to vault on flip-to-player.
  // Shared modes (roll, targets, modifiers, settings) stay put.
  useEffect(() => {
    if (settings.dmMode && (mode === 'vault' || mode === 'character')) setMode('bestiary');
    else if (!settings.dmMode && mode === 'bestiary') setMode('vault');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.dmMode]);

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
    if (next.monsters)          setMonsters(next.monsters);
    if (next.monsterFolders)    setMonsterFolders(next.monsterFolders);
    if (next.settings)          setSettings(s => ({ ...DEFAULT_SETTINGS, ...next.settings }));
    // Stay on / return to the home surface after a bulk replace so the
    // user sees what just landed before diving in. Home is mode-aware.
    setMode(next.settings?.dmMode ? 'bestiary' : 'vault');
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

  // Add and immediately enter — the common "create blank / import"
  // path. Doing this as a single function avoids the stale-closure trap
  // in `enterCharacter`'s existence check: a freshly-added character
  // isn't visible in the `characters` closure of the same render, so a
  // naive `addCharacter(); enterCharacter(id);` sequence would silently
  // no-op. Writing the three setters together batches them into one
  // render and sidesteps the check entirely.
  const addAndEnterCharacter = (character) => {
    setCharacters(cs => ({ ...cs, [character.id]: character }));
    setActiveCharacterId(character.id);
    setMode('roll');
  };

  // Rename a character — display-only field; id stays stable.
  const renameCharacter = (id, name) => {
    setCharacters(cs => {
      if (!cs[id]) return cs;
      return { ...cs, [id]: { ...cs[id], name } };
    });
  };

  // Duplicate: deep-clone via JSON, fresh id, "<name> (copy)" name.
  // The source's portrait and modifiers come along so duplicates are
  // genuine spares, not blanks.
  const duplicateCharacter = (id) => {
    const src = characters[id];
    if (!src) return null;
    const clone = JSON.parse(JSON.stringify(src));
    clone.id = makeCharacterId();
    clone.name = `${src.name || 'Character'} (copy)`;
    setCharacters(cs => ({ ...cs, [clone.id]: clone }));
    return clone.id;
  };

  // Delete with two safeguards: if the active character is being deleted,
  // swap activeCharacterId to a surviving sibling first; if the deletion
  // would empty the vault, auto-create a blank so the views never face
  // an empty `characters` map.
  //
  // We deliberately don't nest `setActiveCharacterId` inside a
  // `setCharacters` updater here: StrictMode double-invokes updaters in
  // dev, and `makeBlankCharacter` produces a fresh random id each call —
  // the two invocations would write different ids to `characters` vs.
  // `activeCharacterId`. Computing the next vault outside the setter and
  // making both state calls from the same event handler keeps them
  // batched into a single, consistent render.
  const deleteCharacter = (id) => {
    if (!characters[id]) return;
    const next = { ...characters };
    delete next[id];
    if (Object.keys(next).length === 0) {
      const fallback = makeBlankCharacter('Default Character');
      next[fallback.id] = fallback;
      setCharacters(next);
      setActiveCharacterId(fallback.id);
      return;
    }
    setCharacters(next);
    if (id === activeCharacterId) {
      setActiveCharacterId(Object.keys(next)[0]);
    }
  };

  // Force per-character-private views to remount on character switch so any
  // view-internal useState resets without us having to lift it up.
  const charKey = activeCharacterId || 'vault';

  // ─── Bestiary CRUD (DM mode) ─────────────────────────────────────────
  // Mirrors the character vault helpers above. No `enter` concept — DM
  // mode has no "active monster" singleton; instead each monster carries
  // an `active: bool` flag that surfaces it on the DM Roll page.

  const addMonster = (monster) => {
    setMonsters(ms => ({ ...ms, [monster.id]: monster }));
    return monster.id;
  };

  const renameMonster = (id, name) => {
    setMonsters(ms => ms[id] ? ({ ...ms, [id]: { ...ms[id], name } }) : ms);
  };

  const duplicateMonster = (id) => {
    const src = monsters[id];
    if (!src) return null;
    const clone = JSON.parse(JSON.stringify(src));
    clone.id = makeMonsterId();
    clone.name = `${src.name || 'Monster'} (copy)`;
    // A duplicate starts inactive so it doesn't clutter the encounter
    // roster before the DM decides to use it.
    clone.active = false;
    setMonsters(ms => ({ ...ms, [clone.id]: clone }));
    return clone.id;
  };

  const deleteMonster = (id) => {
    setMonsters(ms => {
      if (!ms[id]) return ms;
      const next = { ...ms };
      delete next[id];
      return next;
    });
  };

  const toggleMonsterActive = (id) => {
    setMonsters(ms => ms[id]
      ? ({ ...ms, [id]: { ...ms[id], active: !ms[id].active } })
      : ms);
  };

  // Generic edit hook used by the stat-block editor. Accepts either a
  // patch object (shallow merge) or an updater function (next = fn(cur));
  // matches the shape consumers expect from React state setters so the
  // modal can pass `setMonster` straight to its sub-fields.
  const updateMonster = (id, updater) => {
    setMonsters(ms => {
      const cur = ms[id];
      if (!cur) return ms;
      const next = typeof updater === 'function' ? updater(cur) : { ...cur, ...updater };
      return { ...ms, [id]: next };
    });
  };

  const moveMonsterToFolder = (id, folderId) => {
    setMonsters(ms => ms[id]
      ? ({ ...ms, [id]: { ...ms[id], folderId: folderId || null } })
      : ms);
  };

  const addMonsterFolder = (name = 'New Folder') => {
    const folder = { id: makeMonsterId(), name };
    setMonsterFolders(fs => [...fs, folder]);
    return folder.id;
  };

  const renameMonsterFolder = (id, name) => {
    setMonsterFolders(fs => fs.map(f => f.id === id ? { ...f, name } : f));
  };

  // Folder delete moves contained monsters back to ungrouped (folderId
  // = null) so nothing is lost — destructive enough to confirm but not
  // typed-confirm-worthy. Matches TargetsView's folder pattern.
  const deleteMonsterFolder = (id) => {
    setMonsterFolders(fs => fs.filter(f => f.id !== id));
    setMonsters(ms => {
      const next = { ...ms };
      for (const mid of Object.keys(next)) {
        if (next[mid].folderId === id) next[mid] = { ...next[mid], folderId: null };
      }
      return next;
    });
  };

  const dmMode = !!settings.dmMode;

  return (
    <div className="bg-grimoire grain font-body text-parchment min-h-screen relative overflow-hidden">
      <Header
        mode={mode} setMode={setMode}
        character={activeCharacter}
        dmMode={dmMode}
      />
      {!dmMode && mode === 'vault' && (
        <VaultView
          characters={characters}
          activeCharacterId={activeCharacterId}
          onEnter={enterCharacter}
          onAdd={addCharacter}
          onAddAndEnter={addAndEnterCharacter}
          onRename={renameCharacter}
          onDuplicate={duplicateCharacter}
          onDelete={deleteCharacter}
        />
      )}
      {dmMode && mode === 'bestiary' && (
        <BestiaryView
          monsters={monsters}
          monsterFolders={monsterFolders}
          onAddMonster={addMonster}
          onRenameMonster={renameMonster}
          onDuplicateMonster={duplicateMonster}
          onDeleteMonster={deleteMonster}
          onToggleMonsterActive={toggleMonsterActive}
          onMoveMonsterToFolder={moveMonsterToFolder}
          onUpdateMonster={updateMonster}
          onAddFolder={addMonsterFolder}
          onRenameFolder={renameMonsterFolder}
          onDeleteFolder={deleteMonsterFolder}
        />
      )}
      {!dmMode && mode === 'roll' && activeCharacter && (
        <RollView
          key={charKey}
          character={activeCharacter}
          updateCharacter={setActiveCharacter}
          modifiers={mergedModifiers}
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
      {dmMode && mode === 'roll' && (
        <DmRollView
          monsters={Object.values(monsters).filter(m => m.active)}
          modifiers={globalModifiers}
          targets={targets} folders={folders}
          selectedTargets={selectedTargets} setSelectedTargets={setSelectedTargets}
          activeMods={activeMods} setActiveMods={setActiveMods}
          modParams={modParams} setModParams={setModParams}
          custom={custom} setCustom={setCustom}
          composed={composed} setComposed={setComposed}
          history={history} setHistory={setHistory}
          copied={copied} setCopied={setCopied}
        />
      )}
      {!dmMode && mode === 'character' && activeCharacter && (
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
          key={dmMode ? 'dm' : charKey}
          characterModifiers={dmMode ? [] : characterModifiers}
          setCharacterModifiers={dmMode ? (() => {}) : setCharacterModifiers}
          globalModifiers={globalModifiers} setGlobalModifiers={setGlobalModifiers}
          activeMods={activeMods} setActiveMods={setActiveMods}
        />
      )}
      {mode === 'settings' && (
        <SettingsView
          settings={settings} setSettings={setSettings}
          state={{ characters, activeCharacterId, globalModifiers, targets, folders, monsters, monsterFolders, settings }}
          replaceState={replaceState}
        />
      )}
    </div>
  );
}

function Header({ mode, setMode, character, dmMode }) {
  const subhead =
    mode === 'vault'     ? 'choose a character to play, or add a new one' :
    mode === 'bestiary'  ? 'imported monster stat blocks · mark "active" to surface them on the Roll page' :
    mode === 'character' ? 'authoring · changes save automatically' :
    mode === 'targets'   ? 'organize encounter targets into folders' :
    mode === 'modifiers' ? 'forge toggleable buffs, debuffs, and conditions that stack onto your rolls' :
    mode === 'settings'  ? 'theme · typography · DM mode toggle · updates · backup' :
    null;

  // Player mode hides the nav on its home surface (vault — no active character
  // to drive the tabs). DM mode keeps the nav visible everywhere because
  // Bestiary is itself one of the nav items, not a separate launch page.
  const showNav = dmMode || mode !== 'vault';
  const home = dmMode ? 'bestiary' : 'vault';
  const homeLabel = dmMode ? 'back to bestiary' : 'back to vault';
  const modeList = dmMode ? MODES_DM : MODES_PLAYER;

  return (
    <header className="relative z-10 px-6 pt-6 pb-3 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between mb-1 gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => setMode(home)}
          title={mode === home ? `already at the ${home}` : homeLabel}
          aria-label={homeLabel}
          className="font-display text-gold text-2xl font-bold hover:text-parchment transition cursor-pointer"
        >
          GRIMOIRE
        </button>
        {showNav && (
          <nav className="flex items-center gap-1">
            {modeList.map(m => (
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
      {mode === 'roll' && !dmMode && character ? (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <PortraitDisplay portrait={character.portrait} size={48} />
            <div className="min-w-0">
              <div className="font-display text-xl truncate">{character.name || '— unnamed —'}</div>
              <div className="text-fade text-sm truncate">
                {[character.ancestry, character.klass, `Level ${character.level}`]
                  .filter(Boolean).join(' · ')}
              </div>
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
              : mode === 'bestiary'  ? 'BESTIARY'
              : mode === 'character' ? 'CHARACTER SHEET'
              : mode === 'targets'   ? 'TARGET BOOK'
              : mode === 'settings'  ? 'SETTINGS'
              : mode === 'roll' && dmMode ? 'DM ROLL'
              : 'MODIFIER FORGE'}
          </div>
          {subhead && <div className="text-fade text-sm italic">{subhead}</div>}
        </div>
      )}
    </header>
  );
}
