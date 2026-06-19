// national-view.js — render the ranked national-scan sites as a list in the
// sidebar (header + one card per site). Row click -> handlers.onFly(site).
const roadFmt = (m) => (m == null ? '—' : m < 1000 ? `${Math.round(m)} מ'` : `${(m / 1000).toFixed(1)} ק"מ`);
// note the data source: OSRM (a fallback when Overpass failed) includes dirt tracks
const roadSrc = (s) => (s.roadSource === 'osrm' ? ' <span class="rsrc" title="מרחק מ-OSRM (גיבוי) — עשוי לכלול דרך עפר">·OSRM</span>' : '');

export function renderNational(el, result, handlers = {}) {
  el.innerHTML = '';
  const { sites, scanned, confirmed, losCount = 0, accessibleCount = 0, partial, bandsTotal, hasRoads } = result;

  const hdr = document.createElement('div');
  hdr.className = 'nat-hdr';
  hdr.innerHTML = `נמצאו <b>${sites.length}</b> אתרים · נסרקו ${scanned} נקודות, נבדקו לעומק ${confirmed}, אומתו ${losCount}`;
  el.appendChild(hdr);

  if (sites.length)
    el.insertAdjacentHTML('beforeend', '<div class="nat-hint">💡 לחץ על אתר כדי לראות את כל נקודות היעד שלו על המפה · מיקום אנטנות ידני מושבת בזמן סריקה ארצית.</div>');

  if (partial && sites.length)
    el.insertAdjacentHTML('beforeend', `<div class="nat-note">לא נמצאו אתרים שעוברים את כל ${bandsTotal} הטווחים — מציג את הטובים ביותר (חלק מהטווחים).</div>`);
  if (!hasRoads && sites.length)
    el.insertAdjacentHTML('beforeend', '<div class="nat-note">⚠️ נתוני כבישים לא נטענו במלואם — נגישות הרכב לחלק מהנקודות לא אומתה.</div>');
  if (!sites.length) {
    const msg = (hasRoads && losCount > 0 && accessibleCount === 0)
      ? `נמצאו ${losCount} אתרי קו ראייה, אך אף אחד אינו נגיש לרכב (כולם רחוקים מכביש). נסה אזור אחר.`
      : 'לא נמצאו אתרים מתאימים. נסה מרווח רשת צפוף יותר, או הרחב את הבדיקה לעומק.';
    el.insertAdjacentHTML('beforeend', `<div class="muted">${msg}</div>`);
    return;
  }

  sites.forEach((s, i) => {
    const bandChips = s.bands.map((b) => {
      const cls = b.clear ? 'ok' : b.found ? 'est' : 'no';
      const mark = b.clear ? '✓' : b.found ? '~' : '✗';
      return `<span class="band-chip ${cls}">${b.km} ${mark}</span>`;
    }).join('');
    const foundBands = s.bands.filter((b) => b.found);
    // one Google Maps link that drops the observer + all its 30/40/50 km targets on a
    // single map, so the whole fan can be seen together (and navigated through).
    const allPts = [[s.lat, s.lon], ...foundBands.map((b) => [b.lat, b.lon])];
    const gmapsAll = 'https://www.google.com/maps/dir/' + allPts.map(([la, lo]) => `${la.toFixed(5)},${lo.toFixed(5)}`).join('/');
    const card = document.createElement('div');
    card.className = 'scard nat';

    const targetRows = s.bands.map((b) => {
      if (!b.found) return `<div class="ntarget none">≈${b.km} ק"מ — לא נמצאה נקודה</div>`;
      const mark = b.clear ? '✓ קו ראייה' : '~ משוער';
      return `<div class="ntarget" data-lat="${b.lat}" data-lon="${b.lon}">` +
        `<b>≈${b.km} ק"מ</b> · ${b.distanceKm.toFixed(1)} ק"מ · אזימוט ${Math.round(b.bearingDeg)}° · מרווח ${Math.round(b.marginM)} מ' · ${mark}<br>` +
        `<span class="coords">${b.lat.toFixed(4)}, ${b.lon.toFixed(4)}</span> · ` +
        `<a href="https://waze.com/ul?ll=${b.lat},${b.lon}&navigate=yes" target="_blank">Waze</a> · ` +
        `<a href="https://maps.google.com/?q=${b.lat},${b.lon}" target="_blank">Maps</a></div>`;
    }).join('');

    card.innerHTML =
      `<div class="nrow-main">` +
        `<div class="srow"><span class="snum">${i + 1}</span> <b>${s.bandsClear}/${bandsTotal} טווחים</b> · עד ${Math.round(s.maxReachKm)} ק"מ</div>` +
        `<div class="bandchips">${bandChips}</div>` +
        `<div class="srow2">מרווח כולל ${Math.round(s.clearanceSum)} מ' · גובה ${s.groundElev == null ? '—' : Math.round(s.groundElev)} מ'</div>` +
        `<div class="srow2">כביש: <b>${roadFmt(s.roadDistM)}</b>${roadSrc(s)} · <span class="coords">${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}</span> (משקיף)</div>` +
        `<div class="srow2">משקיף: <a href="https://waze.com/ul?ll=${s.lat},${s.lon}&navigate=yes" target="_blank">Waze</a> · ` +
        `<a href="https://maps.google.com/?q=${s.lat},${s.lon}" target="_blank">Maps</a></div>` +
        `<div class="srow2"><a class="gall" href="${gmapsAll}" target="_blank" title="פותח את המשקיף וכל נקודות היעד יחד במפה אחת">🗺️ כל ${allPts.length} הנקודות יחד ב‑Google Maps</a></div>` +
      `</div>` +
      `<details class="ndrop"><summary>📍 נקודות היעד שנמצאו (${foundBands.length})</summary>${targetRows}</details>`;

    // main area -> fly to the observer site; the dropdown toggles independently
    card.querySelector('.nrow-main').addEventListener('click', (e) => {
      if (e.target.tagName === 'A') return;
      handlers.onFly && handlers.onFly(s);
    });
    // a target row -> fly to that target point
    card.querySelectorAll('.ntarget[data-lat]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') return;
        handlers.onFly && handlers.onFly({ lat: +row.dataset.lat, lon: +row.dataset.lon });
      });
    });
    el.appendChild(card);
  });
}
