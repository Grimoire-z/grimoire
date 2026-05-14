const { app, BrowserWindow, shell, ipcMain } = require('electron');
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
    const setupAsset = (release.assets || []).find(a => /Setup .*\.exe$/.test(a.name));
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
