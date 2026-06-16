// scan.js — automated multi-distance LOS scan. Fix one observer, find good
// line-of-sight candidate points at several target distances in one run, either
// along one corridor (one drive) or best-at-each-distance.
//
// Stage 1 sweep (z11, reuses viewshed physics) -> candidate matrix.
// Stage 2 select (pure) -> one point per distance, per mode.
// Stage 3 confirm (z12 precise analyzeLink) -> authoritative verdict/clearance.
import { destination, squareBox } from './geo.js';
import { curvatureDropM, fresnelRadiusM, analyzeLink } from './los.js';
import { ensureCovered, ensurePath, elevation } from './terrain.js';
import { isSafe } from './safezone.js';

const SCAN_ZOOM = 11;
const CONFIRM_ZOOM = 12;
const MAX_RANGE_M = 50000;
const BEARINGS = 360;        // 1° angular resolution
const STEP_M = 60;
const CORRIDOR_HALF_DEG = 5; // +/- wedge half-width for the "one drive" corridor
const CHUNK_BEARINGS = 20;   // yield to the UI every N bearings during the async sweep

let scanToken = 0; // bumped to invalidate an in-flight / superseded scan
/** Invalidate any in-flight scan (e.g. observer moved or a new scan started). */
export function cancelScan() { scanToken++; }

// One bearing's contribution to the candidate matrix (shared by sweep + sweepAsync).
function accumulateBearing(cand, bi, opts, obsH, steps) {
  const { observer, distancesKm, toleranceKm, rxMast, freqHz, fresnelPct, sampleElev, safe } = opts;
  const az = (360 * bi) / BEARINGS;
  let runningMax = -Infinity; // max required (curvature+Fresnel) angle so far
  for (let s = 1; s <= steps; s++) {
    const d = s * STEP_M;
    const p = destination(observer.lat, observer.lon, az, d);
    const terrain = sampleElev(p[0], p[1]);
    if (Number.isNaN(terrain)) continue;
    const groundTop = terrain - curvatureDropM(d);
    const km = d / 1000;
    // a candidate is only meaningful once a horizon is established (else margin = +Inf)
    if (runningMax !== -Infinity) {
      const margin = groundTop + rxMast - obsH - runningMax * d; // m above the blocking horizon
      if (margin >= 0) {
        for (let di = 0; di < distancesKm.length; di++) {
          if (Math.abs(km - distancesKm[di]) <= toleranceKm) {
            const cur = cand[di][bi];
            // only keep candidates inside the safe-travel area (when a predicate is given)
            if ((!cur || margin > cur.marginM) && (!safe || safe(p[0], p[1])))
              cand[di][bi] = { marginM: margin, lat: p[0], lon: p[1], distM: d, groundElev: terrain, az };
          }
        }
      }
    }
    const inflate = fresnelPct * fresnelRadiusM(freqHz, d, Math.max(1, MAX_RANGE_M - d));
    const obstacleAngle = (groundTop + inflate - obsH) / d;
    if (obstacleAngle > runningMax) runningMax = obstacleAngle;
  }
}

/** Pure radial sweep -> candidates[di][bi] (best margin>=0 point per band per bearing, or null). */
export function sweep(opts) {
  const obsH = opts.observer.groundElev + opts.observer.mast;
  const steps = Math.floor(MAX_RANGE_M / STEP_M);
  const cand = opts.distancesKm.map(() => new Array(BEARINGS).fill(null));
  for (let bi = 0; bi < BEARINGS; bi++) accumulateBearing(cand, bi, opts, obsH, steps);
  return cand;
}

// Same sweep, chunked so the UI can paint progress and stay responsive.
async function sweepAsync(opts, onProgress) {
  const obsH = opts.observer.groundElev + opts.observer.mast;
  const steps = Math.floor(MAX_RANGE_M / STEP_M);
  const cand = opts.distancesKm.map(() => new Array(BEARINGS).fill(null));
  for (let bi = 0; bi < BEARINGS; bi++) {
    accumulateBearing(cand, bi, opts, obsH, steps);
    if (bi % CHUNK_BEARINGS === 0) { onProgress?.('compute', bi / BEARINGS); await new Promise((r) => setTimeout(r)); }
  }
  return cand;
}

/** Best candidate per distance, any direction. */
export function selectBest(cand) {
  return cand.map((arr) => arr.reduce((best, c) => (c && (!best || c.marginM > best.marginM) ? c : best), null));
}

