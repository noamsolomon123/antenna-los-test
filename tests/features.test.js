// Pure tests for the aiming/physics feature utilities (declination, diffraction, mast).
// Run with: node tests/features.test.js
import assert from 'node:assert/strict';
import { magneticDeclination, trueToMagnetic, magneticToTrue } from '../src/declination.js';
import { diffractionParamV, knifeEdgeLossDb } from '../src/diffraction.js';
import { minMastForClearance } from '../src/optimize.js';
import { analyzeLink } from '../src/los.js';

let passed = 0;
const approx = (a, b, tol, msg) => { assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`); passed++; };
const ok = (c, msg) => { assert.ok(c, msg); passed++; };

// --- magnetic declination (Israel, ~+5° E) ---
approx(magneticDeclination(31.78, 35.22), 5.0, 0.5, 'Jerusalem declination ~+5°E');
approx(magneticDeclination(32.08, 34.78), 4.9, 0.5, 'Tel Aviv declination ~+4.9°E');
ok(magneticDeclination(33.3, 35.6) > magneticDeclination(29.6, 34.9), 'declination grows northward');
{
  const az = 90, lat = 31.5, lon = 35.0;
  const mag = trueToMagnetic(az, lat, lon);
  approx(mag, az - magneticDeclination(lat, lon), 1e-9, 'magnetic = true − declination');
  approx(magneticToTrue(mag, lat, lon), az, 1e-9, 'magnetic→true round-trips');
  ok(trueToMagnetic(2, 31.5, 35) > 350, 'wraps below 0 to ~357°');
}

// --- knife-edge diffraction loss (ITU-R P.526) ---
approx(knifeEdgeLossDb(0), 6.02, 0.1, 'J(0) ≈ 6 dB');
approx(knifeEdgeLossDb(1), 13.9, 0.3, 'J(1) ≈ 14 dB');
approx(knifeEdgeLossDb(2.4), 20.5, 0.5, 'J(2.4) ≈ 20 dB');
ok(knifeEdgeLossDb(-1) === 0, 'deep clearance (v<−0.78) ⇒ 0 dB');
ok(knifeEdgeLossDb(2) > knifeEdgeLossDb(1), 'loss grows with v');
{
  const lambda = 299792458 / 5.8e9;
  ok(diffractionParamV(0, 5000, 5000, lambda) === 0, 'h=0 ⇒ v=0');
  ok(diffractionParamV(20, 5000, 5000, lambda) > diffractionParamV(10, 5000, 5000, lambda), 'v grows with obstacle height');
  ok(diffractionParamV(-10, 5000, 5000, lambda) < 0, 'clearance below LOS ⇒ negative v ⇒ no loss');
}

// analyzeLink now reports a diffraction loss: ~0 when clear, large when blocked
{
  const clear = analyzeLink({ a: { lat: 31.3, lon: 35.0, groundElev: 0, mast: 50 }, b: { lat: 31.3, lon: 34.8, groundElev: 0, mast: 50 }, freqHz: 5.8e9, fresnelPct: 0.6, sampleElev: () => 0 });
  ok(clear.diffractionLossDb < 1, 'wide-open path ⇒ ~0 dB diffraction loss');
  const blocked = analyzeLink({ a: { lat: 31.3, lon: 35.0, groundElev: 0, mast: 2 }, b: { lat: 31.3, lon: 34.8, groundElev: 0, mast: 2 }, freqHz: 5.8e9, fresnelPct: 0.6, sampleElev: (lat, lon) => (lon < 34.91 && lon > 34.89 ? 200 : 0) });
  ok(blocked.diffractionLossDb > 15, 'a 200 m wall mid-path ⇒ heavy diffraction loss');
}

// --- minimum mast-height optimizer ---
{
  const sampleElev = (lat, lon) => (lon < 34.91 && lon > 34.89 ? 80 : 0); // 80 m wall mid-path
  const a = { lat: 31.3, lon: 35.0, groundElev: 0, mast: 2 };
  const b = { lat: 31.3, lon: 34.8, groundElev: 0, mast: 2 };
  const h = minMastForClearance({ a, b, freqHz: 5.8e9, fresnelPct: 0.6, sampleElev, side: 'A', maxMast: 400 });
  ok(h !== null && h > 0, `needs a positive mast to clear an 80 m wall: ${h}`);
  const after = analyzeLink({ a: { ...a, mast: h }, b, freqHz: 5.8e9, fresnelPct: 0.6, sampleElev });
  ok(after.clear, 'applying the computed min mast clears the link');
  // already-clear path ⇒ 0 (antennas sit on 100 m ground over flat 0 terrain)
  const flat = (lat, lon) => 0;
  ok(minMastForClearance({ a: { lat: 31.3, lon: 35.0, groundElev: 100, mast: 0 }, b: { lat: 31.3, lon: 34.8, groundElev: 100, mast: 0 }, freqHz: 5.8e9, fresnelPct: 0.6, sampleElev: flat, side: 'A' }) === 0, 'already-clear ⇒ 0 m needed');
  // impossible within ceiling ⇒ null
  const wall = (lat, lon) => (lon < 34.91 && lon > 34.89 ? 5000 : 0);
  ok(minMastForClearance({ a, b, freqHz: 5.8e9, fresnelPct: 0.6, sampleElev: wall, side: 'A', maxMast: 50 }) === null, '5 km wall, 50 m ceiling ⇒ null (unreachable)');
}

console.log(`\n✅ all ${passed} feature assertions passed`);
