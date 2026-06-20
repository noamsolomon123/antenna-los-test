// buildings.js — OSM building footprints + heights for urban line-of-sight.
// Pure geometry (point-in-polygon, height lookup, tag parsing) + a browser Overpass
// fetch. Used to add rooftop heights to the terrain profile so a link between two
// antennas in a built-up area is blocked by buildings the bare-earth DEM can't see.

/** Ray-casting point-in-polygon. ring = [[lon,lat], …]. */
export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Metres of building height from OSM tags: explicit height, else ~3 m per level. */
export function buildingHeight(tags = {}) {
  if (tags.height != null) { const m = parseFloat(tags.height); if (Number.isFinite(m)) return m; }
  if (tags['building:levels'] != null) { const l = parseFloat(tags['building:levels']); if (Number.isFinite(l)) return l * 3; }
  return 0;
}

/** Parse Overpass `out geom tags` way elements → [{ height, ring:[[lon,lat],…] }] (heighted only). */
export function parseBuildings(elements) {
  const out = [];
  for (const el of elements || []) {
    if (!el.geometry || !el.tags) continue;
    const h = buildingHeight(el.tags);
    if (!(h > 0)) continue;
    const ring = el.geometry.map((p) => [p.lon, p.lat]);
    if (ring.length >= 4) out.push({ height: h, ring });
  }
  return out;
}

/** Max height of any footprint containing the point (0 if none). */
export function buildingHeightAt(lat, lon, buildings) {
  let h = 0;
  for (const b of buildings) {
    if (b.height > h && pointInRing(lon, lat, b.ring)) h = b.height;
  }
  return h;
}

const OVERPASS = 'https://overpass-api.de/api/interpreter';
/** Fetch heighted buildings inside {south,west,north,east} via Overpass (CORS-ok). */
export async function fetchBuildings(box, { signal } = {}) {
  const q = `[out:json][timeout:25];(way["building"](${box.south},${box.west},${box.north},${box.east}););out geom tags;`;
  const res = await fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(q), signal });
  if (!res.ok) throw new Error('overpass ' + res.status);
  const j = await res.json();
  return parseBuildings(j.elements);
}
