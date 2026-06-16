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
const cache = new Map();      // "z/x/y" -> Float32Array(256*256) | 'nodata'
const inflight = new Map();   // "z/x/y" -> Promise

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
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (inflight.has(key)) return inflight.get(key);
  const p = fetchTile(z, x, y).then((elev) => {
    cache.set(key, elev);
    inflight.delete(key);
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

/** Pre-fetch every tile covering a {south,west,north,east} box at a zoom. */
export async function ensureCovered(box, zoom, onProgress) {
  const x0 = Math.floor(lon2tileF(box.west, zoom));
  const x1 = Math.floor(lon2tileF(box.east, zoom));
  const y0 = Math.floor(lat2tileF(box.north, zoom)); // north = smaller y
  const y1 = Math.floor(lat2tileF(box.south, zoom));
  const tasks = [];
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) tasks.push(() => loadTile(zoom, x, y));
  await runPool(tasks, 6, onProgress);
}

/** Synchronous bilinear elevation (m) from already-cached tiles; NaN if missing. */
export function elevation(lat, lon, zoom) {
  const fx = lon2tileF(lon, zoom);
  const fy = lat2tileF(lat, zoom);
  const tx = Math.floor(fx);
  const ty = Math.floor(fy);
  const tile = cache.get(`${zoom}/${tx}/${ty}`);
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
