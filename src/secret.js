// secret.js — hidden walkthrough finder. From one observer, find car-accessible,
// safe LOS spots near 30/40/50 km and step through them one-by-one.
// Reuses the explore engine (margin grid -> curate -> roads -> safe).
import { runExplore } from './explore.js';
import { searchPlaces } from './geocode.js';

const BANDS = [30, 40, 50];
const TOL_KM = 3;        // a point "at 40 km" = 37–43 km
const MAX_ROAD_M = 1000; // car-accessible: within 1 km of a road
const $ = (id) => document.getElementById(id);
const roadFmt = (m) => (m == null ? '—' : m < 1000 ? `${Math.round(m)} מ'` : `${(m / 1000).toFixed(1)} ק"מ`);

let map, observer = null, obsMarker = null, pointMarkers = [], highlight = null;
let found = [], idx = 0;

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([31.0, 34.9], 8);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Esri World Imagery' }).addTo(map);
  map.on('click', (e) => placeObserver(e.latlng));
}

function placeObserver(latlng) {
  observer = { lat: latlng.lat, lon: latlng.lng, mast: 3, groundElev: 0 };
  if (obsMarker) map.removeLayer(obsMarker);
  obsMarker = L.marker([observer.lat, observer.lon], {
    icon: L.divIcon({ className: '', html: '<div style="background:#e74c3c;color:#fff;font-weight:800;font-size:12px;padding:2px 9px;border-radius:999px;white-space:nowrap">📡 משקיף</div>', iconSize: [72, 24], iconAnchor: [36, 24] }),
    zIndexOffset: 1000,
  }).addTo(map);
  $('obs-coords').textContent = `${observer.lat.toFixed(4)}, ${observer.lon.toFixed(4)}`;
  $('search-btn').disabled = false;
}

function wireObserverSearch() {
  const input = $('obs-search'), box = $('obs-results');
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    if (input.value.trim().length < 2) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="sresult msg">מחפש…</div>';
    let results = [];
    try { results = await searchPlaces(input.value); } catch (_) { /* network */ }
    if (!results.length) { box.innerHTML = '<div class="sresult msg">לא נמצאו תוצאות</div>'; return; }
    box.innerHTML = '';
    results.forEach((r) => {
      const d = document.createElement('div');
      d.className = 'sresult';
      d.textContent = r.name;
      d.onclick = () => { placeObserver({ lat: r.lat, lng: r.lon }); map.flyTo([r.lat, r.lon], 12); box.innerHTML = ''; };
      box.appendChild(d);
    });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.searchbox')) box.innerHTML = ''; });
}

function bandOf(c) {
  return BANDS.reduce((best, b) => (Math.abs(c.distanceKm - b) < Math.abs(c.distanceKm - best) ? b : best), BANDS[0]);
}

async function runSearch() {
  if (!observer) { return; }
  $('search-btn').disabled = true;
  $('presenter').innerHTML = '';
  $('results').innerHTML = '';
  showProgress(true, 'מתחיל…', 0);
  try {
    const res = await runExplore({ observer: { ...observer }, rxMast: 3, freqHz: 5.8e9, fresnelPct: 0.6, onProgress });
    found = res.candidates.filter((c) =>
      c.roadDistM != null && c.roadDistM <= MAX_ROAD_M &&
      BANDS.some((b) => Math.abs(c.distanceKm - b) <= TOL_KM));
    found.forEach((c) => { c.band = bandOf(c); });
    found.sort((a, b) => a.band - b.band || b.marginM - a.marginM);
    renderMarkers();
    renderList();
    if (found.length) present(0);
    else $('presenter').innerHTML = '<div class="card"><div class="muted">לא נמצאו נקודות נגישות לרכב במרחקי 30/40/50 ק"מ. בתורן 3 מ\' קו הראייה מוגבל — נסה משקיף גבוה יותר, או מיקום/כיוון אחר.</div></div>';
  } catch (e) {
    $('presenter').innerHTML = '<div class="card"><div class="muted">שגיאה בחיפוש — נסה שוב.</div></div>';
  } finally {
    $('search-btn').disabled = false;
    showProgress(false);
  }
}

