// viewshed.js — orchestrates the 50 km coverage compute: gather terrain, run the
// worker, paint the YES/NO raster as a Leaflet overlay. Browser-only.
import { squareBox } from './geo.js';
import { ensureCovered, buildGrid, elevation } from './terrain.js';

const MAX_RANGE_M = 50000;
const ZOOM = 11;       // ~65 m terrain — plenty for a 50 km coverage raster
const ELEV_GRID = 512; // source elevation sampling resolution
const OUT_GRID = 384;  // output raster resolution (~260 m cells)
const RAYS = 1440;     // angular resolution (no rim gaps at this grid size)
const STEP_M = 60;     // along-ray sample spacing

let currentOverlay = null;
let worker = null;
let activeReject = null; // reject() of the in-flight compute promise, if any
let runToken = 0;        // bumped on cancel/new run so stale results are discarded

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./viewshed.worker.js', import.meta.url), { type: 'module' });
  }
  return worker;
}

// Invalidate the in-flight result without killing the (reusable) worker.
function invalidate() {
  runToken++;
  if (activeReject) { const reject = activeReject; activeReject = null; reject(new Error('cancelled')); }
}

/** Hard-cancel: invalidate the in-flight result AND tear down the worker (used by clear). */
export function cancelViewshed() {
  invalidate();
  if (worker) { worker.terminate(); worker = null; }
}

function renderRaster(state, gridN, box, observer) {
  const canvas = document.createElement('canvas');
  canvas.width = gridN;
  canvas.height = gridN;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(gridN, gridN);
  let yes = 0, no = 0;
  for (let i = 0; i < state.length; i++) {
    const o = i * 4;
    if (state[i] === 1) {            // YES — green
      img.data[o] = 39; img.data[o + 1] = 209; img.data[o + 2] = 124; img.data[o + 3] = 180;
      yes++;
    } else if (state[i] === 2) {     // NO — red
      img.data[o] = 231; img.data[o + 1] = 76; img.data[o + 2] = 60; img.data[o + 3] = 150;
      no++;
    } else {
      img.data[o + 3] = 0;           // no-data — transparent
    }
  }
  ctx.putImageData(img, 0, 0);
  const bounds = [[box.south, box.west], [box.north, box.east]];
  return {
    url: canvas.toDataURL(),
    bounds,
    stats: { yes, no, hasData: yes + no > 0, coverage: yes + no > 0 ? yes / (yes + no) : 0 },
  };
}

/**
 * Compute & display the 50 km viewshed from `observer`.
 *  opts: { map, observer:{lat,lon,groundElev,mast}, rxMast, freqHz, fresnelPct, onProgress(phase,frac) }
 * Returns { stats } after the overlay is on the map.
 */
export async function computeViewshed({ map, observer, rxMast, freqHz, fresnelPct, onProgress }) {
  invalidate(); // supersede any prior result but keep the worker for reuse
  const myToken = ++runToken; // claim this run
  const box = squareBox(observer.lat, observer.lon, MAX_RANGE_M);

  onProgress?.('tiles', 0);
  await ensureCovered(box, ZOOM, (d, t) => onProgress?.('tiles', d / t));
  if (myToken !== runToken) throw new Error('cancelled');

  // make sure the observer's own ground elevation is fresh from the terrain
  const g = elevation(observer.lat, observer.lon, ZOOM);
  const obs = { ...observer, groundElev: Number.isNaN(g) ? observer.groundElev : g };

  onProgress?.('compute', 0);
  const elev = buildGrid(box, ELEV_GRID, ELEV_GRID, ZOOM);

  const result = await new Promise((resolve, reject) => {
    const w = getWorker();
    activeReject = reject;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'progress') onProgress?.('compute', m.value);
      else if (m.type === 'done') { activeReject = null; resolve(m); }
    };
    w.onerror = (err) => { activeReject = null; reject(new Error('worker: ' + (err.message || 'load/run failed'))); };
    w.onmessageerror = () => { activeReject = null; reject(new Error('worker message error')); };
    w.postMessage(
      {
        type: 'compute',
        elev, ew: ELEV_GRID, eh: ELEV_GRID, box,
        observer: obs, rxMast, freqHz, fresnelPct,
        rays: RAYS, stepM: STEP_M, gridN: OUT_GRID, maxRangeM: MAX_RANGE_M,
      },
      [elev.buffer]
    );
  });
  if (myToken !== runToken) throw new Error('cancelled'); // a clear/new run superseded us

  const { url, bounds, stats } = renderRaster(result.state, result.gridN, result.box, obs);
  if (currentOverlay) map.removeLayer(currentOverlay);
  currentOverlay = L.imageOverlay(url, bounds, { opacity: 0.9, interactive: false });
  currentOverlay.addTo(map);
  onProgress?.('done', 1);
  return { stats, box, groundElev: obs.groundElev };
}

/** Remove the coverage overlay from the map. */
export function clearViewshed(map) {
  if (currentOverlay) {
    map.removeLayer(currentOverlay);
    currentOverlay = null;
  }
}
