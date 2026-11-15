import { newScene, simulate, renderPNG, WINS, GROUNDREC, W, H } from './harness.mjs';
// 1) plow
let s = newScene('snow');
let now = simulate(s, 150);
renderPNG(s, '/tmp/out/plow0.png', WINS, { x: 480, y: 270, w: 720, h: 90, scale: 2 });
const path = (t) => ({ x: 560 + t * 560, y: 324 });          // 560px/s along the top of window 2
simulate(s, 0.5, { pointer: path });
renderPNG(s, '/tmp/out/plow1.png', WINS, { x: 480, y: 270, w: 720, h: 90, scale: 2 });
simulate(s, 0.4, { pointer: () => ({ x: 1300, y: 600 }) });
renderPNG(s, '/tmp/out/plow2.png', WINS, { x: 480, y: 270, w: 720, h: 90, scale: 2 });

// 2) drag window 2 sideways: drift breaks into clumps
s = newScene('snow');
simulate(s, 150);
renderPNG(s, '/tmp/out/drag0.png', WINS, { x: 400, y: 200, w: 900, h: 200, scale: 1.5 });
let wins = WINS.map((w) => ({ ...w }));
let t = 1000 + 5000;
for (let i = 0; i < 24; i++) {                               // 0.4 s of dragging at ~600px/s
  wins[1].x += 10; wins[1].y -= 1;
  for (let k = 0; k < 2; k++) { t += 1 / 60; if (k === 0) s.setSurfaces(wins, GROUNDREC, t); s.update(1 / 60, t); }
}
renderPNG(s, '/tmp/out/drag1.png', wins, { x: 400, y: 200, w: 900, h: 300, scale: 1.5 });
for (let i = 0; i < 30; i++) { t += 1 / 60; if (i % 2 === 0) s.setSurfaces(wins, GROUNDREC, t); s.update(1 / 60, t); }
renderPNG(s, '/tmp/out/drag2.png', wins, { x: 400, y: 200, w: 900, h: 400, scale: 1.2 });
console.log('interact ok', s.debugStats());
