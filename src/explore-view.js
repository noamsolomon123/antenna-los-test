// explore-view.js — the "all LOS points" table overlay: render rows, sort,
// filter, and route row clicks back to the map / antenna placement.
import { sortCandidates, filterCandidates } from './explore.js';

const $ = (id) => document.getElementById(id);

let candidates = [];
let sortBy = 'route';
let sortDir = 'asc';
let handlers = {}; // { onFly(c), onPick(c) }

const DEFAULT_DIR = { route: 'asc', distance: 'asc', clearance: 'desc', height: 'desc', road: 'asc' };
const FILTER_IDS = ['exp-min-km', 'exp-max-km', 'exp-min-clr', 'exp-dir-from', 'exp-dir-to', 'exp-min-h', 'exp-max-road'];
const roadFmt = (m) => (m == null ? '—' : m < 1000 ? `${Math.round(m)} מ'` : `${(m / 1000).toFixed(1)} ק"מ`);

export function initExploreView(h) {
  handlers = h || {};
  $('exp-close').addEventListener('click', closeExploreView);
  $('exp-reset').addEventListener('click', () => {
    FILTER_IDS.forEach((id) => { $(id).value = ''; });
    render();
  });
  FILTER_IDS.forEach((id) => $(id).addEventListener('input', render));
  // preset: one tap -> car-accessible (within 1 km of a road, nearest first)
  $('exp-preset-car').addEventListener('click', () => {
    $('exp-max-road').value = '1';
    sortBy = 'road'; sortDir = 'asc';
    render();
  });
  document.querySelectorAll('#exp-table th[data-sort]').forEach((th) => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (sortBy === field) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortBy = field; sortDir = DEFAULT_DIR[field] || 'asc'; }
      render();
    });
  });
}

export function openExploreView(cands) {
  candidates = cands || [];
  sortBy = 'route'; sortDir = 'asc';
  $('explore-overlay').hidden = false;
  render();
}

export function closeExploreView() { $('explore-overlay').hidden = true; }
export function isExploreOpen() { return !$('explore-overlay').hidden; }

const num = (id) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : null; };

function readFilters() {
  return {
    minKm: num('exp-min-km'), maxKm: num('exp-max-km'),
    minClearance: num('exp-min-clr'), minHeight: num('exp-min-h'),
    dirFrom: num('exp-dir-from'), dirTo: num('exp-dir-to'),
    maxRoadKm: num('exp-max-road'),
  };
}

function render() {
  const rows = sortCandidates(filterCandidates(candidates, readFilters()), sortBy, sortDir);
  $('exp-count').textContent = `${rows.length} מתוך ${candidates.length} נקודות`;
  document.querySelectorAll('#exp-table th[data-sort]').forEach((th) => {
    th.dataset.active = th.dataset.sort === sortBy ? sortDir : '';
  });
  const tb = $('exp-rows');
  tb.innerHTML = '';
  rows.forEach((c) => {
    const tr = document.createElement('tr');
    const ord = Number.isFinite(c.routeOrder) ? c.routeOrder : '–';
    const h = c.groundElev == null ? '—' : Math.round(c.groundElev);
    tr.innerHTML =
      `<td class="ord ${Number.isFinite(c.routeOrder) ? 'on' : ''}">${ord}</td>` +
      `<td>${c.distanceKm.toFixed(1)}</td>` +
      `<td>${c.bearingDeg.toFixed(0)}°</td>` +
      `<td class="${c.marginM >= 0 ? 'pos' : 'neg'}">${c.marginM.toFixed(1)}</td>` +
      `<td>${h}</td>` +
      `<td>${roadFmt(c.roadDistM)}</td>` +
      `<td class="coords">${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}<br>` +
      `<a href="https://waze.com/ul?ll=${c.lat},${c.lon}&navigate=yes" target="_blank">Waze</a> · ` +
      `<a href="https://maps.google.com/?q=${c.lat},${c.lon}" target="_blank">Maps</a></td>` +
      `<td><button class="exp-place">הצב ←</button></td>`;
    tr.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') return;
      if (e.target.classList.contains('exp-place')) { handlers.onPick && handlers.onPick(c); return; }
      handlers.onFly && handlers.onFly(c);
    });
    tb.appendChild(tr);
  });
}
