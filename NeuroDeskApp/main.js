const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const updater = require('./updater');

// WSL2 backend design: LocalAI/NeuroDesk inference backends (llama-cpp and
// friends) are only ever released as Linux/macOS artifacts, so the server must
// run inside Windows Subsystem for Linux. The Electron shell handles
// deploying the bundled linux/amd64 binary into the WSL home folder, running
// it there, and policing the port.
const LINUX_BIN = app.isPackaged
  ? path.join(process.resourcesPath, 'neurodesk-linux')
  : 'D:\\NeuroDesk\\NeuroDesk\\neurodesk-linux-amd64';
const WSL_RUN_DIR = '~/neurodesk';
const WSL_BACKEND_BIN = WSL_RUN_DIR + '/neurodesk';
const WSL_MODELS_DIR = WSL_RUN_DIR + '/models';
const APP_URL = 'http://127.0.0.1:8080';
const WINDOW_URLS = ['http://127.0.0.1:8080/', 'http://[::1]:8080/'];

let mainWindow = null;
let backendProc = null;
let windowUrlIndex = 0;

// WSL2's localhost relay occasionally binds only the IPv6 loopback (::1) and
// not 127.0.0.1, so accept a backend that answers on EITHER loopback address.
// Returns the working URL (or '' if neither answers).
async function probeBackend() {
  for (let i = 0; i < WINDOW_URLS.length; i++) {
    try {
      const r = await fetch(WINDOW_URLS[i]);
      if (r.ok) return WINDOW_URLS[i];
    } catch (_) {}
  }
  return '';
}

// Runs a command inside the default WSL distro and resolves with
// { code, out, err } once it exits.
function wslRun(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn('wsl.exe', args, { windowsHide: true, ...opts });
    let out = '';
    let err = '';
    child.stdout && child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr && child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => resolve({ code: -1, out, err: err || String(e) }));
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

async function wslReady() {
  const res = await wslRun(['--status']);
  const text = (res.out + ' ' + res.err).toLowerCase();
  if (res.code !== 0 || text.includes('optional_component') || text.includes('no installed distributions')) {
    return false;
  }
  // A bare distro check: `wsl echo ok` must succeed.
  const ok = await wslRun(['-e', 'echo', 'ok']);
  return ok.code === 0;
}

// Copies the bundled linux binary into the WSL home and ensures the runtime
// directories exist. Skips the copy when the deployed file already matches
// the bundle (cheap write otherwise, but avoids needless traffic).
async function deployBackend() {
  const bundle = fs.statSync(LINUX_BIN);
  await wslRun(['-e', 'bash', '-lc', 'mkdir -p ' + WSL_RUN_DIR + '/models']);

  const probe = await wslRun(['-e', 'bash', '-lc', 'cat ' + WSL_RUN_DIR + '/.bundle-version 2>/dev/null']);
  const marker = `${bundle.size}:${bundle.mtimeMs}`;
  if (probe.code === 0 && probe.out.trim() === marker) {
    return;
  }

  await new Promise((resolve, reject) => {
    const child = spawn('wsl.exe', ['-e', 'bash', '-lc',
      'cat > ' + WSL_BACKEND_BIN + ' && chmod +x ' + WSL_BACKEND_BIN + ' && echo ' + marker + ' > ' + WSL_RUN_DIR + '/.bundle-version'],
      { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    child.stderr && child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error('Deploying backend into WSL failed (exit ' + code + '): ' + err.trim()));
    });
    fs.createReadStream(LINUX_BIN).pipe(child.stdin);
  });
}

const STARTUP_TIMEOUT_MS = 4 * 60 * 1000; // cold WSL boot + deploy can exceed 1 min

function startBackend() {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    const fail = (msg) => { if (!settled) { settled = true; reject(new Error(msg)); } };
    try {
      if (backendProc) { resolve(); return; } // never spawn two backends
      const up = await probeBackend();
      if (up) {
        // A server (from this or a previous session) is already answering.
        windowUrlIndex = up.includes('::1') ? 1 : 0;
        resolve();
        return;
      }

      if (!(await wslReady())) {
        dialog.showErrorBox(
          'NeuroDesk needs WSL 2',
          'This app runs the AI server inside Windows Subsystem for Linux, which is not installed or has no distribution yet.\n\n' +
          'Please run these steps as Administrator and reboot, then start NeuroDesk again:\n' +
          '  1. wsl --install --no-distribution\n' +
          '  2. reboot the PC\n' +
          '  3. wsl --install -d Ubuntu\n\n' +
          'You can verify with:  wsl -l -v'
        );
        app.quit();
        return fail(new Error('WSL 2 not available'));
      }

      if (!fs.existsSync(LINUX_BIN)) {
        throw new Error('Bundled Linux backend binary not found: ' + LINUX_BIN);
      }

      await deployBackend();

      const out = fs.openSync(path.join(app.getPath('userData'), 'backend.out.log'), 'a');
      const err = fs.openSync(path.join(app.getPath('userData'), 'backend.err.log'), 'a');

      backendProc = spawn('wsl.exe', ['--cd', WSL_RUN_DIR, '-e', 'bash', '-lc',
        WSL_BACKEND_BIN + ' --address 0.0.0.0:8080 --models-path ' + WSL_MODELS_DIR],
        { stdio: ['ignore', out, err], windowsHide: true });

      backendProc.on('error', (e) => fail('Failed to launch backend: ' + e.message));
      backendProc.on('exit', (code) => {
        if (!mainWindow) {
          fail('Backend exited (code ' + code + ') before becoming ready. Check backend.err.log');
        }
      });

      const started = Date.now();
      const probe = setInterval(async () => {
        if (settled) { clearInterval(probe); return; }
        const up = await probeBackend();
        if (up) {
          clearInterval(probe);
          windowUrlIndex = up.includes('::1') ? 1 : 0;
          resolve();
        } else if (Date.now() - started > STARTUP_TIMEOUT_MS) {
          clearInterval(probe);
          fail('Backend did not start within ' + (STARTUP_TIMEOUT_MS / 60000) + ' minutes. Check backend.err.log\n\n' +
            'If this keeps happening, close NeuroDesk and run from a terminal:  wsl --shutdown\n' +
            'then start NeuroDesk again (this resets WSL networking).');
        }
      }, 1000);
    } catch (e) {
      fail(String((e && e.message) || e));
    }
  });
}

function stopBackend() {
  if (!backendProc) return;
  try { backendProc.kill(); } catch (_) {}
  backendProc = null;
  // The Linux process outlives its wsl.exe client, so kill it explicitly.
  wslRun(['-e', 'bash', '-lc', "pkill -f 'neurodesk --address' || true"]);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  // The WSL2 localhost relay can serve only ::1 while 127.0.0.1 stays dead,
  // so keep cycling between the two loopback URLs until one renders — loading
  // the wrong one is what produced a blank white window.
  let failCount = 0;
  const loadUI = () => {
    mainWindow.loadURL(WINDOW_URLS[windowUrlIndex % 2]);
    windowUrlIndex++;
  };
  mainWindow.webContents.on('did-fail-load', (ev, code, desc, url, isMainFrame) => {
    if (isMainFrame && failCount < 24) {
      failCount++;
      setTimeout(loadUI, 1500);
    }
  });
  loadUI();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      await startBackend();
      createWindow();
      updater.setup(() => mainWindow);
    } catch (e) {
      dialog.showErrorBox('NeuroDesk failed to start', String(e));
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}

app.on('will-quit', stopBackend);