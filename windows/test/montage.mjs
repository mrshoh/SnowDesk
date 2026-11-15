import { createCanvas, loadImage } from '@napi-rs/canvas';
import fs from 'node:fs';
const names = process.argv.slice(3);
const out = process.argv[2];
const w = 720, h = 450;
const c = createCanvas(w * 2, h * Math.ceil(names.length / 2));
const ctx = c.getContext('2d');
for (let i = 0; i < names.length; i++) {
  const img = await loadImage(`/tmp/out/${names[i]}.png`);
  ctx.drawImage(img, (i % 2) * w, Math.floor(i / 2) * h, w, h);
  ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif'; ctx.fillText(names[i], (i % 2) * w + 10, Math.floor(i / 2) * h + 24);
}
fs.writeFileSync(out, c.toBuffer('image/png'));
