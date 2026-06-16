// Explore-engine pure-logic tests. Run with: node tests/explore.test.js
import assert from 'node:assert/strict';
import { curate, buildRoute, sortCandidates, filterCandidates } from '../src/explore.js';

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const approx = (a, b, t, m) => { assert.ok(Math.abs(a - b) <= t, `${m}: ${a} vs ${b}`); passed++; };

// --- curate: best-per-bucket, LOS-only, safe filter, distance/nodata exclusion ---
{
  const box = { south: 31.0, west: 34.5, north: 32.0, east: 35.5 };
  const observer = { lat: 31.5, lon: 35.0 };
  const N = 3; // cells at lat {32,31.5,31}, lon {34.5,35,35.5}
  const g = new Float32Array(N * N).fill(NaN);
  const at = (gy, gx, v) => { g[gy * N + gx] = v; };
  at(1, 1, 50);   // observer cell — excluded (too close)
  at(0, 1, 10);   // (32.0, 35.0)  LOS, margin 10
  at(2, 1, 5);    // (31.0, 35.0)  LOS, margin 5
  at(1, 0, -3);   // (31.5, 34.5)  blocked — excluded
  // (1,2) left NaN — no data, excluded

  const all = curate(g, N, box, 1e9, observer, null);
  ok(all.length === 2, 'curate keeps the 2 LOS cells (drops blocked, no-data, and the too-close observer cell)');
  ok(all.some((c) => c.marginM === 10) && all.some((c) => c.marginM === 5), 'curate carries the cell margins');

  const safeStub = (lat) => lat < 31.9; // exclude the northern cell
  const safe = curate(g, N, box, 1e9, observer, safeStub);
  ok(safe.length === 1 && safe[0].marginM === 5, 'curate drops points outside the safe area');
}

// --- buildRoute: outward, bending, bounded hops ---
{
  const observer = { lat: 31.0, lon: 35.0 };
  const cands = [
    { lat: 31.05, lon: 35.0, distanceKm: 5.5, marginM: 10 },
    { lat: 31.10, lon: 35.0, distanceKm: 11.1, marginM: 8 },
    { lat: 31.20, lon: 35.0, distanceKm: 22.2, marginM: 6 },   // 11 km gap from the previous -> unreachable (maxHop 8)
    { lat: 31.00, lon: 35.3, distanceKm: 28.0, marginM: 20 },  // big margin but too far to hop to
  ];
  const route = buildRoute(cands, observer, {});
  ok(route.length === 2, 'route hops P1 -> P2 then stops (next gap exceeds maxHop)');
  ok(route[0].routeOrder === 1 && route[1].routeOrder === 2, 'route members are ordered 1..n');
  ok(route[0].distanceKm < route[1].distanceKm, 'route progresses outward');
  ok(cands[2].routeOrder === Infinity && cands[3].routeOrder === Infinity, 'unreachable points get routeOrder Infinity');
}

// --- sort ---
{
  const cs = [
    { routeOrder: Infinity, distanceKm: 40, marginM: 3, groundElev: 800 },
    { routeOrder: 1, distanceKm: 20, marginM: 9, groundElev: 300 },
    { routeOrder: 2, distanceKm: 30, marginM: 5, groundElev: 500 },
  ];
  ok(sortCandidates(cs, 'route')[0].routeOrder === 1, 'route sort puts the corridor first');
  ok(sortCandidates(cs, 'clearance', 'desc')[0].marginM === 9, 'clearance desc -> strongest first');
  ok(sortCandidates(cs, 'distance', 'asc')[0].distanceKm === 20, 'distance asc -> nearest first');
  ok(sortCandidates(cs, 'height', 'desc')[0].groundElev === 800, 'height desc -> highest first');
}

// --- filter ---
{
  const cs = [
    { distanceKm: 15, marginM: 2, groundElev: 200, bearingDeg: 5 },
    { distanceKm: 35, marginM: 12, groundElev: 700, bearingDeg: 180 },
    { distanceKm: 48, marginM: 8, groundElev: 600, bearingDeg: 355 },
  ];
  ok(filterCandidates(cs, { minKm: 20, maxKm: 50 }).length === 2, 'distance range filter');
  ok(filterCandidates(cs, { minClearance: 10 }).length === 1, 'min clearance filter');
  ok(filterCandidates(cs, { minHeight: 650 }).length === 1, 'min height filter');
  // wrap-aware sector 350..10 should include 5 and 355, exclude 180
  const sec = filterCandidates(cs, { dirFrom: 350, dirTo: 10 });
  ok(sec.length === 2 && !sec.some((c) => c.bearingDeg === 180), 'wrap-around direction sector (350..10)');
}

// --- priority to the south ---
{
  // route prefers the southern of two equal candidates
  const observer = { lat: 31.5, lon: 35.0 };
  const south = { lat: 31.45, lon: 35.0, distanceKm: 5.6, marginM: 10 };
  const north = { lat: 31.55, lon: 35.0, distanceKm: 5.6, marginM: 10 };
  const route = buildRoute([north, south], observer, {});
  ok(route[0] === south, 'buildRoute heads south first (southern candidate chosen)');

  // default route sort puts southern non-route points first
  const cs = [
    { routeOrder: Infinity, lat: 31.6, distanceKm: 20, marginM: 5, groundElev: 400 },
    { routeOrder: Infinity, lat: 31.3, distanceKm: 30, marginM: 5, groundElev: 400 },
    { routeOrder: Infinity, lat: 31.5, distanceKm: 25, marginM: 5, groundElev: 400 },
  ];
  ok(sortCandidates(cs, 'route')[0].lat === 31.3, 'route sort lists the most-southern point first');
}

// --- car access (road distance) ---
{
  // road sort: nearest road first
  const cs = [
    { roadDistM: 500, distanceKm: 20, marginM: 5 },
    { roadDistM: 100, distanceKm: 30, marginM: 5 },
    { roadDistM: 900, distanceKm: 25, marginM: 5 },
  ];
  ok(sortCandidates(cs, 'road', 'asc')[0].roadDistM === 100, 'road sort lists the nearest-road spot first');

  // maxRoadKm filter keeps near + unknown, drops far
  const f = [
    { roadDistM: 200, distanceKm: 10, marginM: 1 },
    { roadDistM: 1500, distanceKm: 10, marginM: 1 },
    { roadDistM: null, distanceKm: 10, marginM: 1 },
  ];
  const kept = filterCandidates(f, { maxRoadKm: 1 });
  ok(kept.length === 2 && !kept.some((c) => c.roadDistM === 1500), 'maxRoadKm drops far-from-road, keeps near + unknown');

  // route prefers the nearer-road of two otherwise-equal candidates
  const observer = { lat: 31.5, lon: 35.0 };
  const nearRoad = { lat: 31.45, lon: 35.0, distanceKm: 5.6, marginM: 10, roadDistM: 50 };
  const farRoad = { lat: 31.45, lon: 35.01, distanceKm: 5.6, marginM: 10, roadDistM: 5000 };
  const route = buildRoute([farRoad, nearRoad], observer, {});
  ok(route[0] === nearRoad, 'buildRoute prefers the spot nearer a road');
}

console.log(`\n✅ all ${passed} explore assertions passed`);
