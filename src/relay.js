// relay.js — relay/repeater site finder (pure core, reuses analyzeLink).
// When A↔B has no line of sight, search high ground between/around them for a spot that
// can see BOTH endpoints, so a passive/active repeater there closes the link.
import { metresPerDegree } from './geo.js';
import { analyzeLink } from './los.js';

/**
 * Find relay sites that clear LOS to BOTH a and b.
 *   { a, b, freqHz, fresnelPct, sampleElev, relayMast?, gridStepKm?, padKm?,
 *     maxResults?, maxTest?, safe? }
 * `sampleElev(lat,lon)` must return ground elevation (tiles already loaded by the caller).
 * Returns ranked sites: [{ lat, lon, groundElev, mast, marginA, marginB, score,
 *                          distAkm, distBkm }], best (largest min-margin) first.
 */
export function findRelaySites({
  a, b, freqHz, fresnelPct, sampleElev,
  relayMast = 10, gridStepKm = 1, padKm = 2, maxResults = 6, maxTest = 200, safe = () => true,
}) {
  const south = Math.min(a.lat, b.lat), north = Math.max(a.lat, b.lat);
  const west = Math.min(a.lon, b.lon), east = Math.max(a.lon, b.lon);
  const [perLat] = metresPerDegree((south + north) / 2);
  const padLat = (padKm * 1000) / perLat;
  const padLon = (padKm * 1000) / metresPerDegree((south + north) / 2)[1];
  const box = { south: south - padLat, north: north + padLat, west: west - padLon, east: east + padLon };
  const dLat = (gridStepKm * 1000) / perLat;

  // collect safe candidates with ground elevation
  const cands = [];
  for (let lat = box.south; lat <= box.north; lat += dLat) {
    const dLon = (gridStepKm * 1000) / metresPerDegree(lat)[1];
    for (let lon = box.west; lon <= box.east; lon += dLon) {
      if (!safe(lat, lon)) continue;
      const g = sampleElev(lat, lon);
      if (Number.isNaN(g)) continue;
      cands.push({ lat, lon, g });
    }
  }
  // relays want height — test the highest ground first and bound the work
  cands.sort((x, y) => y.g - x.g);

  const found = [];
  for (const c of cands.slice(0, maxTest)) {
    const relay = { lat: c.lat, lon: c.lon, groundElev: c.g, mast: relayMast };
    const legA = analyzeLink({ a: relay, b: a, freqHz, fresnelPct, sampleElev });
    if (!legA.clear) continue;
    const legB = analyzeLink({ a: relay, b: b, freqHz, fresnelPct, sampleElev });
    if (!legB.clear) continue;
    found.push({
      lat: c.lat, lon: c.lon, groundElev: c.g, mast: relayMast,
      marginA: legA.minMargin, marginB: legB.minMargin,
      score: Math.min(legA.minMargin, legB.minMargin),
      distAkm: legA.distanceKm, distBkm: legB.distanceKm,
    });
  }
  found.sort((x, y) => y.score - x.score);
  return found.slice(0, maxResults);
}
