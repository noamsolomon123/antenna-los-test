// Pure national-scan logic tests. Run with: node tests/national.test.js
import assert from 'node:assert/strict';
import { buildCandidateGrid, scoreVantage, summarizeScan, rankSites, pickDisplaySites, israelBBox } from '../src/national.js';
import { isSafe } from '../src/safezone.js';

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };

// --- buildCandidateGrid ----------------------------------------------------
{
  const bbox = { south: 31.0, north: 31.2, west: 34.8, east: 35.0 };
  const all = buildCandidateGrid(bbox, 5, () => true);
  ok(all.length > 0, 'grid produces cells over a small box');
  ok(all.every((c) => c.lat >= bbox.south - 1e-9 && c.lat <= bbox.north + 1e-9 &&
                      c.lon >= bbox.west - 1e-9 && c.lon <= bbox.east + 1e-9),
    'every candidate sits inside the bbox');

  const dense = buildCandidateGrid(bbox, 2, () => true);
  ok(dense.length > all.length, 'finer spacing yields more candidates');

  ok(buildCandidateGrid(bbox, 5, () => false).length === 0,
    'a reject-all safe predicate yields no candidates');

  // default predicate is real isSafe: a box inside the West Bank is excluded
  const wb = buildCandidateGrid({ south: 32.15, north: 32.25, west: 35.2, east: 35.3 }, 3);
  ok(wb.length === 0, 'West Bank box excluded by the default isSafe predicate');
  // ...while a box over the northern Negev (safe) keeps cells
  const negev = buildCandidateGrid({ south: 31.0, north: 31.1, west: 34.8, east: 34.9 }, 3);
  ok(negev.length > 0 && negev.every((c) => isSafe(c.lat, c.lon)), 'safe Negev box keeps only safe cells');
}

// --- scoreVantage ----------------------------------------------------------
{
  const gw = 21, gh = 21;
  const box = { south: 31.0, north: 31.2, west: 34.9, east: 35.1 };
  // a Gaussian hill centred in the grid, peak 1000 m on a 0 m plain
  const hill = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const cx = (x - 10) / 10, cy = (y - 10) / 10;
    hill[y * gw + x] = 1000 * Math.exp(-(cx * cx + cy * cy) * 4);
  }
  const center = { lat: 31.1, lon: 35.0 };   // hilltop
  const plain = { lat: 31.02, lon: 34.92 };  // near a corner, low ground
  scoreVantage(hill, gw, gh, box, [center, plain], 3);
  ok(center.vantageScore > plain.vantageScore, 'hilltop scores higher than the plain');
  ok(center.vantageScore > 50, 'hilltop prominence is clearly positive');
  ok(Number.isFinite(center.prefiltElev) && center.prefiltElev > 500, 'hilltop elevation sampled (~peak)');

  // flat terrain -> ~0 prominence
  const flat = new Float32Array(gw * gh).fill(120);
  const p = { lat: 31.1, lon: 35.0 };
  scoreVantage(flat, gw, gh, box, [p], 3);
  ok(Math.abs(p.vantageScore) < 1e-6, 'flat terrain -> ~0 prominence');

  // NaN elevation (no data) -> -Infinity score (deprioritised)
  const nan = new Float32Array(gw * gh).fill(NaN);
  const q = { lat: 31.1, lon: 35.0 };
  scoreVantage(nan, gw, gh, box, [q], 3);
  ok(q.vantageScore === -Infinity, 'no-data cell scored -Infinity');
}

// --- summarizeScan ---------------------------------------------------------
{
  const dists = [30, 40, 50];
  const res = { points: [
    { nominalKm: 30, found: true, clear: true, confirmed: true, marginM: 20, distanceKm: 30.1 },
    { nominalKm: 40, found: true, clear: true, confirmed: true, marginM: 5, distanceKm: 39.8 },
    { nominalKm: 50, found: true, clear: false, confirmed: true, marginM: -3, distanceKm: 50.2 },
  ] };
  const s = summarizeScan(res, dists);
  ok(s.bandsClear === 2, 'counts only clear bands');
  ok(Math.abs(s.clearanceSum - 25) < 1e-9, 'sums clearance of clear bands');
  ok(Math.abs(s.maxReachKm - 39.8) < 1e-9, 'max reach = farthest clear band');

  const none = summarizeScan({ points: [
    { nominalKm: 30, found: false }, { nominalKm: 40, found: false }, { nominalKm: 50, found: false },
  ] }, dists);
  ok(none.bandsClear === 0 && none.clearanceSum === 0 && none.maxReachKm === 0, 'nothing found -> zeros');

  // an unconfirmed (estimated, no terrain data along the path) clear band is NOT trusted
  const unconf = summarizeScan({ points: [
    { nominalKm: 30, found: true, clear: true, confirmed: false, marginM: 12, distanceKm: 29.9 },
    { nominalKm: 40, found: true, clear: true, confirmed: true, marginM: 8, distanceKm: 40.2 },
    { nominalKm: 50, found: false },
  ] }, dists);
  ok(unconf.bandsClear === 1 && Math.abs(unconf.clearanceSum - 8) < 1e-9,
    'unconfirmed/estimated bands are not counted as clear');
}

// --- pickDisplaySites ------------------------------------------------------
{
  const acc = [{ bandsClear: 3, lat: 31 }, { bandsClear: 2, lat: 31 }, { bandsClear: 1, lat: 31 }];
  const r = pickDisplaySites(acc, 3);
  ok(r.partial === false && r.display.length === 1 && r.display[0].bandsClear === 3,
    'when sites clear all bands, show only those (partial=false)');

  const acc2 = [{ bandsClear: 2, lat: 31 }, { bandsClear: 2, lat: 30 }, { bandsClear: 1, lat: 31 }];
  const r2 = pickDisplaySites(acc2, 3);
  ok(r2.partial === true && r2.display.length === 2 && r2.display.every((s) => s.bandsClear === 2),
    'fallback shows only the best partial tier (2-band), not the weaker 1-band site');

  ok(pickDisplaySites([], 3).display.length === 0, 'empty accessible -> empty display');
}

// --- rankSites -------------------------------------------------------------
{
  const sites = [
    { lat: 31.5, bandsClear: 2, clearanceSum: 30 },
    { lat: 30.5, bandsClear: 3, clearanceSum: 10 },
    { lat: 31.0, bandsClear: 3, clearanceSum: 10 },
  ];
  const r = rankSites(sites);
  ok(r[0].bandsClear === 3 && r[1].bandsClear === 3, 'more bands cleared ranks first');
  ok(r[0].lat === 30.5, 'tie on bands+clearance -> south (lower lat) first');
  ok(r[2].bandsClear === 2, 'fewer bands ranks last');

  const tie = [{ lat: 31, bandsClear: 3, clearanceSum: 5 }, { lat: 31, bandsClear: 3, clearanceSum: 50 }];
  ok(rankSites(tie)[0].clearanceSum === 50, 'equal bands -> higher clearance first');
}

// --- israelBBox sanity -----------------------------------------------------
{
  const b = israelBBox();
  ok(b.south < 30 && b.north > 33 && b.west > 34 && b.east < 36, 'Israel bbox spans the expected range');
  ok(b.south < b.north && b.west < b.east, 'bbox is well-formed');
}

console.log(`\n✅ all ${passed} national assertions passed`);
