// Pure scan-logic tests. Run with: node tests/scan.test.js
import assert from 'node:assert/strict';
import { sweep, selectBest, selectCorridor } from '../src/scan.js';

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const mk = (margin) => ({ marginM: margin, lat: 0, lon: 0, distM: 0, groundElev: 0, az: 0 });

// --- selection on a hand-built candidate matrix (3 distances x 8 bearings) ---
{
  const cand = [new Array(8).fill(null), new Array(8).fill(null), new Array(8).fill(null)];
  cand[0][0] = mk(10); cand[0][4] = mk(100); // distance 0: a weak point at bearing 0, a strong one at 4
  cand[1][1] = mk(10);                         // distance 1: only near bearing 1
  cand[2][7] = mk(10); cand[2][1] = mk(5);     // distance 2: near bearing 7 and bearing 1

  const best = selectBest(cand);
  ok(best[0].marginM === 100 && best[1].marginM === 10 && best[2].marginM === 10,
    'selectBest picks the max-margin bearing per distance, any direction');

  const cor = selectCorridor(cand, 45, 8); // window half-width = 1 bearing
  ok(cor.picks.filter(Boolean).length === 3,
    'selectCorridor prefers a window covering ALL distances over a single high-margin outlier');
  ok(cor.corridorAz === 0, 'corridor centred where all three distances are reachable (bearing 0)');
}

// --- sweep over synthetic terrain ---
{
  const flat = () => 50;
  const candFlat = sweep({
    observer: { lat: 31.3, lon: 35.0, groundElev: 800, mast: 20 },
    distancesKm: [30, 40, 50], toleranceKm: 3, rxMast: 20, freqHz: 5.8e9, fresnelPct: 0.6, sampleElev: flat,
  });
  ok(candFlat.every((arr) => arr.some(Boolean)),
    'flat low terrain + high observer => LOS candidates exist at 30/40/50 km');

  const wall = () => 5000;
  const candWall = sweep({
    observer: { lat: 31.3, lon: 35.0, groundElev: 100, mast: 10 },
    distancesKm: [30, 40, 50], toleranceKm: 3, rxMast: 10, freqHz: 5.8e9, fresnelPct: 0.6, sampleElev: wall,
  });
  ok(candWall.every((arr) => arr.every((c) => c === null)),
    'uniform high wall above the observer => no LOS candidates');
}

console.log(`\n✅ all ${passed} scan assertions passed`);