/** Best single corridor (±halfDeg wedge): maximise distances covered, then total margin. */
export function selectCorridor(cand, halfDeg = CORRIDOR_HALF_DEG, bearings = BEARINGS) {
  const W = Math.max(0, Math.round((halfDeg / 360) * bearings));
  let bestScore = -Infinity, bestAz = null, bestPicks = cand.map(() => null);
  for (let bi = 0; bi < bearings; bi++) {
    const picks = cand.map((arr) => {
      let best = null;
      for (let w = -W; w <= W; w++) {
        const c = arr[(bi + w + bearings) % bearings];
        if (c && (!best || c.marginM > best.marginM)) best = c;
      }
      return best;
    });
    const count = picks.filter(Boolean).length;
    const sum = picks.reduce((s, p) => s + (p ? p.marginM : 0), 0);
    const score = count * 1e6 + sum;
    if (score > bestScore) { bestScore = score; bestAz = (360 * bi) / bearings; bestPicks = picks; }
  }
  return { picks: bestPicks, corridorAz: bestAz };
}

/** Run the full scan from `observer`, confirming each pick precisely. */
export async function runScan({ observer, distancesKm, toleranceKm, rxMast, freqHz, fresnelPct, mode, onProgress }) {
  const myToken = ++scanToken;
  const dists = [...distancesKm].sort((a, b) => a - b);
  const box = squareBox(observer.lat, observer.lon, MAX_RANGE_M * 1.03); // enclose all radial endpoints

  onProgress?.('tiles', 0);
  const cov = await ensureCovered(box, SCAN_ZOOM, (d, t) => onProgress?.('tiles', d / t));
  if (myToken !== scanToken) throw new Error('cancelled');
  if (cov && cov.total && cov.nodata / cov.total > 0.85) throw new Error('terrain-unavailable');

  const g = elevation(observer.lat, observer.lon, SCAN_ZOOM);
  const obs = { ...observer, groundElev: Number.isNaN(g) ? observer.groundElev : g };
  if (Number.isNaN(obs.groundElev)) throw new Error('observer-no-data');

  onProgress?.('compute', 0);
  const cand = await sweepAsync({
    observer: obs, distancesKm: dists, toleranceKm, rxMast, freqHz, fresnelPct,
    sampleElev: (la, lo) => elevation(la, lo, SCAN_ZOOM),
    safe: isSafe, // keep only points inside safe Israel
  }, onProgress);
  if (myToken !== scanToken) throw new Error('cancelled');

  let picks, corridorAz = null, fellBack = false;
  if (mode === 'corridor') {
    const r = selectCorridor(cand);
    picks = r.picks; corridorAz = r.corridorAz;
    if (picks.filter(Boolean).length === 0) { picks = selectBest(cand); corridorAz = null; fellBack = true; }
  } else {
    picks = selectBest(cand);
  }

  // Stage 3 — precise confirm each chosen point (z12, tiles along the path only)
  const points = [];
  for (let di = 0; di < dists.length; di++) {
    onProgress?.('confirm', di / dists.length);
    const c = picks[di];
    if (!c) { points.push({ nominalKm: dists[di], found: false }); continue; }
    await ensurePath(observer, { lat: c.lat, lon: c.lon }, CONFIRM_ZOOM);
    const pe = elevation(c.lat, c.lon, CONFIRM_ZOOM);
    const ground = Number.isNaN(pe) ? c.groundElev : pe;
    // re-sample the observer at the confirm zoom so this verdict matches the
    // manual link test exactly (which uses z12 for both endpoints)
    const oz = elevation(observer.lat, observer.lon, CONFIRM_ZOOM);
    const aConfirm = { ...obs, groundElev: Number.isNaN(oz) ? obs.groundElev : oz };
    const link = analyzeLink({
      a: aConfirm, b: { lat: c.lat, lon: c.lon, groundElev: ground, mast: rxMast },
      freqHz, fresnelPct, sampleElev: (la, lo) => elevation(la, lo, CONFIRM_ZOOM),
    });
    points.push({
      nominalKm: dists[di], found: true, lat: c.lat, lon: c.lon, groundElev: ground,
      distanceKm: link.distanceKm, bearingDeg: link.bearingDeg,
      marginM: link.hasData ? link.minMargin : c.marginM,
      clear: link.hasData ? link.clear : true,
      confirmed: link.hasData,
    });
  }

  onProgress?.('done', 1);
  return { points, mode, corridorAz, fellBack, observer: obs };
}
