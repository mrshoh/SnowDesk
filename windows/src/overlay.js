// Renderer for one overlay window (one per display).
import { Scene } from './engine.js';
import { renderWallpaper } from './wallpapers.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let dpr = window.devicePixelRatio || 1;
const scene = new Scene(window.innerWidth, window.innerHeight);
let paused = false;
let last = performance.now();

function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(window.innerWidth * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  scene.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

const api = window.snow;
api.onConfig((cfg) => {
  scene.setEffect(cfg.effect);
  scene.density = cfg.density;
  scene.setLand(cfg.land);
});
api.onSurfaces((s) => scene.setSurfaces(s.wins, s.ground, Date.now() / 1000));
api.onPointer((p) => scene.setPointer(p.x, p.y));
api.onPause((p) => {
  paused = p;
  if (p) ctx.clearRect(0, 0, canvas.width, canvas.height);
});
api.onStatsRequest(() => api.sendStats(`${scene.effect}: ${scene.debugStats()}`));
api.onRenderWallpaper(async (name) => {
  const c = renderWallpaper(name);
  const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.9));
  api.saveWallpaper(name, await blob.arrayBuffer());
});

function frame(ts) {
  const dt = (ts - last) / 1000;
  last = ts;
  if (!paused) {
    scene.update(dt, Date.now() / 1000);
    scene.draw(ctx, dpr);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
api.ready();
