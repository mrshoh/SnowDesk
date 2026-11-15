# SnowDesk for Windows

Weather for your desktop: **snow, rain, sakura, leaves, fireflies, starfall.**
Original code and artwork (everything is drawn in code - no image assets).

## Install
* **SnowDesk-Setup-1.0.0.exe** - installer (per-user, no admin rights needed).
* **SnowDesk-1.0.0-win.zip** - portable: unzip anywhere and run `SnowDesk.exe`.

SnowDesk lives in the system tray (bottom-right, maybe under the ^ arrow). Right-click the snowflake icon.

> The app is not code-signed, so Windows SmartScreen may say "Windows protected your PC".
> Click **More info -> Run anyway** (once).

## What it does
* Six effects, switchable from the tray menu; intensity Light / Normal / Heavy.
* Snow, petals and leaves **land on your open windows and on the taskbar** and pile up.
  Snow forms smooth drifts; windows in front hide the snow behind them.
* **Drag a window** and the snow on it breaks into clumps and slides off.
* **Move the mouse through the snow** to plow it. Leaves and petals scatter; fireflies gather around a still pointer.
* Five wallpapers drawn in code, with "Restore original wallpaper".
* Click-through (never blocks your mouse), multi-monitor, pauses for full-screen games/video and while the
  PC is locked, and halves the effect on battery power.
* Launch at login (installed version).

## Build from source (on Windows, macOS or Linux)
```
npm install
npm start          # run in development
npm run dist       # build installer + zip into ./release  (needs Wine on Linux/macOS)
npm run selftest   # headless smoke test of all effects
```
Layout: `src/engine.js` (particles, drifts, physics) - `src/textures.js` (sprites) -
`src/wallpapers.js` - `src/win32.cjs` (Windows API via koffi) - `main.cjs` (tray, windows, polling).
`test/` has headless render tests (`node test/run_effects.mjs`).
