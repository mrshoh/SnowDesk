// SnowDesk engine: weather particles, snow drifts, window landing, pointer interaction.
// Screen coordinates: y grows downward. Surfaces are {id, x, y(top edge), w, h}, front-to-back.
import { rnd, rgba, newPath } from './env.js';
import * as TX from './textures.js';

export const GROUND = -1;
export const EFFECTS = ['snow', 'rain', 'sakura', 'leaves', 'fireflies', 'starfall'];
const MAXP = 3600;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------- snow drift (height field)

export class SnowPile {
  constructor(id, width, maxH, edgeZone) {
    this.id = id;
    this.width = width;
    this.bucket = 4;
    this.maxH = maxH;
    const n = Math.max(4, Math.floor(width / 4) + 1);
    this.n = n;
    this.heights = new Float32Array(n);
    this.caps = new Float32Array(n);
    this.covered = new Uint8Array(n);
    this.x = 0;
    this.y = 0;
    this.dirty = false;
    this.fillPath = null;
    this.rimPath = null;
    // the drift can only grow to a soft dome: low at the ends, tallest in the middle
    const p1 = rnd(0, 6.28), p2 = rnd(0, 6.28);
    for (let k = 0; k < n; k++) {
      const x = (k + 0.5) * 4;
      const dist = Math.min(x, width - x);
      const t = clamp(dist / Math.max(1, edgeZone), 0, 1);
      const e = Math.pow(Math.sin((t * Math.PI) / 2), 0.85);
      const nz = 0.82 + 0.12 * Math.sin(x * 0.013 + p1) + 0.08 * Math.sin(x * 0.031 + p2);
      this.caps[k] = Math.max(0, maxH * e * nz);
    }
  }

  add(relX, area) {
    if (!Number.isFinite(relX) || !Number.isFinite(area) || relX < -1000 || relX > 100000) return;
    const ci = Math.floor(relX / this.bucket);
    const w = SnowPile.weights;
    for (let k = -2; k <= 2; k++) {
      const i = ci + k;
      if (i < 0 || i >= this.n) continue;
      this.heights[i] += (area / this.bucket) * w[k + 2];
    }
    this.dirty = true;
  }

  reset() { this.heights.fill(0); this.dirty = true; }

  // snow slumps sideways when a slope is too steep, and what does not fit flows inward
  relax() {
    const n = this.n, h = this.heights, caps = this.caps;
    if (n <= 2) return;
    const maxDiff = 3.2;
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < n - 1; i++) {
        const d = h[i] - h[i + 1];
        if (d > maxDiff) { const m = (d - maxDiff) * 0.5; h[i] -= m; h[i + 1] += m; }
        else if (d < -maxDiff) { const m = (-d - maxDiff) * 0.5; h[i] += m; h[i + 1] -= m; }
      }
    }
    for (let i = 0; i < n - 1; i++) {
      if (h[i] > caps[i]) { const ex = h[i] - caps[i]; h[i] = caps[i]; h[i + 1] += ex; }
    }
    for (let j = n - 1; j > 0; j--) {
      if (h[j] > caps[j]) { const ex = h[j] - caps[j]; h[j] = caps[j]; h[j - 1] += ex; }
    }
    for (let i = 0; i < n; i++) h[i] = Math.min(h[i], caps[i]);
  }

  rebuild() {
    this.dirty = false;
    const n = this.n, b = this.bucket, hs = this.heights;
    const sh = Float32Array.from(hs);
    for (let k = 1; k < n - 1; k++) sh[k] = (hs[k - 1] + 2 * hs[k] + hs[k + 1]) / 4;
    const fill = newPath(), rim = newPath();
    let any = false;
    let i = 0;
    while (i < n) {
      if (this.covered[i] || sh[i] < 0.8) { i++; continue; }
      let j = i;
      while (j + 1 < n && !this.covered[j + 1] && sh[j + 1] >= 0.8) j++;
      const pts = [[i * b, -sh[i] * 0.4]];
      for (let k = i; k <= j; k++) pts.push([(k + 0.5) * b, -sh[k]]);
      pts.push([(j + 1) * b, -sh[j] * 0.4]);
      fill.moveTo(pts[0][0], 2);
      fill.lineTo(pts[0][0], pts[0][1]);
      rim.moveTo(pts[0][0], pts[0][1]);
      for (let m = 1; m < pts.length; m++) {
        const mx = (pts[m - 1][0] + pts[m][0]) / 2, my = (pts[m - 1][1] + pts[m][1]) / 2;
        fill.quadraticCurveTo(pts[m - 1][0], pts[m - 1][1], mx, my);
        rim.quadraticCurveTo(pts[m - 1][0], pts[m - 1][1], mx, my);
      }
      const last = pts[pts.length - 1];
      fill.lineTo(last[0], last[1]);
      rim.lineTo(last[0], last[1]);
      fill.lineTo(last[0], 2);
      fill.closePath();
      any = true;
      i = j + 1;
    }
    this.fillPath = any ? fill : null;
    this.rimPath = any ? rim : null;
  }
}
SnowPile.weights = [0.1, 0.2, 0.4, 0.2, 0.1];

