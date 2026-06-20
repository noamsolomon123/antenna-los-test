// ui.js — wires the sidebar DOM, app state, map controller, link analysis and
// the viewshed compute together. The single controller for user interaction.
import { state, update, freqHz, DEFAULT_MAST } from './state.js';
import { analyzeLink, effectiveHeight } from './los.js';
import { distanceM } from './geo.js';
import { computeLinkBudget } from './linkbudget.js';
import { ensureCovered, elevation, elevationAt } from './terrain.js';
import { initMap } from './map.js';
import { computeViewshed, clearViewshed, cancelViewshed } from './viewshed.js';
import { renderProfile } from './profile-chart.js';
import { runScan, cancelScan } from './scan.js';
import { isSafe } from './safezone.js';
import { runExplore } from './explore.js';
import { initExploreView, openExploreView, closeExploreView, applyCarPreset } from './explore-view.js';
import { searchPlaces, reversePlace } from './geocode.js';
import { runNationalScan, cancelNationalScan, israelBBox } from './national.js';
import { renderNational } from './national-view.js';
import { closeDrawer } from './mobile.js';
import { minMastForClearance } from './optimize.js';
import { findRelaySites } from './relay.js';
import { encodeState, decodeState } from './permalink.js';
import { buildLinkKml } from './kml.js';
import { fetchBuildings, buildingHeightAt } from './buildings.js';
import { magneticDeclination, trueToMagnetic } from './declination.js';

const PROFILE_ZOOM = 12;
const $ = (id) => document.getElementById(id);
let mapCtl;
let linkTimer = null;
let linkToken = 0; // newest A↔B recompute wins; an older awaited one must not overwrite it
let scanMode = 'corridor';
let natScope = 'all';
let nationalActive = false; // while a national scan / its results are showing, lock manual antenna placement
let nationalRunning = false; // a scan is in flight — ignore re-entry (e.g. clicking the other scan button)
let natInfoToken = 0; // invalidates stale reverse-geocode fills when a newer site is clicked
let savedFileCache = null; // parsed data/national-israel.json, memoized so tab switches don't refetch
let toastTimer = null;
let includeBuildings = false; // when on, add OSM building heights to the LOS profile
let buildingsCache = { key: null, list: [] }; // memoized buildings for the current path box
let restoringPermalink = false; // suppress hash-writes while restoring from a shared link
const SOUTH_MAX_LAT = 31.5; // "south" = everything from ~Kiryat Gat / Beersheba southward (incl. the Negev)

export function initUI() {
  mapCtl = initMap('map', { onMapClick, onMove, onSelect: selectAntenna, onHover, onRemove: removeAntenna });
  wireFrequency();
  wireMasts();
  wireObserver();
  $('vs-btn').addEventListener('click', runViewshed);
  $('vs-clear').addEventListener('click', () => { cancelViewshed(); clearViewshed(mapCtl.map); $('vs-stats').textContent = ''; showProgress(false); });
  wireScan();
  wireExplore();
  wireNational();
  wireSearch();
  updateObserverNote();
  selectAntenna('A');
  renderVerdict(null);
  ['lb-tx', 'lb-gain', 'lb-sens'].forEach((id) => { const el = $(id); if (el) el.addEventListener('input', () => { renderBudget(); writeHash(); }); });
  ['A', 'B'].forEach((w) => { const el = $(`ant${w}-remove`); if (el) el.addEventListener('click', () => removeAntenna(w)); });
  // tools card
  $('opt-mast').addEventListener('click', optimizeMastUI);
  $('find-relay').addEventListener('click', findRelayUI);
  $('share-link').addEventListener('click', shareLinkUI);
  $('export-kml').addEventListener('click', exportKmlUI);
  $('bld-toggle').addEventListener('change', (e) => {
    includeBuildings = e.target.checked;
    buildingsCache = { key: null, list: [] };
    if (state.antennaA && state.antennaB) recomputeLink(true);
  });
  renderBudget();
  updateToolButtons();
  // a shared permalink takes priority over the first-visit national view
  const fromLink = restoreFromHash();
  // first visit (no shared link): open straight to the saved all-Israel results (instant "wow");
  // returning users keep the scan tab. The national-mode banner makes the locked map exitable.
  let firstVisit = false;
  try { firstVisit = !localStorage.getItem('nat-seen'); localStorage.setItem('nat-seen', '1'); } catch (_) {}
  if (firstVisit && !fromLink) setNatTab('saved');
  updateCoach();
  syncAria();
}

// mirror the color-only "active" state of every toggle group into aria-pressed so
// screen-reader / color-blind users know which option is selected
function syncAria() {
  document.querySelectorAll('.obs, .preset, .nat-tab').forEach((b) =>
    b.setAttribute('aria-pressed', b.classList.contains('active') ? 'true' : 'false'));
}

// ---------- national scan (auto-find best sites across Israel) --------------
function wireNational() {
  $('nat-scope-all').addEventListener('click', () => setNatScope('all'));
  $('nat-scope-south').addEventListener('click', () => setNatScope('south'));
  $('nat-scope-view').addEventListener('click', () => setNatScope('view'));
  $('national-btn').addEventListener('click', () => runNationalUI(false));
  $('national-hq-btn').addEventListener('click', () => runNationalUI(true));
  $('national-clear').addEventListener('click', () => {
    cancelNationalScan(); mapCtl.clearNational(); $('national-results').innerHTML = ''; showNationalProgress(false);
    setNationalMode(false); setStatus(''); hideTargetInfo();
  });
  $('nat-tab-scan').addEventListener('click', () => setNatTab('scan'));
  $('nat-tab-saved').addEventListener('click', () => setNatTab('saved'));
  $('nat-info-x').addEventListener('click', hideTargetInfo);
  $('nat-banner-x').addEventListener('click', () => setNatTab('scan')); // exit national mode -> placement
}

