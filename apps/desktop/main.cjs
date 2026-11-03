// EAZAZI LEAD INSTAGRAM — Windows desktop shell.
// Loads the shared web UI (built into ./renderer) over a privileged app:// scheme and talks to the same backend API.
const { app, BrowserWindow, ipcMain, net, Notification, protocol, safeStorage, shell, session, Menu, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RENDERER = path.join(__dirname, 'renderer');
const ORIGIN = 'app://eazazi';
const DEFAULT_SERVER = process.env.EAZAZI_SERVER_URL || 'http://localhost:4000';
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
const tokenFile = () => path.join(app.getPath('userData'), 'session.bin');

function readCfg() { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return {}; } }
function writeCfg(c) { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c, null, 2)); }

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();
app.setAppUserModelId('ir.eazazi.lead');

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 640, show: false, backgroundColor: '#f2f5fb',
    title: 'EAZAZI LEAD INSTAGRAM', icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  // Keep navigation inside the app; open everything else in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });
  // Error recovery: if the renderer crashes or fails to load, offer reload.
  win.webContents.on('render-process-gone', async () => {
    const r = await dialog.showMessageBox(win, { type: 'error', buttons: ['بارگذاری مجدد', 'خروج'], message: 'برنامه با خطا مواجه شد.' });
    if (r.response === 0) win.reload(); else app.quit();
  });
  win.webContents.on('did-fail-load', () => setTimeout(() => win && win.loadURL(`${ORIGIN}/index.html`), 1500));
  win.loadURL(`${ORIGIN}/index.html`);
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  // Serve renderer files with path-traversal protection and a strict CSP.
  protocol.handle('app', async (req) => {
    const { pathname } = new URL(req.url);
    const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = path.normalize(path.join(RENDERER, rel));
    if (!file.startsWith(RENDERER)) return new Response('forbidden', { status: 403 });
    const res = await net.fetch(pathToFileURL(fs.existsSync(file) ? file : path.join(RENDERER, 'index.html')).toString());
    const server = readCfg().serverUrl || DEFAULT_SERVER;
    const headers = new Headers(res.headers);
    headers.set('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; connect-src 'self' ${server}`);
    return new Response(res.body, { status: res.status, headers });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'notifications' || permission === 'clipboard-sanitized-write'));

  ipcMain.handle('server:get', () => readCfg().serverUrl || DEFAULT_SERVER);
  ipcMain.handle('server:set', (_e, url) => {
    if (typeof url !== 'string' || !/^https?:\/\/[^\s]+$/.test(url)) throw new Error('invalid url');
    writeCfg({ ...readCfg(), serverUrl: url.replace(/\/$/, '') });
  });
  // Refresh token is encrypted with the OS (DPAPI on Windows) before touching disk.
  ipcMain.handle('token:get', () => {
    try { const b = fs.readFileSync(tokenFile()); return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(b) : null; } catch { return null; }
  });
  ipcMain.handle('token:set', (_e, token) => {
    if (!token) { fs.rmSync(tokenFile(), { force: true }); return; }
    if (!safeStorage.isEncryptionAvailable()) return; // never store tokens in plain text
    fs.mkdirSync(path.dirname(tokenFile()), { recursive: true });
    fs.writeFileSync(tokenFile(), safeStorage.encryptString(String(token)));
  });
  ipcMain.handle('notify', (_e, title, body) => {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title: String(title).slice(0, 120), body: String(body).slice(0, 300), icon: path.join(__dirname, 'build', 'icon.png') });
    n.on('click', () => { if (win) { win.show(); win.focus(); } });
    n.show();
  });
  ipcMain.handle('open-external', (_e, url) => { if (typeof url === 'string' && /^https:\/\//.test(url)) return shell.openExternal(url); });
  ipcMain.handle('version', () => app.getVersion());
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) return { status: 'dev' };
    try {
      const { autoUpdater } = require('electron-updater');
      const feed = readCfg().updateUrl || process.env.EAZAZI_UPDATE_URL;
      if (feed) autoUpdater.setFeedURL({ provider: 'generic', url: feed });
      const r = await autoUpdater.checkForUpdatesAndNotify();
      return { status: r?.updateInfo?.version && r.updateInfo.version !== app.getVersion() ? 'available' : 'latest', version: r?.updateInfo?.version };
    } catch (e) { return { status: 'error', version: String(e.message || e) }; }
  });

  createWindow();
});

app.on('window-all-closed', () => app.quit());
