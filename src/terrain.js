// terrain.js — fetch, decode & cache AWS "Terrain Tiles" (Terrarium PNG) and
// sample elevation anywhere. Browser-only (uses fetch + canvas). No API key.
//
// Terrarium decode:  elevation_m = (R*256 + G + B/256) - 32768
// Source verified CORS-enabled (Access-Control-Allow-Origin: *).

const SOURCES = [
  (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
  (z, x, y) => `https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${z}/${x}/${y}.png`,
];

const TILE = 256;
const MAX_TILES = 700;        // bound memory (~175 MB of Float32 tiles); higher so the national scan, which loads all-Israel + many 50 km boxes, doesn't thrash the cache
const NODATA_TTL = 60000;     // ms — retry a failed tile after this, don't pin failures forever
const cache = new Map();      // "z/x/y" -> Float32Array(256*256)  (success only)
const nodataUntil = new Map();// "z/x/y" -> timestamp until which it's treated as no-data
const inflight = new Map();   // "z/x/y" -> Promise

function cacheSet(key, val) {
  cache.set(key, val);
  if (cache.size > MAX_TILES) cache.delete(cache.keys().next().value); // evict oldest
}

// ---- slippy-map tile math --------------------------------------------------
const lon2tileF = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2tileF = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * 2 ** z;
};

// ---- pixel decoding --------------------------------------------------------
function decodeBitmap(bmp) {
  const c =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(TILE, TILE)
      : Object.assign(document.createElement('canvas'), { width: TILE, height: TILE });
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, TILE, TILE);
  const { data } = ctx.getImageData(0, 0, TILE, TILE);
  const elev = new Float32Array(TILE * TILE);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    elev[p] = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768;
  }
  return elev;
}

async function fetchTile(z, x, y) {
  for (const src of SOURCES) {
    try {
      const res = await fetch(src(z, x, y), { mode: 'cors' });
      if (!res.ok) continue;
      const bmp = await createImageBitmap(await res.blob());
      const elev = decodeBitmap(bmp);
      bmp.close?.();
      return elev;
    } catch (_) {
      /* try next source */
    }
  }
  return 'nodata';
}

function loadTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return Promise.resolve(hit); } // LRU: refresh recency on hit
  const until = nodataUntil.get(key);
  if (until && Date.now() < until) return Promise.resolve('nodata');
  if (inflight.has(key)) return inflight.get(key);
  const p = fetchTile(z, x, y).then((elev) => {
    inflight.delete(key);
    if (elev === 'nodata') { nodataUntil.set(key, Date.now() + NODATA_TTL); return 'nodata'; }
    cacheSet(key, elev);
    nodataUntil.delete(key);
    return elev;
  });
  inflight.set(key, p);
  return p;
}

// ---- throttled batch loading ----------------------------------------------
async function runPool(tasks, concurrency, onProgress) {
  let done = 0;
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const my = idx++;
      await tasks[my]();
      done++;
      onProgress?.(done, tasks.length);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, worker)
  );
}

/** Pre-fetch every tile covering a {south,west,north,east} box. Returns {total,nodata}. */
export async function ensureCovered(box, zoom, onProgress) {
  const x0 = Math.floor(lon2tileF(box.west, zoom));
  const x1 = Math.floor(lon2tileF(box.east, zoom));
  const y0 = Math.floor(lat2tileF(box.north, zoom)); // north = smaller y
  const y1 = Math.floor(lat2tileF(box.south, zoom));
  let nodata = 0;
  const coords = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) coords.push([x, y]);
  const tasks = coords.map(([x, y]) => async () => { if ((await loadTile(zoom, x, y)) === 'nodata') nodata++; });
  await runPool(tasks, 6, onProgress);
  return { total: coords.length, nodata };
}

/** Decoded elevation tile (Float32 256x256) for z/x/y, or 'nodata'. Shares the cache. */
export function getDecodedTile(z, x, y) {
  return loadTile(z, x, y);
}

/**
 * Pre-fetch only the tiles a straight a->b path crosses (a thin strip), at a zoom.
 * Enumerates EVERY tile the segment passes through (Amanatides–Woo grid traversal)
 * so a later fine-grained profile sample never lands in an un-loaded tile.
 */
