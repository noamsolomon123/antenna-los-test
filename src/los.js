// los.js — line-of-sight physics (pure, no DOM). Importable in Node for tests.
// Earth curvature uses the 4/3 effective-radius model; clearance uses Fresnel zones.
import { EARTH_RADIUS_M, distanceM, bearingDeg, lerpPoint } from './geo.js';
import { diffractionParamV, knifeEdgeLossDb } from './diffraction.js';

export const LIGHT_SPEED = 299792458; // m/s
export const K_FACTOR = 4 / 3;        // standard atmospheric refraction
export const EFFECTIVE_EARTH_RADIUS_M = K_FACTOR * EARTH_RADIUS_M; // ~8.495e6 m

/** Curvature bulge (m) at an interior point, distances d1/d2 (m) from the two ends. */
export function curvatureBulgeM(d1, d2) {
  return (d1 * d2) / (2 * EFFECTIVE_EARTH_RADIUS_M);
}

/** Curvature drop (m) of terrain seen from an observer, at range d (m). */
export function curvatureDropM(d) {
  return (d * d) / (2 * EFFECTIVE_EARTH_RADIUS_M);
}

/** First Fresnel-zone radius (m) at a point with distances d1/d2 (m) from the ends. */
export function fresnelRadiusM(freqHz, d1, d2) {
  const total = d1 + d2;
  if (total <= 0 || freqHz <= 0) return 0;
  const lambda = LIGHT_SPEED / freqHz;
  return Math.sqrt((lambda * d1 * d2) / total);
}

/**
 * Conservative upper bound on the required Fresnel clearance contributed by an
 * obstacle at range d (m) from the observer, for ANY endpoint beyond it.
 * As the far distance -> infinity, fresnelRadius -> sqrt(lambda*d); we scale by pct.
 * Used by the viewshed sweep so a YES cell genuinely clears ~pct of F1.
 */
export function fresnelInflationBoundM(freqHz, d, pct) {
  if (freqHz <= 0 || d <= 0) return 0;
  const lambda = LIGHT_SPEED / freqHz;
  return pct * Math.sqrt(lambda * d);
}

/** Effective antenna elevation above sea level = ground + mast. */
export function effectiveHeight(antenna) {
  return antenna.groundElev + antenna.mast;
}

/**
 * Precise point-to-point link analysis between two antennas.
 *  a, b        : { lat, lon, groundElev, mast }
 *  freqHz      : operating frequency (Hz)
 *  fresnelPct  : required fraction of the first Fresnel zone to keep clear (e.g. 0.6)
 *  sampleElev  : (lat, lon) => ground elevation (m) or NaN when unknown
 * Returns a result object with per-sample profile data and a binary verdict.
 */
export function analyzeLink({ a, b, freqHz, fresnelPct, sampleElev }) {
  const A = [a.lat, a.lon];
  const B = [b.lat, b.lon];
  const D = distanceM(A, B);
  const az = bearingDeg(A, B);
  const hA = effectiveHeight(a);
  const hB = effectiveHeight(b);

  const N = Math.max(64, Math.min(600, Math.round(D / 30)));
  const lambda = freqHz > 0 ? LIGHT_SPEED / freqHz : 0;
  const samples = [];
  let minMargin = Infinity;
  let minAtKm = 0;
  let minTerrain = NaN; // effective terrain at the determining point
  let withData = 0;
  let maxV = -Infinity; // worst (largest) knife-edge diffraction parameter along the path
  const total = N - 1;

  for (let i = 1; i < N; i++) {
    const t = i / N;
    const d1 = D * t;
    const d2 = D - d1;
    const p = lerpPoint(A, B, t);
    const terrain = sampleElev(p[0], p[1]);
    const sight = hA + (hB - hA) * t;
    const bulge = curvatureBulgeM(d1, d2);
    const fr = fresnelRadiusM(freqHz, d1, d2);
    const f60 = sight - fresnelPct * fr; // lower bound of required clearance
    const effTerrain = (Number.isNaN(terrain) ? terrain : terrain + bulge);
    const km = d1 / 1000;

    if (!Number.isNaN(terrain)) {
      withData++;
      const margin = sight - bulge - fresnelPct * fr - terrain;
      if (margin < minMargin) {
        minMargin = margin;
        minAtKm = km;
        minTerrain = effTerrain;
      }
      // height of (curvature-corrected) terrain above the straight line of sight
      const h = terrain + bulge - sight;
      const v = diffractionParamV(h, d1, d2, lambda);
      if (v > maxV) maxV = v;
    }
    samples.push({ km, terrain, effTerrain, sight, f60, fresnelFull: sight - fr });
  }

  const hadData = withData > 0;
  return {
    distanceM: D,
    distanceKm: D / 1000,
    bearingDeg: az,
    freqHz,
    fresnelPct,
    hA,
    hB,
    samples,
    hasData: hadData,
    dataFraction: total > 0 ? withData / total : 0, // share of path with terrain data
    minMargin: hadData ? minMargin : NaN,
    minAtKm,
    minTerrain, // effective terrain elevation at the determining point
    clear: hadData && minMargin >= 0, // binary YES/NO
    // single dominant knife-edge diffraction loss (dB) for the worst obstruction;
    // ~0 when the path clears with Fresnel margin, grows as terrain intrudes.
    diffractionLossDb: hadData && lambda > 0 ? knifeEdgeLossDb(maxV) : NaN,
  };
}
