'use strict';
const { app, BrowserWindow, Tray, Menu, nativeImage, screen, powerMonitor, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const win32 = require('./src/win32.cjs');

const EFFECTS = [
  ['snow', 'Snow'], ['rain', 'Rain'], ['sakura', 'Sakura'],
  ['leaves', 'Leaves'], ['fireflies', 'Fireflies'], ['starfall', 'Starfall'],
];
const WALLPAPERS = ['Snow', 'Rain', 'Autumn', 'Fireflies', 'Stars'];
const INTENSITY = { light: 0.5, normal: 1.0, heavy: 1.7 };
const SELFTEST = process.argv.includes('--selftest');
function log(msg) {
  console.log(msg);
  if (process.env.SNOWDESK_LOG) { try { fs.appendFileSync(process.env.SNOWDESK_LOG, msg + '\n'); } catch (e) { /* ignore */ } }
}

let errorOnce = new Set();
function errorLog(msg) {
  try {
    const f = path.join(app.getPath('userData'), 'error.log');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) { /* ignore */ }
}
function errorLogOnce(key, msg) { if (!errorOnce.has(key)) { errorOnce.add(key); errorLog(msg); } }
process.on('uncaughtException', (e) => { log('UNCAUGHT ' + (e && e.stack)); errorLog('UNCAUGHT ' + (e && e.stack)); });
process.on('unhandledRejection', (e) => { log('UNHANDLED ' + ((e && e.stack) || e)); errorLog('UNHANDLED ' + ((e && e.stack) || e)); });
app.setAppUserModelId('com.snowdesk.app');
if (!SELFTEST && !app.requestSingleInstanceLock()) { app.quit(); }

// ------------------------------------------------------------ settings

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let state = { effect: 'snow', intensity: 'normal', land: true, enabled: true, origWallpaper: null };
function loadSettings() {
  try { state = { ...state, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch (e) { /* first run */ }
}
function saveSettings() {
  if (SELFTEST) return;
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(state, null, 2)); }
  catch (e) { /* ignore */ }
}

// ------------------------------------------------------------ overlays

let overlays = [];            // { win, display, ready }
let tray = null;
let pausedFullscreen = false;
let pausedLocked = false;
let onBattery = false;
let rebuildTimer = null;
const isPaused = () => pausedFullscreen || pausedLocked;

function density() { return INTENSITY[state.intensity] * (onBattery ? 0.5 : 1); }

function createOverlay(display) {
  const b = display.bounds;
  const win = new BrowserWindow({
    x: b.x, y: b.y, width: b.width, height: b.height,
    frame: false, transparent: true, resizable: false, movable: false, focusable: false,
    skipTaskbar: true, hasShadow: false, alwaysOnTop: true, show: false, fullscreenable: false,
    thickFrame: false, backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  win.setBounds(b);
  win.loadFile(path.join(__dirname, 'overlay.html'));
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2 || SELFTEST) console.log(`[overlay] ${message}`);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.error('overlay renderer gone:', d.reason));
  const ov = { win, display, ready: false };
  win.once('ready-to-show', () => { if (state.enabled && !isPaused()) win.showInactive(); });
  return ov;
}

function rebuildOverlays() {
  for (const ov of overlays) { try { ov.win.destroy(); } catch (e) { /* gone */ } }
  overlays = [];
  if (!state.enabled) return;
  for (const d of screen.getAllDisplays()) overlays.push(createOverlay(d));
}

function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuildOverlays, 400);
}

function sendConfig() {
  const cfg = { effect: state.effect, density: density(), land: state.land };
  for (const ov of overlays) if (ov.ready) ov.win.webContents.send('config', cfg);
}

function applyPause() {
  const p = isPaused();
  for (const ov of overlays) {
    if (!ov.ready) continue;
    ov.win.webContents.send('pause', p);
    if (p) ov.win.hide(); else if (state.enabled) ov.win.showInactive();
  }
}

