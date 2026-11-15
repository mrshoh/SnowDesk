// Generates assets/icon.png, assets/tray.png and assets/icon.ico (snowflake on a night-sky tile).
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, '..', 'assets');
fs.mkdirSync(assets, { recursive: true });

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function render(px) {
  const c = createCanvas(px, px);
  const ctx = c.getContext('2d');
  ctx.scale(px / 1024, px / 1024);
  // tile
  rrect(ctx, 40, 40, 944, 944, 210);
  const g = ctx.createLinearGradient(0, 40, 0, 984);
  g.addColorStop(0, '#1a295c'); g.addColorStop(0.5, '#385fa8'); g.addColorStop(1, '#8dbdea');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  rrect(ctx, 40, 40, 944, 944, 210);
  ctx.clip();
  const glow = ctx.createRadialGradient(512, 460, 0, 512, 460, 440);
  glow.addColorStop(0, 'rgba(255,255,255,0.30)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 1024);
  // snow ground
  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  ctx.beginPath();
  ctx.moveTo(40, 984);
  ctx.lineTo(40, 800);
  ctx.bezierCurveTo(340, 860, 640, 740, 984, 790);
  ctx.lineTo(984, 984);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // crystal
  ctx.save();
  ctx.translate(512, 450);
  ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? 'rgba(158,205,255,0.35)' : '#ffffff';
    for (let k = 0; k < 6; k++) {
      ctx.save();
      ctx.rotate((k * Math.PI) / 3);
      ctx.lineWidth = pass === 0 ? 74 : 34;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -270); ctx.stroke();
      ctx.lineWidth = pass === 0 ? 56 : 24;
      ctx.beginPath();
      for (const [y, len] of [[120, 95], [195, 65]]) {
        ctx.moveTo(0, -y); ctx.lineTo(len * 0.866, -y - len * 0.5);
        ctx.moveTo(0, -y); ctx.lineTo(-len * 0.866, -y - len * 0.5);
      }
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [x, y, r] of [[220, 250, 14], [800, 220, 12], [170, 470, 9], [860, 500, 10], [300, 140, 9], [700, 140, 15], [860, 330, 8], [150, 330, 11]]) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

fs.writeFileSync(path.join(assets, 'icon.png'), render(512).toBuffer('image/png'));
fs.writeFileSync(path.join(assets, 'tray.png'), render(64).toBuffer('image/png'));

// ICO container with PNG-compressed images
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((s) => render(s).toBuffer('image/png'));
const head = Buffer.alloc(6);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = 6 + sizes.length * 16;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s === 256 ? 0 : s, 0); e.writeUInt8(s === 256 ? 0 : s, 1);
  e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
fs.writeFileSync(path.join(assets, 'icon.ico'), Buffer.concat([head, ...entries, ...pngs]));
console.log('icons written');
