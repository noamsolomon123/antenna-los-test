// ui.js — wires the sidebar DOM, app state, map controller, link analysis and
// the viewshed compute together. The single controller for user interaction.
import { state, update, freqHz, DEFAULT_MAST } from './state.js';
import { analyzeLink, effectiveHeight } from './los.js';
import { ensureCovered, elevation, elevationAt } from './terrain.js';
import { initMap } from './map.js';
import { computeViewshed, clearViewshed, cancelViewshed } from './viewshed.js';
import { renderProfile } from './profile-chart.js';
import { runScan } from './scan.js';

const PROFILE_ZOOM = 12;
const $ = (id) => document.getElementById(id);
let mapCtl;
let linkTimer = null;
let scanMode = 'corridor';

export function initUI() {
  mapCtl = initMap('map', { onMapClick, onMove, onSelect: selectAntenna, onHover });
  wireFrequency();
  wireMasts();
  wireObserver();
  $('vs-btn').addEventListener('click', runViewshed);
  $('vs-clear').addEventListener('click', () => { cancelViewshed(); clearViewshed(mapCtl.map); $('vs-stats').textContent = ''; showProgress(false); });
  wireScan();
  selectAntenna('A');
  renderVerdict(null);
}

// ---------- automated scan -------------------------------------------------
function wireScan() {
  const modeBtn = $('scan-mode');
  modeBtn.addEventListener('click', () => {
    scanMode = scanMode === 'corridor' ? 'best' : 'corridor';
    modeBtn.textContent = scanMode === 'corridor' ? 'מסדרון — נסיעה אחת' : 'הכי טוב בכל מרחק';
  });
  $('scan-btn').addEventListener('click', runScanUI);
  $('scan-clear').addEventListener('click', () => { mapCtl.clearScan(); $('scan-results').innerHTML = ''; });
}

function parseDistances() {
  return ($('scan-dists').value || '')
    .split(',').map((s) => parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 50)
    .sort((a, b) => a - b);
}

async function runScanUI() {
  const obs = state['antenna' + state.observer];
  if (!obs) { setStatus('מקם קודם אנטנה למיקום המשקיף'); return; }
  if (Number.isNaN(obs.groundElev)) { setStatus('אין נתוני שטח במיקום המשקיף — בחר נקודה ביבשה'); return; }
  const dists = parseDistances();
  if (!dists.length) { setStatus('הזן מרחקי יעד תקינים (למשל 30, 40, 50)'); return; }
  const tol = Math.max(1, parseFloat($('scan-tol').value) || 3);
  // receiver mast = the other antenna's mast field (editable even before it's placed)
  const rxMast = mastVal(state.observer === 'A' ? 'B' : 'A');
  setStatus('');
  $('scan-btn').disabled = true;
  showScanProgress(true, 'מתחיל…', 0);
  try {
    const res = await runScan({
      observer: { ...obs }, distancesKm: dists, toleranceKm: tol, rxMast,
      freqHz: freqHz(), fresnelPct: state.fresnelPct, mode: scanMode, onProgress: onScanProgress,
    });
    mapCtl.setScanResults(obs, res.points, res.corridorAz, pickScanPoint);
    renderScanResults(res);
  } catch (e) {
    setStatus(e && e.message === 'observer-no-data' ? 'אין נתוני שטח במיקום המשקיף' : 'שגיאה בסריקה');
  } finally {
    $('scan-btn').disabled = false;
    showScanProgress(false);
  }
}

