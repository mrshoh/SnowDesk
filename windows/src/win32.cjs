'use strict';
// Thin Windows API layer (koffi FFI). On other platforms every call is a harmless no-op,
// so the rest of the app can be tested anywhere.
const isWin = process.platform === 'win32';

const stub = {
  available: false,
  enumWindows: () => [],
  fullscreenBusy: () => false,
  setWallpaper: () => false,
  getWallpaper: () => '',
};

function load() {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const dwm = koffi.load('dwmapi.dll');
  const shell32 = koffi.load('shell32.dll');

  const RECT = koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  const EnumProc = koffi.proto('bool __stdcall EnumProc(void *hwnd, intptr_t lparam)');

  const EnumWindows = user32.func('bool __stdcall EnumWindows(EnumProc *cb, intptr_t lparam)');
  const IsWindowVisible = user32.func('bool __stdcall IsWindowVisible(void *hwnd)');
  const IsIconic = user32.func('bool __stdcall IsIconic(void *hwnd)');
  const GetWindowRect = user32.func('bool __stdcall GetWindowRect(void *hwnd, _Out_ RECT *rect)');
  const GetWindowLongW = user32.func('int32 __stdcall GetWindowLongW(void *hwnd, int32 index)');
  const GetWindowThreadProcessId = user32.func('uint32 __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32 *pid)');
  const GetClassNameW = user32.func('int32 __stdcall GetClassNameW(void *hwnd, _Out_ uint16_t *buf, int32 max)');
  const SystemParametersInfoW = user32.func('bool __stdcall SystemParametersInfoW(uint32 action, uint32 param, void *pv, uint32 winIni)');
  const DwmGetRect = dwm.func('int32 __stdcall DwmGetWindowAttribute(void *hwnd, uint32 attr, _Out_ RECT *pv, uint32 cb)');
  const DwmGetInt = dwm.func('int32 __stdcall DwmGetWindowAttribute(void *hwnd, uint32 attr, _Out_ int32 *pv, uint32 cb)');
  const SHQueryUserNotificationState = shell32.func('int32 __stdcall SHQueryUserNotificationState(_Out_ int32 *state)');

  const SKIP_CLASSES = new Set([
    'Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd', 'Windows.UI.Core.CoreWindow',
    'XamlExplorerHostIslandWindow', 'TopLevelWindowForOverflowXamlIsland', 'NotifyIconOverflowWindow',
    'TaskListThumbnailWnd', 'MultitaskingViewFrame',
  ]);
  const ownPid = process.pid;
  const classBuf = new Uint16Array(256);
  let sink = null;

  function className(hwnd) {
    const n = GetClassNameW(hwnd, classBuf, 256);
    return n > 0 ? String.fromCharCode(...classBuf.subarray(0, n)) : '';
  }

  function collect(hwnd) {
    if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) return;
    const ex = GetWindowLongW(hwnd, -20) >>> 0;                     // GWL_EXSTYLE
    if (ex & 0x00000080) return;                                    // WS_EX_TOOLWINDOW
    if (ex & 0x08000000) return;                                    // WS_EX_NOACTIVATE
    if (ex & 0x00000020) return;                                    // WS_EX_TRANSPARENT (click-through overlays)
    const cloaked = [0];
    if (DwmGetInt(hwnd, 14, cloaked, 4) === 0 && cloaked[0] !== 0) return;   // DWMWA_CLOAKED
    const pid = [0];
    GetWindowThreadProcessId(hwnd, pid);
    if (pid[0] === ownPid) return;
    if (SKIP_CLASSES.has(className(hwnd))) return;
    const r = {};
    // visible frame without the invisible resize borders
    if (DwmGetRect(hwnd, 9, r, 16) !== 0 && !GetWindowRect(hwnd, r)) return;   // DWMWA_EXTENDED_FRAME_BOUNDS
    const w = r.right - r.left, h = r.bottom - r.top;
    if (w < 120 || h < 60) return;
    sink.push({ id: Number(koffi.address(hwnd)), x: r.left, y: r.top, w, h });
  }

  const callback = koffi.register((hwnd) => { if (sink) { try { collect(hwnd); } catch (e) { /* skip */ } } return true; },
    koffi.pointer(EnumProc));

  return {
    available: true,
    // top-level windows, front to back, in physical pixels
    enumWindows() {
      const out = [];
      sink = out;
      try { EnumWindows(callback, 0); } finally { sink = null; }
      return out;
    },
    // true while a full-screen game/video/presentation is running
    fullscreenBusy() {
      const s = [0];
      if (SHQueryUserNotificationState(s) !== 0) return false;
      return s[0] === 2 || s[0] === 3 || s[0] === 4;
    },
    setWallpaper(file) {
      const buf = Buffer.from(file + '\0', 'utf16le');
      return !!SystemParametersInfoW(0x0014, 0, buf, 0x03);          // SPI_SETDESKWALLPAPER, update + broadcast
    },
    getWallpaper() {
      const buf = Buffer.alloc(520 * 2);
      SystemParametersInfoW(0x0073, 520, buf, 0);                    // SPI_GETDESKWALLPAPER
      return buf.toString('utf16le').split('\0')[0];
    },
  };
}

let api = stub;
if (isWin) {
  try { api = load(); } catch (e) { console.error('win32 layer failed to load:', e); stub.loadError = e && e.stack; api = stub; }
}
module.exports = api;
