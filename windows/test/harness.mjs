import { createCanvas, Path2D } from '@napi-rs/canvas';
import fs from 'node:fs';
import { setCanvasFactory, setPathFactory } from '../src/env.js';
import { Scene } from '../src/engine.js';

setCanvasFactory((w, h) => createCanvas(w, h));
setPathFactory(() => new Path2D());

export const W = 1440, H = 900;
// front-to-back
export const WINS = [
  { id: 3, x: 300, y: 100, w: 200, h: 150 },
  { id: 2, x: 520, y: 330, w: 640, h: 400 },
  { id: 1, x: 120, y: 170, w: 560, h: 420 },
];
export const GROUNDREC = { x: 0, y: 860, w: 1440 };

export function backdrop(ctx, wins) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1d2a3f'); g.addColorStop(1, '#0d1420');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const w of [...wins].reverse()) {
    ctx.fillStyle = '#3a4252'; ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#2a303d'; ctx.fillRect(w.x, w.y, w.w, 28);
    ctx.fillStyle = '#e7ebf3'; ctx.fillRect(w.x + 1, w.y + 28, w.w - 2, w.h - 29);
    ctx.fillStyle = '#9aa5b8'; ctx.fillRect(w.x + 20, w.y + 50, w.w * 0.6, 10);
  }
  ctx.fillStyle = '#10151f'; ctx.fillRect(0, 860, W, 40);
  ctx.fillStyle = '#4a90d9'; for (let i = 0; i < 9; i++) ctx.fillRect(560 + i * 38, 868, 26, 26);
}

export function newScene(effect) {
  const s = new Scene(W, H);
  s.setEffect(effect);
  return s;
}

export function simulate(scene, seconds, opts = {}) {
  const dt = 1 / 60;
  let now = 1000;
  const wins = opts.wins || WINS;
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    now += dt;
    if (i % 2 === 0) scene.setSurfaces(wins, GROUNDREC, now);
    if (opts.pointer) { const p = opts.pointer(i * dt); scene.setPointer(p.x, p.y); }
    scene.update(dt, now);
  }
  return now;
}

export function renderPNG(scene, file, wins = WINS, crop) {
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  backdrop(ctx, wins);
  const layer = createCanvas(W, H);
  scene.draw(layer.getContext('2d'), 1);
  ctx.drawImage(layer, 0, 0);
  let out = c;
  if (crop) {
    out = createCanvas(crop.w * crop.scale, crop.h * crop.scale);
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = true;
    o.drawImage(c, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w * crop.scale, crop.h * crop.scale);
  }
  fs.writeFileSync(file, out.toBuffer('image/png'));
}
