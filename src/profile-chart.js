// profile-chart.js — draws the A->B terrain cross-section as an SVG:
// effective terrain (with curvature bulge), the sightline, the 60% Fresnel
// boundary, and the determining (worst-clearance) point. Hebrew labels.

const W = 600, H = 220, PAD_L = 40, PAD_R = 12, PAD_T = 14, PAD_B = 26;

const svgEl = (name, attrs) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
};

export function renderProfile(container, result) {
  container.innerHTML = '';
  if (!result || !result.hasData) {
    container.innerHTML = '<div class="muted">אין נתוני שטח לחתך הזה.</div>';
    return;
  }
  const s = result.samples.filter((p) => !Number.isNaN(p.terrain));
  const xs = result.distanceKm;
  let lo = Infinity, hi = -Infinity;
  for (const p of s) {
    lo = Math.min(lo, p.effTerrain, p.f60);
    hi = Math.max(hi, p.effTerrain, p.sight);
  }
  lo = Math.min(lo, result.hA, result.hB);
  hi = Math.max(hi, result.hA, result.hB);
  const span = Math.max(1, hi - lo);
  lo -= span * 0.08; hi += span * 0.08;

  const X = (km) => PAD_L + (km / xs) * (W - PAD_L - PAD_R);
  const Y = (m) => PAD_T + (1 - (m - lo) / (hi - lo)) * (H - PAD_T - PAD_B);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', style: 'display:block' });

  // axes / grid
  for (let g = 0; g <= 4; g++) {
    const m = lo + ((hi - lo) * g) / 4;
    const y = Y(m);
    svg.appendChild(svgEl('line', { x1: PAD_L, y1: y, x2: W - PAD_R, y2: y, stroke: '#2a2f38', 'stroke-width': 1 }));
    const t = svgEl('text', { x: 4, y: y + 3, fill: '#7d828b', 'font-size': 9 });
    t.textContent = Math.round(m);
    svg.appendChild(t);
  }

  const path = (pts, close) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ') + (close ? ' Z' : '');

  // terrain (effective = terrain + curvature bulge)
  const terrainPts = s.map((p) => [p.km, p.effTerrain]);
  const terrainArea = path(terrainPts) + ` L${X(s[s.length - 1].km).toFixed(1)},${Y(lo).toFixed(1)} L${X(s[0].km).toFixed(1)},${Y(lo).toFixed(1)} Z`;
  svg.appendChild(svgEl('path', { d: terrainArea, fill: '#5c4f33', stroke: '#8a7642', 'stroke-width': 1 }));

  // 60% Fresnel clearance boundary
  svg.appendChild(svgEl('path', { d: path(s.map((p) => [p.km, p.f60])), fill: 'none', stroke: '#78aaff', 'stroke-width': 1, opacity: 0.55, 'stroke-dasharray': '3 3' }));

  // sightline A-top -> B-top
  svg.appendChild(svgEl('line', { x1: X(0), y1: Y(result.hA), x2: X(xs), y2: Y(result.hB), stroke: result.clear ? '#6fd388' : '#e74c3c', 'stroke-width': 2, 'stroke-dasharray': '6 4' }));

  // determining point — diamond sits on the obstacle (effective terrain) that drives the verdict
  if (Number.isFinite(result.minAtKm) && Number.isFinite(result.minTerrain)) {
    const dx = X(result.minAtKm);
    const dy = Y(result.minTerrain);
    svg.appendChild(svgEl('line', { x1: dx, y1: PAD_T, x2: dx, y2: H - PAD_B, stroke: '#f1c40f', 'stroke-width': 1, opacity: 0.6 }));
    svg.appendChild(svgEl('rect', { x: dx - 3, y: dy - 3, width: 6, height: 6, fill: '#fff', stroke: '#f1c40f', 'stroke-width': 1, transform: `rotate(45 ${dx} ${dy})` }));
  }

  // endpoints
  const dotA = svgEl('circle', { cx: X(0), cy: Y(result.hA), r: 4, fill: '#e74c3c' });
  const dotB = svgEl('circle', { cx: X(xs), cy: Y(result.hB), r: 4, fill: '#3498db' });
  svg.appendChild(dotA); svg.appendChild(dotB);
  const la = svgEl('text', { x: X(0) + 4, y: Y(result.hA) - 6, fill: '#e74c3c', 'font-size': 10 }); la.textContent = 'A';
  const lb = svgEl('text', { x: X(xs) - 12, y: Y(result.hB) - 6, fill: '#8ab4f8', 'font-size': 10 }); lb.textContent = 'B';
  svg.appendChild(la); svg.appendChild(lb);

  container.appendChild(svg);
}
