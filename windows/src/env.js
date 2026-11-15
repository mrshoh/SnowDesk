// Environment hooks so the same drawing code runs in Electron (browser canvas) and in Node tests.
let canvasFactory = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
let pathFactory = () => new Path2D();

export function setCanvasFactory(f) { canvasFactory = f; }
export function setPathFactory(f) { pathFactory = f; }
export function makeCanvas(w, h) { return canvasFactory(w, h); }
export function newPath() { return pathFactory(); }

export function rgba(r, g, b, a = 1) {
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
}
export function rnd(a, b) { return a + Math.random() * (b - a); }
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
