// roads.js — road access. Fetches drivable roads (incl. dirt tracks) from
// OpenStreetMap Overpass (free, no key) and measures distance to the nearest road.
import { metresPerDegree } from './geo.js';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
// proper car-drivable roads (excludes faint agricultural 'track's and 'service' aisles,
// which a normal car can't rely on and which make the Negev query time out)
const DRIVABLE = '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|road|living_street)$';
const cache = new Map(); // box key -> ways

/** Fetch drivable road ways covering a {south,west,north,east} box. Returns [[ [lat,lon], … ], … ]. */
export async function fetchRoads(box) {
  const key = `${box.south.toFixed(2)},${box.west.toFixed(2)},${box.north.toFixed(2)},${box.east.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key);
  const q = `[out:json][timeout:40];way["highway"~"${DRIVABLE}"](${box.south},${box.west},${box.north},${box.east});out geom;`;
  for (const ep of ENDPOINTS) {
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const ways = (data.elements || [])
        .filter((e) => Array.isArray(e.geometry) && e.geometry.length > 1)
        .map((e) => e.geometry.map((g) => [g.lat, g.lon]));
      cache.set(key, ways);
      return ways;
    } catch (_) { /* try next mirror */ }
  }
  return []; // offline / all mirrors busy — caller falls back gracefully
}

// planar distance (m) from origin-relative point P=(0,0) to segment A-B
function segDist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Pure: distance (m) from (lat,lon) to the nearest road segment in `ways`; Infinity if none. */
export function nearestRoadM(lat, lon, ways) {
  if (!ways || !ways.length) return Infinity;
  const [perLat, perLon] = metresPerDegree(lat);
  let best = Infinity;
  for (const way of ways) {
    for (let i = 1; i < way.length; i++) {
      const ax = (way[i - 1][1] - lon) * perLon, ay = (way[i - 1][0] - lat) * perLat;
      const bx = (way[i][1] - lon) * perLon, by = (way[i][0] - lat) * perLat;
      const d = segDist(ax, ay, bx, by);
      if (d < best) best = d;
    }
  }
  return best;
}
