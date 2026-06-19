// national.js — "National Scan": automatically find the best antenna observer
// sites across all of Israel, without manual point-picking.
//
// Two-stage pipeline so an all-Israel search is tractable in the browser:
//   Stage 1 (cheap, whole country): grid the safe-Israel area, score each cell by
//           terrain prominence (a fast "sees far" proxy). Keep the top candidates.
//   Stage 2 (precise, top only): run the real LOS scan (scan.js) on each shortlisted
//           cell, confirm clear line-of-sight at the 30/40/50 km bands, then check
//           car access (distance to a drivable road).
// Output: ranked sites (most bands cleared, then clearance, then south first).
import { metresPerDegree, squareBox } from './geo.js';
import { ensureCovered, buildGrid } from './terrain.js';
import { isSafe, SAFE_RINGS } from './safezone.js';
import { runScan } from './scan.js';
import { fetchRoads, nearestRoadM } from './roads.js';
import { nearestRoadOSRM } from './roads-osrm.js';

const PREFILTER_ZOOM = 11;     // ~65 m terrain for the cheap national prominence grid
const PREFILTER_CELL_M = 500;  // target sampling resolution of the prominence grid
const ROAD_CONCURRENCY = 3;    // gentle on Overpass
const OSRM_CONCURRENCY = 4;    // gentle on the public OSRM demo server (fallback only)

const DEFAULTS = {
  gridSpacingKm: 3,
  maxConfirm: 60,
  distancesKm: [30, 40, 50],
  toleranceKm: 3,
  mast: 3,        // observer mast (the site we're evaluating)
  rxMast: 3,      // far-end mast
  fresnelPct: 0.6,
  freqHz: 5.8e9,
  maxRoadM: 1000, // car-accessible: within 1 km of a drivable road
  prominenceRadiusKm: 4,
};

const MAX_DISPLAY = 50; // cap the result list so it stays a useful shortlist

// ---- pure helpers ----------------------------------------------------------

/** Bounding box of safe Israel, derived from the boundary polygon (single source of truth). */
export function israelBBox() {
  const ring = SAFE_RINGS[0];
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const [lon, lat] of ring) {
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lon < west) west = lon;
    if (lon > east) east = lon;
  }
  return { south, north, west, east };
}

/** Pure: grid of safe candidate cells, ~spacingKm apart, inside `safe`. */
export function buildCandidateGrid(bbox, spacingKm, safe = isSafe) {
  const out = [];
  const perLatMid = metresPerDegree((bbox.south + bbox.north) / 2)[0];
  const dLat = (spacingKm * 1000) / perLatMid;
  if (!(dLat > 0)) return out;
  for (let lat = bbox.south; lat <= bbox.north; lat += dLat) {
    const perLon = metresPerDegree(lat)[1];
    const dLon = (spacingKm * 1000) / perLon;
    if (!(dLon > 0)) continue;
    for (let lon = bbox.west; lon <= bbox.east; lon += dLon) {
      if (safe(lat, lon)) out.push({ lat, lon });
    }
  }
  return out;
}

// bilinear sample of a regular lat/lon grid (row 0 = north). NaN-aware.
function sampleGrid(grid, gw, gh, box, lat, lon) {
  if (lat < box.south || lat > box.north || lon < box.west || lon > box.east) return NaN;
  const fx = ((lon - box.west) / (box.east - box.west)) * (gw - 1);
  const fy = ((box.north - lat) / (box.north - box.south)) * (gh - 1);
  const x0 = Math.max(0, Math.min(gw - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(gh - 1, Math.floor(fy)));
  const x1 = Math.min(gw - 1, x0 + 1);
  const y1 = Math.min(gh - 1, y0 + 1);
  const dx = fx - x0, dy = fy - y0;
  const v = (cx, cy) => grid[cy * gw + cx];
  const a = v(x0, y0), b = v(x1, y0), c = v(x0, y1), d = v(x1, y1);
  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) {
    const vals = [a, b, c, d].filter((z) => !Number.isNaN(z));
    return vals.length ? vals.reduce((s, z) => s + z, 0) / vals.length : NaN;
  }
  const top = a * (1 - dx) + b * dx;
  const bot = c * (1 - dx) + d * dx;
  return top * (1 - dy) + bot * dy;
}