function renderScanResults(res) {
  const el = $('scan-results');
  el.innerHTML = '';
  if (res.fellBack) el.insertAdjacentHTML('beforeend',
    '<div class="muted" style="margin-bottom:6px">לא נמצא מסדרון אחד — מציג את הנקודות הטובות ביותר בכל כיוון.</div>');
  let num = 0;
  res.points.forEach((p, i) => {
    if (!p.found) {
      el.insertAdjacentHTML('beforeend',
        `<div class="scard none"><b>≈${p.nominalKm} ק"מ</b> — לא נמצאה נקודת קו ראייה</div>`);
      return;
    }
    num++;
    const cls = p.clear ? 'yes' : 'no';
    const verdict = (p.clear ? '✓ קו ראייה' : '✗ חסום') + (p.confirmed ? '' : ' (משוער)');
    el.insertAdjacentHTML('beforeend', `
      <div class="scard ${cls}" data-i="${i}">
        <div class="srow"><span class="snum">${num}</span> <b>≈${p.nominalKm} ק"מ</b> · <span class="${cls}">${verdict}</span></div>
        <div class="srow2">מרחק ${p.distanceKm.toFixed(1)} ק"מ · אזימוט ${p.bearingDeg.toFixed(0)}° · גובה ${Math.round(p.groundElev)} מ' · מרווח ${p.marginM.toFixed(1)} מ'</div>
        <div class="srow2"><span class="coords">${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</span> · <a href="https://waze.com/ul?ll=${p.lat},${p.lon}&navigate=yes" target="_blank">Waze</a> · <a href="https://maps.google.com/?q=${p.lat},${p.lon}" target="_blank">Maps</a></div>
        <button class="linkbtn setb">הצב לבדיקה מדויקת ←</button>
      </div>`);
  });
  el.querySelectorAll('.scard[data-i]').forEach((card) => {
    card.addEventListener('click', (e) => { if (e.target.tagName === 'A') return; pickScanPoint(res.points[+card.dataset.i]); });
  });
}

function pickScanPoint(p) {
  if (!p || !p.found) return;
  const target = state.observer === 'A' ? 'B' : 'A';
  placeAntenna(target, { lat: p.lat, lng: p.lon });
  mapCtl.flyTo([p.lat, p.lon], 13);
}

function onScanProgress(phase, frac) {
  const label = phase === 'tiles' ? 'טוען נתוני שטח' : phase === 'compute' ? 'סורק כיוונים' : phase === 'confirm' ? 'מאמת נקודות' : 'מסיים';
  showScanProgress(true, `${label}… ${Math.round(frac * 100)}%`, frac);
}

function showScanProgress(on, text, frac) {
  $('scan-progress').style.display = on ? 'block' : 'none';
  if (text != null) $('scan-progress-label').textContent = text;
  if (frac != null) $('scan-progress-bar').style.width = `${Math.round(frac * 100)}%`;
}

// ---------- map interactions ------------------------------------------------
function onMapClick(latlng) {
  if (!state.antennaA) placeAntenna('A', latlng);
  else if (!state.antennaB) placeAntenna('B', latlng);
  else placeAntenna(mapCtl.getSelected(), latlng);
}

function placeAntenna(which, latlng) {
  const mast = mastVal(which);
  const ant = { lat: latlng.lat, lon: latlng.lng, groundElev: NaN, mast }; // unknown until terrain resolves
  update({ ['antenna' + which]: ant });
  mapCtl.setAntenna(which, [ant.lat, ant.lon], '…');
  if (which === state.observer) mapCtl.setRing([ant.lat, ant.lon]);
  // fetch ground elevation, then refine
  elevationAt(ant.lat, ant.lon, PROFILE_ZOOM).then((g) => {
    if (state['antenna' + which] !== ant) return; // antenna replaced meanwhile
    ant.groundElev = g; // may be NaN (genuine no-data) — handled downstream
    updateCards();
    mapCtl.setAntenna(which, [ant.lat, ant.lon], tipFor(which));
    recomputeLink(false);
  });
  if (which === 'A' && !state.antennaB) selectAntenna('B');
  updateCards();
  recomputeLink(true);
}

function onMove(which, latlng, ended) {
  const ant = state['antenna' + which];
  if (!ant) return;
  ant.lat = latlng.lat; ant.lon = latlng.lng;
  if (which === state.observer) mapCtl.setRing([ant.lat, ant.lon]);
  if (ended) {
    elevationAt(ant.lat, ant.lon, PROFILE_ZOOM).then((g) => {
      if (state['antenna' + which] !== ant) return;
      ant.groundElev = g;
      updateCards();
      mapCtl.setAntenna(which, [ant.lat, ant.lon], tipFor(which));
    });
  }
  recomputeLink(ended);
}

function onSelect(which) { selectAntenna(which); }

function selectAntenna(which) {
  mapCtl.setSelected(which);
  ['A', 'B'].forEach((w) => $('card' + w)?.classList.toggle('selected', w === which));
}

function onHover(latlng, elev) {
  const e = Number.isNaN(elev) ? '—' : `${Math.round(elev)} מ'`;
  $('hover').innerHTML = `סמן: ${latlng.lat.toFixed(3)}, ${latlng.lng.toFixed(3)} · גובה <b>${e}</b>`;
}