function renderMarkers() {
  pointMarkers.forEach((m) => map.removeLayer(m));
  pointMarkers = [];
  found.forEach((c, i) => {
    const m = L.marker([c.lat, c.lon], {
      icon: L.divIcon({ className: '', html: `<div style="background:#2e7dd1;color:#fff;font-weight:800;font-size:12px;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5)">${i + 1}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }),
      zIndexOffset: 500,
    }).addTo(map).on('click', () => present(i));
    pointMarkers.push(m);
  });
  if (found.length) {
    map.fitBounds(L.latLngBounds([[observer.lat, observer.lon], ...found.map((c) => [c.lat, c.lon])]), { padding: [40, 40], animate: false });
  }
}

function renderList() {
  const el = $('results');
  el.innerHTML = '';
  if (!found.length) return;
  let lastBand = null;
  found.forEach((c, i) => {
    if (c.band !== lastBand) {
      lastBand = c.band;
      const h = document.createElement('div');
      h.className = 'grouphdr';
      h.textContent = `מרחק ≈ ${c.band} ק"מ`;
      el.appendChild(h);
    }
    const d = document.createElement('div');
    d.className = 'litem';
    d.dataset.i = i;
    d.innerHTML = `<b>${i + 1}.</b> ${c.distanceKm.toFixed(1)} ק"מ · מרווח ${c.marginM.toFixed(0)} מ' · כביש ${roadFmt(c.roadDistM)}`;
    d.onclick = () => present(i);
    el.appendChild(d);
  });
}

function present(i) {
  if (!found.length) return;
  idx = (i + found.length) % found.length;
  const c = found[idx];
  if (highlight) map.removeLayer(highlight);
  highlight = L.circleMarker([c.lat, c.lon], { radius: 14, color: '#ffd166', weight: 3, fill: false, opacity: 0.95 }).addTo(map);
  map.flyTo([c.lat, c.lon], 14);
  $('presenter').innerHTML =
    `<div class="presenter">
      <div class="pres-num">נקודה ${idx + 1} מתוך ${found.length}</div>
      <div class="pres-band">≈ ${c.band} ק"מ</div>
      <div class="pres-rows">
        מרחק בפועל: <b>${c.distanceKm.toFixed(1)} ק"מ</b> · אזימוט ${c.bearingDeg.toFixed(0)}°<br>
        מרווח קו ראייה: <b class="${c.marginM >= 0 ? 'pos' : 'neg'}">${c.marginM.toFixed(1)} מ'</b> · גובה קרקע ${c.groundElev == null ? '—' : Math.round(c.groundElev)} מ'<br>
        מרחק מכביש: <b>${roadFmt(c.roadDistM)}</b><br>
        <span class="coords">${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}</span> ·
        <a href="https://waze.com/ul?ll=${c.lat},${c.lon}&navigate=yes" target="_blank">Waze</a> ·
        <a href="https://maps.google.com/?q=${c.lat},${c.lon}" target="_blank">Maps</a>
      </div>
      <div class="pres-nav"><button id="pres-prev">→ הקודם</button><button id="pres-next">הבא ←</button></div>
    </div>`;
  $('pres-prev').onclick = () => present(idx - 1);
  $('pres-next').onclick = () => present(idx + 1);
  document.querySelectorAll('.litem').forEach((el) => el.classList.toggle('active', +el.dataset.i === idx));
  const active = document.querySelector('.litem.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function onProgress(phase, frac) {
  const label = phase === 'tiles' ? 'טוען נתוני שטח' : phase === 'compute' ? 'מחשב קו ראייה' : phase === 'roads' ? 'טוען כבישים' : 'מסיים';
  showProgress(true, phase === 'roads' ? 'טוען כבישים…' : `${label}… ${Math.round(frac * 100)}%`, phase === 'roads' ? null : frac);
}
function showProgress(on, text, frac) {
  $('search-progress').style.display = on ? 'block' : 'none';
  if (text != null) $('search-progress-label').textContent = text;
  if (frac != null) $('search-progress-bar').style.width = `${Math.round(frac * 100)}%`;
}

// arrow keys match the button arrows (← next, → previous)
document.addEventListener('keydown', (e) => {
  if (!found.length) return;
  if (e.key === 'ArrowLeft') present(idx + 1);
  else if (e.key === 'ArrowRight') present(idx - 1);
});

initMap();
wireObserverSearch();
$('search-btn').addEventListener('click', runSearch);
$('search-btn').disabled = true;