/**
 * Pure: annotate each candidate with `vantageScore` = elevation minus the mean of
 * its neighbourhood (prominence). High score ⇒ ridge/hilltop ⇒ likely good far-LOS.
 * Also sets `prefiltElev`. NaN elevation (sea / no data) ⇒ score -Infinity.
 */
export function scoreVantage(grid, gw, gh, box, candidates, prominenceRadiusKm = 4) {
  const DIRS = 12;
  const RINGS = [0.45, 0.75, 1.0];
  for (const c of candidates) {
    const h0 = sampleGrid(grid, gw, gh, box, c.lat, c.lon);
    c.prefiltElev = h0;
    if (Number.isNaN(h0)) { c.vantageScore = -Infinity; continue; }
    const [perLat, perLon] = metresPerDegree(c.lat);
    let sum = 0, n = 0;
    for (let k = 0; k < DIRS; k++) {
      const th = (2 * Math.PI * k) / DIRS;
      for (const f of RINGS) {
        const r = prominenceRadiusKm * 1000 * f;
        const h = sampleGrid(grid, gw, gh, box, c.lat + (r * Math.cos(th)) / perLat, c.lon + (r * Math.sin(th)) / perLon);
        if (!Number.isNaN(h)) { sum += h; n++; }
      }
    }
    c.vantageScore = h0 - (n ? sum / n : h0);
  }
  return candidates;
}

/**
 * Pure: reduce a runScan result to a per-site band summary. A band counts as clear
 * only if the precise (z12) confirm succeeded — `p.confirmed` — so unconfirmed
 * "estimated" picks (no terrain data along the path) are NOT trusted as clear,
 * matching the conservative manual-scan UI.
 */
export function summarizeScan(scanResult, distancesKm) {
  const pts = (scanResult && scanResult.points) || [];
  const bands = distancesKm.map((km) => {
    const p = pts.find((q) => q.nominalKm === km);
    const found = !!(p && p.found);
    const clear = !!(found && p.clear && p.confirmed);
    return {
      km, found, clear,
      marginM: found ? p.marginM : null,
      distanceKm: found ? p.distanceKm : null,
      bearingDeg: found ? p.bearingDeg : null,
      lat: found ? p.lat : null,
      lon: found ? p.lon : null,
    };
  });
  const cleared = bands.filter((b) => b.clear);
  return {
    bands,
    bandsClear: cleared.length,
    clearanceSum: cleared.reduce((s, b) => s + (b.marginM || 0), 0),
    maxReachKm: cleared.reduce((m, b) => Math.max(m, b.distanceKm || 0), 0),
  };
}

/** Pure: rank sites — most bands cleared, then highest total clearance, then south first. */
export function rankSites(sites) {
  return [...sites].sort((a, b) =>
    (b.bandsClear - a.bandsClear) ||
    (b.clearanceSum - a.clearanceSum) ||
    (a.lat - b.lat));
}

/**
 * Pure: choose which sites to display — the top ranked sites (all-bands first, then
 * the best partials), capped at MAX_DISPLAY so the user always gets a useful list of
 * options rather than just the single best tier. `partial` = no site cleared all bands.
 * Returns { display, partial }.
 */
export function pickDisplaySites(accessible, bandsTotal) {
  const partial = !accessible.some((s) => s.bandsClear === bandsTotal);
  return { display: rankSites(accessible).slice(0, MAX_DISPLAY), partial };
}

// ---- road accessibility (async, deduped per ~0.01° box) --------------------