// ---------- link analysis ---------------------------------------------------
function recomputeLink(ensure) {
  clearTimeout(linkTimer);
  linkTimer = setTimeout(() => doRecompute(ensure), ensure ? 0 : 90);
}

async function doRecompute(ensure) {
  const a = state.antennaA, b = state.antennaB;
  if (!a || !b) { renderVerdict(null); $('profile').innerHTML = ''; mapCtl.drawLink(null, null); return; }
  if (ensure) {
    setStatus('טוען נתוני שטח…');
    await ensureCovered(pathBox(a, b), PROFILE_ZOOM);
    setStatus('');
    a.groundElev = elevation(a.lat, a.lon, PROFILE_ZOOM);
    b.groundElev = elevation(b.lat, b.lon, PROFILE_ZOOM);
    updateCards();
  }
  if (Number.isNaN(a.groundElev) || Number.isNaN(b.groundElev)) {
    renderVerdict({ noStationData: true });
    $('profile').innerHTML = '';
    mapCtl.drawLink(L.latLng(a.lat, a.lon), L.latLng(b.lat, b.lon), false);
    return;
  }
  const result = analyzeLink({
    a, b, freqHz: freqHz(), fresnelPct: state.fresnelPct,
    sampleElev: (la, lo) => elevation(la, lo, PROFILE_ZOOM),
  });
  update({ link: result });
  renderVerdict(result);
  renderProfile($('profile'), result);
  mapCtl.drawLink(L.latLng(a.lat, a.lon), L.latLng(b.lat, b.lon), result.clear);
  mapCtl.setAntenna('A', [a.lat, a.lon], tipFor('A'));
  mapCtl.setAntenna('B', [b.lat, b.lon], tipFor('B'));
  updateCards();
}

function pathBox(a, b) {
  const pad = 0.03;
  return {
    south: Math.min(a.lat, b.lat) - pad, north: Math.max(a.lat, b.lat) + pad,
    west: Math.min(a.lon, b.lon) - pad, east: Math.max(a.lon, b.lon) + pad,
  };
}

// ---------- rendering -------------------------------------------------------
function renderVerdict(r) {
  const big = $('v-result');
  const setNeutral = (msg) => { big.textContent = msg; big.className = 'big neutral'; $('v-clearance').textContent = ''; };
  if (!r) {
    $('v-dist').textContent = '—'; $('v-az').textContent = '—';
    setNeutral('מקם אנטנה A ו-B במפה');
    return;
  }
  if (r.noStationData) { setNeutral('אין נתוני שטח במיקום אחת התחנות — בחר נקודה ביבשה'); return; }
  $('v-dist').textContent = r.distanceKm.toFixed(1) + ' ק"מ';
  $('v-az').textContent = r.bearingDeg.toFixed(0) + '°';
  $('v-freq').textContent = fmtFreq(state.frequencyMHz);
  if (!r.hasData) { setNeutral('— אין נתוני שטח —'); return; }
  if (r.dataFraction < 0.8) { setNeutral(`נתונים חלקיים (${Math.round(r.dataFraction * 100)}%) — לא ניתן לקבוע`); return; }
  big.textContent = r.clear ? '✓ יש קו ראייה — כן' : '✗ אין קו ראייה — לא';
  big.className = 'big ' + (r.clear ? 'yes' : 'no');
  $('v-clearance').innerHTML =
    `מרווח פרנל מינימלי: <b>${r.minMargin.toFixed(1)} מ'</b> · נקודה קובעת בק"מ ${r.minAtKm.toFixed(1)}`;
}

function updateCards() {
  ['A', 'B'].forEach((w) => {
    const ant = state['antenna' + w];
    if (!ant) return;
    const known = !Number.isNaN(ant.groundElev);
    $(`ant${w}-coords`).textContent = `${ant.lat.toFixed(4)}, ${ant.lon.toFixed(4)}`;
    $(`ant${w}-ground`).textContent = known ? `${Math.round(ant.groundElev)} מ'` : '—';
    $(`ant${w}-eff`).textContent = known ? `${Math.round(effectiveHeight(ant))} מ'` : '—';
  });
}

