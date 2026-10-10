const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const os = require('node:os');
const { NativeBridge, availability } = require('./native-bridge.cjs');
const native = new NativeBridge();
const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();

let win;
let permanentKey = '';
let minting = false;
let lastMint = 0;
const page = pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
function trusted(event) {
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== page) {
    throw new Error('Untrusted request');
  }
}
app.whenReady().then(() => {
  if (!ownsInstance) return;
  session.defaultSession.setPermissionRequestHandler((contents, permission, done, details) => {
    done(contents === win?.webContents && details.requestingUrl === page && permission === 'media' &&
      (details.mediaTypes || []).every(type => type === 'video'));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission) =>
    contents === win?.webContents && contents.getURL() === page && permission === 'media');
  ipcMain.handle('key:set', (event, key) => {
    trusted(event);
    if (typeof key !== 'string' || key.trim().length < 8 || key.length > 4096) throw new Error('Enter a valid API key');
    permanentKey = key.trim();
    return true;
  });
  ipcMain.handle('key:clear', event => { trusted(event); permanentKey = ''; });
  ipcMain.handle('token:create', async event => {
    trusted(event);
    if (!permanentKey) throw new Error('Add your Decart API key first');
    if (minting || Date.now() - lastMint < 2000) throw new Error('Please wait before reconnecting');
    minting = true;
    lastMint = Date.now();
    try {
      const { createDecartClient } = await import('@decartai/sdk');
      const client = createDecartClient({ apiKey: permanentKey });
      const token = await client.tokens.create({ expiresIn: 300, allowedModels: ['lucy-2.5'] });
      return { apiKey: token.apiKey };
    } catch {
      throw new Error('Decart authentication failed. Check your key, account access, and connection.');
    } finally { minting = false; }
  });
  ipcMain.handle('system:status', event => {
    trusted(event);
    const info = availability();
    return { platform: process.platform, release: os.release(), virtualCameraAvailable: info.present, nativeReason: info.reason, running: native.ready }; 
  });
  ipcMain.handle('virtual:start', event => { trusted(event); return native.start(); });
  ipcMain.handle('virtual:stop', event => { trusted(event); return native.stop(); });
  ipcMain.handle('virtual:frame', (event, bytes) => { trusted(event); return native.write(bytes); });
  win = new BrowserWindow({
    width: 1240, height: 860, minWidth: 850, minHeight: 650,
    backgroundColor: '#eef7fc', title: 'BenZica AI Camera — Windows 11 Alpha',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.loadURL(page);
});
app.on('window-all-closed', () => { permanentKey = ''; app.quit(); });

let quitting = false;
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault(); permanentKey = '';
  native.stop().finally(() => { quitting = true; app.quit(); });
});
