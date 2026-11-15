import { createCanvas, Path2D } from '@napi-rs/canvas';
import fs from 'node:fs';
import { setCanvasFactory, setPathFactory } from '../src/env.js';
import { renderWallpaper, WALLPAPERS } from '../src/wallpapers.js';
setCanvasFactory((w, h) => createCanvas(w, h));
setPathFactory(() => new Path2D());
const out = createCanvas(1440, 405 * 3);
const o = out.getContext('2d');
let i = 0;
for (const n of WALLPAPERS) {
  const t0 = Date.now();
  const c = renderWallpaper(n);
  const jpg = c.toBuffer('image/jpeg', 90);
  console.log(n, `${(jpg.length / 1024) | 0} KB`, `${Date.now() - t0}ms`);
  o.drawImage(c, (i % 2) * 720, Math.floor(i / 2) * 405, 720, 405);
  i++;
}
fs.writeFileSync('/tmp/out/walls.png', out.toBuffer('image/png'));