ipcMain.on('overlay-ready', (event) => {
  const ov = overlays.find((o) => o.win.webContents === event.sender);
  if (!ov) return;
  ov.ready = true;
  ov.win.webContents.send('config', { effect: state.effect, density: density(), land: state.land });
});

// ------------------------------------------------------------ window tracking

function groundFor(d) {
  // snow lands on the top edge of a bottom taskbar
  const b = d.bounds, wa = d.workArea;
  const gap = (b.y + b.height) - (wa.y + wa.height);
  if (gap > 8 && wa.y === b.y) return { x: wa.x - b.x, y: wa.y + wa.height - b.y, w: wa.width };
  return null;
}

function tickWindows() {
  try { tickWindowsInner(); } catch (e) { errorLogOnce('tickWindows', 'tickWindows: ' + (e && e.stack)); }
}

function tickWindowsInner() {
  if (!state.enabled || isPaused() || overlays.length === 0) return;
  const raw = win32.enumWindows();
  const wins = [];
  for (const r of raw) {
    const d = screen.screenToDipRect(null, { x: r.x, y: r.y, width: r.w, height: r.h });
    wins.push({ id: r.id, x: d.x, y: d.y, w: d.width, h: d.height });
  }
  for (const ov of overlays) {
    if (!ov.ready) continue;
    const b = ov.display.bounds;
    const list = [];
    for (const w of wins) {
      if (w.x < b.x + b.width && w.x + w.w > b.x && w.y < b.y + b.height && w.y + w.h > b.y) {
        list.push({ id: w.id, x: w.x - b.x, y: w.y - b.y, w: w.w, h: w.h });
      }
    }
    ov.win.webContents.send('surfaces', { wins: list, ground: groundFor(ov.display) });
  }
}

let lastPt = { x: -1, y: -1 };
function tickPointer() {
  if (!state.enabled || isPaused() || overlays.length === 0) return;
  const p = screen.getCursorScreenPoint();
  if (p.x === lastPt.x && p.y === lastPt.y) return;
  lastPt = p;
  for (const ov of overlays) {
    if (!ov.ready) continue;
    ov.win.webContents.send('pointer', { x: p.x - ov.display.bounds.x, y: p.y - ov.display.bounds.y });
  }
}

function tickFullscreen() {
  const busy = win32.fullscreenBusy();
  if (busy !== pausedFullscreen) { pausedFullscreen = busy; applyPause(); }
}

// ------------------------------------------------------------ wallpapers

const wallpaperDir = () => path.join(app.getPath('userData'), 'Wallpapers');

function saveOriginalWallpaper() {
  if (state.origWallpaper === null) { state.origWallpaper = win32.getWallpaper() || ''; saveSettings(); }
}

function applyWallpaper(name) {
  saveOriginalWallpaper();
  const file = path.join(wallpaperDir(), `${name}.jpg`);
  if (fs.existsSync(file)) { win32.setWallpaper(file); return; }
  const ov = overlays.find((o) => o.ready);
  if (ov) ov.win.webContents.send('render-wallpaper', name);
}

ipcMain.on('save-wallpaper', (_e, name, data) => {
  try {
    fs.mkdirSync(wallpaperDir(), { recursive: true });
    const file = path.join(wallpaperDir(), `${name}.jpg`);
    fs.writeFileSync(file, Buffer.from(data));
    if (SELFTEST) log(`SELFTEST wallpaper ${name}: ${(fs.statSync(file).size / 1024) | 0} KB`);
    else win32.setWallpaper(file);
  } catch (e) { console.error('wallpaper save failed', e); }
});

function restoreWallpaper() {
  if (state.origWallpaper) win32.setWallpaper(state.origWallpaper);
}

// ------------------------------------------------------------ tray menu

