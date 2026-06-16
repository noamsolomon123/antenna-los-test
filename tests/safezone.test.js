// Safe-travel boundary tests. Run with: node tests/safezone.test.js
import assert from 'node:assert/strict';
import { isSafe } from '../src/safezone.js';

let passed = 0;
const ok = (c, m) => { assert.ok(c, m); passed++; };

// excluded (unsafe to travel)
ok(!isSafe(31.53, 35.10), 'Hebron (West Bank) excluded');
ok(!isSafe(31.90, 35.20), 'Ramallah (West Bank) excluded');
ok(!isSafe(32.46, 35.30), 'Jenin (West Bank) excluded');
ok(!isSafe(31.50, 34.45), 'Gaza excluded');
ok(!isSafe(30.50, 34.20), 'Sinai / Egypt excluded');
ok(!isSafe(31.95, 35.94), 'Amman / Jordan excluded');
ok(!isSafe(33.80, 35.80), 'Lebanon excluded');

// safe (inside Israel, Green Line)
ok(isSafe(31.25, 34.79), 'Beer Sheva safe');
ok(isSafe(32.08, 34.78), 'Tel Aviv safe');
ok(isSafe(32.79, 34.99), 'Haifa safe');
ok(isSafe(31.34, 35.10), 'Har Amasa safe');
ok(isSafe(30.61, 34.80), 'Mitzpe Ramon safe');
ok(isSafe(29.56, 34.95), 'Eilat safe');
ok(isSafe(31.243, 34.712), 'Negev 40 km point safe');

console.log(`\n✅ all ${passed} safezone assertions passed`);
