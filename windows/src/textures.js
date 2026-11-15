// All sprites are drawn in code. Drawing uses a y-up coordinate system (origin bottom-left),
// then the finished bitmap is a normal upright image.
import { makeCanvas, rgba, mulberry32 } from './env.js';

const memo = (fn) => { let v; return () => v || (v = fn()); };
const PI = Math.PI;

function make(w, h, draw) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.translate(0, h);
  ctx.scale(1, -1);
  draw(ctx);
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

const tintCache = new Map();
export function tint(base, color) {
  let m = tintCache.get(base);
  if (!m) { m = new Map(); tintCache.set(base, m); }
  let t = m.get(color);
  if (!t) {
    t = makeCanvas(base.width, base.height);
    const c = t.getContext('2d');
    c.drawImage(base, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, base.width, base.height);
    m.set(color, t);
  }
  return t;
}

function radial(ctx, size, stops) {
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  for (const [o, a] of stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

export const dot = memo(() => make(32, 32, (ctx) => radial(ctx, 32, [[0, 1], [0.45, 0.9], [1, 0]])));
export const glow = memo(() => make(64, 64, (ctx) => radial(ctx, 64, [[0, 1], [0.3, 0.35], [1, 0]])));
export const bokeh = memo(() => make(64, 64, (ctx) => radial(ctx, 64, [[0, 0.55], [0.65, 0.5], [1, 0]])));

export const streak = memo(() => make(4, 48, (ctx) => {
  const g = ctx.createLinearGradient(0, 0, 0, 48);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  roundRect(ctx, 1, 0, 2, 48, 1);
  ctx.fill();
}));

export const trail = memo(() => make(160, 8, (ctx) => {
  const g = ctx.createLinearGradient(0, 0, 160, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  roundRect(ctx, 0, 2, 160, 4, 2);
  ctx.fill();
}));

export const ring = memo(() => make(32, 32, (ctx) => {
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(16, 16, 13, 0, PI * 2);
  ctx.stroke();
}));

export const puff = memo(() => make(48, 48, (ctx) => {
  const rand = mulberry32(99);
  for (let i = 0; i < 8; i++) {
    const cx = 14 + rand() * 20, cy = 14 + rand() * 20, r = 7 + rand() * 6;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, PI * 2);
    ctx.fill();
  }
}));

// ---- six-fold snow crystals ----
function crystal(variant) {
  return make(64, 64, (ctx) => {
    ctx.translate(32, 32);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const branches = variant === 0 ? [[10, 9], [17, 8], [23, 5]] : (variant === 1 ? [[14, 8]] : [[18, 7]]);
    for (let pass = 0; pass < 2; pass++) {
      const halo = pass === 0;
      ctx.strokeStyle = halo ? rgba(0.72, 0.86, 1, 0.38) : '#fff';
      ctx.lineWidth = halo ? 5 : (variant === 2 ? 2.6 : 1.7);
      for (let k = 0; k < 6; k++) {
        ctx.save();
        ctx.rotate((k * PI) / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 27);
        for (const [y, len] of branches) {
          ctx.moveTo(0, y); ctx.lineTo(len * 0.866, y + len * 0.5);
          ctx.moveTo(0, y); ctx.lineTo(-len * 0.866, y + len * 0.5);
        }
        ctx.stroke();
        ctx.restore();
      }
      if (variant === 1) {
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * PI) / 3 + PI / 6;
          const x = Math.cos(a) * 10, y = Math.sin(a) * 10;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  });
}
export const crystals = memo(() => [crystal(0), crystal(1), crystal(2)]);

// ---- autumn leaves: 6 shapes x 6 colourways ----
const LEAF_PALETTES = [
  [rgba(0.55, 0.08, 0.06), rgba(0.88, 0.20, 0.10), rgba(0.35, 0.04, 0.04)],  // deep red
  [rgba(0.85, 0.35, 0.05), rgba(0.98, 0.60, 0.15), rgba(0.55, 0.20, 0.03)],  // orange
  [rgba(0.90, 0.65, 0.10), rgba(1.00, 0.88, 0.30), rgba(0.60, 0.40, 0.05)],  // golden yellow
  [rgba(0.40, 0.22, 0.10), rgba(0.65, 0.40, 0.18), rgba(0.25, 0.13, 0.05)],  // brown
  [rgba(0.45, 0.55, 0.12), rgba(0.90, 0.55, 0.10), rgba(0.28, 0.32, 0.06)],  // green to orange
  [rgba(0.70, 0.15, 0.10), rgba(0.95, 0.70, 0.15), rgba(0.42, 0.08, 0.05)],  // red to yellow
];
const LEAF_Y = [[10, 61], [10, 58], [10, 60], [8, 42], [10, 56], [6, 60]];

function profile(ctx, y0, y1, steps, hw) {
  ctx.beginPath();
  ctx.moveTo(32, y0);
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    ctx.lineTo(32 + hw(u), y0 + (y1 - y0) * u);
  }
  for (let i = steps - 1; i >= 1; i--) {
    const u = i / steps;
    ctx.lineTo(32 - hw(u), y0 + (y1 - y0) * u);
  }
  ctx.closePath();
}

function sideVeins(ctx, y0, y1, hw) {
  ctx.beginPath();
  ctx.moveTo(32, y0);
  ctx.lineTo(32, y1 - 3);
  for (const u of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    const y = y0 + (y1 - y0) * u, w = hw(u) * 0.8, yy = y + (y1 - y0) * 0.1;
    ctx.moveTo(32, y); ctx.lineTo(32 + w, yy);
    ctx.moveTo(32, y); ctx.lineTo(32 - w, yy);
  }
}

const sinp = (u, e) => Math.pow(Math.abs(Math.sin(u * PI)), e);
const HW = [
  null,
  (u) => 15 * sinp(u, 0.7) * (1 + 0.28 * Math.sin(u * PI * 8)),
  (u) => 15 * sinp(u, 0.8) * (1 - 0.3 * u) * (1 + 0.05 * Math.sin(u * PI * 36)),
  null,
  (u) => 17 * sinp(u, 0.55),
  (u) => 8 * sinp(u, 0.9),
];

// 0 maple, 1 oak, 2 birch, 3 ginkgo, 4 round (aspen), 5 narrow (willow)
function leafOutline(ctx, shape) {
  switch (shape) {
    case 0: {
      const pts = [[32, 10], [38, 15], [48, 9], [45, 22], [59, 28], [49, 35], [53, 47], [42, 44], [38, 51], [32, 61]];
      ctx.beginPath();
      ctx.moveTo(32, 10);
      for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
      for (const q of pts.slice(0, -1).reverse()) ctx.lineTo(64 - q[0], q[1]);
      ctx.closePath();
      return;
    }
    case 1: profile(ctx, 10, 58, 64, HW[1]); return;
    case 2: profile(ctx, 10, 60, 64, HW[2]); return;
    case 3: {
      ctx.beginPath();
      ctx.moveTo(32, 8);
      for (let a = -60; a <= 60; a += 4) {
        const rad = (a * PI) / 180;
        let r = 34 + 1.5 * Math.sin(a * 0.6);
        if (Math.abs(a) < 5) r -= 9;
        ctx.lineTo(32 + r * Math.sin(rad), 8 + r * Math.cos(rad));
      }
      ctx.closePath();
      return;
    }
    case 4: profile(ctx, 10, 56, 64, HW[4]); return;
    default: profile(ctx, 6, 60, 64, HW[5]);
  }
}

function leafVeins(ctx, shape) {
  switch (shape) {
    case 0: {
      ctx.beginPath();
      for (const t of [[46, 12], [57, 28], [52, 45], [32, 58]]) {
        ctx.moveTo(32, 12); ctx.lineTo(t[0], t[1]);
        ctx.moveTo(32, 12); ctx.lineTo(64 - t[0], t[1]);
      }
      return;
    }
    case 1: sideVeins(ctx, 10, 58, HW[1]); return;
    case 2: sideVeins(ctx, 10, 60, HW[2]); return;
    case 3: {
      ctx.beginPath();
      for (let deg = -50; deg <= 50; deg += 20) {
        const rad = (deg * PI) / 180;
        ctx.moveTo(32, 10); ctx.lineTo(32 + 30 * Math.sin(rad), 10 + 30 * Math.cos(rad));
      }
      return;
    }
    case 4: sideVeins(ctx, 10, 56, HW[4]); return;
    default: sideVeins(ctx, 6, 60, HW[5]);
  }
}

const leafCache = new Map();
export function leafTex(shape, palette) {
  const key = shape * 10 + palette;
  let t = leafCache.get(key);
  if (t) return t;
  const [c0, c1, edge] = LEAF_PALETTES[palette];
  const [y0, y1] = LEAF_Y[shape];
  t = make(64, 64, (ctx) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(0.35, 0.22, 0.10);
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(32, 1); ctx.lineTo(32, 13); ctx.stroke();
    leafOutline(ctx, shape);
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = edge.replace(/[\d.]+\)$/, '0.8)');
    ctx.lineWidth = 1.3;
    ctx.stroke();
    leafVeins(ctx, shape);
    ctx.strokeStyle = edge.replace(/[\d.]+\)$/, '0.45)');
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  leafCache.set(key, t);
  return t;
}

// ---- sakura: 4 shapes x 5 colourways ----
const SAKURA_PALETTES = [
  [[1.00, 0.78, 0.86], [1.00, 0.93, 0.96]],  // pale
  [[0.98, 0.62, 0.76], [1.00, 0.85, 0.91]],  // classic pink
  [[0.92, 0.42, 0.62], [1.00, 0.75, 0.85]],  // deep pink
  [[0.98, 0.85, 0.90], [1.00, 0.98, 0.99]],  // white blush
  [[1.00, 0.70, 0.72], [1.00, 0.90, 0.88]],  // warm peach pink
];

function petalPath(ctx, w, h, notch) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-w * 0.95, h * 0.22, -w * 0.8, h * 1.02, 0, h - notch);
  ctx.bezierCurveTo(w * 0.8, h * 1.02, w * 0.95, h * 0.22, 0, 0);
  ctx.closePath();
}