// switch between the live-scan controls and the saved all-Israel view (no re-scan)
function setNatTab(tab) {
  const saved = tab === 'saved';
  $('nat-tab-scan').classList.toggle('active', !saved);
  $('nat-tab-saved').classList.toggle('active', saved);
  syncAria();
  $('nat-scan-panel').hidden = saved;
  $('nat-saved-panel').hidden = !saved;
  cancelNationalScan();
  mapCtl.clearNational();
  $('national-results').innerHTML = '';
  showNationalProgress(false);
  setStatus('');
  hideTargetInfo();
  if (saved) loadSavedNational();
  else setNationalMode(false); // back to the scan tab — allow placing antennas again
}

// load the pre-computed all-Israel scan that ships with the app and render it instantly
async function loadSavedNational() {
  setNationalMode(true); // it's national results -> lock placement + enable click-away
  $('national-results').innerHTML = '<div class="muted">טוען תוצאות שמורות…</div>';
  // prefer the user's own saved all-Israel run (localStorage); fall back to the one
  // that ships with the app so there's always something to show on first visit.
  let res = null, src = '';
  try { const local = localStorage.getItem('nat-israel-saved'); if (local) { res = JSON.parse(local); src = 'שלך'; } } catch (_) {}
  if (!res && savedFileCache) { res = savedFileCache; src = 'ברירת מחדל'; }
  if (!res) {
    try {
      const r = await fetch('data/national-israel.json'); // static shipped asset — let the browser cache it
      if (r.ok) { res = await r.json(); savedFileCache = res; src = 'ברירת מחדל'; }
    } catch (_) {}
  }
  if (!res || !Array.isArray(res.sites)) {
    $('national-results').innerHTML = '<div class="muted">עדיין אין תוצאות שמורות. עבור ל"סריקה חדשה", בחר "כל ישראל" והרץ — הן יישמרו לפעם הבאה.</div>';
    return;
  }
  renderNational($('national-results'), res, { onFly: natFly });
  mapCtl.setNationalResults(res.sites, natFly);
  const meta = $('nat-saved-meta');
  if (meta) meta.textContent = (res.generatedAt ? ` · עודכן: ${String(res.generatedAt).slice(0, 10)}` : '') + ` (${src})`;
}

function setNatScope(s) {
  natScope = s;
  $('nat-scope-all').classList.toggle('active', s === 'all');
  $('nat-scope-south').classList.toggle('active', s === 'south');
  $('nat-scope-view').classList.toggle('active', s === 'view');
  syncAria();
}

// intersect a {south,west,north,east} box with the safe-Israel bbox
function clampToIsrael(box) {
  const il = israelBBox();
  return {
    south: Math.max(box.south, il.south), north: Math.min(box.north, il.north),
    west: Math.max(box.west, il.west), east: Math.min(box.east, il.east),
  };
}

