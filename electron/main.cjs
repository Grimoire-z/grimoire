const { app, BrowserWindow, shell, ipcMain, net, session } = require('electron');
const path = require('path');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const https = require('node:https');

const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const REPO = 'Grimoire-z/grimoire';

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#14100c',
    autoHideMenuBar: true,
    title: 'Grimoire',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ─── Update mechanism ──────────────────────────────────────────────────────
// Repo is private, so reads need auth. Instead of embedding a token in the
// binary (which would leak if the .exe is shared), we shell out to the
// user's locally-installed `gh` CLI to grab a fresh token. Both machines
// in this user's workflow already have gh authenticated.

function execFileP(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr: stderr?.toString() }));
      else resolve({ stdout: stdout.toString(), stderr: stderr?.toString() });
    });
  });
}

async function getGhToken() {
  try {
    const { stdout } = await execFileP('gh', ['auth', 'token']);
    const token = stdout.trim();
    if (!token) throw new Error('empty token returned from gh');
    return token;
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error('GitHub CLI not installed. Install via `winget install GitHub.cli` and run `gh auth login`.');
    }
    throw new Error(`GitHub CLI not authenticated. Run \`gh auth login\` in a terminal. (${e.message})`);
  }
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        httpsGet(res.headers.location, headers).then(resolve, reject);
        res.resume();
        return;
      }
      resolve(res);
    }).on('error', reject);
  });
}

async function fetchJson(url, token) {
  const res = await httpsGet(url, {
    'User-Agent': 'grimoire-app',
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  });
  if (res.statusCode !== 200) {
    let body = '';
    for await (const chunk of res) body += chunk;
    throw new Error(`GitHub API ${res.statusCode}: ${body.slice(0, 200)}`);
  }
  let body = '';
  for await (const chunk of res) body += chunk;
  return JSON.parse(body);
}

async function downloadAsset(url, token, destPath, onProgress) {
  const res = await httpsGet(url, {
    'User-Agent': 'grimoire-app',
    // Asset endpoints require this Accept header to return the binary.
    'Accept': 'application/octet-stream',
    'Authorization': `Bearer ${token}`,
  });
  if (res.statusCode !== 200) {
    let body = '';
    for await (const chunk of res) body += chunk;
    throw new Error(`Asset download ${res.statusCode}: ${body.slice(0, 200)}`);
  }
  const total = parseInt(res.headers['content-length'] || '0', 10);
  let received = 0;
  const file = fs.createWriteStream(destPath);
  return new Promise((resolve, reject) => {
    res.on('data', (chunk) => {
      received += chunk.length;
      if (onProgress) onProgress(received, total);
    });
    res.on('error', reject);
    file.on('error', reject);
    file.on('finish', () => file.close(() => resolve()));
    res.pipe(file);
  });
}