function drawPetal(ctx, x, y, deg, w, h, notch, c0, c1, strokeA) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((deg * PI) / 180);
  petalPath(ctx, w, h, notch);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(c0[0], c0[1], c0[2]));
  g.addColorStop(1, rgba(c1[0], c1[1], c1[2]));
  ctx.fillStyle = g;
  ctx.fill();
  if (strokeA > 0) {
    ctx.strokeStyle = rgba(c0[0], c0[1], c0[2], strokeA);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}

const sakuraCache = new Map();
// 0 wide petal, 1 narrow petal, 2 whole blossom, 3 curled petal
export function sakuraTex(shape, palette) {
  const key = shape * 10 + palette;
  let t = sakuraCache.get(key);
  if (t) return t;
  const [c0, c1] = SAKURA_PALETTES[palette];
  const deep = [0.85, 0.30, 0.50];
  t = make(64, 64, (ctx) => {
    if (shape === 0 || shape === 1) {
      const wide = shape === 0;
      const h = wide ? 48 : 52;
      drawPetal(ctx, 32, 6, 0, wide ? 24 : 17, h, wide ? 11 : 7, c0, c1, 0.6);
      ctx.strokeStyle = rgba(deep[0], deep[1], deep[2], 0.3);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(32, 8); ctx.lineTo(32, 6 + h * 0.8);
      ctx.moveTo(32, 8); ctx.lineTo(26, 6 + h * 0.72);
      ctx.moveTo(32, 8); ctx.lineTo(38, 6 + h * 0.72);
      ctx.stroke();
    } else if (shape === 2) {
      for (let k = 0; k < 5; k++) drawPetal(ctx, 32, 32, k * 72, 14, 28, 4, c0, c1, 0.65);
      ctx.fillStyle = rgba(deep[0], deep[1], deep[2], 0.55);
      ctx.beginPath(); ctx.arc(32, 32, 4, 0, PI * 2); ctx.fill();
      for (let k = 0; k < 9; k++) {
        const a = (k * 2 * PI) / 9 + 0.3;
        const tx = 32 + 8 * Math.cos(a), ty = 32 + 8 * Math.sin(a);
        ctx.strokeStyle = rgba(deep[0], deep[1], deep[2], 0.8);
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(32, 32); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = rgba(0.98, 0.85, 0.35);
        ctx.beginPath(); ctx.arc(tx, ty, 1.2, 0, PI * 2); ctx.fill();
      }
    } else {
      drawPetal(ctx, 32, 8, 12, 18, 46, 5, c0, c1, 0.6);
      ctx.save();
      ctx.translate(36, 10); ctx.rotate((12 * PI) / 180);
      petalPath(ctx, 7, 38, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(27, 10); ctx.rotate((12 * PI) / 180);
      petalPath(ctx, 6, 36, 0);
      ctx.fillStyle = rgba(deep[0], deep[1], deep[2], 0.22);
      ctx.fill();
      ctx.restore();
    }
  });
  sakuraCache.set(key, t);
  return t;
}
