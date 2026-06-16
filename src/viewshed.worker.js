// viewshed.worker.js — radial-sweep line-of-sight (module worker). Receives a
// pre-decoded elevation grid and returns a Float32 clearance-MARGIN raster
// (metres above the Fresnel-inflated horizon per cell; NaN = no data).
// margin >= 0 means a clear link; the margin is also used by the explore view.
import { destination } from './geo.js';
import { curvatureDropM, fresnelRadiusM } from './los.js';

// bilinear sample of the source elevation grid (row 0 = north). NaN if unknown.
function sampleElev(elev, ew, eh, box, lat, lon) {
  const fx = ((lon - box.west) / (box.east - box.west)) * (ew - 1);
  const fy = ((box.north - lat) / (box.north - box.south)) * (eh - 1);
  if (fx < 0 || fy < 0 || fx > ew - 1 || fy > eh - 1) return NaN;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(ew - 1, x0 + 1), y1 = Math.min(eh - 1, y0 + 1);
  const dx = fx - x0, dy = fy - y0;
  const v = (cx, cy) => elev[cy * ew + cx];
  const a = v(x0, y0), b = v(x1, y0), c = v(x0, y1), d = v(x1, y1);
  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) return NaN;
  return (a * (1 - dx) + b * dx) * (1 - dy) + (c * (1 - dx) + d * dx) * dy;
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type !== 'compute') return;
  const {
    elev, ew, eh, box, observer, rxMast, freqHz, fresnelPct,
    rays, stepM, gridN, maxRangeM,
  } = msg;

  const obsH = observer.groundElev + observer.mast;
  const margin = new Float32Array(gridN * gridN).fill(NaN); // metres above horizon; NaN = no data
  const { north, south, west, east } = box;

  const markCell = (lat, lon, m) => {
    const gx = Math.round(((lon - west) / (east - west)) * (gridN - 1));
    const gy = Math.round(((north - lat) / (north - south)) * (gridN - 1));
    if (gx < 0 || gy < 0 || gx >= gridN || gy >= gridN) return;
    const idx = gy * gridN + gx;
    if (Number.isNaN(margin[idx]) || m > margin[idx]) margin[idx] = m; // keep the best
  };

  const steps = Math.floor(maxRangeM / stepM);
  const progressTick = Math.max(1, Math.floor(rays / 20));

  for (let r = 0; r < rays; r++) {
    const az = (360 * r) / rays;
    let runningMax = -Infinity; // max required (curvature+fresnel) angle so far
    for (let s = 1; s <= steps; s++) {
      const d = s * stepM;
      const p = destination(observer.lat, observer.lon, az, d);
      const terrain = sampleElev(elev, ew, eh, box, p[0], p[1]);
      if (Number.isNaN(terrain)) continue; // leave as no-data
      const groundTop = terrain - curvatureDropM(d);
      // Required Fresnel clearance for an obstacle here, using the worst-case
      // endpoint still inside the 50 km disc (d2 = maxRange - d) — an upper bound,
      // so a margin >= 0 never false-positives against the precise check.
      const inflate = fresnelPct * fresnelRadiusM(freqHz, d, Math.max(1, maxRangeM - d));
      // receiver-top metres above the blocking horizon at this range
      if (runningMax !== -Infinity) markCell(p[0], p[1], groundTop + rxMast - obsH - runningMax * d);
      const obstacleAngle = (groundTop + inflate - obsH) / d;
      if (obstacleAngle > runningMax) runningMax = obstacleAngle;
    }
    if (r % progressTick === 0) self.postMessage({ type: 'progress', value: r / rays });
  }

  self.postMessage({ type: 'done', margin, gridN, box, observer, maxRangeM }, [margin.buffer]);
};