async function attachRoadDistances(sites, maxRoadM, onProgress, alive) {
  if (!sites.length) return true;
  const half = maxRoadM + 1000; // box big enough to contain any road within maxRoadM
  const keyOf = (b) => `${b.south.toFixed(2)},${b.west.toFixed(2)},${b.north.toFixed(2)},${b.east.toFixed(2)}`;
  const groups = new Map();
  for (const s of sites) {
    s.roadDistM = null; s.roadSource = null;
    const box = squareBox(s.lat, s.lon, half);
    const k = keyOf(box);
    if (!groups.has(k)) groups.set(k, { box, members: [] });
    groups.get(k).members.push(s);
  }

  // Stage A — Overpass per deduped box (paved roads only, efficient). A failed box
  // leaves its members unresolved (roadDistM stays null) for the OSRM fallback below.
  const entries = [...groups.values()];
  let done = 0, idx = 0;
  async function overpassWorker() {
    while (idx < entries.length) {
      const my = idx++;
      if (!alive()) return;
      const { box, members } = entries[my];
      const { ok, ways } = await fetchRoads(box, { withStatus: true });
      if (ok) {
        for (const s of members) {
          const d = nearestRoadM(s.lat, s.lon, ways);
          s.roadDistM = Number.isFinite(d) ? d : Infinity; // queried, no paved road near -> far
          s.roadSource = 'osm';
        }
      }
      onProgress?.(0.7 * (++done / entries.length));
    }
  }
  await Promise.all(Array.from({ length: Math.min(ROAD_CONCURRENCY, entries.length) }, overpassWorker));
  if (!alive()) return false;

  // Stage B — OSRM per-point fallback for whatever Overpass couldn't resolve, so an
  // Overpass outage no longer leaves far-from-road "desert hole" sites in the list as
  // unknown-but-kept: OSRM gives a real distance and the >maxRoadM filter drops them.
  const pending = sites.filter((s) => s.roadDistM == null);
  if (pending.length) {
    let j = 0, d2 = 0;
    async function osrmWorker() {
      while (j < pending.length) {
        const s = pending[j++];
        if (!alive()) return;
        const r = await nearestRoadOSRM(s.lat, s.lon);
        if (r.ok) { s.roadDistM = r.distM; s.roadSource = 'osrm'; } // else: stays null -> keep + warn
        onProgress?.(0.7 + 0.3 * (++d2 / pending.length));
      }
    }
    await Promise.all(Array.from({ length: Math.min(OSRM_CONCURRENCY, pending.length) }, osrmWorker));
  }
  onProgress?.(1);
  // hasRoads = road access was determined (by either source) for every site
  return sites.every((s) => s.roadDistM != null);
}

// ---- orchestrator ----------------------------------------------------------

let nationalToken = 0;
/**
 * Cancel an in-flight national scan. Bumping the token flips `alive()` false, which
 * the per-candidate runScan sees via its `isCancelled` hook and aborts — without
 * touching the manual-scan token (so a manual scan running elsewhere is unaffected).
 */
export function cancelNationalScan() { nationalToken++; }

/**
 * Run the full national scan. opts (all optional, see DEFAULTS):
 *   { bbox, gridSpacingKm, maxConfirm, distancesKm, toleranceKm, mast, rxMast,
 *     fresnelPct, freqHz, maxRoadM, prominenceRadiusKm, onProgress(phase,frac,info) }
 * Returns { sites, scanned, confirmed, losCount, accessibleCount, hasRoads, partial,
 *           bandsTotal, distancesKm }.
 */
