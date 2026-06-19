// geocode.js — free place search in Israel via OpenStreetMap Nominatim (no API key).
// Triggered on Enter (not per keystroke) to respect the usage policy.
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const REVERSE = 'https://nominatim.openstreetmap.org/reverse';

/** Search Israeli places by name. Returns [{ name, lat, lon }]. */
export async function searchPlaces(query) {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const url = `${ENDPOINT}?q=${encodeURIComponent(q)}&format=jsonv2&countrycodes=il&limit=6&accept-language=he`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const data = await res.json();
  return data
    .map((d) => ({ name: d.display_name, lat: +d.lat, lon: +d.lon }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

const revCache = new Map(); // lat,lon -> short place label (Hebrew)

/**
 * Reverse-geocode a point to a short Hebrew place label (nearest city/town/area).
 * Returns '' if unknown / on failure. Cached so repeated clicks don't re-query.
 */
export async function reversePlace(lat, lon) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (revCache.has(key)) return revCache.get(key);
  const url = `${REVERSE}?lat=${lat}&lon=${lon}&format=jsonv2&zoom=12&addressdetails=1&accept-language=he`;
  let label = '';
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const d = await res.json();
      const a = d.address || {};
      label = a.city || a.town || a.village || a.municipality || a.hamlet || a.suburb
        || a.neighbourhood || a.city_district || a.county || a.region || a.state || d.name || '';
    }
  } catch (_) { /* offline / throttled -> caller falls back to coords */ }
  if (label) revCache.set(key, label); // never cache an empty result: a transient throttle must not poison the point
  return label;
}