// ---------------------------------------------------------------- particles

function mk(tex, w, h, x, y, z = 1) {
  return {
    kind: 'main', tex, w, h, x, y, rot: 0, sx: 1, alpha: 1, baseAlpha: 1, z, add: false,
    vx: 0, vy: 0, age: 0, life: 1e9, dead: false, hidden: false,
    phase: Math.random() * TAU, rock: 0, swayAmp: 0, swayFreq: 1, fall: 50,
    resting: false, surfaceId: 0, relX: 0, restH: 0, restTime: 0, restLife: 90,
    curiosity: 1, orbit: 40, heading: Math.random() * TAU, pulse: 2,
    depth: 0.5, spinRate: 0, area: 1, drag: 0, chunk: false, flip: 0, baseRot: 0,
  };
}

// ---------------------------------------------------------------- scene

export class Scene {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.effect = 'snow';
    this.density = 1;
    this.landOn = true;
    this.surfaces = [];
    this.surfaceIndex = new Map();
    this.prevRects = new Map();
    this.lastPoll = 0;
    this.piles = new Map();
    this.pileTimer = 0;
    this.particles = [];
    this.activeCount = 0;
    this.spawnAcc = 0;
    this.meteorTimer = 1;
    this.wind = 0;
    this.time = 0;
    this.mouse = { x: -9999, y: -9999 };
    this.mouseLast = { x: -9999, y: -9999 };
    this.mouseVel = { x: 0, y: 0 };
    this.mouseSpeed = 0;
    this.stillTime = 0;
    this.mouseValid = false;
    this.flash = { alpha: 0, steps: [], t: 0 };
    this.seenStamp = Scene.lightningStamp;
  }

  setSize(w, h) { this.width = w; this.height = h; }

  setEffect(name) {
    if (name === this.effect) return;
    this.effect = name;
    this.reset();
  }

  setLand(v) {
    this.landOn = v;
    if (!v) for (const id of [...this.piles.keys()]) if (id !== GROUND) this.piles.delete(id);
  }

  reset() {
    this.particles = [];
    this.piles.clear();
    this.activeCount = 0;
    this.spawnAcc = 0;
    this.meteorTimer = 1;
    this.seenStamp = Scene.lightningStamp;
    this.flash = { alpha: 0, steps: [], t: 0 };
  }

  setPointer(x, y) {
    this.mouse = { x, y };
    this.mouseValid = x >= 0 && x <= this.width && y >= 0 && y <= this.height;
  }

  // ------------------------------------------------ surfaces from the window tracker

  setSurfaces(wins, ground, now) {
    const pollDt = Math.max(0.005, now - this.lastPoll);
    this.lastPoll = now;
    const nw = wins.map((w) => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h }));
    if (ground) nw.push({ id: GROUND, x: ground.x, y: ground.y, w: ground.w, h: 2000 });

    const newIndex = new Map();
    nw.forEach((s, i) => newIndex.set(s.id, i));

    const moved = new Map();
    const gone = new Set();
    for (const [id, old] of this.prevRects) {
      const i = newIndex.get(id);
      if (i === undefined) { gone.add(id); continue; }
      const r = nw[i];
      const dx = r.x - old.x, dy = r.y - old.y;
      if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5 || Math.abs(r.w - old.w) > 1.5) {
        moved.set(id, { x: dx / pollDt, y: dy / pollDt });
      }
    }
    for (const p of this.particles) {
      if (!p.resting || p.dead) continue;
      if (gone.has(p.surfaceId)) this.release(p, 0, 0);
      else if (moved.has(p.surfaceId)) { const v = moved.get(p.surfaceId); this.release(p, v.x, v.y); }
    }
    // snow drifts: dragged windows shed their snow as clumps
    for (const [id, pile] of [...this.piles]) {
      if (gone.has(id)) this.piles.delete(id);
      else if (moved.has(id)) {
        this.slideOff(pile, this.prevRects.get(id), moved.get(id));
        this.piles.delete(id);
      }
    }
    this.surfaces = nw;
    this.surfaceIndex = newIndex;
    this.prevRects = new Map(nw.map((s) => [s.id, { x: s.x, y: s.y, w: s.w }]));

    // keep drifts attached to their windows and hide the parts behind windows in front
    for (const [id, pile] of this.piles) {
      const i = newIndex.get(id);
      if (i === undefined) continue;
      const sf = nw[i];
      pile.x = sf.x;
      pile.y = sf.y;
      const cov = new Uint8Array(pile.n);
      for (let j = 0; j < i; j++) {
        const f = nw[j];
        if (f.y <= sf.y - 1 && f.y + f.h >= sf.y - 1) {
          const lo = Math.max(0, Math.floor((f.x - sf.x) / pile.bucket));
          const hi = Math.min(pile.n - 1, Math.floor((f.x + f.w - sf.x) / pile.bucket));
          for (let k = lo; k <= hi; k++) cov[k] = 1;
        }
      }
      let same = true;
      for (let k = 0; k < pile.n; k++) if (cov[k] !== pile.covered[k]) { same = false; break; }
      if (!same) { pile.covered = cov; pile.dirty = true; }
    }
  }

  release(p, vx, vy) {
    p.resting = false;
    p.restTime = 0;
    p.hidden = false;
    p.alpha = p.baseAlpha;
    const cap = 1100;
    p.vx = clamp(vx * 0.8 + rnd(-40, 40), -cap, cap);
    p.vy = clamp(vy * 0.6 - rnd(-20, 60), -cap, cap);
  }

  findLanding(x, oldY, newY) {
    let best = -1, bestTop = Infinity;
    const S = this.surfaces;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (!this.landOn && s.id !== GROUND) continue;
      const top = s.y;
      if (!(top >= oldY && top <= newY && top < bestTop && x >= s.x && x <= s.x + s.w)) continue;
      let covered = false;
      for (let j = 0; j < i; j++) {
        const f = S[j];
        if (x >= f.x && x <= f.x + f.w && top + 1 >= f.y && top + 1 <= f.y + f.h) { covered = true; break; }
      }
      if (!covered) { best = i; bestTop = top; }
    }
    return best;
  }

  // ------------------------------------------------ frame update

  update(dt, now) {
    dt = clamp(dt, 0, 0.05);
    if (dt <= 0) return;
    this.time += dt;
    const t = this.time;
    this.wind = 9 * Math.sin(t * 0.17) + 6 * Math.sin(t * 0.53 + 1) + 4 * Math.sin(t * 1.3 + 2);
    this.updatePointer(dt);
    this.plowSnow(dt);
    this.spawn(dt);

    let active = 0;
    const n = this.particles.length;
    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      if (p.dead) continue;
      p.age += dt;
      if (p.resting) { this.stepResting(p, dt); continue; }
      switch (p.kind) {
        case 'main': this.stepMain(p, dt); if (!p.dead && !p.resting) active++; break;
        case 'spark': this.stepSpark(p, dt); break;
        case 'meteor': this.stepMeteor(p, dt); break;
        case 'fx': this.stepFx(p); break;
      }
    }
    this.activeCount = active;
    let w = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.dead) this.particles[w++] = p;
    }
    this.particles.length = w;

    this.pileTimer += dt;
    if (this.pileTimer > 0.12) {
      this.pileTimer = 0;
      for (const pile of this.piles.values()) if (pile.dirty) { pile.relax(); pile.rebuild(); }
    }
    this.lightning(dt, now);
  }

  updatePointer(dt) {
    const m = this.mouse;
    const d = Math.hypot(m.x - this.mouseLast.x, m.y - this.mouseLast.y);
    this.mouseSpeed = d / dt;
    this.mouseVel = { x: (m.x - this.mouseLast.x) / dt, y: (m.y - this.mouseLast.y) / dt };
    if (d < 2) this.stillTime += dt; else this.stillTime = 0;
    this.mouseLast = { x: m.x, y: m.y };
  }

  kill(p) { p.dead = true; }

  // ------------------------------------------------ spawning

  emit(dt, rate, cap, make) {
    if (this.activeCount >= cap || this.particles.length > MAXP) { this.spawnAcc = 0; return; }
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) { this.spawnAcc -= 1; make(); }
  }

  spawn(dt) {
    const w = this.width, h = this.height, s = (w / 1440) * this.density;
    switch (this.effect) {
      case 'snow': this.emit(dt, 48 * s, Math.floor(900 * s), () => this.makeSnow(w, h)); break;
      case 'rain': this.emit(dt, 650 * s, Math.floor(1100 * s), () => this.makeRain(w, h)); break;
      case 'sakura': this.emit(dt, 5 * s, Math.floor(130 * s), () => this.makePetal(w, h)); break;
      case 'leaves': this.emit(dt, 4.5 * s, Math.floor(110 * s), () => this.makeLeaf(w, h)); break;
      case 'fireflies': {
        const target = Math.floor(42 * s);
        if (this.activeCount < target) this.makeFirefly(w, h);
        else if (this.activeCount > Math.floor(target * 1.3) + 2) {
          const v = this.particles.find((q) => !q.dead && q.kind === 'main');
          if (v) this.kill(v);
        }
        break;
      }
      case 'starfall':
        this.meteorTimer -= dt;
        if (this.meteorTimer <= 0) {
          this.makeMeteor(w, h);
          if (Math.random() < 0.25) this.makeMeteor(w, h);
          this.meteorTimer = rnd(0.5, 2.2) / Math.max(0.4, this.density);
        }
        break;
    }
  }

  makeSnow(w, h) {
    const roll = Math.random();
    const depth = roll < 0.55 ? 0 : (roll < 0.9 ? 0.5 : 1);
    const x = rnd(-80, w + 80), y = -40;
    let p, fall, amp, area = 1, spin = 0;
    if (depth === 0) {
      const d = rnd(2.5, 4.5);
      p = mk(TX.dot(), d, d, x, y);
      p.alpha = rnd(0.45, 0.75);
      fall = rnd(22, 40); amp = rnd(5, 12); area = 2.2;
    } else if (depth === 0.5) {
      const kind = Math.floor(Math.random() * 10);
      let d;
      if (kind < 5) { d = rnd(7, 13); p = mk(TX.puff(), d, d, x, y); p.rot = rnd(0, 6.28); }
      else if (kind < 8) { d = rnd(9, 16); p = mk(pick(TX.crystals()), d, d, x, y); p.rot = rnd(0, 6.28); spin = rnd(-0.9, 0.9); }
      else { d = rnd(5, 8); p = mk(TX.dot(), d, d, x, y); }
      p.alpha = rnd(0.7, 0.95);
      fall = rnd(45, 75); amp = rnd(10, 24); area = 5.0 + d * 0.3;
    } else {
      // near: big out-of-focus flakes and a few sharp crystals, in front of everything
      if (Math.random() < 0.6) { const d = rnd(16, 36); p = mk(TX.bokeh(), d, d, x, y, 2); p.alpha = rnd(0.16, 0.32); }
      else { const d = rnd(22, 34); p = mk(pick(TX.crystals()), d, d, x, y, 2); p.rot = rnd(0, 6.28); p.alpha = rnd(0.5, 0.8); spin = rnd(-0.7, 0.7); }
      fall = rnd(100, 160); amp = rnd(18, 40);
    }
    p.baseAlpha = p.alpha;
    p.depth = depth; p.fall = fall; p.swayAmp = amp; p.swayFreq = rnd(0.5, 1.5);
    p.spinRate = spin; p.area = area; p.vy = fall;
    this.particles.push(p);
  }

  makeRain(w, h) {
    const p = mk(TX.tint(TX.streak(), rgba(0.75, 0.88, 1)), rnd(1.2, 2), rnd(14, 26), rnd(-100, w + 160), -30);
    p.alpha = rnd(0.25, 0.55);
    p.baseAlpha = p.alpha;
    p.vx = -rnd(60, 110);
    p.vy = rnd(900, 1300);
    p.rot = Math.atan2(-p.vx, p.vy);
    this.particles.push(p);
  }

  makePetal(w, h) {
    const roll = Math.floor(Math.random() * 100);
    const shape = roll < 45 ? 0 : (roll < 65 ? 1 : (roll < 80 ? 2 : 3));
    const palette = Math.floor(Math.random() * 5);
    const d = shape === 2 ? rnd(18, 26) : rnd(12, 18);
    const p = mk(TX.sakuraTex(shape, palette), d, d, rnd(-60, w + 60), -20);
    p.baseAlpha = rnd(0.88, 1);
    p.alpha = p.baseAlpha;
    p.fall = rnd(30, 55) * (shape === 2 ? 0.75 : 1);
    p.swayAmp = rnd(25, 60);
    p.swayFreq = rnd(0.5, 1.2);
    p.rock = rnd(0.4, 1.2);
    p.baseRot = rnd(0, 6.28);
    p.spinRate = rnd(-1.0, 1.0);
    p.flip = shape === 2 ? 0 : rnd(1.0, 3.0);
    p.vy = p.fall;
    this.particles.push(p);
  }

  makeLeaf(w, h) {
    const roll = Math.floor(Math.random() * 100);
    const shape = roll < 25 ? 0 : (roll < 45 ? 1 : (roll < 65 ? 2 : (roll < 75 ? 3 : (roll < 90 ? 4 : 5))));
    const palette = shape === 3 ? (Math.random() < 0.8 ? 2 : 1) : Math.floor(Math.random() * 6);
    let d;
    if (shape === 0 || shape === 1) d = rnd(20, 30);
    else if (shape === 2) d = rnd(14, 22);
    else if (shape === 5) d = rnd(18, 26);
    else d = rnd(14, 20);
    const p = mk(TX.leafTex(shape, palette), d, d, rnd(-60, w + 60), -24);
    p.fall = rnd(50, 95) * (shape === 5 ? 1.15 : (shape === 3 ? 0.85 : 1));
    p.swayAmp = rnd(35, 95);
    p.swayFreq = rnd(0.7, 1.9);
    p.rock = rnd(0.5, 1.5);
    p.baseRot = rnd(0, 6.28);
    p.spinRate = rnd(-1.2, 1.2);
    p.flip = rnd(1.2, 3.6);
    p.vy = p.fall;
    this.particles.push(p);
  }

  makeFirefly(w, h) {
    const d = rnd(14, 26);
    const p = mk(TX.tint(TX.glow(), rgba(0.9, 1.0, 0.45)), d, d, rnd(0, w), rnd(h * 0.15, h), 2);
    p.add = true;
    p.alpha = 0;
    p.curiosity = rnd(0.5, 3.0);
    p.orbit = rnd(16, 90);
    p.pulse = rnd(1.4, 3.2);
    p.vx = rnd(-20, 20);
    p.vy = rnd(-20, 20);
    this.particles.push(p);
  }

  makeMeteor(w, h) {
    const speed = rnd(750, 1150);
    const ang = rnd(-2.55, -2.1);                       // heading down-left (y-up angle)
    const len = speed * rnd(0.10, 0.16);
    const p = mk(TX.tint(TX.trail(), rgba(1, 0.95, 0.8)), len, rnd(3, 5), rnd(w * 0.3, w * 1.2), -20, 2);
    p.kind = 'meteor';
    p.add = true;
    p.vx = Math.cos(ang) * speed;
    p.vy = -Math.sin(ang) * speed;
    p.rot = Math.atan2(p.vy, p.vx);
    this.particles.push(p);
  }

  // ------------------------------------------------ stepping

  stepMain(p, dt) {
    const oldY = p.y;
    switch (this.effect) {
      case 'snow': case 'sakura': case 'leaves': {
        let tx = Math.sin(p.age * p.swayFreq + p.phase) * p.swayAmp + this.wind;
        let ty = p.fall;
        if (this.effect === 'snow') {
          tx = Math.sin(p.age * p.swayFreq + p.phase) * p.swayAmp
            + Math.sin(p.age * p.swayFreq * 2.3 + p.phase * 2) * p.swayAmp * 0.35
            + this.wind * (0.4 + p.depth);
          ty = p.fall * (1 + 0.12 * Math.sin(p.age * p.swayFreq * 1.4 + p.phase));
          p.rot += p.spinRate * dt;
        }
        const k = Math.min(1, 1.6 * dt);
        p.vx += (tx - p.vx) * k;
        p.vy += (ty - p.vy) * k;
        if (this.effect === 'leaves' || this.effect === 'sakura') this.pushByPointer(p, dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.rock > 0) {
          p.baseRot += p.spinRate * dt;
          p.rot = p.baseRot + Math.sin(p.age * p.swayFreq * 1.7 + p.phase) * p.rock;
        }
        if (p.flip > 0) p.sx = 0.25 + 0.75 * Math.abs(Math.cos(p.age * p.flip + p.phase));
        break;
      }
      case 'rain':
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        break;
      case 'fireflies': this.stepFirefly(p, dt); return;
      default: return;
    }

    const passesThrough = this.effect === 'snow' && p.depth > 0.8;       // near flakes fall in front of windows
    if (p.y > oldY && !passesThrough) {
      const idx = this.findLanding(p.x, oldY, p.y);
      if (idx >= 0) {
        const top = this.surfaces[idx].y;
        if (this.effect === 'rain') { this.splash(p.x, top); this.kill(p); }
        else if (this.effect === 'snow') this.landSnow(p, idx, p.x);
        else this.land(p, idx, p.x);
        return;
      }
    }
    if (p.y > this.height + 60 || p.x < -250 || p.x > this.width + 250) this.kill(p);
  }

  land(p, idx, x) {
    const s = this.surfaces[idx];
    const rel = x - s.x;
    let neighbors = 0;
    for (const q of this.particles) {
      if (q.resting && !q.dead && q.surfaceId === s.id && Math.abs(q.relX - rel) < 7) neighbors++;
    }
    if (neighbors > 48) { this.kill(p); return; }          // pile is full: melt
    const layer = this.effect === 'sakura' ? 0.2 : 0.25;
    p.surfaceId = s.id;
    p.relX = rel;
    p.restH = Math.min(neighbors * layer, 14) + rnd(0, 1.5);
    p.resting = true;
    p.restTime = 0;
    p.restLife = rnd(70, 150);
    p.vx = 0; p.vy = 0;
    p.rot = rnd(0, TAU);
    p.sx = 1;
    p.x = x;
    p.y = s.y - p.restH;
  }

  stepResting(p, dt) {
    p.restTime += dt;
    const i = this.surfaceIndex.get(p.surfaceId);
    if (i === undefined) { this.release(p, 0, 0); return; }
    const s = this.surfaces[i];
    const x = s.x + p.relX, y = s.y - p.restH;
    p.x = x; p.y = y;
    let covered = false;
    for (let j = 0; j < i; j++) {
      const f = this.surfaces[j];
      if (x >= f.x && x <= f.x + f.w && s.y - 1 >= f.y && s.y - 1 <= f.y + f.h) { covered = true; break; }
    }
    p.hidden = covered;
    if ((this.effect === 'leaves' || this.effect === 'sakura') && this.mouseSpeed > 120 && !covered && this.mouseValid) {
      const dx = x - this.mouse.x, dy = y - this.mouse.y, d = Math.hypot(dx, dy);
      if (d < 90) {
        const ux = d > 0.1 ? dx / d : rnd(-1, 1);
        p.resting = false;
        p.restTime = 0;
        p.vx = ux * rnd(180, 420);
        p.vy = -rnd(140, 300);
        return;
      }
    }
    const over = p.restTime - p.restLife;
    if (over > 0) {
      p.alpha = p.baseAlpha * Math.max(0, 1 - over / 2);
      if (over > 2) this.kill(p);
    }
  }

  pushByPointer(p, dt) {
    if (this.mouseSpeed <= 120 || !this.mouseValid) return;
    const dx = p.x - this.mouse.x, dy = p.y - this.mouse.y, d = Math.hypot(dx, dy);
    if (!(d < 90 && d > 0.1)) return;
    const f = (1 - d / 90) * Math.min(this.mouseSpeed, 1200) * 0.12 * dt * 60;
    p.vx += (dx / d) * f;
    p.vy += (dy / d) * f - (1 - d / 90) * 30;
  }

  stepFirefly(p, dt) {
    const w = this.width, h = this.height;
    if (this.mouseValid && this.stillTime > p.curiosity) {
      const ang = p.phase + p.age * 0.8;
      const tx = this.mouse.x + Math.cos(ang) * p.orbit, ty = this.mouse.y + Math.sin(ang) * p.orbit * 0.8;
      const dx = tx - p.x, dy = ty - p.y, d = Math.max(1, Math.hypot(dx, dy));
      const speed = Math.min(220, 60 + d * 0.8), k = Math.min(1, 2.2 * dt);
      p.vx += ((dx / d) * speed - p.vx) * k;
      p.vy += ((dy / d) * speed - p.vy) * k;
    } else {
      p.heading += rnd(-1, 1) * 2.0 * Math.sqrt(dt);
      if (p.x < 10 || p.x > w - 10 || p.y < 10 || p.y > h - 10) p.heading = Math.atan2(h / 2 - p.y, w / 2 - p.x);
      const sp = 28 + 14 * Math.sin(p.age * 0.5 + p.phase), k = Math.min(1, 1.5 * dt);
      p.vx += (Math.cos(p.heading) * sp - p.vx) * k;
      p.vy += (Math.sin(p.heading) * sp - 6 - p.vy) * k;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const fade = Math.min(1, p.age / 1.5);
    p.alpha = fade * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(p.age * p.pulse + p.phase)));
  }

  stepSpark(p, dt) {
    const oldY = p.y;
    p.vy += p.fall * dt;
    if (p.drag > 0) {
      const f = Math.max(0, 1 - p.drag * dt);
      p.vx *= f;
      p.vy *= f;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.spinRate !== 0) p.rot += p.spinRate * dt;

    // a clump of snow that lands on a window or the taskbar adds to that drift
    if (p.chunk && this.effect === 'snow' && p.y > oldY) {
      const idx = this.findLanding(p.x, oldY, p.y);
      if (idx >= 0) {
        const sf = this.surfaces[idx];
        this.getPile(sf).add(p.x - sf.x, p.area);
        this.spawnPowder(p.x, sf.y, 4, 0, -40, 90);
        this.kill(p);
        return;
      }
    }
    const t = p.age / p.life;
    if (t >= 1) { this.kill(p); return; }
    p.alpha = p.chunk ? p.baseAlpha * Math.min(1, (p.life - p.age) / 0.5) : (1 - t) * p.baseAlpha;
    if (p.y > this.height + 80) this.kill(p);
  }

  stepMeteor(p, dt) {
    const oldY = p.y, oldX = p.x;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const idx = this.findLanding(p.x, oldY, p.y);
    if (idx >= 0) {
      const top = this.surfaces[idx].y;
      const t = (top - oldY) / Math.max(0.001, p.y - oldY);
      this.burst(oldX + (p.x - oldX) * t, top);
      this.kill(p);
      return;
    }
    if (p.y > this.height + 80 || p.x < -400) this.kill(p);
  }

  stepFx(p) {
    const t = p.age / p.life;
    if (t >= 1) { this.kill(p); return; }
    p.w = p.w0 + (p.w1 - p.w0) * t;
    p.h = p.h0 + (p.h1 - p.h0) * t;
    p.alpha = p.alpha0 * (1 - t);
  }

  // ------------------------------------------------ splashes, sparks, lightning

  spawnSpark(x, y, vx, vy, size, tintColor, gravity, life, additive, opts = {}) {
    if (this.particles.length >= MAXP) return;
    const base = opts.tex || TX.dot();
    const p = mk(tintColor ? TX.tint(base, tintColor) : base, size, size, x, y, 3);
    p.kind = 'spark';
    p.add = additive;
    p.vx = vx; p.vy = vy; p.fall = gravity; p.life = life;
    p.drag = opts.drag || 0;
    p.spinRate = opts.spin || 0;
    p.area = opts.chunkArea || 0;
    p.chunk = p.area > 0;
    p.alpha = opts.alpha === undefined ? 1 : opts.alpha;
    p.baseAlpha = p.alpha;
    this.particles.push(p);
  }

  spawnPowder(x, y, count, vx, vy, spread) {
    for (let i = 0; i < count; i++) {
      this.spawnSpark(x, y, vx + rnd(-spread, spread), vy - rnd(0, spread), rnd(2, 5), rgba(0.97, 0.98, 1),
        120, rnd(0.6, 1.4), false, { drag: 1.8, alpha: rnd(0.5, 0.9) });
    }
  }

  fx(tex, x, y, w0, h0, w1, h1, life, alpha, add, z) {
    if (this.particles.length >= MAXP) return;
    const p = mk(tex, w0, h0, x, y, z);
    p.kind = 'fx'; p.add = add; p.life = life; p.alpha0 = alpha; p.alpha = alpha;
    p.w0 = w0; p.h0 = h0; p.w1 = w1; p.h1 = h1;
    this.particles.push(p);
  }

  splash(x, y) {
    this.fx(TX.tint(TX.ring(), rgba(0.8, 0.9, 1)), x, y, 8, 2.8, 28.8, 10.4, 0.3, 0.5, false, 2);
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      this.spawnSpark(x, y, rnd(-80, 80), -rnd(70, 170), 2.5, rgba(0.8, 0.9, 1), 800, 0.32, false);
    }
  }

  burst(x, y) {
    this.fx(TX.tint(TX.glow(), rgba(1, 0.9, 0.6)), x, y, 40, 40, 96, 96, 0.35, 1, true, 3);
    const n = 16 + Math.floor(Math.random() * 11);
    for (let i = 0; i < n; i++) {
      const a = rnd(0.15, 0.85) * Math.PI, sp = rnd(80, 360);
      this.spawnSpark(x, y, Math.cos(a) * sp, -Math.sin(a) * sp, rnd(2, 5), rgba(1, 0.92, 0.7), 520, rnd(0.45, 0.95), true);
    }
  }

  lightning(dt, now) {
    if (this.effect === 'rain') {
      if (now > Scene.nextLightning) { Scene.nextLightning = now + rnd(8, 18); Scene.lightningStamp++; }
      if (this.seenStamp !== Scene.lightningStamp) {
        this.seenStamp = Scene.lightningStamp;
        this.flash = { alpha: 0, t: 0, from: 0, steps: [[0.45, 0.04], [0.05, 0.07], [0.3, 0.04], [0, 0.5]] };
        this.flash.cur = this.flash.steps.shift();
        this.flash.from = 0;
      }
    }
    const f = this.flash;
    if (f.cur) {
      f.t += dt;
      const [to, dur] = f.cur;
      if (f.t >= dur) { f.alpha = to; f.from = to; f.t = 0; f.cur = f.steps.shift(); }
      else f.alpha = f.from + (to - f.from) * (f.t / dur);
    }
  }

  // ------------------------------------------------ snow drifts

  getPile(sf) {
    let pile = this.piles.get(sf.id);
    if (!pile) {
      const dock = sf.id === GROUND;
      pile = new SnowPile(sf.id, sf.w, dock ? 26 : 14, dock ? Math.min(240, sf.w * 0.28) : 28);
      pile.x = sf.x;
      pile.y = sf.y;
      this.piles.set(sf.id, pile);
    }
    return pile;
  }

  landSnow(p, idx, x) {
    const sf = this.surfaces[idx];
    this.getPile(sf).add(x - sf.x, p.area);
    this.kill(p);
  }

  // a dragged window throws its snow off in clumps and powder
  slideOff(pile, old, v) {
    if (!old) return;
    const hs = pile.heights, b = pile.bucket;
    const idxs = [];
    let total = 0;
    for (let i = 0; i < hs.length; i++) { if (hs[i] > 0.5) idxs.push(i); total += hs[i]; }
    total *= b;
    if (total <= 8 || idxs.length === 0) return;
    const count = Math.min(70, Math.max(6, Math.floor(total / 70)));
    const areaEach = total / count;
    const sz = Math.min(24, Math.max(7, Math.sqrt(areaEach) * 1.5));
    const vx = clamp(v.x, -1100, 1100), vy = clamp(v.y, -1100, 1100);
    for (let k = 0; k < count; k++) {
      const i = pick(idxs);
      const x = old.x + (i + 0.5) * b + rnd(-2, 2), y = old.y - hs[i] * rnd(0.2, 1);
      this.spawnSpark(x, y, vx * 0.75 + rnd(-70, 70), vy * 0.5 - rnd(-10, 110), sz * rnd(0.8, 1.2),
        rgba(0.95, 0.97, 1), 650, 6, false, { tex: TX.puff(), drag: 0.3, spin: rnd(-3, 3), chunkArea: areaEach, alpha: 1 });
      this.spawnPowder(x, y, 2, vx * 0.85, vy * 0.6, 120);
    }
  }

  // moving the pointer through a drift carves it and throws powder
  plowSnow(dt) {
    if (this.effect !== 'snow' || this.mouseSpeed <= 40 || this.piles.size === 0 || !this.mouseValid) return;
    const R = 26, m = this.mouse;
    for (const pile of this.piles.values()) {
      const relX = m.x - pile.x;
      if (!(relX > -R && relX < pile.width + R)) continue;
      const ci = clamp(Math.floor(relX / pile.bucket), 0, pile.n - 1);
      if (pile.covered[ci]) continue;
      const hc = pile.heights[ci];
      const up = pile.y - m.y;                                   // pointer height above the drift base
      if (!(up > -10 && up < hc + 12)) continue;

      const reach = Math.floor(R / pile.bucket);
      const strength = Math.min(1, (this.mouseSpeed * dt) / 8);
      let removed = 0;
      for (let k = -reach; k <= reach; k++) {
        const i = ci + k;
        if (i < 0 || i >= pile.n || pile.covered[i]) continue;
        const fall = 1 - Math.abs(k) / (reach + 1);
        const take = pile.heights[i] * 0.55 * fall * strength;
        pile.heights[i] -= take;
        removed += take * pile.bucket;
      }
      if (removed <= 0.2) continue;

      // part of the snow is shoved ahead of the pointer, the rest flies up as powder
      const dir = this.mouseVel.x >= 0 ? 1 : -1;
      pile.add(relX + dir * (R + 6), removed * 0.4);
      const n = Math.min(14, Math.floor(removed / 1.5) + 1);
      for (let i = 0; i < n; i++) {
        const y = pile.y - clamp(up, 0, hc) - rnd(0, 4);
        this.spawnSpark(m.x + rnd(-R * 0.6, R * 0.6), y,
          this.mouseVel.x * 0.45 + rnd(-90, 90), -(rnd(40, 200) + Math.abs(this.mouseVel.y) * 0.2),
          rnd(2, 5.5), rgba(0.97, 0.98, 1), 200, rnd(0.7, 1.6), false, { drag: 1.4, alpha: rnd(0.55, 0.95) });
      }
      pile.relax();
      pile.rebuild();
    }
  }

  // ------------------------------------------------ drawing

  draw(ctx, dpr = 1) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.width, this.height);

    for (const pile of this.piles.values()) {
      if (!pile.fillPath) continue;
      ctx.setTransform(dpr, 0, 0, dpr, pile.x * dpr, pile.y * dpr);
      const g = ctx.createLinearGradient(0, -pile.maxH, 0, 2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(1, 'rgb(189,214,242)');
      ctx.fillStyle = g;
      ctx.fill(pile.fillPath);
      ctx.strokeStyle = 'rgba(158,189,230,0.6)';
      ctx.lineWidth = 1.2;
      ctx.stroke(pile.fillPath);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.stroke(pile.rimPath);
    }

    let add = false;
    for (let z = 1; z <= 3; z++) {
      for (const p of this.particles) {
        if (p.dead || p.hidden || p.z !== z || p.alpha <= 0.003) continue;
        if (p.add !== add) { add = p.add; ctx.globalCompositeOperation = add ? 'lighter' : 'source-over'; }
        ctx.globalAlpha = p.alpha > 1 ? 1 : p.alpha;
        if (p.kind === 'meteor') {
          const c = Math.cos(p.rot), s = Math.sin(p.rot);
          ctx.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * p.x, dpr * p.y);
          ctx.drawImage(p.tex, -p.w, -p.h / 2, p.w, p.h);                  // head is at the right end
          ctx.globalAlpha = Math.min(1, p.alpha * 0.7);
          ctx.drawImage(TX.tint(TX.glow(), rgba(1, 0.97, 0.85)), -8, -8, 16, 16);
        } else {
          const c = Math.cos(p.rot), s = Math.sin(p.rot);
          ctx.setTransform(dpr * c * p.sx, dpr * s * p.sx, -dpr * s, dpr * c, dpr * p.x, dpr * p.y);
          ctx.drawImage(p.tex, -p.w / 2, -p.h / 2, p.w, p.h);
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this.flash.alpha > 0.003) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(209,229,255,${this.flash.alpha})`;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  debugStats() {
    let moving = 0, resting = 0;
    for (const p of this.particles) { if (p.dead) continue; if (p.resting) resting++; else moving++; }
    let maxH = 0;
    for (const pile of this.piles.values()) for (const h of pile.heights) if (h > maxH) maxH = h;
    return `particles=${this.particles.length} moving=${moving} resting=${resting} piles=${this.piles.size} maxPile=${maxH.toFixed(1)}`;
  }
}
Scene.lightningStamp = 0;
Scene.nextLightning = Date.now() / 1000 + 8;
