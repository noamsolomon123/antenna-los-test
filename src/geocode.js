// geocode.js — free place search in Israel via OpenStreetMap Nominatim (no API key).
// Triggered on Enter (not per keystroke) to respect the usage policy.
const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

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
