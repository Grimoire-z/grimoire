import { useState, useEffect, useMemo } from 'react';
import { DEFAULT_CHARACTER, DEFAULT_MODIFIERS, DEFAULT_SETTINGS, loadState, saveState } from './state.js';
import RollView from './views/RollView.jsx';
import ModifierForgeView from './views/ModifierForgeView.jsx';
import CharacterView from './views/CharacterView.jsx';
import TargetsView from './views/TargetsView.jsx';
import SettingsView from './views/SettingsView.jsx';
import { D20Icon } from './components.jsx';

const MODES = [
  { id: 'roll',      label: 'Roll' },
  { id: 'character', label: 'Character' },
  { id: 'targets',   label: 'Targets' },
  { id: 'modifiers', label: 'Modifiers' },
];

export default function App() {
  // Hydrate from localStorage if available; otherwise use defaults.
  const initial = useMemo(() => loadState() || {}, []);

  const [mode,      setMode]      = useState('roll');
  const [character, setCharacter] = useState(initial.character || DEFAULT_CHARACTER);
  const [modifiers, setModifiers] = useState(initial.modifiers || DEFAULT_MODIFIERS);
  const [targets,   setTargets]   = useState(initial.targets || []);
  const [folders,   setFolders]   = useState(initial.folders || []);
  const [settings,  setSettings]  = useState({ ...DEFAULT_SETTINGS, ...(initial.settings || {}) });

  // Ephemeral roll-view state — not persisted.
  const [tab,             setTab]             = useState('attacks');
  const [activeMods,      setActiveMods]      = useState({});
  const [modParams,       setModParams]       = useState({});
  const [selectedTargets, setSelectedTargets] = useState({});
  const [custom,          setCustom]          = useState({ bonus: '', damage: '' });
  const [castLevel,       setCastLevel]       = useState({});
  const [composed,        setComposed]        = useState('');
  const [history,         setHistory]         = useState([]);
  const [copied,          setCopied]          = useState(false);

  // Persist whenever the durable bits change.
  useEffect(() => {
    saveState({ character, modifiers, targets, folders, settings });
  }, [character, modifiers, targets, folders, settings]);

  // Apply theme + font preset to <html> so CSS-var swaps reach every node.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.fontPreset = settings.fontPreset;
  }, [settings.theme, settings.fontPreset]);

  return (
    <div className="bg-grimoire grain font-body text-parchment min-h-screen relative overflow-hidden">
      <Header
        mode={mode} setMode={setMode}
        character={character}
      />
      {mode === 'roll' && (
        <RollView
          character={character}
          modifiers={modifiers}
          targets={targets} folders={folders}
          selectedTargets={selectedTargets} setSelectedTargets={setSelectedTargets}
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
      {mode === 'character' && (
        <CharacterView character={character} setCharacter={setCharacter} />
      )}
      {mode === 'targets' && (
        <TargetsView
          targets={targets} setTargets={setTargets}
          folders={folders} setFolders={setFolders}
        />
      )}
      {mode === 'modifiers' && (
        <ModifierForgeView
          modifiers={modifiers} setModifiers={setModifiers}
          activeMods={activeMods} setActiveMods={setActiveMods}
        />
      )}
      {mode === 'settings' && (
        <SettingsView settings={settings} setSettings={setSettings} />
      )}
    </div>
  );
}

function Header({ mode, setMode, character }) {
  const subhead =
    mode === 'character' ? 'authoring · changes save automatically' :
    mode === 'targets'   ? 'organize encounter targets into folders' :
    mode === 'modifiers' ? 'forge toggleable buffs, debuffs, and conditions that stack onto your rolls' :
    mode === 'settings'  ? 'theme & typography · more options to come' :
    null;

  return (
    <header className="relative z-10 px-6 pt-6 pb-3 max-w-7xl mx-auto">
      <div className="flex items-baseline justify-between mb-1 gap-4 flex-wrap">
        <h1 className="font-display text-gold text-2xl font-bold">GRIMOIRE</h1>
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
      {mode === 'roll' ? (
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
            {mode === 'character' ? 'CHARACTER SHEET'
              : mode === 'targets' ? 'TARGET BOOK'
              : mode === 'settings' ? 'SETTINGS'
              : 'MODIFIER FORGE'}
          </div>
          {subhead && <div className="text-fade text-sm italic">{subhead}</div>}
        </div>
      )}
    </header>
  );
}