function parseSemver(v) {
  return String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
}
function isNewer(latest, current) {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('check-for-update', async () => {
  try {
    const token = await getGhToken();
    const release = await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`, token);
    const current = app.getVersion();
    const latest = release.tag_name;
    const hasUpdate = isNewer(latest, current);
    // GitHub silently replaces spaces in uploaded asset filenames with dots, so
    // the .exe we built as "Grimoire Setup 0.7.0.exe" is served as
    // "Grimoire.Setup.0.7.0.exe" by the API. Match "Setup" with no assumption
    // about the surrounding separator (space, dot, or none).
    const setupAsset = (release.assets || []).find(a => /setup/i.test(a.name) && /\.exe$/i.test(a.name));
    return {
      ok: true,
      current,
      latest,
      hasUpdate,
      releaseUrl: release.html_url,
      asset: setupAsset
        ? { name: setupAsset.name, url: setupAsset.url, size: setupAsset.size }
        : null,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('download-and-install', async (event, asset) => {
  try {
    if (!asset?.url) throw new Error('no asset to download');
    const token = await getGhToken();
    const tmpFile = path.join(os.tmpdir(), `grimoire-update-${Date.now()}.exe`);
    const win = BrowserWindow.fromWebContents(event.sender);
    await downloadAsset(asset.url, token, tmpFile, (received, total) => {
      win?.webContents.send('update-download-progress', { received, total });
    });
    // shell.openPath spawns the installer with the user's default association
    // (Windows runs the .exe directly). The installer will prompt the user to
    // close the running app if needed.
    const err = await shell.openPath(tmpFile);
    if (err) throw new Error(`Failed to launch installer: ${err}`);
    return { ok: true, path: tmpFile };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('open-external', async (_event, url) => {
  await shell.openExternal(url);
  return { ok: true };
});

// ─── 5e.tools monster importer ─────────────────────────────────────────────
// Fetch a monster from 5e.tools by bestiary URL, normalize its shape, and
// hand it back to the renderer. Runs in main because (a) we want a real
// fetch (renderer would fetch fine too — 5e.tools is public — but main
// keeps the data layer consistent with the GitHub updater), and (b)
// having the mapper here means the renderer only deals with already-
// normalized monster shapes via the standard IPC contract.
//
// URL shape: https://5e.tools/bestiary.html#<encoded-name>_<source>
// Data URL:  https://5e.tools/data/bestiary/bestiary-<source>.json
// JSON top:  { monster: [{ name, source, ... }, ...], ... }
//
// Source codes are lowercase in URLs, uppercase in JSON. Names are URL-
// encoded; the last `_` in the fragment separates name from source code.

function parseFiveEtoolsUrl(url) {
  let u;
  try { u = new URL(url); }
  catch { throw new Error('not a valid URL'); }
  if (!/(^|\.)5e\.tools$/i.test(u.host)) {
    throw new Error(`expected a 5e.tools URL, got "${u.host}"`);
  }
  const hash = u.hash.replace(/^#/, '');
  if (!hash) throw new Error('URL has no monster fragment (the #...part)');
  const decoded = decodeURIComponent(hash);
  const lastUnderscore = decoded.lastIndexOf('_');
  if (lastUnderscore === -1) {
    throw new Error('URL fragment missing the source code (expected "...#name_source")');
  }
  const name = decoded.slice(0, lastUnderscore).trim();
  const source = decoded.slice(lastUnderscore + 1).trim();
  if (!name || !source) throw new Error('could not parse name/source from URL fragment');
  return { name, source };
}

// Try several mirrors in sequence. 5e.tools itself sits behind Cloudflare
// and 403s requests without browser-like headers (anti-hotlink). The
// public 5etools-mirror-* GitHub Pages sites don't gate access and are the
// canonical fallback. Some less-common sources (homebrew supplements,
// recent releases) only live on a subset of mirrors, so we try each and
// return the first that responds with JSON.
const BESTIARY_HOSTS = [
  'https://5e.tools/data/bestiary',
  'https://5etools-mirror-3.github.io/data/bestiary',
  'https://5etools-mirror-2.github.io/data/bestiary',
  'https://5etools-mirror-1.github.io/data/bestiary',
];

const BROWSERY_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept': 'application/json,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://5e.tools/bestiary.html',
};

// Uses Electron's `net.fetch` (Chromium networking) rather than the global
// `fetch` (Node's undici). Cloudflare on 5e.tools blocks bare Node fetches
// even with browser-like headers — TLS fingerprint and request semantics
// betray them. net.fetch routes through Chromium's stack so the request
// looks identical to one from a real browser tab, which passes the bot
// check. Mirrors fall back to the GitHub Pages copies (no Cloudflare).
async function fetchBestiary(source) {
  const filename = `bestiary-${source.toLowerCase()}.json`;
  const failures = [];
  for (const host of BESTIARY_HOSTS) {
    const url = `${host}/${filename}`;
    try {
      console.log('[grimoire] 5etools fetch try:', url);
      const res = await net.fetch(url, { headers: BROWSERY_HEADERS });
      if (res.ok) {
        console.log('[grimoire] 5etools fetch ok:', url);
        return await res.json();
      }
      failures.push(`${url} → ${res.status} ${res.statusText}`);
    } catch (e) {
      failures.push(`${url} → ${e.message}`);
    }
  }
  throw new Error(
    `could not fetch ${filename} from any 5e.tools mirror — source "${source}" may not exist on the mirrors that have it open, or all hosts are down right now.\n\n${failures.join('\n')}`
  );
}

function findMonster(name, source, bestiary) {
  const list = bestiary.monster || [];
  return list.find(m =>
    (m.name || '').toLowerCase() === name.toLowerCase() &&
    (m.source || '').toLowerCase() === source.toLowerCase()
  );
}

// ─── 5e.tools shape helpers ───────────────────────────────────────────────
// 5e.tools encodes inline references as `{@tag value|extra...}`. For our
// stored monster shape we want readable plain text, so this strips tags
// down to the visible value. Not exhaustive — covers the tags that
// commonly appear in monster stat blocks; unknown tags fall through to
// "tag value" which is at least legible.

function stripFiveEtoolsTags(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\{@(\w+)\s+([^}|]+)(?:\|[^}]*)?\}/g, (_match, tag, value) => {
    switch (tag.toLowerCase()) {
      case 'dc':        return `DC ${value}`;
      case 'h':         return 'Hit: ';
      case 'atk':       return value; // attack type
      case 'hit':
      case 'damage':
      case 'dice':
      case 'd20':
      case 'chance':
      case 'recharge':
      case 'spell':
      case 'item':
      case 'creature':
      case 'condition':
      case 'skill':
      case 'sense':
      case 'filter':
        return value;
      default:
        return value;
    }
  });
}

function entriesToText(entries) {
  if (typeof entries === 'string') return stripFiveEtoolsTags(entries);
  if (Array.isArray(entries)) return entries.map(entriesToText).filter(Boolean).join('\n\n');
  if (entries && typeof entries === 'object') {
    if (entries.entries) return entriesToText(entries.entries);
    if (entries.items)   return entriesToText(entries.items);
  }
  return '';
}

const SIZE_MAP = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan' };
function mapSize(size) {
  if (!size) return '';
  const arr = Array.isArray(size) ? size : [size];
  return arr.map(s => SIZE_MAP[s] || String(s)).join('/');
}

function typeToString(type) {
  if (!type) return '';
  if (typeof type === 'string') return type;
  const base = type.type || type.choose || '';
  const tagsRaw = type.tags || [];
  const tags = tagsRaw.map(t => (typeof t === 'string' ? t : (t.tag || ''))).filter(Boolean);
  return tags.length ? `${base} (${tags.join(', ')})` : String(base);
}

const ALIGN_MAP = {
  L: 'lawful', N: 'neutral', C: 'chaotic',
  G: 'good',   E: 'evil',
  U: 'unaligned', A: 'any alignment',
};
function alignmentToString(alignment) {
  if (!alignment) return '';
  if (!Array.isArray(alignment)) return String(alignment);
  // Skip nested complex alignment shapes (rare); join known letter codes.
  return alignment
    .map(a => (typeof a === 'string' ? ALIGN_MAP[a] || a : ''))
    .filter(Boolean)
    .join(' ');
}

function crToString(cr) {
  if (cr == null) return '';
  if (typeof cr === 'string' || typeof cr === 'number') return String(cr);
  if (typeof cr === 'object' && cr.cr != null) return String(cr.cr);
  return '';
}

function extractAc(acField) {
  if (!acField) return null;
  if (typeof acField === 'number') return acField;
  if (Array.isArray(acField)) {
    const first = acField[0];
    if (typeof first === 'number') return first;
    if (typeof first === 'object' && typeof first.ac === 'number') return first.ac;
  }
  if (typeof acField === 'object' && typeof acField.ac === 'number') return acField.ac;
  return null;
}

function extractHp(hpField) {
  if (!hpField) return null;
  if (typeof hpField === 'number') return { average: hpField, formula: '' };
  if (typeof hpField === 'object') {
    return {
      average: typeof hpField.average === 'number' ? hpField.average : null,
      formula: hpField.formula || '',
    };
  }
  return null;
}

function speedToString(speed) {
  if (!speed) return '';
  if (typeof speed === 'string') return speed;
  if (typeof speed === 'object') {
    const parts = [];
    for (const [kind, val] of Object.entries(speed)) {
      if (typeof val === 'number') {
        parts.push(kind === 'walk' ? `${val} ft.` : `${kind} ${val} ft.`);
      } else if (typeof val === 'object' && typeof val.number === 'number') {
        parts.push(kind === 'walk' ? `${val.number} ft.` : `${kind} ${val.number} ft.`);
      }
    }
    return parts.join(', ');
  }
  return '';
}

function slugifyActionName(name) {
  return String(name || 'action').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function extractActions(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(a => ({
    id: slugifyActionName(a.name),
    name: a.name || '',
    description: entriesToText(a.entries || []),
  }));
}

function mapFiveEtoolsMonster(raw) {
  return {
    name:      raw.name || '',
    source:    raw.source || '',
    size:      mapSize(raw.size),
    type:      typeToString(raw.type),
    alignment: alignmentToString(raw.alignment),
    cr:        crToString(raw.cr),
    ac:        extractAc(raw.ac),
    hp:        extractHp(raw.hp),
    speed:     speedToString(raw.speed),
    abilities: {
      str: raw.str ?? 10, dex: raw.dex ?? 10, con: raw.con ?? 10,
      int: raw.int ?? 10, wis: raw.wis ?? 10, cha: raw.cha ?? 10,
    },
    // Save / skill objects are already in `{ ability: "+N" }` shape.
    saves:     raw.save || {},
    skills:    raw.skill || {},
    senses:    Array.isArray(raw.senses)    ? raw.senses.join(', ')    : (raw.senses || ''),
    passive:   typeof raw.passive === 'number' ? raw.passive : null,
    languages: Array.isArray(raw.languages) ? raw.languages.join(', ') : (raw.languages || ''),
    traits:           extractActions(raw.trait),
    actions:          extractActions(raw.action),
    legendaryActions: extractActions(raw.legendary),
  };
}

ipcMain.handle('import-monster-from-5etools', async (_event, url) => {
  try {
    const { name, source } = parseFiveEtoolsUrl(url);
    const bestiary = await fetchBestiary(source);
    const raw = findMonster(name, source, bestiary);
    if (!raw) {
      throw new Error(`monster "${name}" not found in bestiary-${source.toLowerCase()}.json — does the URL still resolve in your browser?`);
    }
    return { ok: true, monster: mapFiveEtoolsMonster(raw) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// JSON import — accepts either a bare 5e.tools monster object
// `{ name, source, ... }` or a bestiary wrapper `{ monster: [...] }`.
// In the wrapper case we take the first (or only) entry rather than
// guessing intent — multi-monster pastes get a clear error. Same
// mapping pipeline as the URL importer, just without the fetch.
ipcMain.handle('import-monster-from-json', async (_event, jsonText) => {
  try {
    if (typeof jsonText !== 'string' || jsonText.trim() === '') {
      throw new Error('no JSON provided');
    }
    let parsed;
    try { parsed = JSON.parse(jsonText); }
    catch (e) { throw new Error(`invalid JSON: ${e.message}`); }
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('JSON did not parse to an object');
    }
    let raw;
    if (Array.isArray(parsed.monster)) {
      if (parsed.monster.length === 0) {
        throw new Error('bestiary JSON has an empty monster array');
      }
      if (parsed.monster.length > 1) {
        throw new Error(
          `bestiary JSON contains ${parsed.monster.length} monsters — paste a single monster object, ` +
          `or extract just the one you want from the array`
        );
      }
      raw = parsed.monster[0];
    } else if (parsed.name && parsed.source) {
      raw = parsed;
    } else {
      throw new Error(
        `JSON doesn't look like a monster — expected an object with "name" and "source" fields, ` +
        `or a bestiary wrapper { "monster": [{...}] }`
      );
    }
    return { ok: true, monster: mapFiveEtoolsMonster(raw) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ─── DDB character refresh (in-app browser) ────────────────────────────────
// One-click "refresh this character from D&D Beyond" by opening a
// BrowserWindow to the user's DDB character page and intercepting the
// /character/v5/pdf POST at the network layer.
//
// Why network-layer interception instead of a bookmarklet: DDB's bundle
// captures `window.fetch` at module load, so any JS-level monkey-patch
// applied later (bookmarklet, devtools snippet) misses the call. The
// session.webRequest.onBeforeRequest hook below fires before the
// request leaves Chromium's networking stack — it doesn't care how DDB
// called fetch.
//
// Auth piggybacks on the embedded BrowserWindow: we use a dedicated
// `persist:ddb` session so DDB cookies live in their own jar, isolated
// from the main app. First refresh prompts a DDB login; subsequent
// refreshes find the session already authed.
//
// Returns { body } on success or { cancelled: true } if the user
// closes the window without clicking DDB's Print/Download. Either way,
// the renderer is responsible for parsing the body via parseDdbJson.

ipcMain.handle('refresh-character-from-ddb', async (event, characterUrl) => {
  let parsedUrl;
  try {
    parsedUrl = new URL(characterUrl);
  } catch {
    throw new Error('not a valid URL');
  }
  if (!/(^|\.)dndbeyond\.com$/i.test(parsedUrl.host)) {
    throw new Error(`expected a dndbeyond.com URL, got "${parsedUrl.host}"`);
  }

  return new Promise((resolve, reject) => {
    const ddbSession = session.fromPartition('persist:ddb');
    const parentWin = BrowserWindow.fromWebContents(event.sender);

    const win = new BrowserWindow({
      width: 1100,
      height: 800,
      title: 'Refresh from D&D Beyond — click Print/Download when ready',
      parent: parentWin || undefined,
      autoHideMenuBar: true,
      backgroundColor: '#14100c',
      webPreferences: {
        session: ddbSession,
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    let captured = false;
    const filter = { urls: ['*://character-service.dndbeyond.com/character/v*/pdf*'] };

    const onRequest = (details, callback) => {
      // Always allow the request to proceed so DDB's own PDF download
      // still works (nice freebie for the user).
      callback({});
      if (captured) return;
      try {
        const data = details.uploadData;
        if (!data || !data.length) return;
        const chunks = data.map(d => (d.bytes ? Buffer.from(d.bytes) : Buffer.alloc(0)));
        const body = Buffer.concat(chunks).toString('utf8');
        if (!body || !body.includes('exportData')) return;
        captured = true;
        // Detach the listener so a second click doesn't try to resolve
        // the already-fulfilled Promise.
        try { ddbSession.webRequest.onBeforeRequest(filter, null); } catch {}
        // Give DDB's request a moment to finish before closing — early
        // close aborts their PDF mid-flight which is jarring even if
        // our capture is complete.
        setTimeout(() => { if (!win.isDestroyed()) win.close(); }, 800);
        resolve({ body });
      } catch (e) {
        console.error('[grimoire] ddb refresh capture failed', e);
      }
    };

    ddbSession.webRequest.onBeforeRequest(filter, onRequest);

    win.on('closed', () => {
      try { ddbSession.webRequest.onBeforeRequest(filter, null); } catch {}
      if (!captured) resolve({ cancelled: true });
    });

    win.loadURL(characterUrl).catch(err => {
      try { ddbSession.webRequest.onBeforeRequest(filter, null); } catch {}
      if (!win.isDestroyed()) win.close();
      reject(new Error(`failed to load ${characterUrl}: ${err.message}`));
    });
  });
});
