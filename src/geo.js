// geo.js — small geodesy helpers (pure, no DOM). Distances in metres, angles in degrees.
// Used by los.js, viewshed.js, the worker and the map glue. Safe to import in Node for tests.

export const EARTH_RADIUS_M = 6371008.8; // mean Earth radius (IUGG)

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Great-circle distance between [lat,lon] points, in metres (haversine). */
export function distanceM(a, b) {
  const dLat = (b[0] - a[0]) * D2R;
  const dLon = (b[1] - a[1]) * D2R;
  const la1 = a[0] * D2R;
  const la2 = b[0] * D2R;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from north (0..360). */
export function bearingDeg(a, b) {
  const la1 = a[0] * D2R;
  const la2 = b[0] * D2R;
  const dLon = (b[1] - a[1]) * D2R;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) -
    Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

/** Destination point from [lat,lon] travelling distM metres on bearing azDeg. */
export function destination(lat, lon, azDeg, distM) {
  const d = distM / EARTH_RADIUS_M;
  const br = azDeg * D2R;
  const la1 = lat * D2R;
  const lo1 = lon * D2R;
  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br)
  );
  const lo2 =
    lo1 +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(la1),
      Math.cos(d) - Math.sin(la1) * Math.sin(la2)
    );
  return [la2 * R2D, ((lo2 * R2D + 540) % 360) - 180];
}

/** Linear interpolation between two [lat,lon] points (fine for <=50 km spans). */
export function lerpPoint(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Metres-per-degree at a given latitude, as [perLat, perLon]. */
export function metresPerDegree(lat) {
  const perLat = 111132.92 - 559.82 * Math.cos(2 * lat * D2R);
  const perLon = 111412.84 * Math.cos(lat * D2R) - 93.5 * Math.cos(3 * lat * D2R);
  return [perLat, perLon];
}

/** Square bounding box of half-size radiusM around centre, as {south,west,north,east}. */
export function squareBox(lat, lon, radiusM) {
  const [perLat, perLon] = metresPerDegree(lat);
  const dLat = radiusM / perLat;
  const dLon = radiusM / perLon;
  return { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };
}
