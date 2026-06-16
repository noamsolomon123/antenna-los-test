// explore.js — "find all LOS points" engine. Reuses the viewshed margin grid,
// curates the safe LOS area into best-per-cell candidates, builds a bending
// corridor route, and provides pure sort/filter helpers for the table view.
import { distanceM, bearingDeg, metresPerDegree } from './geo.js';
import { computeMarginGrid } from './viewshed.js';
import { elevation } from './terrain.js';
import { isSafe } from './safezone.js';
import { fetchRoads, nearestRoadM } from './roads.js';

const ZOOM = 11;
const CELL_KM = 2.5;     // curation bucket size
const MIN_DIST_KM = 1.5; // ignore points right next to the observer

/**
 * Pure: margin grid -> best (margin>=0) safe LOS point per ~cellKm bucket.
 * Each candidate: { lat, lon, marginM, distanceKm, bearingDeg }.
 */
export function curate(grid, gridN, box, maxRangeM, observer, safe, cellKm = CELL_KM, minDistKm = MIN_DIST_KM) {
  const { north, south, west, east } = box;
  const [perLat, perLon] = metresPerDegree(observer.lat);
  const cellDegLat = (cellKm * 1000) / perLat;
  const cellDegLon = (cellKm * 1000) / perLon;
  const buckets = new Map();
  for (let gy = 0; gy < gridN; gy++) {
    const lat = north - ((north - south) * gy) / (gridN - 1);
    for (let gx = 0; gx < gridN; gx++) {
      const m = grid[gy * gridN + gx];
      if (Number.isNaN(m) || m < 0) continue; // line-of-sight only
      const lon = west + ((east - west) * gx) / (gridN - 1);
      const distM = distanceM([observer.lat, observer.lon], [lat, lon]);
      const distanceKm = distM / 1000;
      if (distM > maxRangeM || distanceKm < minDistKm) continue;
      if (safe && !safe(lat, lon)) continue;
      const key = `${Math.floor((lat - south) / cellDegLat)},${Math.floor((lon - west) / cellDegLon)}`;
      const cur = buckets.get(key);
      if (!cur || m > cur.marginM) {
        buckets.set(key, { lat, lon, marginM: m, distanceKm, bearingDeg: bearingDeg([observer.lat, observer.lon], [lat, lon]) });
      }
    }
  }
  return [...buckets.values()];
}

/**
 * Pure: greedy outward route from the observer that hops to nearby high-clearance
 * spots (so it bends to follow good terrain). Sets `routeOrder` on each candidate
 * (1-based for route members, Infinity otherwise) and returns the ordered route.
 */
export function buildRoute(candidates, observer, opts = {}) {
  const maxHopKm = opts.maxHopKm ?? 8;
  const hopPenalty = opts.hopPenalty ?? 2;
  const southBias = opts.southBias ?? 80; // prefer heading south (lower latitude)
  const roadPenalty = opts.roadPenalty ?? 3; // per km to the nearest road (prefer drivable)
  candidates.forEach((c) => { c.routeOrder = Infinity; });
  const remaining = new Set(candidates);
  let cur = { lat: observer.lat, lon: observer.lon, distanceKm: 0 };
  const route = [];
  for (;;) {
    let best = null, bestScore = -Infinity;
    for (const c of remaining) {
      if (c.distanceKm <= cur.distanceKm) continue; // must progress outward
      const hopKm = distanceM([cur.lat, cur.lon], [c.lat, c.lon]) / 1000;
      if (hopKm > maxHopKm) continue;
      // reward clearance + short hop + going south + being near a road
      const roadKm = c.roadDistM == null ? 2 : c.roadDistM / 1000;
      const score = c.marginM - hopPenalty * hopKm + southBias * (cur.lat - c.lat) - roadPenalty * roadKm;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (!best) break;
    best.routeOrder = route.length + 1;
    route.push(best);
    remaining.delete(best);
    cur = best;
  }
  return route;
}

/** Pure: sort. 'route' = corridor-first (routeOrder then distance); others honor dir. */
export function sortCandidates(cands, sortBy = 'route', dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  const roadBucket = (c) => Math.round((c.roadDistM ?? 9e9) / 250); // ~250 m buckets
  const cmp = {
    // corridor first, then nearer-road (drivable) + southern first
    route: (a, b) => (a.routeOrder - b.routeOrder) || (roadBucket(a) - roadBucket(b)) || ((a.lat || 0) - (b.lat || 0)),
    distance: (a, b) => sign * (a.distanceKm - b.distanceKm),
    clearance: (a, b) => sign * (a.marginM - b.marginM),
    height: (a, b) => sign * ((a.groundElev || 0) - (b.groundElev || 0)),
    road: (a, b) => sign * ((a.roadDistM ?? Infinity) - (b.roadDistM ?? Infinity)),
  }[sortBy] || (() => 0);
  return [...cands].sort(cmp);
}

/** Pure: filter by distance range, min clearance, direction sector (wrap-aware), min height. */
export function filterCandidates(cands, f = {}) {
  return cands.filter((c) => {
    if (f.minKm != null && c.distanceKm < f.minKm) return false;
    if (f.maxKm != null && c.distanceKm > f.maxKm) return false;
    if (f.minClearance != null && c.marginM < f.minClearance) return false;
    if (f.minHeight != null && (c.groundElev || 0) < f.minHeight) return false;
    if (f.maxRoadKm != null && c.roadDistM != null && c.roadDistM / 1000 > f.maxRoadKm) return false;
    if (f.dirFrom != null && f.dirTo != null) {
      const b = c.bearingDeg;
      const inSector = f.dirFrom <= f.dirTo ? (b >= f.dirFrom && b <= f.dirTo) : (b >= f.dirFrom || b <= f.dirTo);
      if (!inSector) return false;
    }
    return true;
  });
}

// bounding box of the candidate points, padded — keeps the road query small
function roadsBox(candidates, padDeg = 0.02) {
  if (!candidates.length) return null;
  let s = Infinity, n = -Infinity, w = Infinity, e = -Infinity;
  for (const c of candidates) { s = Math.min(s, c.lat); n = Math.max(n, c.lat); w = Math.min(w, c.lon); e = Math.max(e, c.lon); }
  return { south: s - padDeg, north: n + padDeg, west: w - padDeg, east: e + padDeg };
}

/** Run the full explore from `observer`: margin grid -> curated candidates + route. */
export async function runExplore({ observer, rxMast, freqHz, fresnelPct, onProgress }) {
  const r = await computeMarginGrid({ observer, rxMast, freqHz, fresnelPct, onProgress });
  const candidates = curate(r.grid, r.gridN, r.box, r.maxRangeM, r.observer, isSafe);
  for (const c of candidates) {
    const g = elevation(c.lat, c.lon, ZOOM);
    c.groundElev = Number.isNaN(g) ? null : g;
  }
  onProgress?.('roads', 0);
  // query only the candidates' bounding box (+pad) — far smaller than the full 50 km square
  const ways = await fetchRoads(roadsBox(candidates) || r.box);
  for (const c of candidates) { const d = nearestRoadM(c.lat, c.lon, ways); c.roadDistM = Number.isFinite(d) ? d : null; }
  buildRoute(candidates, r.observer, {});
  return { candidates, observer: r.observer, hasRoads: ways.length > 0 };
}