function buildMenu() {
  const template = [
    { label: 'SnowDesk', enabled: false },
    { type: 'separator' },
    ...EFFECTS.map(([id, label]) => ({
      label, type: 'radio', checked: state.effect === id,
      click: () => { state.effect = id; saveSettings(); sendConfig(); buildMenu(); },
    })),
    { type: 'separator' },
    {
      label: 'Wallpapers',
      submenu: [
        ...WALLPAPERS.map((n) => ({ label: n, click: () => applyWallpaper(n) })),
        { type: 'separator' },
        { label: 'Restore original wallpaper', click: restoreWallpaper },
      ],
    },
    {
      label: 'Intensity',
      submenu: Object.keys(INTENSITY).map((k) => ({
        label: k[0].toUpperCase() + k.slice(1), type: 'radio', checked: state.intensity === k,
        click: () => { state.intensity = k; saveSettings(); sendConfig(); buildMenu(); },
      })),
    },
    {
      label: 'Land on windows', type: 'checkbox', checked: state.land,
      click: (item) => { state.land = item.checked; saveSettings(); sendConfig(); },
    },
    {
      label: 'Launch at login', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      enabled: app.isPackaged,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    {
      label: state.enabled ? 'Pause weather' : 'Resume weather',
      click: () => { state.enabled = !state.enabled; saveSettings(); rebuildOverlays(); buildMenu(); },
    },
    { label: 'Quit SnowDesk', click: () => app.quit() },
  ];
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(template));
}

// ------------------------------------------------------------ self-test (--selftest)

function runSelfTest() {
  log(`SELFTEST platform=${process.platform} win32layer=${win32.available} displays=${screen.getAllDisplays().length}`);
  try {
    const wins = win32.enumWindows();
    log(`SELFTEST win32 windows=${wins.length} first=${JSON.stringify(wins[0] || null)} fullscreenBusy=${win32.fullscreenBusy()} wallpaper="${win32.getWallpaper()}"`);
  } catch (e) { log(`SELFTEST win32 ERROR ${e && e.stack}`); }
  let idx = 0;
  const ov = () => overlays.find((o) => o.ready);
  ipcMain.on('stats', (_e, s) => log(`SELFTEST ${s}`));
  setTimeout(() => ov() && ov().win.webContents.send('render-wallpaper', 'Snow'), 4500);
  state.intensity = 'heavy';
  const step = () => {
    const o = ov();
    if (!o) { log('SELFTEST no overlay ready'); app.exit(1); return; }
    state.effect = EFFECTS[idx][0];
    sendConfig();
    setTimeout(() => o.win.webContents.send('stats-request'), 2500);
    idx += 1;
    if (idx < EFFECTS.length) setTimeout(step, 3000); else setTimeout(() => app.exit(0), 3500);
  };
  setTimeout(step, 2000);
}

// ------------------------------------------------------------ startup

app.whenReady().then(() => {
  loadSettings();
  if (process.platform === 'win32' && !win32.available) errorLog('Windows API layer unavailable: ' + win32.loadError);
  if (process.platform === 'darwin') app.dock && app.dock.hide();
  onBattery = powerMonitor.isOnBatteryPower();

  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('SnowDesk');
  buildMenu();
  tray.on('click', () => tray.popUpContextMenu());

  rebuildOverlays();
  setInterval(tickWindows, 33);
  setInterval(tickPointer, 16);
  setInterval(tickFullscreen, 500);
  setInterval(() => { const b = powerMonitor.isOnBatteryPower(); if (b !== onBattery) { onBattery = b; sendConfig(); } }, 15000);

  screen.on('display-added', scheduleRebuild);
  screen.on('display-removed', scheduleRebuild);
  screen.on('display-metrics-changed', scheduleRebuild);
  powerMonitor.on('on-battery', () => { onBattery = true; sendConfig(); });
  powerMonitor.on('on-ac', () => { onBattery = false; sendConfig(); });
  powerMonitor.on('lock-screen', () => { pausedLocked = true; applyPause(); });
  powerMonitor.on('unlock-screen', () => { pausedLocked = false; applyPause(); });
  powerMonitor.on('suspend', () => { pausedLocked = true; applyPause(); });
  powerMonitor.on('resume', () => { pausedLocked = false; applyPause(); });

  if (SELFTEST) runSelfTest();
});

app.on('window-all-closed', () => { /* keep running in the tray */ });
