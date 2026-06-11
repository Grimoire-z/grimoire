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
- `src/main.jsx` — Vite entry; wraps `<App/>` in `<ErrorBoundary>` inside StrictMode
- `src/ErrorBoundary.jsx` — class error boundary; catches render-time throws and shows a recovery panel (download-raw-backup-from-localStorage + reload). Self-contained: imports nothing from app modules so it stays functional regardless of what broke
- `src/App.jsx` — top-level component: header, vault/bestiary routing, mode switching (Vault / Bestiary / Roll / Character / Targets / Modifiers / Settings). Holds the `characters` map + `activeCharacterId` (player mode) and the `monsters` map + `monsterFolders` (DM mode). Derives `activeCharacter` from the active id. Header nav list is `MODES_PLAYER` or `MODES_DM` based on `settings.dmMode`.
- `src/state.js` — `DEMO_CHARACTER` (the Thora sample — reference only, NOT what fresh installs seed) + `BLANK_CHARACTER` (the true-empty template `makeBlankCharacter` deep-clones per call), DEFAULT_MODIFIERS, DEFAULT_SETTINGS (incl. `dmMode`), SAVE_DEFS, SKILL_DEFS, EFFECT_LABELS/PLACEHOLDERS/DESCRIPTIONS/HAS_VALUE/NO_VALUE_BLURB (effect-type registry consumed by ModifierForge + composer), `makeId`/`makeShortId`/`makeCharacterId`/`makeBlankCharacter`/`makeMonsterId`/`makeBlankMonster`/`defaultVault` (id + vault helpers), `migrate` chain (v1→v2→v3→v4, called inside `loadState` and `parseImport`), `loadState`/`saveState` (with data-loss guards — see "Data integrity"), `downloadExport`/`parseImport`
- `src/composer.js` — pure command composition (compose, composeFromMod, substituteParams, quoted)
- `src/dnd.js` — shared folder drag-reorder: `reorderItem(arr, from, to)` pure splice + `useFolderDragReorder({index, onReorder})` hook (returns `handleProps`/`dropZoneProps` to spread). Used by TargetsView's FolderCard and RollChrome's TargetGroup so the DnD logic lives in one place
- `src/ddbPdfImport.js` — D&D Beyond fillable PDF importer; uses pdfjs-dist worker via `?worker` Vite import. Kept as a fallback path; the primary import flow in v0.9.3+ goes through `ddbJsonImport.js` (see "DDB character refresh" below). pdfjs-dist itself is dynamic-imported via a memoized `loadPdfjs()` helper inside this file — keeps the main bundle ~270KB instead of ~660KB. **Don't re-add a top-level `import * as pdfjs from 'pdfjs-dist'`** or the chunk-split benefit goes away.
- `src/ddbJsonImport.js` — DDB JSON importer (v0.9.3+). Maps the `exportData` blob that DDB's web client POSTs to `character-service.dndbeyond.com/character/v5/pdf` into our character-patch shape. Consumed by both the in-app Refresh-from-DDB flow (network-layer webRequest interception) and the JSON paste/file fallback paths. Also exports `DDB_BOOKMARKLET` — kept for reference / extreme fallback, but it doesn't reliably intercept since DDB's bundle caches `window.fetch` at module load.
- `src/components.jsx` — shared (Checkbox, TabBar, ActionCard, ModifierRow, FieldLabel, SectionCard, D20Icon, PortraitDisplay, fileToPortraitDataUrl, ConfirmDeleteModal)
- `src/themes.js` — registry of color themes and font presets surfaced in SettingsView (paired with CSS blocks in `index.css`)
- `src/views/RollView.jsx` — player composer view. **Three-column unified layout** (Saves | Skills | Attacks-or-Spells) instead of tab-paginated pages — see "Roll-page unified layout (v0.9.2+)" below. Side panel (Targets + Modifiers + custom bonuses) and the fixed-bottom command bar live in `RollChrome.jsx` and are shared with `DmRollView`.
- `src/views/RollChrome.jsx` — shared roll-surface chunks (`RollSidePanel`, `ComposerBar`, plus the internal `TargetsPanel`/`TargetGroup`). Both player Roll and DM Roll import from here. Targets panel folder list is height-capped + scrollable; each folder header has per-folder bulk select-all / reset buttons.
- `src/views/DmRollView.jsx` — DM Roll surface. Renders each active monster from the Bestiary as a card with clickable buttons for actions, legendary actions, saves, and skills (each composing `!attack` / `!save` / `!check` through the same `compose()` as player Roll). Header has a per-monster `!init add 1d20 "<name>"` helper button.
- `src/views/CharacterView.jsx` — Roll20-style sheet editor (identity, combat, abilities, saves, skills, attacks, spells, DDB import)
- `src/views/ModifierForgeView.jsx` — modifier library editor
- `src/views/TargetsView.jsx` — target book; folders + targets
- `src/views/SettingsView.jsx` — full-page settings (Updates + Backup & Restore + Theme + Fonts + Credits); reached via the d20 button in the header
- `src/views/VaultView.jsx` — launch page; grid of character cards + an "+ add" card. Clicking a card calls `enterCharacter(id)` in `App.jsx`, which sets `activeCharacterId` and routes to Roll. The GRIMOIRE header title is the way back from any mode.
- `src/views/BestiaryView.jsx` — DM mode's analogue of the vault: holds imported monster stat blocks, grouped into collapsible folder sections. Each card has an `active` checkbox (multi-select — multiple monsters can be active simultaneously) that surfaces them on the DM Roll page. Card shows a compact two-line summary (size+type+alignment, then `CR · AC · HP`) when stat-block data is present; clicking the card body opens `StatBlockModal`. Per-card overflow menu has Rename / Duplicate / Delete + a folder picker. Folder headers support inline rename + delete (folder delete moves contained monsters to Ungrouped). 5e.tools URL import + JSON paste / file import live in the Add-monster picker.
- `src/views/StatBlockModal.jsx` — the in-place stat-block view + editor. Renders the classic 5e layout (identity, AC/HP/Speed, six-ability grid with mods, saves/skills/senses/languages/CR, then traits/actions/legendary actions sections) in read mode. An `✎ Edit` toggle in the header flips every section to inline editable inputs that write through `setMonster(updater)` immediately — no explicit save step. Used by `BestiaryView`; pass `monster`, `setMonster`, and `onClose`.
- `src/index.css` — Tailwind import + custom theme classes (fonts are self-hosted, imported via `src/fonts.js` — no runtime network)
- `src/fonts.js` — `@fontsource` imports for the six families (bundled into dist by Vite); imported from `main.jsx`. Replaced the old runtime Google-Fonts `@import`
- `scripts/inspect-pdf.mjs`, `scripts/test-mapper.mjs` — offline diagnostic tools for tuning the PDF importer; useful when DDB shifts the layout

