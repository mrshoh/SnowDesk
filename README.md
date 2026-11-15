# SnowDesk

Weather for your desktop: **snow, rain, sakura, leaves, fireflies and starfall**, drawn over your windows.
Inspired by the idea of desktop weather apps; all code and artwork here are original (every sprite and wallpaper is drawn in code).

| Platform | Folder | Tech |
|---|---|---|
| macOS 13+ (Apple Silicon and Intel) | [`mac/`](mac) | Swift, AppKit, SpriteKit |
| Windows 10/11 (x64) | [`windows/`](windows) | Electron, Canvas 2D, Win32 via koffi |

## Features
- Six effects, switchable from the menu-bar / tray icon; intensity Light / Normal / Heavy.
- Snow, petals and leaves **land on open windows and on the Dock / taskbar** and pile up. Snow forms smooth drifts, and windows in front hide the snow behind them.
- **Drag a window** and its snow breaks into clumps and slides off.
- **Move the pointer through the snow** to plow it; leaves and petals scatter, fireflies gather around a still pointer.
- Varied leaves (six shapes, six colourways) and sakura (petals, whole blossoms, curled petals).
- Five wallpapers drawn in code, with "Restore original wallpaper".
- Click-through overlay, multi-monitor, pauses for full-screen apps and display sleep, halves the effect on battery.

## Build
**macOS** (needs Xcode command line tools): `cd mac && ./build.sh` produces `SnowDesk.app` and `SnowDesk.dmg`.
Grant Accessibility access so snow lands exactly on the Dock.

**Windows**: `cd windows && npm install && npm start` (or `npm run dist` for an installer).
Windows binaries are large, so they are published under **Releases** instead of being committed.

## Notes
- The apps are not code-signed or notarized: macOS shows "unidentified developer" (right-click, Open) and Windows SmartScreen shows "Windows protected your PC" (More info, Run anyway).
- The Windows version was built and tested headlessly; the Windows-API layer is the least-tested part.
