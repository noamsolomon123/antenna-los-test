// national-view.js — render the ranked national-scan sites as a list in the
// sidebar (header + one card per site). Row click -> handlers.onFly(site).
const roadFmt = (m) => (m == null ? '—' : m < 1000 ? `${Math.round(m)} מ'` : `${(m / 1000).toFixed(1)} ק"מ`);

export function renderNational(el, result, handlers = {}) {
  el.innerHTML = '';
  const { sites, scanned, confirmed, losCount = 0, accessibleCount = 0, partial, bandsTotal, hasRoads } = result;

  const hdr = document.createElement('div');
  hdr.className = 'nat-hdr';
  hdr.innerHTML = `נמצאו <b>${sites.length}</b> אתרים · נסרקו ${scanned} נקודות, נבדקו לעומק ${confirmed}, אומתו ${losCount}`;
  el.appendChild(hdr);

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
    const bandsTxt = s.bands.map((b) => `${b.km}${b.clear ? '✓' : '✗'}`).join(' · ');
    const card = document.createElement('div');
    card.className = 'scard nat';
    card.innerHTML =
      `<div class="srow"><span class="snum">${i + 1}</span> <b>${s.bandsClear}/${bandsTotal} טווחים</b> · עד ${Math.round(s.maxReachKm)} ק"מ</div>` +
      `<div class="srow2">טווחים: ${bandsTxt} · מרווח כולל ${Math.round(s.clearanceSum)} מ' · גובה ${s.groundElev == null ? '—' : Math.round(s.groundElev)} מ'</div>` +
      `<div class="srow2">כביש: <b>${roadFmt(s.roadDistM)}</b> · <span class="coords">${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}</span></div>` +
      `<div class="srow2"><a href="https://waze.com/ul?ll=${s.lat},${s.lon}&navigate=yes" target="_blank">Waze</a> · ` +
      `<a href="https://maps.google.com/?q=${s.lat},${s.lon}" target="_blank">Maps</a></div>`;
    card.addEventListener('click', (e) => { if (e.target.tagName === 'A') return; handlers.onFly && handlers.onFly(s); });
    el.appendChild(card);
  });
}