function tipFor(which) {
  const ant = state['antenna' + which];
  if (!ant) return '';
  const base = which === state.observer ? 'משקיף · ' : '';
  const h = Number.isNaN(ant.groundElev) ? '…' : `${Math.round(effectiveHeight(ant))} מ'`;
  return `${base}${h}`;
}

// ---------- controls --------------------------------------------------------
function mastVal(which) {
  const v = parseFloat($(`ant${which}-mast`).value);
  return Number.isFinite(v) ? v : DEFAULT_MAST;
}

function wireMasts() {
  ['A', 'B'].forEach((w) => {
    $(`ant${w}-mast`).addEventListener('input', () => {
      const ant = state['antenna' + w];
      if (ant) { ant.mast = mastVal(w); updateCards(); recomputeLink(true); }
    });
  });
}

function wireFrequency() {
  const input = $('freq-input');
  const apply = () => {
    const mhz = parseInt(input.value, 10);
    if (!Number.isFinite(mhz) || mhz <= 0) return;
    update({ frequencyMHz: mhz });
    $('freq-ghz').textContent = fmtFreq(mhz);
    document.querySelectorAll('.preset').forEach((b) => b.classList.toggle('active', +b.dataset.mhz === mhz));
    recomputeLink(true);
  };
  input.addEventListener('input', apply);
  document.querySelectorAll('.preset').forEach((b) =>
    b.addEventListener('click', () => { input.value = b.dataset.mhz; apply(); }));
}

function wireObserver() {
  ['A', 'B'].forEach((w) => {
    $('obs-' + w).addEventListener('click', () => {
      update({ observer: w });
      $('obs-A').classList.toggle('active', w === 'A');
      $('obs-B').classList.toggle('active', w === 'B');
      const ant = state['antenna' + w];
      if (ant) mapCtl.setRing([ant.lat, ant.lon]);
      // move the "משקיף" badge to the chosen observer
      ['A', 'B'].forEach((x) => {
        const a = state['antenna' + x];
        if (a) mapCtl.setAntenna(x, [a.lat, a.lon], tipFor(x));
      });
    });
  });
}

// ---------- viewshed --------------------------------------------------------
async function runViewshed() {
  const obs = state['antenna' + state.observer];
  if (!obs) { setStatus('מקם קודם אנטנה למיקום המשקיף'); return; }
  if (Number.isNaN(obs.groundElev)) { setStatus('אין נתוני שטח במיקום המשקיף — בחר נקודה ביבשה'); return; }
  setStatus('');
  const otherAnt = state['antenna' + (state.observer === 'A' ? 'B' : 'A')];
  const rxMast = otherAnt ? otherAnt.mast : DEFAULT_MAST;
  $('vs-btn').disabled = true;
  showProgress(true, 'מתחיל…');
  try {
    const { stats } = await computeViewshed({
      map: mapCtl.map, observer: { ...obs }, rxMast,
      freqHz: freqHz(), fresnelPct: state.fresnelPct, onProgress,
    });
    $('vs-stats').innerHTML = stats.hasData
      ? `כיסוי קו ראייה: <b>${(stats.coverage * 100).toFixed(0)}%</b> מהשטח שנבדק (תורן מקבל ${rxMast} מ')`
      : 'אין נתוני שטח באזור — נסה מיקום אחר';
  } catch (e) {
    if (!e || e.message !== 'cancelled') setStatus('שגיאה בחישוב הכיסוי');
  } finally {
    $('vs-btn').disabled = false;
    showProgress(false);
  }
}

function onProgress(phase, frac) {
  const label = phase === 'tiles' ? 'טוען נתוני שטח' : phase === 'compute' ? 'מחשב קו ראייה' : 'מסיים';
  showProgress(true, `${label}… ${Math.round(frac * 100)}%`, frac);
}

function showProgress(on, text, frac) {
  const wrap = $('vs-progress');
  wrap.style.display = on ? 'block' : 'none';
  if (text != null) $('vs-progress-label').textContent = text;
  if (frac != null) $('vs-progress-bar').style.width = `${Math.round(frac * 100)}%`;
}

function setStatus(t) { $('status').textContent = t || ''; }

function fmtFreq(mhz) { return mhz >= 1000 ? `${(mhz / 1000).toFixed(2).replace(/\.?0+$/, '')} GHz` : `${mhz} MHz`; }
