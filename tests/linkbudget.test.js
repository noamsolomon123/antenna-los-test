// Pure link-budget unit tests. Run with: node tests/linkbudget.test.js  (no dependencies)
import assert from 'node:assert/strict';
import {
  fsplDb, eirpDbm, rxPowerDbm, fadeMarginDb, maxRangeKm, linkQuality,
  computeLinkBudget, DEFAULT_BUDGET,
} from '../src/linkbudget.js';

let passed = 0;
const approx = (a, b, tol, msg) => { assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`); passed++; };
const ok = (c, msg) => { assert.ok(c, msg); passed++; };

// --- FSPL against known values ---
approx(fsplDb(5800, 10), 127.71, 0.05, 'FSPL @5.8GHz, 10 km ~127.7 dB');
approx(fsplDb(2400, 1), 100.04, 0.05, 'FSPL @2.4GHz, 1 km ~100.0 dB');
approx(fsplDb(5800, 20) - fsplDb(5800, 10), 6.02, 0.02, 'doubling distance adds ~6 dB');
ok(fsplDb(0, 10) === 0 && fsplDb(5800, 0) === 0, 'FSPL guards against zero freq/distance');

// --- EIRP / Rx / margin chain ---
approx(eirpDbm({ txPowerDbm: 20, txGainDbi: 20, txCableLossDb: 0.5 }), 39.5, 1e-9, 'EIRP = 20+20-0.5');
{
  const eirp = 39.5, fspl = fsplDb(5800, 10);
  const rx = rxPowerDbm({ eirp, fspl, rxGainDbi: 20, rxCableLossDb: 0.5 });
  approx(rx, -68.71, 0.05, 'Rx power @10 km ~ -68.7 dBm');
  approx(fadeMarginDb(rx, -85), 16.29, 0.05, 'fade margin vs -85 dBm ~16.3 dB');
}

// --- quality bands ---
ok(linkQuality(-1) === 'none', 'negative margin => none');
ok(linkQuality(3) === 'weak', '3 dB => weak');
ok(linkQuality(10) === 'ok', '10 dB => ok');
ok(linkQuality(20) === 'strong', '20 dB => strong');
ok(linkQuality(NaN) === 'unknown', 'NaN => unknown');

// --- max range: sane, and monotonic in Tx power ---
{
  const base = { eirp: 39.5, freqMHz: 5800, rxGainDbi: 20, rxCableLossDb: 0.5, rxSensitivityDbm: -85 };
  const r = maxRangeKm(base);
  ok(r > 40 && r < 100, `5.8GHz 20dBi dishes max range plausible (~65 km): ${r.toFixed(1)}`);
  ok(maxRangeKm({ ...base, eirp: 49.5 }) > r, 'more EIRP => longer range');
}

// --- aggregate matches the piecewise math ---
{
  const b = computeLinkBudget({ ...DEFAULT_BUDGET, freqMHz: 5800, distKm: 10 });
  approx(b.eirp, 39.5, 1e-9, 'aggregate EIRP');
  approx(b.fspl, fsplDb(5800, 10), 1e-9, 'aggregate FSPL');
  approx(b.fadeMarginDb, 16.29, 0.05, 'aggregate margin');
  ok(b.quality === 'strong', 'default 5.8GHz @10km is a strong link');
  // at its own max range the margin should be ~0
  const atMax = computeLinkBudget({ ...DEFAULT_BUDGET, freqMHz: 5800, distKm: b.maxRangeKm });
  approx(atMax.fadeMarginDb, 0, 0.1, 'margin ~0 at computed max range');
}

console.log(`\n✅ all ${passed} link-budget assertions passed`);
