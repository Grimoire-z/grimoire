# Grimoire

Avrae Discord command composer — Electron + Vite + React desktop app.

This file is the source of truth for project memory. It's committed to the repo so the same context follows the project across machines.

## Stack

- Vite + React 19 (JS, not TS — keep it that way unless we have a strong reason)
- Tailwind v4 via `@tailwindcss/vite`
- Electron 42 + electron-builder for packaging
- pdfjs-dist for D&D Beyond PDF parsing
- localStorage persistence (no DB, no backend)

## Scripts

- `npm run dev` — Vite only (port 5173, strict)
- `npm run electron:dev` — Vite + Electron concurrently (the dev workflow)
- `npm run build` — Vite production build into `dist/`
- `npm run dist` — Vite build + electron-builder → installer + portable in `release/`
- `npm run dist:dir` — same as `dist` but only produces the unpacked dir, skipping installer creation

## Source layout

- `electron/main.cjs` — Electron main process; loads dev URL or `dist/index.html`. Sandbox enabled, devtools open detached in dev
- `electron/preload.cjs` — exposes `window.grimoire` (platform info)
- `src/main.jsx` — Vite entry
- `src/App.jsx` — top-level component: header, vault/bestiary routing, mode switching (Vault / Bestiary / Roll / Character / Targets / Modifiers / Settings). Holds the `characters` map + `activeCharacterId` (player mode) and the `monsters` map + `monsterFolders` (DM mode). Derives `activeCharacter` from the active id. Header nav list is `MODES_PLAYER` or `MODES_DM` based on `settings.dmMode`.
- `src/state.js` — DEFAULT_CHARACTER, DEFAULT_MODIFIERS, DEFAULT_SETTINGS (incl. `dmMode`), SAVE_DEFS, SKILL_DEFS, `makeCharacterId`/`makeBlankCharacter`/`makeMonsterId`/`makeBlankMonster`/`defaultVault` (vault helpers), `migrate` chain (v1→v2→v3, called inside `loadState` and `parseImport`), `loadState`/`saveState`, `downloadExport`/`parseImport`
- `src/composer.js` — pure command composition (compose, composeFromMod, substituteParams)
- `src/ddbPdfImport.js` — D&D Beyond fillable PDF importer; uses pdfjs-dist worker via `?worker` Vite import. PDF is the only supported import path (DDB retired their JSON character-service endpoint, so the previous `ddbImport.js` JSON path was removed in v0.5+). pdfjs-dist itself is dynamic-imported via a memoized `loadPdfjs()` helper inside this file — keeps the main bundle ~270KB instead of ~660KB. **Don't re-add a top-level `import * as pdfjs from 'pdfjs-dist'`** or the chunk-split benefit goes away.
- `src/components.jsx` — shared (Checkbox, TabBar, ActionCard, ModifierRow, FieldLabel, SectionCard, D20Icon, PortraitDisplay, fileToPortraitDataUrl, ConfirmDeleteModal)
- `src/themes.js` — registry of color themes and font presets surfaced in SettingsView (paired with CSS blocks in `index.css`)
- `src/views/RollView.jsx` — player composer view; paginated spells, attack/spell dedup. Side panel (Targets + Modifiers + custom bonuses) and the fixed-bottom command bar live in `RollChrome.jsx` and are shared with `DmRollView`.
- `src/views/RollChrome.jsx` — shared roll-surface chunks (`RollSidePanel`, `ComposerBar`, plus the internal `TargetsPanel`/`TargetGroup`). Both player Roll and DM Roll import from here.
- `src/views/DmRollView.jsx` — DM Roll surface. Renders each active monster from the Bestiary as a card with clickable buttons for actions, legendary actions, saves, and skills (each composing `!attack` / `!save` / `!check` through the same `compose()` as player Roll). Header has a per-monster `!init add 1d20 "<name>"` helper button.
- `src/views/CharacterView.jsx` — Roll20-style sheet editor (identity, combat, abilities, saves, skills, attacks, spells, DDB import)
- `src/views/ModifierForgeView.jsx` — modifier library editor
- `src/views/TargetsView.jsx` — target book; folders + targets
- `src/views/SettingsView.jsx` — full-page settings (Updates + Backup & Restore + Theme + Fonts + Credits); reached via the d20 button in the header
- `src/views/VaultView.jsx` — launch page; grid of character cards + an "+ add" card. Clicking a card calls `enterCharacter(id)` in `App.jsx`, which sets `activeCharacterId` and routes to Roll. The GRIMOIRE header title is the way back from any mode.
- `src/views/BestiaryView.jsx` — DM mode's analogue of the vault: holds imported monster stat blocks, grouped into collapsible folder sections. Each card has an `active` checkbox (multi-select — multiple monsters can be active simultaneously) that will surface them on the DM Roll page once slice 4 lands. Card shows a compact two-line summary (size+type+alignment, then `CR · AC · HP`) when stat-block data is present; clicking the card body opens an in-place `StatBlockModal` with the full block (abilities grid, saves/skills/senses/languages/CR, traits/actions/legendary actions). Per-card overflow menu has Rename / Duplicate / Delete + a folder picker. Folder headers support inline rename + delete (folder delete moves contained monsters to Ungrouped). 5e.tools URL import in the Add-monster picker uses the main-process IPC handler.
- `src/index.css` — Google Fonts + Tailwind import + custom theme classes
- `scripts/inspect-pdf.mjs`, `scripts/test-mapper.mjs` — offline diagnostic tools for tuning the PDF importer; useful when DDB shifts the layout

