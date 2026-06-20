// Pure tests for serialization features (permalink encode/decode, KML export).
// Run with: node tests/io.test.js
import assert from 'node:assert/strict';
import { encodeState, decodeState } from '../src/permalink.js';
import { buildLinkKml } from '../src/kml.js';

let passed = 0;
const approx = (a, b, tol, msg) => { assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`); passed++; };
const ok = (c, msg) => { assert.ok(c, msg); passed++; };

// --- permalink round-trip ---
{
  const s = {
    antennaA: { lat: 31.78012, lon: 35.22034, mast: 5 },
    antennaB: { lat: 31.74, lon: 34.88, mast: 12 },
    frequencyMHz: 5800, observer: 'A',
    budget: { tx: 20, gain: 24, sens: -85 },
  };
  const enc = encodeState(s);
  ok(typeof enc === 'string' && enc.includes('a=') && enc.includes('lb='), 'encodes to a query string');
  const d = decodeState(enc);
  approx(d.antennaA.lat, 31.78012, 1e-4, 'A lat round-trips (5dp)');
  approx(d.antennaB.lon, 34.88, 1e-9, 'B lon round-trips');
  ok(d.antennaA.mast === 5 && d.antennaB.mast === 12, 'masts round-trip');
  ok(d.frequencyMHz === 5800 && d.observer === 'A', 'freq + observer round-trip');
  ok(d.budget.tx === 20 && d.budget.gain === 24 && d.budget.sens === -85, 'budget round-trips');
}
// tolerates a leading '#', missing fields, and garbage
ok(Object.keys(decodeState('')).length === 0, 'empty string ⇒ empty state');
ok(decodeState('#f=2400').frequencyMHz === 2400, 'parses a hash with only frequency');
ok(decodeState('a=foo,bar,baz').antennaA === undefined, 'garbage coords are ignored');
{
  const partial = encodeState({ antennaA: { lat: 32, lon: 35, mast: 3 } });
  const d = decodeState(partial);
  ok(d.antennaA && !d.antennaB && !d.frequencyMHz, 'partial state encodes/decodes without inventing fields');
}

// --- KML export ---
{
  const kml = buildLinkKml({ a: { lat: 31.78, lon: 35.22 }, b: { lat: 31.74, lon: 34.88 }, distanceKm: 33.1, clear: true, freqMHz: 5800 });
  ok(kml.startsWith('<?xml'), 'is an XML document');
  ok(kml.includes('<kml') && kml.includes('</kml>'), 'has kml root');
  ok(kml.includes('<LineString>') && kml.includes('35.220000,31.780000,0'), 'has the link line with lon,lat order');
  ok((kml.match(/<Placemark>/g) || []).length >= 3, 'A, B and the link are placemarks');
  ok(kml.includes('ff66d36f'), 'clear link is tinted green');
  const blocked = buildLinkKml({ a: { lat: 31, lon: 35 }, b: { lat: 31, lon: 34.9 }, clear: false });
  ok(blocked.includes('ff6b6bff'), 'blocked link is tinted red');
  const withPts = buildLinkKml({ a: { lat: 31, lon: 35 }, b: { lat: 31, lon: 34.9 }, clear: true, extraPoints: [{ lat: 31, lon: 34.95, name: 'ממסר' }] });
  ok((withPts.match(/<Placemark>/g) || []).length === 4, 'extra points add placemarks');
}

console.log(`\n✅ all ${passed} io assertions passed`);
