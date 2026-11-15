import { createCanvas, Path2D } from '@napi-rs/canvas';
import fs from 'node:fs';
import { setCanvasFactory, setPathFactory } from '../src/env.js';
import * as TX from '../src/textures.js';
setCanvasFactory((w, h) => createCanvas(w, h));
setPathFactory(() => new Path2D());
const S = 2;                      // draw each 64px sprite at 128px
const cell = 64 * S;
const c = createCanvas(cell * 6, cell * (6 + 4 + 1) + 20);
const ctx = c.getContext('2d');
ctx.fillStyle = '#3b4a3a'; ctx.fillRect(0, 0, c.width, cell * 6);
ctx.fillStyle = '#26303f'; ctx.fillRect(0, cell * 6, c.width, c.height);
for (let shape = 0; shape < 6; shape++) for (let pal = 0; pal < 6; pal++)
  ctx.drawImage(TX.leafTex(shape, pal), pal * cell, shape * cell, cell, cell);
for (let shape = 0; shape < 4; shape++) for (let pal = 0; pal < 5; pal++)
  ctx.drawImage(TX.sakuraTex(shape, pal), pal * cell, (6 + shape) * cell, cell, cell);
TX.crystals().forEach((t, i) => ctx.drawImage(t, i * cell, 10 * cell, cell, cell));
ctx.drawImage(TX.puff(), 3 * cell, 10 * cell, cell, cell);
ctx.drawImage(TX.bokeh(), 4 * cell, 10 * cell, cell, cell);
fs.writeFileSync('/tmp/out/sheet.png', c.toBuffer('image/png'));
console.log('sheet ok');
