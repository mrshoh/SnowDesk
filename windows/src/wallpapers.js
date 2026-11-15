// Procedural wallpapers (original art drawn in code). y-up drawing space.
import { makeCanvas, rgba, mulberry32 } from './env.js';

export const WALLPAPERS = ['Snow', 'Rain', 'Autumn', 'Fireflies', 'Stars'];
const c = (r, g, b, a = 1) => rgba(r, g, b, a);

export function renderWallpaper(name, W = 3840, H = 2160) {
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.translate(0, H);
  ctx.scale(1, -1);
  const seed = [...name].reduce((a, ch) => ((a * 31 + ch.charCodeAt(0)) >>> 0), 7);
  const rand = mulberry32(seed);
  const R = (a, b) => a + rand() * (b - a);
  const S = { ctx, W, H, R };

  switch (name) {
    case 'Snow': drawSnow(S); break;
    case 'Rain': drawRain(S); break;
    case 'Autumn': drawAutumn(S); break;
    case 'Fireflies': drawFireflies(S); break;
    default: drawStars(S);
  }
  return canvas;
}

function vgrad({ ctx, W, H }, cols) {
  const g = ctx.createLinearGradient(0, H, 0, 0);   // first colour at the top
  cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function glow({ ctx }, cx, cy, radius, rgb, a) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  g.addColorStop(0, c(rgb[0], rgb[1], rgb[2], a));
  g.addColorStop(1, c(rgb[0], rgb[1], rgb[2], 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

function dot({ ctx }, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function dots(S, n, yMin, yMax, rMin, rMax, rgb, aMin, aMax) {
  for (let i = 0; i < n; i++) {
    const x = S.R(0, S.W), y = S.R(yMin, yMax), r = S.R(rMin, rMax);
    dot(S, x, y, r, c(rgb[0], rgb[1], rgb[2], S.R(aMin, aMax)));
  }
}

function hillFn(base, amp, f, ph) {
  return (x) => base + amp * (0.65 * Math.sin(x * f + ph) + 0.35 * Math.sin(x * f * 2.3 + ph * 1.7));
}

function fillHill({ ctx, W }, fn, color) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, fn(0));
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, fn(x));
  ctx.lineTo(W, fn(W));
  ctx.lineTo(W, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function pines(S, fn, color, count, hMin, hMax) {
  const { ctx, W } = S;
  ctx.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const x = S.R(-40, W + 40), h = S.R(hMin, hMax), w = h * 0.34, y = fn(x) - 6;
    for (let tier = 0; tier < 4; tier++) {
      const ty = y + h * (0.12 + tier * 0.2), tw = w * (1 - tier * 0.2);
      ctx.beginPath();
      ctx.moveTo(x - tw, ty);
      ctx.lineTo(x, ty + h * 0.34);
      ctx.lineTo(x + tw, ty);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillRect(x - h * 0.02, y, h * 0.04, h * 0.15);
  }
}

function roundTrees(S, fn, colors, count, hMin, hMax) {
  const { ctx, W } = S;
  for (let i = 0; i < count; i++) {
    const x = S.R(0, W), h = S.R(hMin, hMax), y = fn(x) - 4;
    ctx.fillStyle = c(0.16, 0.08, 0.05);
    ctx.fillRect(x - h * 0.03, y, h * 0.06, h * 0.45);
    ctx.fillStyle = colors[Math.floor(S.R(0, colors.length))];
    for (let k = 0; k < 6; k++) {
      const cx = x + S.R(-h * 0.22, h * 0.22), cy = y + h * S.R(0.45, 0.85), r = h * S.R(0.16, 0.26);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawSnow(S) {
  const { ctx, W, H } = S;
  vgrad(S, [c(0.05, 0.09, 0.20), c(0.13, 0.25, 0.42), c(0.55, 0.70, 0.82)]);
  dots(S, 500, H * 0.45, H, 1.2, 3.2, [1, 1, 1], 0.4, 0.95);
  const mx = W * 0.74, my = H * 0.78;
  glow(S, mx, my, 520, [0.85, 0.93, 1], 0.35);
  dot(S, mx, my, 90, c(0.95, 0.97, 1));
  const far = hillFn(H * 0.30, 110, 0.0013, 1.0);
  fillHill(S, far, c(0.62, 0.74, 0.86));
  pines(S, far, c(0.18, 0.30, 0.45), 90, 150, 260);
  const mid = hillFn(H * 0.20, 90, 0.0017, 2.2);
  fillHill(S, mid, c(0.82, 0.89, 0.95));
  pines(S, mid, c(0.08, 0.15, 0.27), 55, 260, 420);
  fillHill(S, hillFn(H * 0.09, 60, 0.0021, 4.0), c(0.95, 0.97, 1));
  dots(S, 900, 0, H, 1.5, 4.5, [1, 1, 1], 0.3, 0.8);
}

function drawRain(S) {
  const { ctx, W, H } = S;
  vgrad(S, [c(0.07, 0.10, 0.14), c(0.12, 0.20, 0.26), c(0.22, 0.34, 0.40)]);
  const bokeh = [[1, 0.8, 0.5], [0.6, 0.85, 1], [1, 0.6, 0.6]];
  for (let i = 0; i < 70; i++) {
    glow(S, S.R(0, W), S.R(0, H * 0.6), S.R(40, 160), bokeh[Math.floor(S.R(0, 3))], S.R(0.10, 0.22));
  }
  const sky = c(0.04, 0.06, 0.09);
  let x = 0;
  while (x < W) {
    const bw = S.R(90, 240), bh = S.R(260, 900);
    ctx.fillStyle = sky;
    ctx.fillRect(x, 0, bw, bh);
    ctx.fillStyle = c(1, 0.85, 0.5, 0.55);
    for (let wy = 40; wy < bh - 30; wy += 44) {
      for (let wx = x + 14; wx < x + bw - 24; wx += 30) {
        if (S.R(0, 1) < 0.28) ctx.fillRect(wx, wy, 12, 18);
      }
    }
    x += bw + S.R(0, 20);
  }
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 700; i++) {
    const sx = S.R(0, W), sy = S.R(0, H);
    ctx.strokeStyle = c(1, 1, 1, S.R(0.08, 0.2));
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 18, sy - 120); ctx.stroke();
  }
}

function drawAutumn(S) {
  const { W, H } = S;
  vgrad(S, [c(0.35, 0.12, 0.12), c(0.85, 0.40, 0.15), c(0.98, 0.78, 0.40)]);
  const sx = W * 0.3, sy = H * 0.32;
  glow(S, sx, sy, 700, [1, 0.9, 0.6], 0.6);
  dot(S, sx, sy, 110, c(1, 0.95, 0.75));
  const h1 = hillFn(H * 0.30, 120, 0.0012, 0.4);
  fillHill(S, h1, c(0.62, 0.28, 0.12));
  const warm = [c(0.85, 0.35, 0.10), c(0.78, 0.18, 0.10), c(0.95, 0.65, 0.15)];
  roundTrees(S, h1, warm, 30, 120, 240);
  const h2 = hillFn(H * 0.19, 100, 0.0016, 2.0);
  fillHill(S, h2, c(0.45, 0.18, 0.08));
  roundTrees(S, h2, warm, 22, 220, 380);
  fillHill(S, hillFn(H * 0.08, 60, 0.002, 3.5), c(0.28, 0.10, 0.06));
  for (const rgb of [[0.85, 0.35, 0.10], [0.78, 0.18, 0.10], [0.95, 0.65, 0.15]]) {
    dots(S, 90, 0, H * 0.7, 5, 12, rgb, 0.5, 0.95);
  }
}

function drawFireflies(S) {
  const { W, H } = S;
  vgrad(S, [c(0.02, 0.05, 0.07), c(0.04, 0.14, 0.12), c(0.07, 0.22, 0.15)]);
  const h1 = hillFn(H * 0.28, 110, 0.0014, 0.8);
  fillHill(S, h1, c(0.03, 0.09, 0.08));
  pines(S, h1, c(0.015, 0.06, 0.055), 120, 260, 520);
  fillHill(S, hillFn(H * 0.10, 70, 0.002, 2.9), c(0.01, 0.04, 0.04));
  for (let i = 0; i < 150; i++) {
    const x = S.R(0, W), y = S.R(H * 0.05, H * 0.75);
    glow(S, x, y, S.R(20, 60), [0.85, 1, 0.4], 0.45);
    dot(S, x, y, S.R(3, 5), c(1, 1, 0.8));
  }
}

function drawStars(S) {
  const { W, H } = S;
  vgrad(S, [c(0.02, 0.02, 0.08), c(0.11, 0.07, 0.25), c(0.35, 0.18, 0.42)]);
  for (let i = 0; i < 2500; i++) {
    const t = S.R(0, 1), off = (S.R(-1, 1) + S.R(-1, 1)) * 300;
    dot(S, t * W + off * 0.4, H * 0.35 + t * H * 0.45 + off, S.R(0.8, 2.2), c(1, 1, 1, S.R(0.05, 0.4)));
  }
  dots(S, 600, H * 0.2, H, 1, 3, [1, 1, 1], 0.4, 1);
  for (let i = 0; i < 40; i++) {
    const x = S.R(0, W), y = S.R(H * 0.3, H);
    glow(S, x, y, S.R(18, 40), [0.85, 0.9, 1], 0.5);
    dot(S, x, y, 3, '#fff');
  }
  fillHill(S, hillFn(H * 0.20, 160, 0.0011, 0.5), c(0.05, 0.04, 0.13));
  fillHill(S, hillFn(H * 0.12, 110, 0.0016, 2.1), c(0.02, 0.02, 0.07));
}
