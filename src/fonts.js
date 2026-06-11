// Self-hosted fonts. Previously index.css did a runtime `@import` from
// fonts.googleapis.com, which meant the packaged app (loaded over file://)
// hit the network at launch — so offline at a game table, beyond Chromium's
// ~24h cache window, the theme @font-face rules vanished and typography
// collapsed to non-stock fallbacks (a flaky/captive-portal network was even
// worse: the render-blocking @import could stall first paint). These
// @fontsource imports bundle the woff2 into dist/ via Vite, making startup
// fully offline-correct with zero network dependency.
//
// Each @fontsource package registers the SAME font-family name Google used
// ('Cinzel', 'Crimson Pro', etc.), so index.css / themes.js references are
// unchanged. The weights here mirror exactly what the old Google @import
// requested. Top-level weight files carry all subsets with unicode-range, so
// only the glyphs actually rendered (latin, for an English app) load at
// runtime; the rest sit unused in the bundle, which is irrelevant locally.

// Cinzel — display (500 / 700 / 900)
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';

// Crimson Pro — body serif (400 / 500 / 700 + 400 italic)
import '@fontsource/crimson-pro/400.css';
import '@fontsource/crimson-pro/500.css';
import '@fontsource/crimson-pro/700.css';
import '@fontsource/crimson-pro/400-italic.css';

// JetBrains Mono — command text (400 / 600)
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';

// IM Fell English (+ small caps) — antique preset (400 + 400 italic)
import '@fontsource/im-fell-english/400.css';
import '@fontsource/im-fell-english/400-italic.css';
import '@fontsource/im-fell-english-sc/400.css';

// Inter — modern preset (400 / 500 / 600 / 700)
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
