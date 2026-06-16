// Nearest-road distance tests. Run with: node tests/roads.test.js
import assert from 'node:assert/strict';
import { nearestRoadM } from '../src/roads.js';

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };
const approx = (a, b, tol, m) => { assert.ok(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`); passed++; };

// a road running east-west along lat 31.0, from lon 35.0 to 35.1
const road = [[[31.0, 35.0], [31.0, 35.1]]];

approx(nearestRoadM(31.0, 35.05, road), 0, 5, 'point on the road -> ~0 m');
approx(nearestRoadM(31.01, 35.05, road), 1109, 40, 'point ~0.01 deg north of the road -> ~1.1 km');
approx(nearestRoadM(31.0, 35.20, road), 9550, 400, 'point past the east end -> distance to the endpoint');
ok(nearestRoadM(31.0, 35.05, []) === Infinity, 'no roads -> Infinity');
ok(nearestRoadM(31.0, 35.05, null) === Infinity, 'null roads -> Infinity');

console.log(`\n✅ all ${passed} roads assertions passed`);
