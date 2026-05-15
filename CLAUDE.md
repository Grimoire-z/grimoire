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
- `src/App.jsx` — top-level component: header, mode switching (Roll / Character / Targets / Modifiers / Settings)
- `src/state.js` — DEFAULT_CHARACTER, DEFAULT_MODIFIERS, DEFAULT_SETTINGS (theme/fontPreset), SAVE_DEFS, SKILL_DEFS, loadState/saveState (localStorage)
- `src/composer.js` — pure command composition (compose, composeFromMod, substituteParams)
- `src/ddbImport.js` — D&D Beyond JSON → partial character mapping (best-effort)
- `src/ddbPdfImport.js` — D&D Beyond fillable PDF importer; uses pdfjs-dist worker via `?worker` Vite import
- `src/components.jsx` — shared (Checkbox, TabBar, ActionCard, ModifierRow, FieldLabel, SectionCard, D20Icon)
- `src/themes.js` — registry of color themes and font presets surfaced in SettingsView (paired with CSS blocks in `index.css`)
- `src/views/RollView.jsx` — composer view; targets/modifiers/spells side panel, paginated spells, attack/spell dedup
- `src/views/CharacterView.jsx` — Roll20-style sheet editor (identity, combat, abilities, saves, skills, attacks, spells, DDB import)
- `src/views/ModifierForgeView.jsx` — modifier library editor
- `src/views/TargetsView.jsx` — target book; folders + targets
- `src/views/SettingsView.jsx` — full-page settings (theme + font preset chooser + Updates panel); reached via the d20 button in the header
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

### Updates (v0.5+)

- In-app update check + download lives in `SettingsView` → Updates section. Main-process IPC handlers live in `electron/main.cjs`; preload exposes `window.grimoire.checkForUpdate / downloadAndInstall / getVersion / openExternal / onDownloadProgress`.
- Because the repo is private, the GitHub API and asset downloads need auth. **Instead of embedding a token in the binary** (which would leak if the .exe is shared), `getGhToken()` shells out to `gh auth token` on the user's machine. Both of the user's devices already have `gh` authenticated, and this dodges the "shipped credential" footgun.
- Asset endpoint requires `Accept: application/octet-stream` to return binary; the `https.get` wrapper follows redirects (GitHub serves assets via a redirect to a signed S3 URL).
- The Setup installer is preferred for auto-update (NSIS handles "upgrade over existing install"); the portable target is not used here. The "Open releases page" fallback button surfaces only in the error state (when `gh` is missing or auth is stale) so successful checks stay visually uncluttered.
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

The Character view's PDF import section has a diagnostics panel with field/widget filters — useful when DDB shifts the layout again.

## Open work / known stubs

- No custom application icon — electron-builder uses the default Electron icon. Drop a `build/icon.ico` (256×256, multi-resolution) to fix.
- Releases are unsigned (placeholder signtool only); first-run SmartScreen prompt is expected. Real signing would need an EV / OV code-signing cert.
- DDB JSON import (paste/file) fills only header fields + ability scores; doesn't pull weapons/spells from inventory or spell sources
- Single-character only (no vault/picker)
- Auto-derived save/skill mods from ability scores not implemented (manual entry only)
- Main JS chunk is ~660KB (Vite warned >500KB) because pdfjs-dist is loaded synchronously; could be code-split via dynamic import
- localStorage data doesn't sync across machines — would need export/import-to-JSON or point-at-synced-folder mechanism

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
- localStorage character/modifier/target data does NOT sync across devices — that's a separate feature still on the TODO list

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