export async function runNationalScan(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  // clamp so a direct API call can't trigger a UI-freezing runaway (the UI also clamps)
  o.gridSpacingKm = Math.min(Math.max(Number(o.gridSpacingKm) || DEFAULTS.gridSpacingKm, 0.5), 20);
  // ceiling raised to 2000 so a "high quality" all-Israel run can confirm a deep
  // shortlist (it just takes longer — the user opted into a slow, thorough scan).
  o.maxConfirm = Math.min(Math.max((o.maxConfirm | 0) || DEFAULTS.maxConfirm, 1), 2000);
  const bbox = o.bbox || israelBBox();
  if (!(bbox.south < bbox.north && bbox.west < bbox.east)) throw new Error('empty-bbox');
  const dists = [...o.distancesKm].sort((a, b) => a - b);
  const prog = o.onProgress || (() => {});
  const myToken = ++nationalToken;
  const alive = () => myToken === nationalToken;

  // Stage 0 — candidate grid
  prog('grid', 0);
  const candidates = buildCandidateGrid(bbox, o.gridSpacingKm, isSafe);
  prog('grid', 1, { scanned: candidates.length });

  // Stage 1 — cheap vantage prefilter. The terrain grid is padded by the prominence
  // radius so candidates near the edge get a full, unbiased neighbourhood.
  const padDeg = (o.prominenceRadiusKm * 1000) / 90000; // ~prominence radius in degrees (worst-case perLon)
  const gridBox = { south: bbox.south - padDeg, north: bbox.north + padDeg, west: bbox.west - padDeg, east: bbox.east + padDeg };
  prog('prefilter-tiles', 0);
  await ensureCovered(gridBox, PREFILTER_ZOOM, (d, t) => prog('prefilter-tiles', t ? d / t : 0));
  if (!alive()) throw new Error('cancelled');
  const [perLatMid, perLonMid] = metresPerDegree((gridBox.south + gridBox.north) / 2);
  const widthM = (gridBox.east - gridBox.west) * perLonMid;
  const heightM = (gridBox.north - gridBox.south) * perLatMid;
  const gw = Math.max(16, Math.min(800, Math.round(widthM / PREFILTER_CELL_M)));
  const gh = Math.max(16, Math.min(1300, Math.round(heightM / PREFILTER_CELL_M)));
  const grid = buildGrid(gridBox, gw, gh, PREFILTER_ZOOM);
  prog('prefilter-score', 0);
  scoreVantage(grid, gw, gh, gridBox, candidates, o.prominenceRadiusKm);
  prog('prefilter-score', 1);

  // keep the top candidates by vantage; scan them in spatial order (tile-cache reuse)
  const shortlist = candidates
    .filter((c) => Number.isFinite(c.vantageScore))
    .sort((a, b) => b.vantageScore - a.vantageScore)
    .slice(0, o.maxConfirm)
    .sort((a, b) => a.lat - b.lat || a.lon - b.lon);

  // Stage 2 — precise per-candidate confirm. `isCancelled` ties each runScan's abort
  // to OUR token only, so it never shares/clobbers the manual-scan token.
  const losQualified = [];
  for (let i = 0; i < shortlist.length; i++) {
    if (!alive()) throw new Error('cancelled');
    const c = shortlist[i];
    prog('confirm', shortlist.length ? i / shortlist.length : 1, { i: i + 1, total: shortlist.length, found: losQualified.length });
    let res;
    try {
      res = await runScan({
        observer: { lat: c.lat, lon: c.lon, mast: o.mast, groundElev: NaN },
        distancesKm: dists, toleranceKm: o.toleranceKm, rxMast: o.rxMast,
        freqHz: o.freqHz, fresnelPct: o.fresnelPct, mode: 'best',
        onProgress: () => {}, isCancelled: () => !alive(),
      });
    } catch (_) {
      if (!alive()) throw new Error('cancelled');
      continue; // observer-no-data / terrain-unavailable / transient -> skip this cell
    }
    if (!alive()) throw new Error('cancelled');
    const sum = summarizeScan(res, dists);
    if (sum.bandsClear >= 1) {
      losQualified.push({
        lat: c.lat, lon: c.lon,
        groundElev: res.observer && Number.isFinite(res.observer.groundElev) ? res.observer.groundElev : c.prefiltElev,
        vantageScore: c.vantageScore,
        roadDistM: null,
        ...sum,
      });
    }
  }
  prog('confirm', 1, { i: shortlist.length, total: shortlist.length, found: losQualified.length });

  // Stage 3 — car accessibility. Keep sites within range OR with unknown (failed-query)
  // road distance; drop only sites confirmed to be too far from any road.
  prog('roads', 0);
  const hasRoads = await attachRoadDistances(losQualified, o.maxRoadM, (f) => prog('roads', f), alive);
  if (!alive()) throw new Error('cancelled');
  const accessible = losQualified.filter((s) => s.roadDistM == null || s.roadDistM <= o.maxRoadM);

  const bandsTotal = dists.length;
  const { display, partial } = pickDisplaySites(accessible, bandsTotal); // already ranked + capped

  prog('done', 1);
  return {
    sites: display,
    scanned: candidates.length,
    confirmed: shortlist.length,
    losCount: losQualified.length,
    accessibleCount: accessible.length,
    hasRoads,
    partial,
    bandsTotal,
    distancesKm: dists,
  };
}