export async function ensurePath(a, b, zoom, onProgress) {
  const x0 = lon2tileF(a.lon, zoom), y0 = lat2tileF(a.lat, zoom);
  const x1 = lon2tileF(b.lon, zoom), y1 = lat2tileF(b.lat, zoom);
  const keys = new Set();
  let tx = Math.floor(x0), ty = Math.floor(y0);
  const txEnd = Math.floor(x1), tyEnd = Math.floor(y1);
  keys.add(`${tx},${ty}`);
  keys.add(`${txEnd},${tyEnd}`);
  const dx = x1 - x0, dy = y1 - y0;
  if (dx !== 0 || dy !== 0) {
    const stepX = Math.sign(dx) || 1, stepY = Math.sign(dy) || 1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    let tMaxX = dx !== 0 ? (stepX > 0 ? Math.floor(x0) + 1 - x0 : x0 - Math.floor(x0)) * tDeltaX : Infinity;
    let tMaxY = dy !== 0 ? (stepY > 0 ? Math.floor(y0) + 1 - y0 : y0 - Math.floor(y0)) * tDeltaY : Infinity;
    let guard = 0;
    while ((tx !== txEnd || ty !== tyEnd) && guard++ < 10000) {
      if (tMaxX < tMaxY) { tMaxX += tDeltaX; tx += stepX; } else { tMaxY += tDeltaY; ty += stepY; }
      keys.add(`${tx},${ty}`);
    }
  }
  const tasks = [...keys].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return () => loadTile(zoom, x, y);
  });
  await runPool(tasks, 6, onProgress);
}

// memoize the last-resolved tile: scan/sweep samples are spatially coherent (same tile
// for long runs), so this skips a per-sample string build + Map.get in the hottest loop.
let _lz = -1, _ltx = -1, _lty = -1, _ltile = null;

/** Synchronous bilinear elevation (m) from already-cached tiles; NaN if missing. */
export function elevation(lat, lon, zoom) {
  const fx = lon2tileF(lon, zoom);
  const fy = lat2tileF(lat, zoom);
  const tx = Math.floor(fx);
  const ty = Math.floor(fy);
  let tile;
  if (zoom === _lz && tx === _ltx && ty === _lty) tile = _ltile;
  else {
    tile = cache.get(`${zoom}/${tx}/${ty}`);
    if (tile !== undefined) { _lz = zoom; _ltx = tx; _lty = ty; _ltile = tile; } // don't memoize a not-yet-loaded tile
  }
  if (!tile || tile === 'nodata') return NaN;
  // pixel coords within the tile
  const px = (fx - tx) * TILE;
  const py = (fy - ty) * TILE;
  const x0 = Math.min(TILE - 1, Math.max(0, Math.floor(px)));
  const y0 = Math.min(TILE - 1, Math.max(0, Math.floor(py)));
  const x1 = Math.min(TILE - 1, x0 + 1);
  const y1 = Math.min(TILE - 1, y0 + 1);
  const dx = px - x0;
  const dy = py - y0;
  const v = (cx, cy) => tile[cy * TILE + cx];
  const top = v(x0, y0) * (1 - dx) + v(x1, y0) * dx;
  const bot = v(x0, y1) * (1 - dx) + v(x1, y1) * dx;
  return top * (1 - dy) + bot * dy;
}

/** Async convenience: ensure the tile under a point is loaded, then sample. */
export async function elevationAt(lat, lon, zoom) {
  const tx = Math.floor(lon2tileF(lon, zoom));
  const ty = Math.floor(lat2tileF(lat, zoom));
  await loadTile(zoom, tx, ty);
  return elevation(lat, lon, zoom);
}

/**
 * Build a w*h elevation grid (Float32, row-major, row 0 = north) sampling the
 * box at the given zoom. Tiles must already be ensureCovered(). NaN = no data.
 */
export function buildGrid(box, w, h, zoom) {
  const grid = new Float32Array(w * h);
  for (let gy = 0; gy < h; gy++) {
    const lat = box.north - ((box.north - box.south) * gy) / (h - 1);
    for (let gx = 0; gx < w; gx++) {
      const lon = box.west + ((box.east - box.west) * gx) / (w - 1);
      grid[gy * w + gx] = elevation(lat, lon, zoom);
    }
  }
  return grid;
}
