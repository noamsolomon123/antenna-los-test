// Pure tests for the relay finder and building-height geometry.
// Run with: node tests/relay.test.js
import assert from 'node:assert/strict';
import { findRelaySites } from '../src/relay.js';
import { pointInRing, buildingHeight, buildingHeightAt, parseBuildings } from '../src/buildings.js';
import { analyzeLink } from '../src/los.js';

let passed = 0;
const ok = (c, msg) => { assert.ok(c, msg); passed++; };
const approx = (a, b, tol, msg) => { assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`); passed++; };

// --- building geometry ---
{
  const square = [[34.90, 32.00], [34.91, 32.00], [34.91, 32.01], [34.90, 32.01], [34.90, 32.00]];
  ok(pointInRing(34.905, 32.005, square), 'centre is inside the footprint');
  ok(!pointInRing(34.92, 32.005, square), 'point east of the footprint is outside');
  ok(buildingHeight({ height: '24' }) === 24, 'explicit height parses');
  ok(buildingHeight({ 'building:levels': '5' }) === 15, '5 levels ≈ 15 m');
  ok(buildingHeight({}) === 0, 'untagged building ⇒ 0');
  const blds = parseBuildings([
    { tags: { building: 'yes', height: '30' }, geometry: square.map(([lon, lat]) => ({ lon, lat })) },
    { tags: { building: 'yes' }, geometry: square.map(([lon, lat]) => ({ lon, lat })) }, // no height -> dropped
  ]);
  ok(blds.length === 1 && blds[0].height === 30, 'only heighted buildings are parsed');
  ok(buildingHeightAt(32.005, 34.905, blds) === 30, 'height lookup returns the containing building');
  ok(buildingHeightAt(32.5, 35.5, blds) === 0, 'point in no building ⇒ 0');
}

// --- relay finder: a triangular ridge blocks A↔B; a relay on the ridge sees both ---
{
  // ridge centred at lon 34.90, peak 200 m, ~1.8 km half-width; flat 0 elsewhere
  const elev = (lat, lon) => Math.max(0, 200 - 200 * Math.abs(lon - 34.90) / 0.02);
  const a = { lat: 31.30, lon: 35.00, groundElev: 0, mast: 2 };
  const b = { lat: 31.30, lon: 34.80, groundElev: 0, mast: 2 };
  // sanity: the direct link is blocked
  const direct = analyzeLink({ a, b, freqHz: 5.8e9, fresnelPct: 0.6, sampleElev: elev });
  ok(direct.clear === false, 'direct A↔B is blocked by the ridge');

  const relays = findRelaySites({ a, b, freqHz: 5.8e9, fresnelPct: 0.6, sampleElev: elev, relayMast: 10, gridStepKm: 0.5, padKm: 2, maxTest: 250 });
  ok(relays.length >= 1, `found at least one relay site (${relays.length})`);
  const top = relays[0];
  ok(top.score > 0 && top.marginA > 0 && top.marginB > 0, 'top relay clears both legs with positive margin');
  approx(top.lon, 34.90, 0.04, 'top relay sits on/near the ridge');
  ok(top.groundElev > 100, 'top relay is on high ground');
  // confirm independently: a link from the relay to A and to B both clear
  const relay = { lat: top.lat, lon: top.lon, groundElev: top.groundElev, mast: top.mast };
  ok(analyzeLink({ a: relay, b: a, freqHz: 5.8e9, fresnelPct: 0.6, sampleElev: elev }).clear, 'relay→A clears (re-check)');
  ok(analyzeLink({ a: relay, b: b, freqHz: 5.8e9, fresnelPct: 0.6, sampleElev: elev }).clear, 'relay→B clears (re-check)');
}

console.log(`\n✅ all ${passed} relay/buildings assertions passed`);