async function runNationalUI(hq = false) {
  if (nationalRunning) return; // a scan is already in flight — don't start a second one
  // High-quality mode: denser grid + a much deeper confirm shortlist. Slower but
  // far more thorough — the user explicitly opted into an "even an hour" scan.
  if (hq) { $('nat-spacing').value = 1.5; $('nat-confirm').value = 800; }
  const spacing = clampNum($('nat-spacing').value, 3, 0.5, 15);
  const maxConfirm = clampNum($('nat-confirm').value, 60, 5, 2000);
  $('nat-spacing').value = spacing; $('nat-confirm').value = maxConfirm;
  let bbox;
  if (natScope === 'south') {
    const il = israelBBox();
    bbox = { south: il.south, west: il.west, north: SOUTH_MAX_LAT, east: il.east };
  } else if (natScope === 'view') {
    const b = mapCtl.map.getBounds();
    bbox = clampToIsrael({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
    if (!(bbox.south < bbox.north && bbox.west < bbox.east)) { setStatus('התצוגה הנוכחית מחוץ לישראל — הזז את המפה'); return; }
  }
  setStatus('');
  mapCtl.clearNational();
  setNationalMode(true); // entering national-scan mode — manual antenna placement is locked
  const scopeNote = natScope === 'south' ? 'את דרום הארץ' : natScope === 'view' ? 'באזור התצוגה' : 'את כל ישראל';
  const slow = hq || maxConfirm > 150;
  const timeNote = slow ? 'זה יכול לקחת 10–40 דקות (בדיקה איכותית ויסודית)' : 'זה יכול לקחת 1–3 דקות';
  $('national-results').innerHTML =
    `<div class="muted">🔍 סורק ${scopeNote}${hq ? ' באיכות גבוהה' : ''}… עוקב אחרי ההתקדמות למעלה. ${timeNote}. השאר את הדף פתוח.</div>`;
  nationalRunning = true;
  $('national-btn').disabled = true; $('national-hq-btn').disabled = true;
  showNationalProgress(true, 'מתחיל…', 0);
  try {
    const res = await runNationalScan({
      bbox, gridSpacingKm: spacing, maxConfirm,
      freqHz: freqHz(), fresnelPct: state.fresnelPct, onProgress: onNationalProgress,
    });
    renderNational($('national-results'), res, { onFly: natFly });
    mapCtl.setNationalResults(res.sites, natFly);
    // remember a full all-Israel run so the "saved" tab can show it instantly next time
    if (natScope === 'all') {
      try { res.generatedAt = new Date().toISOString(); localStorage.setItem('nat-israel-saved', JSON.stringify(res)); } catch (_) {}
    }
  } catch (e) {
    $('national-results').innerHTML = '';
    const msg = e && e.message;
    if (msg === 'cancelled') { /* superseded / user cancelled — quiet */ }
    else if (msg === 'empty-bbox') setStatus('האזור שנבחר ריק — הזז את המפה ונסה שוב');
    else setStatus('שגיאה בסריקה הארצית — נסה שוב');
  } finally {
    nationalRunning = false;
    $('national-btn').disabled = false; $('national-hq-btn').disabled = false;
    showNationalProgress(false);
  }
}

function natFly(s) {
  closeDrawer(); // on mobile, reveal the map
  // A full result site (has its band targets) -> draw the observer + every 30/40/50 km
  // point it found, with connecting lines, and fit the view so the layout is visible.
  // A bare {lat,lon} (a single target row) -> just fly to and highlight that point.
  if (s && Array.isArray(s.bands)) {
    mapCtl.showNationalSite(s);
    mapCtl.highlightExplore([s.lat, s.lon]);
    selectNationalCard(s); // keep the sidebar list and the map in sync
    showTargetInfo(s);     // small bottom-right panel: where each band target is
  } else {
    mapCtl.flyTo([s.lat, s.lon], 13);
    mapCtl.highlightExplore([s.lat, s.lon]);
  }
}

// small bottom-right panel naming where each 30/40/50 km target lands (reverse-geocoded)
async function showTargetInfo(site) {
  const panel = $('nat-info'), body = $('nat-info-body');
  if (!panel || !body) return;
  const found = (site.bands || []).filter((b) => b.found && Number.isFinite(b.lat) && Number.isFinite(b.lon));
  if (!found.length) { hideTargetInfo(); return; }
  panel.hidden = false;
  body.innerHTML = found.map((b) => `<div class="nr" data-km="${b.km}">≈${b.km} ק"מ · <span class="nk">טוען…</span></div>`).join('');
  const token = (natInfoToken += 1); // a newer click bumps this and stops stale fills
  for (let i = 0; i < found.length; i++) {
    const b = found[i];
    if (i > 0) await new Promise((r) => setTimeout(r, 350)); // ~respect Nominatim's rate policy
    if (token !== natInfoToken) return;
    let place = '';
    try { place = await reversePlace(b.lat, b.lon); } catch (_) {}
    if (token !== natInfoToken) return;
    const el = body.querySelector(`.nr[data-km="${b.km}"] .nk`);
    if (el) el.textContent = place || `${b.lat.toFixed(3)}, ${b.lon.toFixed(3)}`;
  }
}

function hideTargetInfo() {
  natInfoToken += 1; // invalidate any in-flight geocode fills
  const p = $('nat-info');
  if (p) p.hidden = true;
}

// highlight the result card matching a site (whether the click came from the list or a
// map pin) and bring it into view — ties the two together so it feels like one thing
function selectNationalCard(s) {
  const el = $('national-results');
  el.querySelectorAll('.scard.nat.sel').forEach((c) => c.classList.remove('sel'));
  const tag = `${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`;
  const card = [...el.querySelectorAll('.scard.nat')].find((c) => {
    const co = c.querySelector('.nrow-main .coords');
    return co && co.textContent.trim() === tag;
  });
  if (card) { card.classList.add('sel'); card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
}

// national-scan mode: lock manual antenna placement so map clicks don't drop pins
function setNationalMode(on) {
  nationalActive = on;
  document.body.classList.toggle('nat-mode', on);
  const banner = $('nat-banner');
  if (banner) banner.hidden = !on; // persistent "you're in national mode — exit here" banner
  updateCoach();
}

function onNationalProgress(phase, frac, info) {
  const label =
    phase === 'grid' ? 'בונה רשת נקודות'
    : phase === 'prefilter-tiles' ? 'טוען נתוני שטח'
    : phase === 'prefilter-score' ? 'מדרג נקודות תצפית'
    : phase === 'confirm' ? `בודק לעומק ${info ? `${info.i}/${info.total}` : ''} · נמצאו ${info ? info.found : 0}`
    : phase === 'roads' ? 'בודק נגישות לכבישים (שלב איטי)'
    : 'מסיים';
  showNationalProgress(true, frac != null ? `${label} · ${Math.round(frac * 100)}%` : label, frac);
}

function showNationalProgress(on, text, frac) {
  $('national-progress').style.display = on ? 'block' : 'none';
  if (text != null) $('national-progress-label').textContent = text;
  if (frac != null) $('national-progress-bar').style.width = `${Math.round(frac * 100)}%`;
}

function clampNum(raw, fallback, min, max) {
  const v = parseFloat(raw);
  return Number.isFinite(v) ? Math.min(Math.max(v, min), max) : fallback;
}

// ---------- place search ----------------------------------------------------
function wireSearch() {
  const input = $('place-search');
  const box = $('search-results');
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const q = input.value.trim();
    if (q.length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="sresult msg">מחפש…</div>';
    let results = [];
    try { results = await searchPlaces(q); } catch (_) { /* network */ }
    if (!results.length) { box.innerHTML = '<div class="sresult msg">לא נמצאו תוצאות</div>'; return; }
    box.innerHTML = '';
    results.forEach((r) => {
      const div = document.createElement('div');
      div.className = 'sresult';
      div.textContent = r.name;
      div.addEventListener('click', () => { mapCtl.showFoundLocation([r.lat, r.lon], r.name.split(',')[0]); box.innerHTML = ''; });
      box.appendChild(div);
    });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.searchbox')) box.innerHTML = ''; });
}

// ---------- explore (all LOS points) ---------------------------------------
function wireExplore() {
  initExploreView({ onFly: exploreFly, onPick: explorePick });
  $('explore-btn').addEventListener('click', () => runExploreUI(false));
  $('explore-car-btn').addEventListener('click', () => runExploreUI(true));
}

function exploreFly(c) { mapCtl.flyTo([c.lat, c.lon], 13); mapCtl.highlightExplore([c.lat, c.lon]); }

function explorePick(c) {
  const target = state.observer === 'A' ? 'B' : 'A';
  placeAntenna(target, { lat: c.lat, lng: c.lon });
  closeExploreView();
  mapCtl.flyTo([c.lat, c.lon], 13);
}

async function runExploreUI(carPreset) {
  const obs = state['antenna' + state.observer];
  if (!obs) { setStatus('מקם קודם אנטנה למיקום המשקיף'); return; }
  if (Number.isNaN(obs.groundElev)) { setStatus('אין נתוני שטח במיקום המשקיף — בחר נקודה ביבשה'); return; }
  const rxMast = mastVal(state.observer === 'A' ? 'B' : 'A');
  setStatus('');
  $('explore-btn').disabled = true;
  $('explore-car-btn').disabled = true;
  showExploreProgress(true, 'מתחיל…', 0);
  try {
    const res = await runExplore({ observer: { ...obs }, rxMast, freqHz: freqHz(), fresnelPct: state.fresnelPct, onProgress: onExploreProgress });
    if (!res.candidates.length) { setStatus('לא נמצאו נקודות קו ראייה בטוחות באזור'); return; }
    mapCtl.setExploreResults(res.observer, res.candidates, explorePick);
    openExploreView(res.candidates);
    if (carPreset) applyCarPreset(); // open already filtered to car-accessible spots
  } catch (e) {
    const msg = e && e.message;
    if (msg === 'cancelled') { /* superseded — quiet */ }
    else if (msg === 'observer-no-data') setStatus('אין נתוני שטח במיקום המשקיף');
    else setStatus('שגיאה בחישוב הנקודות');
  } finally {
    $('explore-btn').disabled = false;
    $('explore-car-btn').disabled = false;
    showExploreProgress(false);
  }
}

function onExploreProgress(phase, frac) {
  if (phase === 'roads') { showExploreProgress(true, 'טוען כבישים…'); return; }
  const label = phase === 'tiles' ? 'טוען נתוני שטח' : phase === 'compute' ? 'מחשב קו ראייה' : 'מסיים';
  showExploreProgress(true, `${label}… ${Math.round(frac * 100)}%`, frac);
}

function showExploreProgress(on, text, frac) {
  $('explore-progress').style.display = on ? 'block' : 'none';
  if (text != null) $('explore-progress-label').textContent = text;
  if (frac != null) $('explore-progress-bar').style.width = `${Math.round(frac * 100)}%`;
}

// ---------- automated scan -------------------------------------------------
function wireScan() {
  $('scan-mode-corridor').addEventListener('click', () => setScanMode('corridor'));
  $('scan-mode-best').addEventListener('click', () => setScanMode('best'));
  $('scan-btn').addEventListener('click', runScanUI);
  $('scan-clear').addEventListener('click', () => { cancelScan(); mapCtl.clearScan(); $('scan-results').innerHTML = ''; showScanProgress(false); });
}

function setScanMode(m) {
  scanMode = m;
  $('scan-mode-corridor').classList.toggle('active', m === 'corridor');
  $('scan-mode-best').classList.toggle('active', m === 'best');
  syncAria();
}

function updateObserverNote() {
  const note = $('scan-observer-note');
  if (note) note.innerHTML = `סורק מאנטנה <b>${state.observer}</b> · מוצא נקודות קו ראייה במרחקי היעד.`;
}

// stale coverage/scan belong to the previous observer/position — drop them
function invalidateObserverDependent() {
  cancelViewshed(); clearViewshed(mapCtl.map); $('vs-stats').textContent = ''; showProgress(false);
  cancelScan(); mapCtl.clearScan(); $('scan-results').innerHTML = ''; showScanProgress(false);
  mapCtl.clearExplore(); closeExploreView();
}

// returns { dists (clean, deduped, sorted), droppedCount (invalid / >50 km tokens) }
function parseDistances() {
  const raw = ($('scan-dists').value || '').split(',').map((s) => s.trim()).filter((s) => s.length);
  const nums = raw.map((s) => parseFloat(s)).filter((n) => Number.isFinite(n) && n > 0 && n <= 50);
  const dists = [...new Set(nums.map((n) => Math.round(n * 10) / 10))].sort((a, b) => a - b);
  return { dists, droppedCount: raw.length - nums.length };
}

async function runScanUI() {
  const obs = state['antenna' + state.observer];
  if (!obs) { setStatus('מקם קודם אנטנה למיקום המשקיף'); return; }
  if (Number.isNaN(obs.groundElev)) { setStatus('אין נתוני שטח במיקום המשקיף — בחר נקודה ביבשה'); return; }
  const { dists, droppedCount } = parseDistances();
  if (!dists.length) { setStatus('הזן מרחקי יעד תקינים עד 50 ק"מ (למשל 30, 40, 50)'); return; }
  setStatus(droppedCount > 0 ? 'התעלמתי מערכים לא תקינים או מעל 50 ק"מ' : '');
  const rawTol = parseFloat($('scan-tol').value);
  const tol = Number.isFinite(rawTol) ? Math.min(Math.max(rawTol, 1), 20) : 3;
  $('scan-tol').value = tol; // reflect the clamped value
  // receiver mast = the other antenna's mast field (editable even before it's placed)
  const rxMast = mastVal(state.observer === 'A' ? 'B' : 'A');
  $('scan-btn').disabled = true;
  showScanProgress(true, 'מתחיל…', 0);
  try {
    const res = await runScan({
      observer: { ...obs }, distancesKm: dists, toleranceKm: tol, rxMast,
      freqHz: freqHz(), fresnelPct: state.fresnelPct, mode: scanMode, onProgress: onScanProgress,
    });
    mapCtl.setScanResults(res.observer, res.points, res.corridorAz, pickScanPoint); // snapshot origin
    renderScanResults(res);
  } catch (e) {
    const msg = e && e.message;
    if (msg === 'cancelled') { /* superseded — stay quiet */ }
    else if (msg === 'observer-no-data') setStatus('אין נתוני שטח במיקום המשקיף');
    else if (msg === 'terrain-unavailable') setStatus('שגיאת רשת — נתוני השטח לא נטענו, נסה שוב');
    else setStatus('שגיאה בסריקה');
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
    const verdict = p.clear ? '✓ קו ראייה' : '✗ חסום';
    const est = p.confirmed ? '' : ' <span class="est" title="הבדיקה המדויקת לא הושלמה (אין נתוני שטח לכל המסלול) — תוצאה מהסריקה הגסה">(משוער)</span>';
    el.insertAdjacentHTML('beforeend', `
      <div class="scard ${cls}" data-i="${i}">
        <div class="srow"><span class="snum">${num}</span> <b>≈${p.nominalKm} ק"מ</b> · <span class="${cls}">${verdict}</span>${est}</div>
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
  if (nationalActive) {
    // a click on empty map "lets go" of the focused site (clears its target fan), so
    // you're not stuck on one point. Manual antenna placement stays locked.
    const had = mapCtl.clearNationalFocus();
    document.querySelectorAll('#national-results .scard.nat.sel').forEach((c) => c.classList.remove('sel'));
    hideTargetInfo();
    setStatus(had ? '' : 'מצב סריקה ארצית פעיל — מיקום אנטנה בלחיצה מושבת. לחץ "נקה תוצאות" כדי לחזור.');
    return;
  }
  if (!state.antennaA) placeAntenna('A', latlng);
  else if (!state.antennaB) placeAntenna('B', latlng);
  else placeAntenna(mapCtl.getSelected(), latlng);
}

// warn (don't block) if a manually-placed antenna is outside safe Israel
function warnIfUnsafe(which, lat, lon) {
  const el = $(`ant${which}-warn`);
  if (el) el.textContent = isSafe(lat, lon) ? '' : '⚠️ מחוץ לשטח בטוח לנסיעה (יו"ש / עזה / מדינה שכנה)';
}

function placeAntenna(which, latlng) {
  const mast = mastVal(which);
  const ant = { lat: latlng.lat, lon: latlng.lng, groundElev: NaN, mast }; // unknown until terrain resolves
  update({ ['antenna' + which]: ant });
  warnIfUnsafe(which, ant.lat, ant.lon);
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
  if (which === state.observer) invalidateObserverDependent();
  if (which === 'A' && !state.antennaB) selectAntenna('B');
  updateCards();
  updateCoach(); // advance the "place A → place B → done" hint
  recomputeLink(true);
}

// Remove a placed antenna entirely (not just move it): drop its pin, clear its card,
// and let the next map click re-place it. Clears the link/verdict/budget since one end is gone.
function removeAntenna(which) {
  if (!state['antenna' + which]) return;
  update({ ['antenna' + which]: null });
  mapCtl.removeAntenna(which);
  $(`ant${which}-coords`).textContent = '— , —';
  $(`ant${which}-ground`).textContent = '—';
  $(`ant${which}-eff`).textContent = '—';
  $(`ant${which}-warn`).textContent = '';
  if (which === state.observer) { mapCtl.setRing(null); invalidateObserverDependent(); }
  selectAntenna(which); // next click re-places this one
  updateCards();
  recomputeLink(true); // both-ends check inside clears verdict/profile/budget/link
  updateCoach();
}

function onMove(which, latlng, ended) {
  const ant = state['antenna' + which];
  if (!ant) return;
  ant.lat = latlng.lat; ant.lon = latlng.lng;
  if (which === state.observer) mapCtl.setRing([ant.lat, ant.lon]);
  if (ended) {
    warnIfUnsafe(which, ant.lat, ant.lon);
    if (which === state.observer) invalidateObserverDependent();
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
  if (!a || !b) { renderVerdict(null); renderBudget(); $('profile').innerHTML = ''; mapCtl.drawLink(null, null); mapCtl.clearRelays(); setToolResult(''); afterChange(); return; }
  const my = ++linkToken; // guards the async path below against an older recompute finishing late
  if (ensure) {
    setStatus('טוען נתוני שטח…');
    await ensureCovered(pathBox(a, b), PROFILE_ZOOM);
    if (my !== linkToken || state.antennaA !== a || state.antennaB !== b) return; // superseded by a newer move
    if (!(await ensureBuildings(a, b, my))) return; // optional OSM building heights
    if (my !== linkToken) return;
    setStatus('');
    a.groundElev = elevation(a.lat, a.lon, PROFILE_ZOOM);
    b.groundElev = elevation(b.lat, b.lon, PROFILE_ZOOM);
    updateCards();
  }
  if (Number.isNaN(a.groundElev) || Number.isNaN(b.groundElev)) {
    renderVerdict({ noStationData: true });
    renderBudget();
    $('profile').innerHTML = '';
    mapCtl.drawLink(L.latLng(a.lat, a.lon), L.latLng(b.lat, b.lon), false);
    afterChange();
    return;
  }
  const result = analyzeLink({
    a, b, freqHz: freqHz(), fresnelPct: state.fresnelPct,
    sampleElev: makeSampleElev(),
  });
  update({ link: result });
  renderVerdict(result);
  renderBudget();
  renderProfile($('profile'), result);
  mapCtl.drawLink(L.latLng(a.lat, a.lon), L.latLng(b.lat, b.lon), result.clear);
  mapCtl.setAntenna('A', [a.lat, a.lon], tipFor('A'));
  mapCtl.setAntenna('B', [b.lat, b.lon], tipFor('B'));
  mapCtl.clearRelays();
  updateCards();
  afterChange();
}

// run after any change that affects the link: refresh tool button states + share URL
function afterChange() { updateToolButtons(); writeHash(); }

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
  const card = document.querySelector('.verdict');
  const setCardState = (s) => { if (card) { card.classList.toggle('is-yes', s === 'yes'); card.classList.toggle('is-no', s === 'no'); } };
  const setNeutral = (msg) => { big.textContent = msg; big.className = 'big neutral'; $('v-clearance').textContent = ''; setCardState(null); };
  if (!r) {
    $('v-dist').textContent = '—'; $('v-az').textContent = '—';
    setNeutral('מקם אנטנה A ו-B במפה');
    return;
  }
  if (r.noStationData) { setNeutral('אין נתוני שטח במיקום אחת התחנות — בחר נקודה ביבשה'); return; }
  $('v-dist').textContent = r.distanceKm.toFixed(1) + ' ק"מ';
  const oLat = state.antennaA ? state.antennaA.lat : 31.5;
  const oLon = state.antennaA ? state.antennaA.lon : 35.0;
  $('v-az').textContent = `${r.bearingDeg.toFixed(0)}° אמת · ${trueToMagnetic(r.bearingDeg, oLat, oLon).toFixed(0)}° מצפן`;
  $('v-freq').textContent = fmtFreq(state.frequencyMHz);
  if (!r.hasData) { setNeutral('— אין נתוני שטח —'); return; }
  if (r.dataFraction < 0.8) { setNeutral(`נתונים חלקיים (${Math.round(r.dataFraction * 100)}%) — לא ניתן לקבוע`); return; }
  big.textContent = r.clear ? '✓ יש קו ראייה — כן' : '✗ אין קו ראייה — לא';
  big.className = 'big ' + (r.clear ? 'yes' : 'no');
  setCardState(r.clear ? 'yes' : 'no');
  $('v-clearance').innerHTML =
    `מרווח פרנל מינימלי: <b>${r.minMargin.toFixed(1)} מ'</b> · נקודה קובעת בק"מ ${r.minAtKm.toFixed(1)}`;
}

const LB_Q = {
  strong: ['lb-strong', 'חזק'], ok: ['lb-ok', 'שמיש'],
  weak: ['lb-weak', 'חלש'], none: ['lb-none', 'לא נסגר'], unknown: ['lb-none', '—'],
};
function readBudgetInputs() {
  const num = (id, d) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : d; };
  const gain = num('lb-gain', 20);
  return {
    txPowerDbm: num('lb-tx', 20), txGainDbi: gain, txCableLossDb: 0.5,
    rxGainDbi: gain, rxCableLossDb: 0.5, extraLossDb: 0, rxSensitivityDbm: num('lb-sens', -85),
  };
}
// Free-space link budget for the current A↔B distance + frequency. Independent of
// terrain (the LOS card covers blockage); shown whenever both antennas are placed.
function renderBudget() {
  const el = $('lb-result');
  if (!el) return;
  const a = state.antennaA, b = state.antennaB;
  if (!a || !b) { el.className = 'lb-result muted'; el.textContent = 'מקם אנטנה A ו-B כדי לחשב תקציב קישור'; return; }
  const distKm = distanceM([a.lat, a.lon], [b.lat, b.lon]) / 1000;
  const link = state.link;
  const sameLink = link && link.distanceKm != null && Math.abs(link.distanceKm - distKm) < 0.05;
  const diff = sameLink && Number.isFinite(link.diffractionLossDb) ? link.diffractionLossDb : 0;
  const r = computeLinkBudget({ ...readBudgetInputs(), extraLossDb: diff, freqMHz: state.frequencyMHz, distKm });
  const [cls, label] = LB_Q[r.quality] || LB_Q.unknown;
  el.className = 'lb-result';
  el.innerHTML =
    `<div class="lb-pill ${cls}">קישור ${label} · מרווח דהייה ${r.fadeMarginDb.toFixed(1)} dB</div>` +
    '<div class="lb-grid">' +
    `<span>EIRP: <b>${r.eirp.toFixed(1)} dBm</b></span>` +
    `<span>אובדן מסלול: <b>${r.fspl.toFixed(1)} dB</b></span>` +
    (diff > 0.1 ? `<span>אובדן עקיפה: <b>${diff.toFixed(1)} dB</b></span>` : '') +
    `<span>הספק נקלט: <b>${r.rxPowerDbm.toFixed(1)} dBm</b></span>` +
    `<span>טווח מקס': <b>${r.maxRangeKm.toFixed(1)} ק"מ</b></span>` +
    '</div>' +
    `<div class="lb-note">${diff > 0.1
      ? 'כולל אובדן עקיפה (knife-edge) מהמכשול הדומיננטי בנתיב. גשם/קלאטר עדיין לא נכללים.'
      : 'קירוב שטח חופשי (FSPL). חסימות נבדקות בכרטיס קו הראייה.'}</div>`;
}

// ---------- terrain sampler (optionally augmented with OSM building heights) --------
function makeSampleElev() {
  const blds = includeBuildings ? buildingsCache.list : null;
  if (blds && blds.length) {
    return (la, lo) => { const g = elevation(la, lo, PROFILE_ZOOM); return Number.isNaN(g) ? g : g + buildingHeightAt(la, lo, blds); };
  }
  return (la, lo) => elevation(la, lo, PROFILE_ZOOM);
}

// Fetch OSM building footprints+heights for the current A↔B corridor (cached per box).
// Skipped for long paths (few buildings, big query) to stay responsive.
async function ensureBuildings(a, b, guardToken) {
  if (!includeBuildings) { buildingsCache = { key: null, list: [] }; return true; }
  const distKm = distanceM([a.lat, a.lon], [b.lat, b.lon]) / 1000;
  if (distKm > 25) { buildingsCache = { key: 'toolong', list: [] }; return true; }
  const box = pathBox(a, b);
  const key = `${box.south.toFixed(3)},${box.west.toFixed(3)},${box.north.toFixed(3)},${box.east.toFixed(3)}`;
  if (buildingsCache.key === key) return true;
  setStatus('טוען גובה מבנים…');
  try {
    const list = await fetchBuildings(box);
    if (guardToken !== linkToken) return false;
    buildingsCache = { key, list };
  } catch (_) { buildingsCache = { key, list: [] }; }
  return true;
}

// ---------- tools: enable/disable + handlers --------------------------------
function updateToolButtons() {
  const both = !!(state.antennaA && state.antennaB);
  ['opt-mast', 'export-kml'].forEach((id) => { const el = $(id); if (el) el.disabled = !both; });
  const blocked = both && state.link && state.link.hasData && !state.link.clear;
  const relay = $('find-relay'); if (relay) relay.disabled = !blocked;
}
function setToolResult(html) { const el = $('tool-result'); if (el) el.innerHTML = html || ''; }

async function optimizeMastUI() {
  const a = state.antennaA, b = state.antennaB;
  if (!a || !b) return;
  setToolResult('<div class="tr-head">מחשב גובה תורן…</div>');
  await ensureCovered(pathBox(a, b), PROFILE_ZOOM);
  const sampleElev = makeSampleElev();
  const opts = { freqHz: freqHz(), fresnelPct: state.fresnelPct, sampleElev, maxMast: 120 };
  const hA = minMastForClearance({ a, b, side: 'A', ...opts });
  const hB = minMastForClearance({ a, b, side: 'B', ...opts });
  const fmt = (h, w) => h === null ? `צד ${w}: לא נפתח עד 120 מ׳` : h === 0 ? `צד ${w}: כבר פנוי ✓` : `הרם צד ${w} ל-<b>${h} מ׳</b>`;
  setToolResult(`<div class="tr-head">📐 גובה תורן מינימלי לפתיחת הקו</div><div class="tr-row">${fmt(hA, 'A')}</div><div class="tr-row">${fmt(hB, 'B')}</div>`);
}

async function findRelayUI() {
  const a = state.antennaA, b = state.antennaB;
  if (!a || !b) return;
  setToolResult('<div class="tr-head">מחפש אתר ממסר… (מספר שניות)</div>');
  const pad = 0.1;
  const box = { south: Math.min(a.lat, b.lat) - pad, north: Math.max(a.lat, b.lat) + pad, west: Math.min(a.lon, b.lon) - pad, east: Math.max(a.lon, b.lon) + pad };
  await ensureCovered(box, PROFILE_ZOOM);
  const sampleElev = (la, lo) => elevation(la, lo, PROFILE_ZOOM);
  const sites = findRelaySites({ a, b, freqHz: freqHz(), fresnelPct: state.fresnelPct, sampleElev, relayMast: 10, gridStepKm: 1, padKm: 2.5, maxResults: 5, maxTest: 260, safe: isSafe });
  if (!sites.length) { mapCtl.clearRelays(); setToolResult('<div class="tr-head">🛰️ לא נמצא אתר ממסר אוטומטי</div><div class="tr-row">נסה להרחיק/להזיז את הנקודות או להגביה תורן.</div>'); return; }
  mapCtl.showRelays(sites);
  const rows = sites.map((s, i) =>
    `<div class="tr-row">#${i + 1} <b>${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}</b> · גובה ${Math.round(s.groundElev)} מ׳ · מרווח ${Math.min(s.marginA, s.marginB).toFixed(0)} מ׳ ` +
    `<a href="https://www.google.com/maps?q=${s.lat},${s.lon}" target="_blank" rel="noopener">🗺️</a></div>`).join('');
  setToolResult(`<div class="tr-head">🛰️ אתרי ממסר (רואים את A ואת B)</div>${rows}`);
}

async function shareLinkUI() {
  const url = location.origin + location.pathname + '#' + currentHash();
  try { await navigator.clipboard.writeText(url); showToast('הקישור הועתק ללוח 📋'); }
  catch (_) { showToast('העתק ידנית: ' + url); }
}

function exportKmlUI() {
  const a = state.antennaA, b = state.antennaB;
  if (!a || !b) return;
  const link = state.link;
  const kml = buildLinkKml({
    a, b,
    distanceKm: link ? link.distanceKm : distanceM([a.lat, a.lon], [b.lat, b.lon]) / 1000,
    clear: link ? link.clear : false, freqMHz: state.frequencyMHz,
  });
  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url; el.download = 'antenna-link.kml';
  document.body.appendChild(el); el.click(); el.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('קובץ KML הורד ⬇️');
}

// ---------- shareable permalink ---------------------------------------------
function currentBudget() {
  const num = (id, d) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : d; };
  return { tx: num('lb-tx', 20), gain: num('lb-gain', 20), sens: num('lb-sens', -85) };
}
function currentHash() {
  return encodeState({ antennaA: state.antennaA, antennaB: state.antennaB, frequencyMHz: state.frequencyMHz, observer: state.observer, budget: currentBudget() });
}
function writeHash() {
  if (restoringPermalink) return;
  const h = currentHash();
  try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch (_) {}
}
function restoreFromHash() {
  const d = decodeState(location.hash);
  if (!d.antennaA && !d.antennaB && !d.frequencyMHz) return false;
  restoringPermalink = true;
  if (d.frequencyMHz) {
    update({ frequencyMHz: d.frequencyMHz });
    $('freq-input').value = d.frequencyMHz; $('freq-ghz').textContent = fmtFreq(d.frequencyMHz);
    document.querySelectorAll('.preset').forEach((bn) => bn.classList.toggle('active', +bn.dataset.mhz === d.frequencyMHz));
  }
  if (d.budget) { $('lb-tx').value = d.budget.tx; $('lb-gain').value = d.budget.gain; $('lb-sens').value = d.budget.sens; }
  if (d.observer) { update({ observer: d.observer }); $('obs-A').classList.toggle('active', d.observer === 'A'); $('obs-B').classList.toggle('active', d.observer === 'B'); }
  if (d.antennaA) { $('antA-mast').value = d.antennaA.mast; placeAntenna('A', L.latLng(d.antennaA.lat, d.antennaA.lon)); }
  if (d.antennaB) { $('antB-mast').value = d.antennaB.mast; placeAntenna('B', L.latLng(d.antennaB.lat, d.antennaB.lon)); }
  restoringPermalink = false;
  return true;
}

function updateCards() {
  ['A', 'B'].forEach((w) => {
    const ant = state['antenna' + w];
    const rm = $(`ant${w}-remove`); if (rm) rm.hidden = !ant;
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
    syncAria();
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
      syncAria();
      const ant = state['antenna' + w];
      if (ant) mapCtl.setRing([ant.lat, ant.lon]);
      // move the "משקיף" badge to the chosen observer
      ['A', 'B'].forEach((x) => {
        const a = state['antenna' + x];
        if (a) mapCtl.setAntenna(x, [a.lat, a.lon], tipFor(x));
      });
      invalidateObserverDependent(); // prior coverage/scan belonged to the old observer
      updateObserverNote();
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

function setStatus(t) {
  $('status').textContent = t || '';
  // surface real feedback as an on-map toast too (the sidebar #status is off-screen on
  // mobile and below the fold on desktop). Skip routine loading messages (they end with …).
  if (t && !t.endsWith('…')) showToast(t);
}

function showToast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
}

// first-run map coachmark guiding the click-to-place flow (hidden in national mode)
function updateCoach() {
  const c = $('coach');
  if (!c) return;
  if (nationalActive) { c.hidden = true; return; }
  if (!state.antennaA) { c.textContent = '👆 לחץ במפה כדי למקם אנטנה A'; c.hidden = false; }
  else if (!state.antennaB) { c.textContent = '👆 לחץ במפה כדי למקם אנטנה B'; c.hidden = false; }
  else c.hidden = true;
}

function fmtFreq(mhz) { return mhz >= 1000 ? `${(mhz / 1000).toFixed(2).replace(/\.?0+$/, '')} GHz` : `${mhz} MHz`; }