## Architecture notes

### Roll20-style character model (v0.3+)

- Saves are the fixed 6 ability ones; skills are the canonical 18. Lookups go through `SAVE_DEFS` / `SKILL_DEFS`. Per-character only `{mod, prof, expertise?}` overrides are stored.
- Spells: levels 0–9 (cantrips at level 0, no slot tracking). Per-level `{current, max}` slot tracking on levels 1–9.
- Attacks: free-form repeating list.
- Each attack/spell has `id` (Avrae's name for `!attack "<id>"` / `!cast "<id>"`) separate from display `name`. Also has optional `phrase` for per-action flavor text.
- Spells additionally carry an optional `prepared` bool. The Roll view's Spells tab has a "Prepared only" filter (persisted as `settings.preparedOnly`) which, when on, hides unprepared spells from both the level pagination and the spell grid. Character editor exposes a per-spell "Prep" chip and a `N/M prepared` count in each level header. Cantrips can be marked too — useful for "always show on my casting page" semantics even though 5e cantrips aren't technically "prepared".
- Character editor's Spells card uses a two-tier accordion (v0.6+): each level is collapsible (closed by default so a full spellbook compacts to one line per level), and each spell row inside has a compact form (name + Prep chip + ⚙ gear) plus a gear-expanded editor (id, name, sub, phrase, ✕ remove). Expansion state for both tiers is session-local React state (not persisted), since the point of defaulting to closed is to keep the view compact every session. Clicking `+ add` auto-expands both the level and the new (blank) spell so you land in edit mode immediately. Removal shifts higher per-spell open-keys down by one so state stays pinned to the right entry instead of drifting.

### Composer

- `compose()` builds the Avrae command string. Spells inherit attack-mode modifiers automatically; other action kinds (attack, save, check) respect `mod.applies`.
- Targets emit as `-t "<name>"` per selected target, only on attacks/spells.
- Per-action phrase emits as `-phrase "..."` last so it shows in Avrae's result text.

### Theming (v0.4+)

- All colors and font families flow through CSS variables defined in `src/index.css`. Default values live on `:root`. Each named theme/font preset has a `[data-theme="..."]` / `[data-font-preset="..."]` block that overrides those vars.
- The d20 button at the top-right of `App.jsx`'s `Header` is a navigation control — clicking it sets `mode = 'settings'`, rendering `SettingsView` as a full page (same pattern as Roll / Character / Targets / Modifiers). The 'settings' mode is intentionally NOT in the `MODES` nav array; the d20 is its only entry point so the main nav stays at four items. Going back to any other mode is just clicking that mode's nav button.
- The popover pattern was tried first (v0.4 initial commit) and abandoned because the App's root `overflow-hidden` clipped it and z-stacking against the header was fragile. A separate page sidesteps both issues and gives room for future settings sections.
- An effect in `App.jsx` mirrors `settings.theme` / `settings.fontPreset` to `document.documentElement.dataset` so the var swap reaches every node.
- Theme/font preset metadata (id, label, swatch colors, sample font-families) lives in `src/themes.js`. Adding a new theme = (1) add a `[data-theme="..."]` block in `index.css`, (2) register an entry in `THEMES` in `themes.js`. Same pattern for fonts via `FONT_PRESETS`.
- `--color-gold-rgb` / `--color-crimson-rgb` are stored as comma-separated triplets so existing `rgba(...)` alpha-tinted borders and shadows compose with the theme color via `rgba(var(--color-gold-rgb), 0.35)`.
- New themes should preserve role semantics: `gold` is the primary accent, `crimson` is for danger / low-resource indicators. Shift hue/saturation, don't swap roles.
- Inline `style={{ backgroundColor: '#d4a644' }}` ad-hoc colors should be `style={{ backgroundColor: 'var(--color-gold)' }}` so theme swaps reach them. The few legacy spots in `components.jsx` (Checkbox/ModifierRow filled checkmark, TabBar underline) have been converted; keep the convention going.

### DM mode (v0.9+, slices 1-5 — foundation + bestiary CRUD + 5e.tools import + DM Roll + JSON import)

- A persisted setting (`settings.dmMode: boolean`) flips the whole app between **Player mode** (character vault + per-character surfaces) and **DM mode** (bestiary + monster-driven Roll). Toggle lives in Settings → Mode at the bottom of the page, just above Credits — by-design placement so the rest of the settings (Updates, Backup, Theme, Fonts) are the more common interactions and the mode flip is a deliberate-feeling action rather than the first thing the eye lands on. Switching is non-destructive: each mode's state stays intact in localStorage when you're in the other.
- **Header switcheroo**: when `dmMode` is on the header nav becomes `MODES_DM = [Roll, Bestiary, Targets, Modifiers]`; off, it's `MODES_PLAYER = [Roll, Character, Targets, Modifiers]`. Bestiary slots into the same position Character occupies in player mode so muscle memory carries across modes. The home surface (GRIMOIRE title click) is bestiary in DM mode, vault in player. Unlike player mode (which hides the nav on vault), DM mode always shows the nav because Bestiary is itself one of the nav items rather than a separate launch surface.
- **Mode-toggle safety**: an effect keyed on `settings.dmMode` in `App.jsx` reroutes the current `mode` when it'd be invalid for the new toggle state — player-only modes (`vault`, `character`) bounce to `bestiary` on flip-to-DM; the DM-only `bestiary` bounces to `vault` on flip-to-player. Shared modes (`roll`, `targets`, `modifiers`, `settings`) stay put. The initial `mode` value on launch also respects persisted `dmMode` so a DM-mode user reopens to `bestiary`, not `vault`.
- **Schema v3** adds two top-level slices to the persisted shape:
  ```
  monsters: { [id]: { id, name, active, folderId, ... } }
  monsterFolders: [{ id, name }]
  ```
  Each monster currently carries only `id`, `name`, `active`, `folderId`. Richer stat-block fields (AC, HP, abilities, actions, legendary actions, …) land in later slices as the 5e.tools importer is wired in. `migrate()` in `state.js` chains the prior `migrateV1ToV2` with a new `migrateV2ToV3` that adds empty `monsters`/`monsterFolders` and merges fresh `DEFAULT_SETTINGS` (so existing installs come up with `dmMode: false` set explicitly). Backup imports flow through the same chain so older export files keep working forward.
- **ModifierForge in DM mode**: there's no active character, so per-character modifiers are vacuous. App.jsx passes `characterModifiers=[]` + a no-op setter when `dmMode` is on; only `globalModifiers` is editable. Targets work as-is since they were already global.
- **Roll in DM mode (slice 1)**: shows a placeholder card pointing at the upcoming slice 4. Real action grid (active-monster cards + clickable attack/save/check/init buttons composing `!attack`/`!save`/`!check`/`!init add`) lands then.
- **Avrae integration model (locked in slice 0 design)**: combat is initiative-driven. Each "active" monster gets a per-card `!i madd "<name>"` helper button to bootstrap the encounter — Avrae's "monster add" subcommand looks the monster up in Avrae's bestiary, auto-loads stats + actions, and rolls init off the monster's Dex mod. Once monsters are in init, plain `!attack`/`!save`/`!check` (no monset/`!ma`) rolls for the current combatant against the loaded action list. Our cards are reference + button source; init bookkeeping happens in Discord chat. (`!i madd` requires the monster name to match Avrae's bestiary; for homebrew not in Avrae, fall back to manually adding combatants.)
- **Slice 2 (Bestiary CRUD)**: monster cards render in collapsible folder sections — an Ungrouped section pinned at the top for monsters with no `folderId`, plus one section per entry in `monsterFolders`. Each card has an active toggle on the left, name (click to inline-rename), folder picker, and a `⋮` overflow menu (Rename / Duplicate / Delete) in the corner. Duplicate spawns a copy with `(copy)` suffix and `active: false` so it doesn't auto-clutter the encounter. Delete uses the lifted `ConfirmDeleteModal`. Folder rename is inline on the header; folder delete is a plain `window.confirm` (recoverable — monsters move to Ungrouped, nothing is lost) to match TargetsView's folder pattern.
- **Lifted `ConfirmDeleteModal`** (in `components.jsx`): the typed-confirm modal originally inside VaultView is now generic. Caller passes `kind`, `name`, optional `details` JSX (appended after the name). VaultView passes character-specific details; BestiaryView passes monster-specific. Per CLAUDE.md's earlier "lift to a shared component if a second destructive action surfaces it" note — this was that second destructive action.
- **Slice 3 (5e.tools URL import)**: the Bestiary "+ Add monster" button now opens an `AddMonsterPicker` modal with two paths — *Start blank* (existing behavior) and *Import from 5e.tools URL*. The URL path expands to a `<input>` + Import button; on submit, the renderer calls `window.grimoire.importMonsterFrom5etools(url)` (preload bridge → main-process IPC handler in `electron/main.cjs`). The main handler parses the hash to extract `<name>` and `<source>`, fetches `https://5e.tools/data/bestiary/bestiary-<source>.json` via global `fetch` (no auth — 5e.tools is publicly accessible, unlike the GitHub releases API), finds the monster matching name+source, and runs it through `mapFiveEtoolsMonster()` to normalize the shape. Errors propagate back to the modal and render inline so the user can edit the URL without losing context. Successful imports overlay the mapped shape onto a fresh `makeBlankMonster()` so the bestiary invariants (id, `active: false`, `folderId: null`) stay intact. Folder-level "+ add here" stays blank-only — quick action for organizing.
- **5e.tools data shape, learned from the wild:** URL fragment is `<encoded-name>_<source-lowercase>`; the *last* `_` separates name from source (names contain encoded spaces, not underscores). JSON source codes are uppercase even though URLs lowercase them. Bestiary files live at `/data/bestiary/bestiary-<source>.json` with a top-level `{ monster: [...] }`. Stat-block fields use a mix of shapes: `size` is a single-letter array (`["S"]`), `type` can be a string or `{ type, tags }`, `alignment` is an array of letter codes, `ac` is either a number or `[{ ac, from }]`, `hp` is `{ average, formula }`, `speed` is an object keyed by movement type. Inline references use `{@tag value|extra...}` markup which we strip down to readable text via `stripFiveEtoolsTags`. Action/trait/legendary `entries` arrays can nest, so `entriesToText` walks them recursively.
- **5e.tools 403 / Cloudflare gotcha:** the main `5e.tools` host sits behind Cloudflare and rejects bare Node fetches — even with `Mozilla/...` User-Agent and Cloudflare-passing-looking headers, Node's global `fetch` (undici) gets a 403 because the TLS fingerprint and request semantics give it away. `fetchBestiary` therefore uses **`net.fetch` from Electron's `net` module** (Chromium networking stack) instead of the global `fetch`. That sends the request through the same network code a real browser tab uses, which passes Cloudflare's bot check. Mirrors fall back to the public `5etools-mirror-{1,2,3}.github.io` GitHub Pages copies (no Cloudflare, so even Node fetch would work there). Some less-common sources (homebrew supplements, recent releases) only live on the main host, so net.fetch + Cloudflare-via-Chromium is the path that makes them reach. If all four hosts fail, the error lists each URL + its status so the failure is diagnosable.
- **HMR caveat:** main-process changes (`electron/main.cjs`, IPC handlers, preload) **do not hot-reload** — restart `npm run electron:dev` to pick them up. Vite's HMR only covers the renderer.
- **Stat block view (between slices 3 and 4)**: monster cards in the Bestiary now show a two-line compact summary (size+type+alignment / `CR · AC · HP`) when stat-block data is present. Clicking the card body opens a `StatBlockModal` rendering the full classic 5e stat block: identity, AC/HP/Speed, the six-ability grid with score + modifier, saves/skills/senses/languages/CR, then trait/action/legendary-action sections. Card-body click uses the same `data-card-action` skip pattern from VaultView so the active checkbox, folder picker, rename input, and overflow menu don't trigger the modal. Empty (blank-monster) cards show a small "no stat block — import from 5e.tools" hint, and the modal renders a matching prompt rather than empty sections.
- **Slice 4 (DM Roll surface)**: `DmRollView` renders each active monster as a card with the monster's actions, legendary actions, saves, and skills laid out as clickable buttons. Click composes through the same `compose()` as player Roll — `!attack "<action name>"` / `!save <ability>` / `!check <skill>` — and targets / modifiers / custom bonuses flow through the shared `RollSidePanel`. Each card also has a `↻ init add` button that bypasses the composer and emits `!i madd "<monster name>"` — Avrae's monster-add subcommand auto-loads stats + actions from its bestiary and rolls init from Dex (separate code path; init-add isn't one of compose's kinds and doesn't take targets/modifiers). History labels prefix with the monster name (`Adult Lunar Dragon · Bite`) so it's distinguishable across multiple active monsters.
- **Action lookup tip**: `!attack` on Avrae matches by name against the current combatant's loaded actions. The 5e.tools importer slugifies action ids (`tail_slap`) but stores the original `name` (`Tail Slap`); DmRollView's buttons emit the **name** as the id so the quoted string in the composed command matches Avrae's lookup. (The slug-id is still useful as a stable React key.)
- **`RollChrome` extraction (slice 4 refactor)**: the side panel, targets panel, and fixed-bottom composer bar previously inlined in `RollView` are now in `src/views/RollChrome.jsx`, exported as `RollSidePanel` and `ComposerBar`. Both `RollView` and `DmRollView` import them; behavior is unchanged on the player side. If a third roll surface ever appears (encounter builder? party turn order?), it imports from here too.
- **Slice 5 (JSON import path)**: `AddMonsterPicker` adds a third creation path — *Import from JSON* — alongside *Start blank* and *Import from 5e.tools URL*. The JSON path expands the modal to a textarea + `📁 Load .json file` button + Import; the file picker just fills the textarea so the user can review before submitting (matches the Backup-and-Restore confirm-before-applying pattern). Main-process IPC handler `import-monster-from-json` parses the text, accepts either a bare 5e.tools monster object (`{ name, source, ... }`) or a bestiary wrapper (`{ monster: [{...}] }`) with a single entry, and runs the result through the same `mapFiveEtoolsMonster()` the URL importer uses. Multi-monster pastes throw a clear error rather than silently taking the first one. This path is the workaround when 5e.tools is unreachable / blocking, when the source is missing from the public mirrors, or for homebrew monsters not on 5e.tools at all.

### Character vault (v0.8+)

- The app's launch surface is the **Vault** (`mode = 'vault'`) — a grid of character cards, one per character in `state.characters`. Clicking a card sets `activeCharacterId` and routes to Roll. The `mode` value is session-only (not persisted), so every launch starts at the vault.
- State shape (schema v2):
  ```
  {
    schemaVersion: 2,
    characters: { [id]: <character> },     // map keyed by stable 8-char base36 id
    activeCharacterId: <id>,                // which character drives Roll/Character/Targets/Modifiers
    globalModifiers: [<mod>],               // shared across all characters
    targets: [...], folders: [...],         // shared across all characters
    settings: { theme, fontPreset, … },     // app-wide UI prefs
  }
  ```
  Each character carries `id`, all the existing v1 character fields, plus `portrait` (base64 data URL or `null`) and `modifiers` (per-character mod list — empty by default; slice 4 wires the merge).
- **Per-character vs global slices:** character sheet, attacks, spells, slot counts, per-character modifiers, portrait → **per-character**. Targets, folders, global modifiers, settings → **global** (shared across all characters). Roll-view ephemeral state (active mods, composed cmd, history, etc.) resets on character switch — switching is "I just opened the app as character X", not "resume mid-roll".
- **Reset-on-switch mechanic**: an effect in `App.jsx` keyed on `activeCharacterId` clears the Roll ephemerals. Per-view internal state (e.g., the Spells accordion's per-row expansion) is reset by re-mounting RollView/CharacterView/ModifierForgeView with `key={activeCharacterId}`.
- **Header behavior**: the `GRIMOIRE` title is a clickable back-to-vault button (every mode, even within the vault — clicking does nothing harmful there). The four nav tabs (Roll/Character/Targets/Modifiers) only render when there's an active character. The d20 Settings button always renders.
- **Migration (v1 → v2)**: handled in `migrateV1ToV2` in `state.js`. The old single `character` becomes a one-entry vault; the old `modifiers` list becomes `globalModifiers` (preserves their "shared everywhere" semantics — they were the only mod library before). `loadState` and `parseImport` both call the migrator, so existing localStorage and existing v1 backup files both upgrade automatically.
- **Default modifier library** trimmed in v2 to four universally-applicable modifiers (Advantage, Disadvantage, Bless, Bardic Inspiration). The others that were class/build-specific (Sacred Weapon, Divine Smite, etc.) belong in a character's private modifier library — that wiring lands in slice 4 of the vault feature.
- **Initialization**: `defaultVault()` in `state.js` produces the fresh-install state — one blank character named "Default Character", the four default global modifiers, empty targets/folders, default settings.
- **Vault CRUD** lives in `App.jsx` helpers and is exposed via props to `VaultView`:
  - `renameCharacter(id, name)` — display-only field; the character's id stays stable across renames so per-character React state and external references aren't disturbed.
  - `duplicateCharacter(id)` — deep-clones via `JSON.parse(JSON.stringify(...))`, assigns a fresh id, and appends ` (copy)` to the name. Portrait and per-character modifiers come along so duplicates are real spares, not blanks.
  - `deleteCharacter(id)` — has two safety nets: if the deleted character was the active one, `activeCharacterId` retargets to a surviving sibling; if the deletion would empty the vault, a fresh blank Default Character is auto-seeded and made active so views never face a no-character state.
- **Card UX**: Vault cards are clickable `<div role="button">`s (not `<button>` elements) so the action menu's `<button>` children can nest cleanly. A `data-card-action` attribute on the menu / rename-input wrappers lets the card-click handler ignore clicks that originate inside an interactive child (via `e.target.closest('[data-card-action]')`). The ⋮ overflow menu opens a small dropdown with Rename / Duplicate / Delete; outside-click and Escape close it. Rename is inline on the card (text input replaces the name display); Delete opens the confirm modal.
- **Confirm-delete modal**: blocks accidental deletion behind typing `DELETE` exactly. Backdrop click and Escape cancel; the Delete button is disabled until the input matches and Enter doesn't fire on a half-typed string. Lives in `VaultView.jsx` for now; lift to a shared component if a second destructive action surfaces it.
- **Add-character method picker (v0.8+, slice 5)**: clicking the "+ Add Character" empty card in the vault opens `AddCharacterPicker` (in `VaultView.jsx`) with two creation paths today — *Start blank* (fresh `makeBlankCharacter`) and *Import from PDF* (file picker → `importDdbPdfFile` → seed the patch into a fresh blank via `applyCharacterPatch`). Both paths use `addAndEnterCharacter` in `App.jsx` so the new character is added to the vault AND the app routes into it in a single batched render. **Two PDF-import flows now exist and they're not interchangeable:** the CharacterView "Import Character sheet" card **overwrites** the active character (existing behavior, preserved); the Vault empty-card "Import from PDF" **creates** a new vault entry without touching anything else. Both share the `applyCharacterPatch(character, patch)` helper in `state.js` which merges sub-objects (hp/abilities/saves/skills/spellSlots) but replaces top-level scalars and the attacks/spells arrays wholesale. Extra import sources can be added as more buttons in the modal later — DDB JSON was removed in v0.5+ so PDF is the only one currently.
- **Modifier scopes (v0.8+, slice 4)**: every modifier lives in *exactly one* of two lists — `state.characters[id].modifiers` (per-character) or `state.globalModifiers` (shared across all characters). Membership in a list determines scope; modifier objects themselves don't carry a `global: true` field. **New modifiers default to character-private** — the editor's "Global" checkbox is the only way to promote one. The four `DEFAULT_MODIFIERS` (Advantage, Disadvantage, Bless, Bardic Inspiration) seed the global library on fresh installs because they're universally applicable. RollView consumes a merged list (`mergedModifiers` derived in `App.jsx`); character-private wins on the rare id collision so a character can override a global by sharing an id. ModifierForge receives both lists + their setters so it can route updates/deletes/duplicates to the owning list, and the Global toggle moves a modifier between lists while preserving its id (so any `excludes` references and any active-mods toggle survive the move).
- **Portraits**: stored on each character as `character.portrait` — either `null` (silhouette fallback) or a base64 `data:image/jpeg;base64,…` URL. Upload UI is in `CharacterView` → Identity (`PortraitField`); display is in `VaultView` cards (80px), the Roll-view header (48px), and the Character editor (120px), all via `PortraitDisplay` in `components.jsx` so the appearance stays consistent. The resize helper `fileToPortraitDataUrl` (also in `components.jsx`) center-crops to a square, downscales to 256×256, and emits JPEG at q=0.85 — typical output is 15-60KB, well under localStorage's per-origin budget even with a vault of 20+ characters. Files larger than 10MB raw are rejected with a typed error; non-image files likewise. PNG transparency is intentionally NOT preserved (JPEG is small + portraits rarely need alpha) — if that ever matters, swap `image/jpeg` → `image/png` in the helper.

### Backup & Restore / cross-device sync (v0.6+)

- Settings → **Backup & Restore** exposes Export (download JSON) and Import (file picker, with confirm) buttons. Helpers live in `state.js`: `downloadExport(state)` and `parseImport(text)`.
- The exported JSON file mirrors the localStorage payload — v2 shape is `{ schemaVersion, characters, activeCharacterId, globalModifiers, targets, folders, settings }` — plus an `exportedAt` ISO timestamp for human provenance. A round-trip (export → import) is intentionally lossless.
- Filename pattern: `grimoire-<slugified-name>-YYYY-MM-DD.json`. With one character the slug is that character's name (preserves the v1 feel); with multiple it's `vault`.
- Import **replaces** all data — no merge. There's no per-section "import just spells" mode by design; merge semantics for richly-nested per-character data get confusing fast, and the destructive choice is gated behind a `window.confirm()`.
- `parseImport` validates: valid JSON, top-level object, then either (a) `schemaVersion === 1` → auto-migrate via `migrateV1ToV2` so older single-character backups keep working forward, or (b) `schemaVersion === SCHEMA_VERSION` with a `characters` map. Anything else throws a typed error that surfaces in the UI status line.
- After a bulk replace, the app returns to the vault so the user sees what just landed before diving back into a character.
- The bulk-replace is wired through `replaceState(next)` in `App.jsx` — it splats each slice into its useState setter, so the persist `useEffect` fires once afterward and the new state lands in localStorage too.
- Sync is intentionally manual — the user moves the file across devices via whatever cloud storage they already use (Dropbox, OneDrive, email-to-self, etc.). Automatic options were considered and explicitly declined; don't re-pitch them.

### App icon + Credits (v0.6+)

- The app icon at `build/icon.ico` is a multi-resolution ICO (16 / 32 / 48 / 256) embedded with the Microsoft-recommended Windows icon set. electron-builder picks it up automatically — if it's missing the build log will say `default Electron icon is used  reason=application icon is not set`. **That warning being gone from the build log is the canonical confirmation the icon was embedded.**
- The icon source is a "blood moon" photograph by Andrew McCarthy (@AJamesMcCarthy on X), used with credit. The original is ~6391×4939; it was center-cropped to a 4939×4939 square (the moon is roughly centered horizontally) and resampled to the four target sizes, then packed via `npx png-to-ico` into the multi-res ICO. The build process is one-off / regeneration-only — `build/icon.ico` is committed to the repo and won't be rebuilt unless someone wants to swap the source. Don't commit the intermediate PNGs.
- **PowerShell binary-redirect gotcha:** `npx png-to-ico ... > icon.ico` from PowerShell corrupts the binary with a UTF-16 BOM (PS encodes stdout as UTF-16 text by default). Use `cmd /c "npx png-to-ico ... > icon.ico"` instead — cmd does raw byte redirect. Verify with `[BitConverter]::ToString($bytes[0..3])` — a valid ICO starts with `00-00-01-00`.
- `SettingsView.jsx` includes a **Credits** section that surfaces attribution for non-original assets. Links go through the existing `window.grimoire.openExternal` preload bridge (the same one Updates uses for the "open releases page" button) so they open in the user's default browser rather than inside the Electron renderer. The handler defensively no-ops if the bridge isn't present (e.g., when the renderer is loaded outside Electron during preview-tool verification).

### Updates (v0.5+)

- In-app update check + download lives in `SettingsView` → Updates section. Main-process IPC handlers live in `electron/main.cjs`; preload exposes `window.grimoire.checkForUpdate / downloadAndInstall / getVersion / openExternal / onDownloadProgress`.
- Because the repo is private, the GitHub API and asset downloads need auth. **Instead of embedding a token in the binary** (which would leak if the .exe is shared), `getGhToken()` shells out to `gh auth token` on the user's machine. Both of the user's devices already have `gh` authenticated, and this dodges the "shipped credential" footgun.
- Asset endpoint requires `Accept: application/octet-stream` to return binary; the `https.get` wrapper follows redirects (GitHub serves assets via a redirect to a signed S3 URL).
- The Setup installer is preferred for auto-update (NSIS handles "upgrade over existing install"); the portable target is not used here. The "Open releases page" fallback button surfaces only in the error state (when `gh` is missing or auth is stale) so successful checks stay visually uncluttered.
- **GitHub asset-name dot-substitution gotcha:** GitHub silently replaces spaces in uploaded asset filenames with dots. `Grimoire Setup 0.7.0.exe` on disk gets served as `Grimoire.Setup.0.7.0.exe` by the API. The asset-filter regex in `check-for-update` must not assume any specific separator — use `/setup/i.test(a.name) && /\.exe$/i.test(a.name)`, not `/Setup .*\.exe$/`. A space-anchored regex matched nothing, so `setupAsset` came back undefined, `asset` was null in the IPC response, and the renderer's "↓ download & install" button never rendered (only "check for updates" worked). Fixed in v0.7.1+.
- After download, `shell.openPath` runs the installer; the user accepts the UAC prompt and closes Grimoire so NSIS can replace it. Auto-quit-and-relaunch is not wired up — keep it manual so unsaved state isn't lost without warning.

### Targets & folders (v0.3+)

- Targets persist with optional `folderId`. Folders are top-level state alongside targets.
- Roll view's TARGETS panel renders folders as collapsible groups; selection is ephemeral, list/folders persist.
- Editing happens in the dedicated Targets view (header tab next to Modifiers); the Roll view's panel is selection-only.

## D&D Beyond PDF import — schema notes

DDB's fillable PDF (the WOTC-template form) uses these conventions, learned from the wild:

- `CLASS  LEVEL` (note: two spaces) for class+level
- `RACE` (still uppercase) even on 2024 sheets that visually show "SPECIES"
- Saves: `ST Strength` etc. for mods, `StrProf`/`DexProf`/... for prof markers (value `•`)
- Skills: bare names like `Acrobatics`, `Animal` (NB: Animal Handling's mod field is `Animal`, prof is `AnimalHandlingProf`); prof markers `P` (proficient) or `E` (expertise)
- Sleight of Hand uses mixed casing: mod at `SleightofHand`, prof at `SleightOfHandProf`
- HP: `MaxHP` / `CurrentHP` / `TempHP`
- Weapons: first weapon at `Wpn Name` (no number), rest at `Wpn Name 2..6`; bonus/damage at `Wpn1 AtkBonus` / `Wpn1 Damage` for all 6
- Spells: indexed `spellName0..N`, partitioned by level via `spellHeader0..N` walked in document annotation order (page → y descending)
- Slot counts: `spellSlotHeader<L>` text like "4 Slots OOOO"
- Prepared status: `spellPrepared<N>` — **only `P` (always prepared, from class feature / racial trait) maps to `prepared: true`**. `O` (known / in spellbook) and empty both map to `prepared: false`. Daily preparation is treated as a runtime decision the user toggles in the Character editor, so re-importing doesn't trample manual selections. **Cantrips (level 0) are forced to `prepared: true` at import regardless of the field value** — they're at-will in 5e, so they should pass the prepared filter by default. The user can still untoggle a cantrip in the editor if they want it hidden.

Some DDB field names have trailing whitespace (`DEXmod `, `Stealth `); `readField` normalizes via `replace(/\s+/g, ' ').trim()`.

`checkboxTrue` accepts any non-empty non-"off" value as proficient since DDB markers are arbitrary characters. The `'E'` marker on a skill upgrades to expertise.

DDB sometimes lists a spell twice (e.g. native list + "Always Prepared" entry); the importer dedupes by id within each level, and weapons dedup overall.

**Level assignment is index-range based, not document-order based.** Earlier versions walked widgets in document order and tagged each `spellName<N>` with whatever `currentLevel` had been set by the most recent `spellHeader<H>`. That failed on DDB sheets where an end-of-document "Always Prepared" recap appends extra `spellName` widgets *after* the highest-level header — those widgets got walked with `currentLevel = (highest header)` and incorrectly tagged. The current algorithm relies on DDB laying spellName indices CONTIGUOUSLY within each level (cantrips 0-N₀, 1st-level N₀+1-N₁, etc.) and works in two passes:
1. Walk widgets in document order, bucketing each `spellName<N>` into `indicesPerLevel[currentLevel]` exactly as before (some pollution can still land in the highest bucket).
2. For each level whose bucket is non-empty, derive its `startIdx` as the smallest index in the bucket that's strictly greater than the previous level's `startIdx`. This drops out-of-order polluters automatically. Then map every `spellName<N>` to its level by finding the largest range with `startIdx ≤ N`.

If a sheet ever breaks the contiguity assumption (level B's indices interleaved with level A's), this would mis-assign — but DDB hasn't been observed to do that. The `[grimoire] pdf: spell-level ranges` log line prints the derived ranges, which is the right first check when something looks off after future DDB layout shifts.

Header-level extraction prefers the value text (`levelFromHeaderText` matches "CANTRIP" or the first digit) and falls back to the `spellHeader<H>` field-name suffix when the value isn't parseable — that fallback is what keeps a "Always Prepared" label (no digit) from blocking `currentLevel` updates for the section that immediately follows.

After parsing, `mapSpells` sorts each level's spell array alphabetically by display `name` (case-insensitive, locale-aware via `localeCompare` with `sensitivity: 'base'`). The PDF's encoded order is whatever DDB exported (often class-source clustered) and isn't useful in-app; alpha order makes a long spellbook navigable in the Character editor and in the Roll view's spell grid. Array#sort is stable in modern JS, so any duplicates that slipped past dedup keep their relative order.

The Character view's PDF import section has a diagnostics panel with field/widget filters — useful when DDB shifts the layout again.

## Settled-by-design (don't re-pitch)

- **Releases are unsigned.** Grimoire is a personal app for the owner's own machines; the SmartScreen first-run prompt is acceptable, and an EV/OV cert isn't worth the recurring cost. The build still runs `signtool.exe` for a placeholder signature so the resource section is well-formed.
- **Cross-device sync is manual (JSON export/import).** Automatic options — cloud-folder watcher, gist-based — were considered and declined. The single-machine-at-a-time workflow + manual file move is the design, not a stub.

## Windows toolchain quirks

- PowerShell on user's machine has ExecutionPolicy that blocks `npm.ps1`. Always use `npm.cmd` (and `npx.cmd`) explicitly when shelling from PowerShell.
- Bash tool invocations don't see Windows-installed Node/Rust/gh — use the PowerShell tool for those.
- New PowerShell sessions start with stale PATH. Prefix `$env:Path += ';C:\Program Files\nodejs';` (or refresh from machine env) before npm calls.
- electron-builder needs Windows Developer Mode enabled (or admin shell) to extract winCodeSign symlinks. User has Developer Mode on.

## Cross-device workflow

- Repo is at https://github.com/Grimoire-z/grimoire (private)
- New device setup: `gh auth login` → `git clone` → `npm install` → `npm run electron:dev`
- Prereqs: Node ≥22.13 (Node 24 LTS recommended — ESLint 10 / Vite 8 / pdfjs-dist 5.7 EBADENGINE warn below that), git, gh — all installable via `winget`
- Workflow across machines: ask for a commit + push when context-switching; `git pull` on the other side picks up everything including this CLAUDE.md
- localStorage data (character vault, modifiers, targets, folders, settings) doesn't sync automatically across machines — use Settings → Backup & Restore for manual JSON export/import. Automatic sync is settled-by-design above, not an open item.

## Releases

For "I just want to use the app on this device" rather than dev: download the latest release from https://github.com/Grimoire-z/grimoire/releases. Repo is private, so clicking through requires being signed in to a GitHub account on `Grimoire-z`'s team.

Two artifacts per release:
- `Grimoire Setup <version>.exe` — NSIS installer; lets you choose install dir, creates Start-menu shortcut, listed in Add/Remove Programs.
- `Grimoire <version>.exe` — portable single-file; runs anywhere with no install.

Both are x64 only (no 32-bit / arm64 build target), unsigned (signed with placeholder signtool only — Windows SmartScreen will warn on first run, click "More info" → "Run anyway").

### Cutting a new release

1. Bump `version` in `package.json` (semver: minor for new features, patch for fixes).
2. Update CLAUDE.md per the working agreement (open work list, architecture changes, etc.).
3. Commit + push.
4. `npm run dist` from the project root. Output lands in `release/` (which is gitignored). Takes ~30s on a warm machine, longer on first run while `electron-builder` downloads winCodeSign + nsis archives. Default Electron icon is used unless `build/icon.ico` exists.
5. `git tag v<version>` then `git push origin v<version>`.
6. `gh release create v<version> "release/Grimoire Setup <version>.exe" "release/Grimoire <version>.exe" --title "v<version>" --notes "..."` to publish on the Releases page with the two exes attached.

`npm run dist:dir` skips the installer/portable packaging and just produces `release/win-unpacked/Grimoire.exe` for quick smoke-testing — useful when iterating on packaging config without paying the NSIS build cost.

## Working agreement (Claude)

Every commit that introduces new project knowledge must update CLAUDE.md in the same commit. "New project knowledge" includes: architecture decisions, schema discoveries (especially DDB layout shifts), scope changes, items added to or crossed off the open-work list, gotchas worth remembering, and any "we decided X because Y" moments.

Before staging a commit, pause and ask: would a Claude on another device, pulling only this commit, need this written down to keep working? If yes, the CLAUDE.md edit ships in the same commit as the code. If no, that's fine — but make the check explicit so the memory sync isn't skipped by accident.

This keeps the cross-device loop unbroken: a `git pull` on the other side delivers the code change *and* the reasoning behind it together, no out-of-band handoff required.
