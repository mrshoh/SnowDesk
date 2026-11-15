'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const on = (ch) => (cb) => ipcRenderer.on(ch, (_e, v) => cb(v));
contextBridge.exposeInMainWorld('snow', {
  onConfig: on('config'),
  onSurfaces: on('surfaces'),
  onPointer: on('pointer'),
  onPause: on('pause'),
  onRenderWallpaper: on('render-wallpaper'),
  onStatsRequest: on('stats-request'),
  ready: () => ipcRenderer.send('overlay-ready'),
  saveWallpaper: (name, buf) => ipcRenderer.send('save-wallpaper', name, buf),
  sendStats: (s) => ipcRenderer.send('stats', s),
});
