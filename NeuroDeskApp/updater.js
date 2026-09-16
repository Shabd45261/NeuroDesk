const { app, BrowserWindow, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const UPDATE_BASE = 'https://raw.githubusercontent.com/Shabd45261/NeuroDesk/main';
const VERSION_URL = UPDATE_BASE + '/version.json';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DOWNLOAD_DIR = app.getPath('temp');

let checking = false;

function compareVersions(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'NeuroDeskUpdater/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetchJSON(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
  });
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, { headers: { 'User-Agent': 'NeuroDeskUpdater/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        file.close();
        return downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        file.close();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
      let received = 0;
      res.on('data', (chunk) => {
        received += chunk.length;
        if (onProgress) onProgress({ received, total });
      });
      res.pipe(file);
    });
    req.on('error', (e) => { file.destroy(); reject(e); });
    req.setTimeout(0);
    file.on('finish', () => {
      file.close(() => resolve(dest));
    });
    file.on('error', (e) => { req.destroy(); reject(e); });
  });
}

function sha256Of(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(file);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function showProgressWindow() {
  const win = new BrowserWindow({
    width: 380,
    height: 120,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    title: 'NeuroDesk Update',
    backgroundColor: '#1a1b1e',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#1a1b1e;color:#e8eaed;}
    .wrap{padding:18px 20px;}
    h1{font-size:14px;font-weight:600;margin:0 0 12px 0;}
    .bar{height:6px;border-radius:3px;background:#333;overflow:hidden;}
    .fill{height:100%;width:7%;border-radius:3px;background:#e0223c;transition:width .3s ease;animation:b .9s infinite;}
    @keyframes b{0%{transform:translateX(-110%);}100%{transform:translateX(320%);}}
    .pct{font-size:12px;color:#9aa0a6;margin-top:10px;}
  </style></head><body><div class="wrap">
    <h1>Downloading NeuroDesk update&hellip;</h1>
    <div class="bar"><div class="fill" id="fill"></div></div>
    <div class="pct" id="pct">Starting download&hellip;</div>
  </div></body></html>`;
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  win.on('close', () => { if (win.isAlwaysOnTop()) {} });
  return win;
}

function updateProgress(win, { received, total }) {
  if (!win || win.isDestroyed()) return;
  win.webContents.executeJavaScript(
    `(() => {
       const fill = document.getElementById('fill');
       const pct = document.getElementById('pct');
       const total = ${total || 0}, received = ${received || 0};
       if (total > 0) {
         const p = Math.min(100, Math.round((received / total) * 100));
         fill.style.animation = 'none';
         fill.style.width = p + '%';
         pct.textContent = p + '% (' + (received / 1048576).toFixed(1) + ' / ' + (total / 1048576).toFixed(1) + ' MB)';
       } else {
         pct.textContent = (received / 1048576).toFixed(1) + ' MB downloaded';
       }
     })();`
  ).catch(() => {});
}

async function downloadAndInstall(meta, getWindow) {
  const fileName = meta.installer || ('NeuroDeskSetup-' + meta.version + '.exe');
  const url = meta.url || ('https://github.com/Shabd45261/NeuroDesk/releases/download/v' + meta.version + '/' + fileName);
  const dest = path.join(DOWNLOAD_DIR, fileName);
  const progressWin = showProgressWindow();

  try {
    await downloadFile(url, dest, (p) => updateProgress(progressWin, p));

    if (meta.sha256) {
      const actual = await sha256Of(dest);
      if (actual !== meta.sha256.toLowerCase()) {
        throw new Error('Checksum mismatch. The update file may be corrupt.');
      }
    }

    const win = getWindow();
    const { response } = await dialog.showMessageBox(win || progressWin, {
      type: 'info',
      title: 'Update ready',
      message: 'NeuroDesk ' + meta.version + ' downloaded',
      detail: 'The installer will now open. Follow the on-screen steps to complete the update. NeuroDesk will close automatically.',
      buttons: ['Install update'],
      defaultId: 0,
      noLink: true,
    });

    if (response === 0) {
      const { spawn } = require('child_process');
      spawn(dest, [], { detached: true, stdio: 'ignore', windowsHide: false });
      setTimeout(() => app.quit(), 500);
    }
  } catch (e) {
    if (progressWin && !progressWin.isDestroyed()) progressWin.destroy();
    dialog.showMessageBox(getWindow(), {
      type: 'error',
      title: 'Update failed',
      message: 'Could not download the update',
      detail: String(e && e.message ? e.message : e),
      buttons: ['OK'],
    }).catch(() => {});
  }
}

async function checkOnce(getWindow, opts) {
  if (checking) return;
  checking = true;
  const manual = !!(opts && opts.manual);
  try {
    const meta = await fetchJSON(VERSION_URL);
    const current = app.getVersion();
    if (compareVersions(meta.version, current) <= 0) {
      if (manual) dialog.showMessageBox(getWindow(), {
        type: 'info',
        title: 'No updates',
        message: 'NeuroDesk is up to date',
        detail: 'You are running the latest version: v' + current,
        buttons: ['OK'],
        noLink: true,
      });
      return;
    }

    const { response } = await dialog.showMessageBox(getWindow(), {
      type: 'info',
      title: 'Update available',
      message: 'A new version of NeuroDesk is available: v' + meta.version,
      detail: 'You are running v' + current + '. Download and install the update now?',
      buttons: ['Download & install', 'Later'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) {
      await downloadAndInstall(meta, getWindow);
    }
  } catch (_) {
    // offline or unreachable - try again later
    if (manual) dialog.showMessageBox(getWindow(), {
      type: 'error',
      title: 'Check failed',
      message: 'Could not reach the update server',
      detail: 'Check your internet connection and try again.',
      buttons: ['OK'],
      noLink: true,
    }).catch(() => {});
  } finally {
    checking = false;
  }
}

function setup(getWindow) {
  if (!app.isPackaged) return; // only in the shipped build
  setTimeout(() => checkOnce(getWindow), 8000);
  setInterval(() => checkOnce(getWindow), CHECK_INTERVAL_MS);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates…',
          accelerator: 'Ctrl+Shift+U',
          click: () => checkOnce(getWindow, { manual: true }),
        },
      ],
    },
  ]));
}

module.exports = { setup, checkOnce };