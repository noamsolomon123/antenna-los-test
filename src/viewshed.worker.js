// viewshed.worker.js — radial-sweep line-of-sight viewshed (module worker).
// Receives a pre-decoded elevation grid (no DOM here) and returns a YES/NO raster.
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
  const state = new Uint8Array(gridN * gridN); // 0 nodata/outside, 1 YES, 2 NO
  const { north, south, west, east } = box;

  const markCell = (lat, lon, s) => {
    const gx = Math.round(((lon - west) / (east - west)) * (gridN - 1));
    const gy = Math.round(((north - lat) / (north - south)) * (gridN - 1));
    if (gx < 0 || gy < 0 || gx >= gridN || gy >= gridN) return;
    const idx = gy * gridN + gx;
    if (s === 1) state[idx] = 1;              // YES wins
    else if (state[idx] === 0) state[idx] = 2; // NO only if still empty
  };

  const steps = Math.floor(maxRangeM / stepM);
  let progressTick = Math.max(1, Math.floor(rays / 20));

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
      // endpoint still inside the 50 km disc (d2 = maxRange - d). This is an
      // upper bound on the true requirement => a YES cell never produces a
      // false positive against the precise point-to-point check.
      const inflate = fresnelPct * fresnelRadiusM(freqHz, d, Math.max(1, maxRangeM - d));
      const obstacleAngle = (groundTop + inflate - obsH) / d;
      const rxAngle = (groundTop + rxMast - obsH) / d;
      markCell(p[0], p[1], rxAngle >= runningMax ? 1 : 2);
      if (obstacleAngle > runningMax) runningMax = obstacleAngle;
    }
    if (r % progressTick === 0) {
      self.postMessage({ type: 'progress', value: r / rays });
    }
  }

  self.postMessage({ type: 'done', state, gridN, box, observer, maxRangeM }, [state.buffer]);
};
