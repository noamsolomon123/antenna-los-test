// roads-osrm.js — OSRM driving-network fallback for road access. When OpenStreetMap
// Overpass is throttled/down for a point, ask the public OSRM router for the distance
// to the nearest drivable road. Free, no key, CORS-enabled. It's per-point (one request
// each), so it's used only as a fallback for the few points Overpass couldn't resolve —
// which is exactly what stops "desert hole" sites being kept as unknown-but-shown.
const ENDPOINTS = ['https://router.project-osrm.org'];
const REQ_TIMEOUT_MS = 8000; // fail fast so a slow demo server can't hang the scan

// abort a fetch after ms; undefined if AbortSignal.timeout is unsupported
function timeoutSignal(ms) {
  try { return AbortSignal.timeout(ms); } catch (_) { return undefined; }
}

/**
 * Distance (m) from (lat,lon) to the nearest point on the drivable road network, via
 * OSRM's `nearest` service. Returns { ok, distM, roadName }.
 *   ok:true  — distM is the snapped distance to the nearest drivable road.
 *   ok:false — outage (all endpoints failed); caller keeps the point as "unknown".
 * Note: OSRM's driving profile includes dirt tracks, so a small distance here can mean
 * a track rather than a paved road — fine for the fallback's job (reject true holes).
 */
export async function nearestRoadOSRM(lat, lon) {
  for (const base of ENDPOINTS) {
    try {
      const res = await fetch(`${base}/nearest/v1/driving/${lon},${lat}?number=1`, { signal: timeoutSignal(REQ_TIMEOUT_MS) });
      if (!res.ok) continue;
      const j = await res.json();
      if (j.code !== 'Ok' || !Array.isArray(j.waypoints) || !j.waypoints.length) continue;
      const w = j.waypoints[0];
      if (!Number.isFinite(w.distance)) continue;
      return { ok: true, distM: w.distance, roadName: w.name || '' };
    } catch (_) { /* try next endpoint */ }
  }
  return { ok: false, distM: Infinity, roadName: '' };
}
