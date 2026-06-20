// kml.js — build a KML document for a link (pure, no DOM). KML is plain XML, so the
// whole file is assembled in-browser and offered as a download: open the link, its
// endpoints and (optionally) the relay/target points in Google Earth, QGIS or a GPS.
// KML coordinate order is lon,lat,alt.

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const coord = (p) => `${(+p.lon).toFixed(6)},${(+p.lat).toFixed(6)},0`;

function placemarkPoint(name, p, styleUrl) {
  return `<Placemark><name>${esc(name)}</name>${styleUrl ? `<styleUrl>${styleUrl}</styleUrl>` : ''}` +
    `<Point><coordinates>${coord(p)}</coordinates></Point></Placemark>`;
}

/**
 * Build a KML string for an A↔B link.
 *   { a:{lat,lon}, b:{lat,lon}, distanceKm, clear, freqMHz, extraPoints?:[{lat,lon,name}] }
 * `clear` tints the connecting line green (clear) or red (blocked).
 */
export function buildLinkKml({ a, b, distanceKm, clear, freqMHz, extraPoints = [] }) {
  const lineColor = clear ? 'ff66d36f' : 'ff6b6bff'; // aabbggrr
  const title = `קו ראייה A↔B${distanceKm != null ? ` · ${(+distanceKm).toFixed(1)} ק"מ` : ''}${freqMHz ? ` · ${freqMHz} MHz` : ''}`;
  const extras = extraPoints.map((p, i) => placemarkPoint(p.name || `נקודה ${i + 1}`, p, '#pt')).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<name>${esc(title)}</name>
<Style id="link"><LineStyle><color>${lineColor}</color><width>3</width></LineStyle></Style>
<Style id="pt"><IconStyle><scale>0.9</scale></IconStyle></Style>
${placemarkPoint('אנטנה A', a)}
${placemarkPoint('אנטנה B', b)}
<Placemark><name>${esc(title)}</name><styleUrl>#link</styleUrl><LineString><tessellate>1</tessellate><coordinates>${coord(a)} ${coord(b)}</coordinates></LineString></Placemark>
${extras}
</Document></kml>`;
}