## Architecture notes

### Roll20-style character model (v0.3+)

- Saves are the fixed 6 ability ones; skills are the canonical 18. Lookups go through `SAVE_DEFS` / `SKILL_DEFS`. Per-character only `{mod, prof, expertise?}` overrides are stored.
- Spells: levels 0–9 (cantrips at level 0, no slot tracking). Per-level `{current, max}` slot tracking on levels 1–9.
- Attacks: free-form repeating list.
- Each attack/spell has `id` (Avrae's name for `!attack "<id>"` / `!cast "<id>"`) separate from display `name`. Also has optional `phrase` for per-action flavor text.
- Spells additionally carry an optional `prepared` bool. The Roll view's Spells tab has a "Prepared only" filter (persisted as `settings.preparedOnly`) which, when on, hides unprepared spells from both the level pagination and the spell grid. Character editor exposes a per-spell "Prep" chip and a `N/M prepared` count in each level header. Cantrips can be marked too — useful for "always show on my casting page" semantics even though 5e cantrips aren't technically "prepared".
- Character editor's Spells card uses a two-tier accordion (v0.6+): each level is collapsible (closed by default so a full spellbook compacts to one line per level), and each spell row inside has a compact form (name + Prep chip + ⚙ gear) plus a gear-expanded editor (id, name, sub, phrase, ✕ remove). Expansion state for both tiers is session-local React state (not persisted), since the point of defaulting to closed is to keep the view compact every session. Clicking `+ add` auto-expands both the level and the new (blank) spell so you land in edit mode immediately. Removal shifts higher per-spell open-keys down by one so state stays pinned to the right entry instead of drifting.

### Roll-page unified layout (v0.9.2+)

The player Roll view replaces the old tab-paginated UX (Attacks | Spells | Saves | Skills, one at a time) with a **three-column single-window layout** so the user never has to swap pages to see what's available. DM Roll is unchanged — per-monster cards already had every action kind on one surface, so the "swap-between-pages" problem only applied to the player side.

- **Column proportions**: 1 : 2 : 3 on a nested 6-col grid inside the `lg:col-span-3` left section. Saves | Skills | Attacks-or-Spells.
- **Compact rows everywhere** — `ActionCard` (the big two-line button) is no longer used here. Each list is a vertical stack of single-line `CompactRow`s with click-to-fire behavior. Rows use the new `.divide-gold` CSS utility (added in `index.css`) for faint inter-row separators.
- **`lastFired` highlighting**: clicking a row sets `{kind, id}` in local state; the matching row gets `bg-active glow-active` so users can see which row produced the current composed command. Reset on character switch via the existing `key={activeCharacterId}` remount.
- **Proficiency dots are tri-state** via `ProfDot`: hollow ring (untrained) / solid filled (proficient) / donut — outer ring + center fill (expertise).
- **Attacks/Spells column** has an internal pill toggle. The old `tab` state in App.jsx is still around but is now meaningful only for `attacks` vs `spells` — saves/skills are always visible and don't go through it. `ActionsColumn` defensively coerces other values to `attacks`.
- **Per-spell upcast dropdown** lives on each spell row. Options run from the spell's native level up to L9 (Fireball → L3-L9, Magic Missile → L1-L9, Wish → L9 only). Cantrips intentionally skip the dropdown — they don't upcast in 5e. State key changed: `castLevel` was `{ [level]: castAt }`, now `{ [spellId]: castAt }`. The per-level "at:" picker in the spell-level header was removed since each spell carries its own choice. Default per spell = its native level, so picking nothing yields `!cast "fireball"` (no `-l` flag); the dropdown only emits `-l N` when `upcastTo > level`.
- **Spell slots tracker** (`SpellSlotsTracker`) lives in the saves column, under the Saves card, sharing its `md:col-span-1` cell via a `space-y-3` wrapper. One row per leveled slot (1-9) with `max > 0`; cantrips skipped (at-will). Each row shows the level + dots (filled = available, hollow = expended) that grow leftward outward. A `↻ reset` button in the column header (via `ColumnHeader`'s new optional `right` slot) refills every slot to max — long-rest shortcut. Clicking a filled dot expends one, clicking a hollow dot restores one (clamped to [0, max]). Writes go through `setActiveCharacter` (passed as `updateCharacter` to RollView), so the spell-level header's `L1 · 3/4 slots` text and the character sheet stay in lockstep — no extra wiring.
- **Targets panel cap**: the folder list inside `TargetsPanel` (in `RollChrome.jsx`) is capped at `max-h-[29vh]` with `overflow-y-auto scrollbar-thin` so big target books don't push the modifier list off-screen. The header (count + clear-all) stays pinned above the scroll area.
- **Per-folder bulk select**: each folder header in `TargetGroup` shows `all` + `reset` text buttons that select-all or clear selections *for that folder only*. Disabled state when there's nothing to do. The collapse-toggle on the chevron+name had to be split from a single `<button>` row into a flex container of three sibling `<button>`s because HTML doesn't allow nested buttons.

### DDB character refresh (v0.9.3+)

One-click "refresh this character from D&D Beyond" lives in `CharacterView`'s Import card as the **primary** import path. Each character carries a `ddbUrl` field (added to `DEFAULT_CHARACTER`, empty by default — no migration since missing-field is treated as empty). Paste the character's DDB page URL once; subsequent refreshes are two clicks (Refresh button, then DDB's Print/Download button inside the embedded window).

- **Endpoint we ride on**: DDB's `POST https://character-service.dndbeyond.com/character/v5/pdf`. The server isn't generating the PDF from a character ID — the web client *assembles* the full structured character into an `exportData` JSON string and POSTs it; the server just renders. So intercepting the request body gives us everything we'd want, in pre-computed JSON form, far richer than the fillable-PDF schema.
- **Auth shape (don't try to replicate manually)**: requires `Authorization: Bearer <JWT>` (5-minute lifetime, refreshes constantly) **plus** DDB session cookies. Reproducing this auth flow in our own HTTP code is a maintenance nightmare. The embedded-BrowserWindow approach sidesteps it entirely — we ride on DDB's own web client.
- **Why network-layer interception instead of a bookmarklet** (`electron/main.cjs` → `refresh-character-from-ddb` IPC): DDB's bundle captures `window.fetch` at module load. Any JS-level monkey-patch applied after the page is running (bookmarklet, devtools snippet, injected script) misses the call — they call through the captured reference, not `window.fetch`. `session.webRequest.onBeforeRequest` is on the **network layer** (same place 5e.tools's `net.fetch` workaround lives) and observes the request as it leaves Chromium's networking stack regardless of how the renderer's JS called fetch.
- **Session isolation**: uses `session.fromPartition('persist:ddb')` — DDB cookies live in their own jar, isolated from the main app's session. First refresh shows DDB's login page inside the BrowserWindow; cookies persist across launches so subsequent refreshes find auth already in place.
- **Capture logic** (`main.cjs`): registers `onBeforeRequest` for `*://character-service.dndbeyond.com/character/v*/pdf*`, observes `details.uploadData`, concatenates byte buffers to UTF-8, sanity-checks the body contains `exportData`, resolves the Promise with `{ body }`. Always calls `callback({})` to let the request proceed — DDB's own PDF download still works as a side effect. Detaches the listener after the first capture so a second click doesn't try to resolve an already-fulfilled Promise. The window closes 800ms after capture (giving DDB's request time to complete; closing earlier aborts their PDF mid-flight which is jarring).
- **Cancellation**: `win.on('closed')` resolves with `{ cancelled: true }` if the user closed the window without clicking Print. Renderer treats that as a soft status, not an error.
- **`parseDdbJson` (in `ddbJsonImport.js`) accepts three input shapes**, so both the Refresh flow and manual paste fallback funnel through one mapper:
  1. Bookmarklet wrapper: `{ characterId, exportData: <object> }`
  2. Raw DevTools payload: `{ characterId, exportData: "<json string>" }` — the server-side parse hasn't happened yet, so the field is still a JSON-encoded string
  3. Bare exportData object — when the user extracted it some other way
- **`exportData` shape quirks worth knowing**:
  - `stats[]` carries both ability scores AND save modifiers + prof level. We split them: abilities → `patch.abilities`, saves → `patch.saves`.
  - Proficiency level encoding: 1 = untrained, 3 = proficient, 4 = expertise (2 is half-prof; we treat it as untrained since the boolean schema can't represent it). Same encoding for skills and saves.
  - `skills[]` uses display names ("Sleight of Hand", "Animal Handling") which we map to our camelCase ids via `SKILL_NAME_TO_ID` lookup. Unknown skill names (custom DDB skills) are silently skipped.
  - `attacks[]` carries pre-computed `toHit` + `damageString` + free-form `notes`. We assemble these into `sub` joined with ` · `.
  - `spells` is an array-of-arrays indexed by level (0–9). Cantrips are forced `prepared: true` at import (at-will in 5e); leveled spells respect `alwaysPrepared` only (mirrors the PDF importer's P-vs-O convention — daily prep is a runtime decision the user toggles in CharacterView, so re-importing doesn't trample manual selections).
  - `spellSlots[]` has separate pools per level (`combined: [wizardSlots, pactSlots]`). We **sum** the pool for our simple `{current, max}` schema — yes, wizard slots refresh on long rest while pact slots refresh on short rest in 5e, but the Roll-view slot tracker treats them as one bucket. Document if a user complains.
  - `armorClass` in DDB exports has been observed to be nonsensically low (Harkul's L13 wizard came through as `armorClass: 5`, ignoring Mage Armor / Spellwoven Robe). We import as-is and let the user override in the sheet — don't try to "fix" DDB's export.
- **Preload bridge**: `window.grimoire.refreshCharacterFromDdb(url)` returns `{ body }` or `{ cancelled: true }`. Throws (rejected Promise) on URL validation errors or page-load failures. The renderer side (`DdbImport` in `CharacterView`) gates the whole Refresh section on this bridge being present, so renderer-only verification contexts (plain `vite dev` without Electron) hide it instead of breaking.
- **HMR caveat**: `electron/main.cjs` / `electron/preload.cjs` changes don't HMR — restart `npm run electron:dev` after touching them. (Already documented under DM mode but worth restating since this section adds another main-process IPC handler.)

### DM/player mode separation (v0.9.4+)

DM mode and player mode each carry their own **independent** modifier library, targets, and folders. Flipping the `dmMode` toggle in Settings preserves everything on both sides — the active mode just picks which slices the views read/write.

- **New persisted slices** (schema v4): `dmModifiers`, `dmTargets`, `dmFolders` live alongside the existing `globalModifiers` / `targets` / `folders`. App.jsx wires the views conditionally based on `settings.dmMode`:
  - `DmRollView` reads `dmModifiers` + `dmTargets`/`dmFolders` (was `globalModifiers` + player `targets`/`folders` in v0.9.3 and earlier).
  - `TargetsView` reads/writes the DM versions when `dmMode` is on, regular slices otherwise.
  - `ModifierForgeView` receives `dmModifiers` in the `globalModifiers` slot when `dmMode` is on (the editor's "Global" library functionally becomes the DM library — see below).
- **Migration v3 → v4** (`migrateV3ToV4` in `state.js`) **deep-clones** `globalModifiers` into `dmModifiers` so DM mode keeps access to whatever the user had shared previously. Edits diverge from there — modifying a mod on one side doesn't touch the other side's copy. `dmTargets` and `dmFolders` start empty (targets are usually session-specific; copying the player set would just need pruning).
- **Fresh installs** seed `dmModifiers` with a clone of `DEFAULT_MODIFIERS` (the same Advantage / Disadvantage / Bless / Bardic Inspiration the player side gets), so the base buffs are present in both modes from day one.
- **`ModifierForgeView` accepts a `dmMode` prop** that adjusts behavior for the DM library context: the "This character" `ScopeGroup` hides (no character context exists), the Global library is relabeled "DM library", and `+ new` lands directly in the DM library instead of routing through the (no-op) character setter. The per-modifier Global scope toggle in the editor also hides — there's no character side to flip to.
- **Backup files** written from v0.9.3 or earlier auto-upgrade through the migrate chain on import; v0.9.4 backups carry all six slices (player + DM) so a round-trip is lossless.

### Modifier effect-type vocabulary (v0.9.4+)

The `+ add` button row in `ModifierForgeView`'s Effects section expanded from six effect types to thirteen, covering most of Avrae's argument vocabulary. The registry lives in `state.js` (one export per concern — `EFFECT_LABELS` for button text, `EFFECT_DESCRIPTIONS` for hover tooltips, `EFFECT_PLACEHOLDERS` for input hints, `EFFECT_HAS_VALUE` for type dispatch, `EFFECT_NO_VALUE_BLURB` for the EffectRow explanation when no value field is rendered); composer branches in `composer.js` emit the right Avrae flag for each.

| Type | Flag | Common use |
|---|---|---|
| `bonus` | `-b <v>` | Bless, Bardic Inspiration |
| `damage` | `-d "<v>"` | Sneak Attack, Hex, Hunter's Mark |
| `crit` | `-c "<v>"` | Improved Divine Smite, vorpal weapons |
| `adv` | `adv` | Advantage on the d20 |
| `dis` | `dis` | Disadvantage on the d20 |
| `ro` | `-ro <N>` | Reroll each die *once* if ≤ N — Great Weapon Fighting uses 2 |
| `rr` | `-rr <N>` | Reroll each die *repeatedly* until > N |
| `mi` | `-mi <N>` | Minimum die value (Empowered Spell etc.) |
| `max` | `-max` | Maximize every damage die (Empowered Evocation, Vorpal crits) |
| `dtype` | `-dtype "<v>"` | Damage type swap (Divine Smite turning slashing into radiant) |
| `hide` | `-h` | Hidden roll (DM-only) |
| `phrase` | `-phrase "<v>"` | Flavor text appended to the result |
| `raw` | passthrough | Any arbitrary Avrae arg |

Don't conflate `ro` and `rr` in tooltips — Great Weapon Fighting is specifically `-ro 2` (reroll once), *not* `-rr 2` (reroll repeatedly). The earlier v0.9.4 button labeled `Reroll low dice` with GWF as the example used the wrong flag; current labels are `Reroll once` (ro) and `Reroll repeatedly` (rr).

### Targets bulk import (v0.9.4+)

`TargetsView` has a `↓ import list` button next to `+ new folder` that opens an `ImportListModal`. Paste a list of names, pick a destination (existing folder / new folder / Ungrouped), optionally toggle auto-number-duplicates, preview the parsed result, and submit — all created in one `bulkImport` call.

- **Two input shapes** handled by `parseNameList`:
  - Plain list — newline- or comma-separated names.
  - Avrae command syntax — `-t "Name|conditions"` repeated, often all on one line (e.g. `-t "Harkul|" -t "Goblin 1|"`). When the input contains any quoted strings the parser prefers those (explicit marker of intent); the `-t`, quote marks, and `|...` suffix are all stripped, leaving just the name with any trailing number intact.
- **Auto-number duplicates** (on by default) suffixes repeated names with ` 1`, ` 2`, … so a `Goblin/Goblin/Goblin` paste becomes distinguishable in selection. Case-sensitive — `Goblin` and `goblin` stay distinct.
- **Folder creation** is in-flow: picking `+ create new folder…` reveals a name input and the folder gets created alongside the targets in the same submit (so we don't leave behind empty folders if the user bails).

### Data integrity (v0.10.0+, audit batch 1)

Hardening from the v0.10 audit pass. localStorage is the only store, so the failure modes below were all silent-total-data-loss before:

- **Schema-mismatch rescue**: `loadState` (state.js) used to return `null` (→ App seeds the demo vault → persist effect overwrites the real data) whenever the stored `schemaVersion` was unrecognized or the JSON was corrupt. The classic trigger is a **version rollback** on one machine (a stale portable exe and an installed build share the same `%APPDATA%/Grimoire` localStorage; the two dev machines also drift). Now `loadState` copies the raw bytes to a sibling key `grimoire.state.backup.v<tag>` before returning null, so the data survives until a build that understands it comes back.
- **Stale-build write guard**: `saveState` reads the stored `schemaVersion` first and **refuses to overwrite a payload whose version is higher than the running build's** (`{ ok: false, reason: 'stale-build' }`). An older build is effectively read-only against newer data. `saveState` returns `{ ok }`; App's persist effect captures it into `persistError` state and renders a **warning banner** (batch 5) so a failed save — quota or stale-build — is visible instead of a silent console.warn. (No debounce: per-keystroke writes are ~1-4ms and synchronous saves survive an abrupt close — deliberate.)
- **Blank ≠ demo**: `makeBlankCharacter` deep-clones `BLANK_CHARACTER` (empty attacks/spells, zeroed slots, blank saves/skills, neutral 10s) instead of shallow-spreading the fully-populated Thora demo. Fixes two bugs: "Start blank" / fresh installs / delete-last-character no longer produce a Thora clone, AND a silent importer (which only replaces `attacks`/`spells` when the patch carries them) no longer leaves Thora's 10 spells + slots on a non-caster import. The deep clone also kills a latent shared-nested-reference aliasing footgun across characters minted in one session. The Thora sample lives on as `DEMO_CHARACTER` (exported, currently unwired).
- **Error boundary**: `src/ErrorBoundary.jsx` wraps `<App/>`. A render throw (hand-edited backup missing `attacks`, malformed imported monster, bad inline stat-block edit) used to white-screen the packaged app with devtools closed; now it shows a recovery panel that can download a raw backup straight from localStorage (works even when app state is the thing that broke) and reload.
- **Mode-flip session reset**: the Roll-ephemeral reset effect in App.jsx is keyed on `[activeCharacterId, settings.dmMode]` (was just `activeCharacterId`). Flipping player⇄DM now clears activeMods/targets/custom/composed/history — without it, a Bless toggled in player mode kept applying `-b 1d4` to DM rolls (because `dmModifiers` clones `globalModifiers`, sharing the id `'bless'`) and the history strip showed the other surface's commands.
- **Centralized id minting**: `makeShortId(prefix)` (state.js, Math.random-based) replaces the old `prefix_${Date.now().toString(36)}` pattern at the folder/target/modifier sites — that pattern collided when two ids were minted in the same millisecond (it had already bitten the targets bulk-import path, which worked around it with an index suffix). StatBlockModal's `makeEntryId` now aliases the exported `makeId`.

### Correctness fixes (v0.10.0+, audit batch 2)

- **Composer quote-safety** (`composer.js`): a `quoted(s)` helper wraps every double-quoted Avrae arg (action ids, target names, combatant names, `-d`/`-c`/`-dtype`/`-phrase` values, custom damage) and swaps any embedded straight `"` for a typographic `”` — Avrae's tokenizer doesn't reliably honor backslash-escaped quotes, so a literal `"` in a phrase/name used to silently break the command structure. The typographic quote is visually near-identical and is NOT a delimiter. `abilityArg(id)` quotes save/check ids **only when they contain whitespace**, so single-word player ids (`!save dex`) are byte-for-byte unchanged but DM-mode spaced monster skills emit `!i c "sleight of hand"` instead of relying on Avrae's fuzzy matcher. Covered by a throwaway harness during dev (7 cases incl. embedded-quote, spaced-id, upcast, offturn, mod-damage).
- **castLevel composite key** (`RollView` SpellsPane): the per-spell upcast map is keyed by `${level}:${id}`, not bare `id`. DDB only dedups spell ids within a level, so the same id at two levels (Invisibility L2 + an upcast-prepared L4 copy) used to share one slot, leaving one dropdown showing an out-of-range value and firing the wrong `upcastTo`.
- **Single in-flight DDB refresh** (`main.cjs`): `activeDdbRefreshWin` tracks the open refresh window; a second invoke focuses it and bails. The capture listener is a replace-style single slot on the shared `persist:ddb` session, so concurrent refreshes used to clobber each other's listener and could resolve the wrong character's exportData into the wrong character.
- **5e.tools mirrors** (`main.cjs`): the three `5etools-mirror-{1,2,3}.github.io` fallback hosts all 404 as of this audit (the mirror org reorganized), so `BESTIARY_HOSTS` keeps only the main `5e.tools` host (reached via `net.fetch`/Chromium, which passes Cloudflare) and the failure copy now points at the JSON-paste import path as the real fallback. Each fetch gets `AbortSignal.timeout(10000)` so a stalled host can't hang the import on Chromium's multi-minute internal timeout.
- **Stable editor-row keys**: attack rows (CharacterView) and effect/param/option rows (ModifierForge) carry a `_key` (`makeId()`) minted at add-time, used as the React key with `?? index` fallback so pre-existing persisted rows need no migration. Prevents focus/prop misdirection after a row delete. (The spell-accordion rows still key by index — they're entangled with the `openSpells` index-shifting expansion state and were left for a dedicated follow-up.)

### Build & Electron hardening (v0.10.0+, audit batch 3)

- **Packaged size**: `react`, `react-dom`, and `pdfjs-dist` are **devDependencies**, not dependencies (see the `comment:dependencies` note in package.json). Vite bundles them into `dist/` at build time and `electron/main.cjs`/`preload.cjs` require none of them at runtime, so with an empty `dependencies` electron-builder packs **no** node_modules. Result: `app.asar` 42.6 MB → **3.9 MB**, `app.asar.unpacked` (the 36 MB pdfjs skia binary) **gone**, ~78 MB off the installer the updater re-downloads each release. **Don't move them back to `dependencies`** — that re-bloats the asar.
- **Offline fonts**: see `src/fonts.js` — runtime Google-Fonts `@import` replaced with bundled `@fontsource`, so launch needs no network.
- **`npm run clean`** removes `release/`; `dist`/`dist:dir` run it first so old versioned installers (was 2.2 GB accumulated) don't pile up. v0.3.0 (never published to GitHub) was preserved into the backup dir before the one-time purge.
- **Updater plumbing** (`main.cjs`): `httpsGet` caps redirects at 5, **strips `Authorization` when a redirect leaves the original host** (GitHub bounces asset downloads to a signed S3 URL where forwarding the bearer token has historically 400'd), and sets a 30s socket timeout (was none → a stalled connection hung the renderer at "checking…"/"downloading" forever). The downloaded installer uses a **fixed** tmp filename `grimoire-update.exe` so each download overwrites the last instead of accruing ~80-100 MB files in %TEMP%.
- **External-URL safety** (`main.cjs`): `isWebUrl()` gates `shell.openExternal` to `http(s)` only (a `file://`/custom-scheme string would otherwise reach the OS shell). The shared `externalOpenHandler` is the `setWindowOpenHandler` for BOTH the main window and the DDB refresh window — the DDB window previously had none, so a `target=_blank` ad/link spawned an orphan chromeless Electron window on the persist:ddb session. The DDB refresh URL must now be `https:` (was host-checked only). **Don't add a strict dndbeyond.com-only `will-navigate` guard** — first-login redirects through third-party SSO hosts (Wizards/Twitch/Google/Apple) inside that window.

### Player Roll features (v0.10.0+, audit batch 7)

- **Auto-expend spell slots + rest buttons**: `RollView.fire` decrements `spellSlots[action.upcastTo].current` when a leveled spell fires (clamped at 0; cantrips/empty levels skipped — Avrae decrements its own sheet regardless). `SpellSlotsTracker`'s header has **SR** (`!g sr`, dots untouched) and **↻ LR** (`!g lr` + refill all dots) buttons, taking an `emit` prop. SR deliberately doesn't refill dots: the tracker sums wizard + pact slots into one `{current,max}` and short rest restores only pact slots, so a blanket refill would drift for non-warlocks.
- **Favorites**: per-character `favorites: [{ kind, id, level? }]` (added to `BLANK_CHARACTER`, no migration — missing = empty). A hover star on each `CompactRow` toggles membership (`fav.has`/`fav.toggle` plumbed from RollView through the columns); a `FavoritesStrip` above the three-column grid renders them as quick-fire pills. `resolveFavorite` looks each descriptor back up in the live character at render time, so renames/edits/current-upcast-selection are reflected and a deleted source just drops out of the strip. Spell descriptors carry `level` because the same id can sit at two levels.
- **Re-fire + quick dice** (`ComposerBar`): `lastFired` now holds the full action object (still drives the row highlight via `.kind`/`.id`); a `↻ re-fire` button re-runs `fire(lastFired)` with the *current* targets/modifiers ("same attack, next goblin"). A quick-dice input + `1d20`/`1d100`/`1d6` chips compose raw `!r <expr>` through the shared `emit`. ComposerBar takes `emit` (both roll surfaces) and `onRefire` (player only for now — DmRollView re-fire lands with the batch-6 DM rework).
- **On-disk snapshots** (Electron only, same-machine crash protection — NOT cross-device sync, which stays manual): main-process IPC `write-snapshot` / `list-snapshots` / `read-snapshot` (handlers in `main.cjs`, bridged in preload as `window.grimoire.writeSnapshot/listSnapshots/readSnapshot`). Writes timestamped copies of the persist payload to `userData/snapshots`, keeps the newest 10, path-traversal-guarded on read. App.jsx triggers a write every 10 min + on `beforeunload` via a ref to the latest state. SettingsView's Backup & Restore gains a "Snapshots on this machine" panel (hidden outside Electron) that lists them and restores through the existing `parseImport → replaceState` path.

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
- **Slice 4 (DM Roll surface)**: `DmRollView` renders each active monster as a card with the monster's actions, legendary actions, saves, and skills laid out as clickable buttons. Click composes through the same `compose()` as player Roll, with every DM-mode roll passing `action.initContext: true` so the prefix flips to the **initiative-aware** variant — `!i a` for attacks, `!i s` for saves, `!i c` for checks. Those all route through the *current combatant in init* rather than the user's bound character, which is what makes the DM workflow actually correct: after `!i madd "<name>"` loads the monster, every subsequent button targets that monster while it's its turn. Spell stays on `!cast` because DM Roll doesn't surface spell buttons today — revisit when it does. Targets / modifiers / custom bonuses flow through the shared `RollSidePanel` as usual. Each card also has a `↻ init add` button that bypasses the composer and emits `!i madd "<monster name>"` — Avrae's monster-add subcommand auto-loads stats + actions from its bestiary and rolls init from Dex (separate code path; init-add isn't one of compose's kinds and doesn't take targets/modifiers). History labels prefix with the monster name (`Adult Lunar Dragon · Bite`) so it's distinguishable across multiple active monsters.
- **Out-of-turn toggle (per-card)**: each monster card has an `☐ Out of turn` checkbox alongside the init-add button. When on, **every** roll button on the card flips to Avrae's `!i offturn*` family — `!i offturnattack "<combatant>" "<action>"`, `!i offturnsave "<combatant>" <ability>`, `!i offturncheck "<combatant>" <skill>`, and `!i offturncast "<combatant>" "<spell>"` (the cast branch is wired in compose for the day DM Roll surfaces monster spell buttons; today it isn't reachable). These are the canonical Avrae commands for a named combatant acting outside its own init turn — reactions, opportunity attacks, triggered saves, passive checks during another combatant's turn. The flag is per-monster and **ephemeral** (lives in DmRollView's local state, resets on tab/mode switch) since OOT is a moment-to-moment combat state rather than a stored property of the monster. History labels append `(OOT)` when the flag is on so the strip stays disambiguated.
- **Collapsible monster cards**: each card has a `▼`/`▶` chevron at the start of its header that hides/shows the action grid (actions / legendary / saves / skills) while leaving the header — name, summary, OOT, init-add — always visible. Ephemeral state same as the OOT flag (resets on tab/mode switch). A bulk `▶ collapse all` / `▼ expand all` toggle appears at the top of the monster list when there are 2+ active monsters; it flips based on the all-collapsed-or-not state so the next click is always the useful action. Default state is expanded so a fresh encounter shows everything; the toggles are escape hatches for big rosters.
- **Acronym combatant names + instance number**: monster names are **acronymed** before appearing in commands — `Adult Silver Dragon` → `ASD`, `Goblin` → `G`. The `acronym()` helper in `DmRollView.jsx` splits on whitespace, takes each word's first letter, and uppercases. The acronym (plus an optional instance suffix from the per-card `# [—|1|2|…|10]` dropdown) is what flows into the `combatantName` arg of every command that needs one. Display surfaces (card title, history strip labels) keep the **full** name + space-separated instance for readability; only the emitted command text uses the short form. Affected commands: init-add (`!i madd "Adult Silver Dragon" -name "ASD2"` — the long form stays in the bestiary lookup arg so Avrae can find the monster, the `-name` flag registers it under the short form) and the entire `!i offturn*` family (`!i offturnattack "ASD2" "Bite" …`). The in-turn `!i a` / `!i s` / `!i c` commands don't include a combatant name (Avrae uses the current combatant from init), so neither the acronym nor the instance suffix matters there. Init-add always passes `-name` when an acronym exists so the registered combatant name is predictable; without it Avrae would name the combatant by the full lookup string and OOT commands would have to retype it. Ephemeral state, same lifetime as OOT + collapse. Useful pattern: duplicate a card N times in the Bestiary, assign each copy a unique instance number, then init-add them all to register `ASD1`, `ASD2`, `ASD3` as separate combatants in Avrae.
- **Action lookup tip**: `!attack` on Avrae matches by name against the current combatant's loaded actions. The 5e.tools importer slugifies action ids (`tail_slap`) but stores the original `name` (`Tail Slap`); DmRollView's buttons emit the **name** as the id so the quoted string in the composed command matches Avrae's lookup. (The slug-id is still useful as a stable React key.)
- **`RollChrome` extraction (slice 4 refactor)**: the side panel, targets panel, and fixed-bottom composer bar previously inlined in `RollView` are now in `src/views/RollChrome.jsx`, exported as `RollSidePanel` and `ComposerBar`. Both `RollView` and `DmRollView` import them; behavior is unchanged on the player side. If a third roll surface ever appears (encounter builder? party turn order?), it imports from here too.
- **Slice 5 (JSON import path)**: `AddMonsterPicker` adds a third creation path — *Import from JSON* — alongside *Start blank* and *Import from 5e.tools URL*. The JSON path expands the modal to a textarea + `📁 Load .json file` button + Import; the file picker just fills the textarea so the user can review before submitting (matches the Backup-and-Restore confirm-before-applying pattern). Main-process IPC handler `import-monster-from-json` parses the text, accepts either a bare 5e.tools monster object (`{ name, source, ... }`) or a bestiary wrapper (`{ monster: [{...}] }`) with a single entry, and runs the result through the same `mapFiveEtoolsMonster()` the URL importer uses. Multi-monster pastes throw a clear error rather than silently taking the first one. This path is the workaround when 5e.tools is unreachable / blocking, when the source is missing from the public mirrors, or for homebrew monsters not on 5e.tools at all.
- **Stat-block editor (v0.9 polish)**: `StatBlockModal` ships a read-mode by default (preserves the classic 5e layout for reference during play) and an `✎ Edit` toggle in the header that swaps every section to inline editable inputs. Identity, combat, abilities, senses/languages/CR are simple fields. Saves and skills render as full grids (all six abilities, all 18 skills) where typing a mod adds the entry and clearing it removes — no separate add/remove buttons needed; the `pruneEmpty` helper drops blanks before persisting. Traits / actions / legendary actions are repeating editors with name + description textarea + remove. Edits write through `setMonster(updater)` from `App.jsx`'s `updateMonster(id, updater)` helper, which accepts either a patch object or a function (matches React-setter ergonomics). No explicit save step — closing the modal is closing the edit session, and the state is already current.

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
