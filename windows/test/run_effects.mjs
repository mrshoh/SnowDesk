import fs from 'node:fs';
import { newScene, simulate, renderPNG } from './harness.mjs';
fs.mkdirSync('/tmp/out', { recursive: true });
const secs = { snow: 200, rain: 8, sakura: 60, leaves: 60, fireflies: 12, starfall: 20 };
for (const e of Object.keys(secs)) {
  const s = newScene(e);
  const t0 = Date.now();
  simulate(s, secs[e]);
  renderPNG(s, `/tmp/out/${e}.png`);
  console.log(e, s.debugStats(), `${Date.now() - t0}ms`);
}
