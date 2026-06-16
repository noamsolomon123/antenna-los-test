// Pure-physics unit tests. Run with: node tests/los.test.js  (no dependencies)
import assert from 'node:assert/strict';
import { distanceM, destination, bearingDeg } from '../src/geo.js';
import {
  curvatureBulgeM, curvatureDropM, fresnelRadiusM, fresnelInflationBoundM,
  effectiveHeight, analyzeLink, EFFECTIVE_EARTH_RADIUS_M,
} from '../src/los.js';

let passed = 0;
const approx = (a, b, tol, msg) => { assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`); passed++; };
const ok = (c, msg) => { assert.ok(c, msg); passed++; };

// --- geo ---
const A = [31.3, 35.0], B = [31.3, 34.6];
approx(distanceM(A, B), 38050, 800, 'distance ~38 km across 0.4° lon at 31.3°N');
{
  const d = destination(31.3, 35.0, 90, 10000);
  approx(distanceM([31.3, 35.0], d), 10000, 5, 'destination 10 km round-trips');
  approx(bearingDeg([31.3, 35.0], d), 90, 0.5, 'bearing east ~90°');
}

// --- curvature (4/3 earth) ---
approx(EFFECTIVE_EARTH_RADIUS_M, 8.4947e6, 2e3, 'effective earth radius ~8495 km');
approx(curvatureDropM(50000), 147.1, 1.5, 'curvature drop at 50 km ~147 m');
approx(curvatureBulgeM(25000, 25000), 36.8, 0.5, 'mid bulge of 50 km path ~36.8 m');

// --- Fresnel ---
approx(fresnelRadiusM(5.8e9, 17100, 17100), 21.0, 1.0, 'F1 radius @5.8GHz, 34.2 km, midpoint ~21 m');
ok(fresnelInflationBoundM(5.8e9, 17100, 0.6) >= 0.6 * fresnelRadiusM(5.8e9, 17100, 17100),
  'inflation bound >= actual 0.6·F1 (conservative)');

// --- effective height ---
approx(effectiveHeight({ groundElev: 700, mast: 10 }), 710, 0, 'effective height = ground + mast');

// --- analyzeLink: clear over flat ground, tall masts, short hop ---
{
  const r = analyzeLink({
    a: { lat: 31.3, lon: 35.0, groundElev: 0, mast: 50 },
    b: { lat: 31.3, lon: 34.8, groundElev: 0, mast: 50 }, // ~19 km
    freqHz: 5.8e9, fresnelPct: 0.6, sampleElev: () => 0,
  });
  ok(r.clear === true, 'flat ground + 50 m masts @19 km => YES');
  ok(r.minMargin > 0, 'positive clearance margin');
}

// --- analyzeLink: blocked by a ridge near the midpoint ---
{
  const r = analyzeLink({
    a: { lat: 31.3, lon: 35.0, groundElev: 0, mast: 50 },
    b: { lat: 31.3, lon: 34.8, groundElev: 0, mast: 50 },
    freqHz: 5.8e9, fresnelPct: 0.6,
    sampleElev: (lat, lon) => (lon < 34.91 && lon > 34.89 ? 300 : 0), // 300 m wall mid-path
  });
  ok(r.clear === false, '300 m ridge at midpoint => NO');
  ok(r.minMargin < 0, 'negative margin where blocked');
}

// --- analyzeLink: no terrain data => not clear, flagged ---
{
  const r = analyzeLink({
    a: { lat: 31.3, lon: 35.0, groundElev: 0, mast: 10 },
    b: { lat: 31.3, lon: 34.8, groundElev: 0, mast: 10 },
    freqHz: 5.8e9, fresnelPct: 0.6, sampleElev: () => NaN,
  });
  ok(r.hasData === false && r.clear === false, 'no terrain data => hasData=false, not clear');
}

console.log(`\n✅ all ${passed} assertions passed`);
