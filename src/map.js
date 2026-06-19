// map.js — Leaflet view controller. Owns base layers, antenna markers (draggable),
// the 50 km ring, the A-B link line and the hover-elevation probe. Uses global `L`.
import { elevationAt } from './terrain.js';
import { createHeightLayer } from './heightmap.js';

const HOVER_ZOOM = 12;

function antennaIcon(label, color, tip) {
  return L.divIcon({
    className: '',
    html: `<div style="text-align:center;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))">
      <div style="background:${color};color:#fff;font-weight:800;font-size:13px;padding:2px 9px;border-radius:999px;white-space:nowrap">${label} 📡</div>
      <div style="background:rgba(0,0,0,.6);color:#fff;font-size:10px;padding:1px 5px;border-radius:5px;margin-top:2px;white-space:nowrap">${tip}</div></div>`,
    iconSize: [60, 42],
    iconAnchor: [30, 42],
  });
}

export function initMap(elId, handlers) {
  const map = L.map(elId, { zoomControl: true, worldCopyJump: false }).setView([31.4, 35.0], 8);
  window.addEventListener('resize', () => map.invalidateSize());

  const sat = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 18, attribution: 'Esri World Imagery' }
  ).addTo(map);
  const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: 'OpenTopoMap (CC-BY-SA)' });
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: 'OpenStreetMap' });
  const height = createHeightLayer();
  L.control.layers(
    { '🛰️ לוויין (Esri)': sat, '🗺️ טופוגרפי': topo, 'מפה (OSM)': osm },
    { 'גובה — מפת צבע': height },
    { position: 'topleft' }
  ).addTo(map);
  const heightLegend = () => document.getElementById('height-legend');
  map.on('overlayadd', (e) => { if (e.layer === height && heightLegend()) heightLegend().style.display = 'block'; });
  map.on('overlayremove', (e) => { if (e.layer === height && heightLegend()) heightLegend().style.display = 'none'; });

  const markers = { A: null, B: null };
  let ring = null, link = null, distLabel = null;
  let scanMarkers = [], scanLine = null;
  let exploreGroup = null, exploreHighlight = null;
  let nationalGroup = null;
  let nationalSiteGroup = null;
  let foundMarker = null;
  let selected = 'A';

  map.on('click', (e) => handlers.onMapClick(e.latlng));

  // debounced hover-elevation probe
  let hoverTimer = null;
  map.on('mousemove', (e) => {
    clearTimeout(hoverTimer);
    const { lat, lng } = e.latlng;
    hoverTimer = setTimeout(async () => {
      let elev = NaN;
      try { elev = await elevationAt(lat, lng, HOVER_ZOOM); } catch (_) {}
      handlers.onHover({ lat, lng }, elev);
    }, 140);
  });

  function makeMarker(which, latlng) {
    const color = which === 'A' ? '#e74c3c' : '#3498db';
    const tip = which === 'A' ? 'משקיף' : '';
    const m = L.marker(latlng, { draggable: true, icon: antennaIcon(which, color, tip), zIndexOffset: 1000 }).addTo(map);
    m.on('click', (ev) => { L.DomEvent.stop(ev); selected = which; handlers.onSelect(which); });
    m.on('drag', () => handlers.onMove(which, m.getLatLng(), false));
    m.on('dragend', () => handlers.onMove(which, m.getLatLng(), true));
    return m;
  }

  return {
    map,
    getSelected: () => selected,
    setSelected(which) { selected = which; },

    setAntenna(which, latlng, tipText) {
      if (!markers[which]) markers[which] = makeMarker(which, latlng);
      else markers[which].setLatLng(latlng);
      if (tipText != null) {
        const color = which === 'A' ? '#e74c3c' : '#3498db';
        markers[which].setIcon(antennaIcon(which, color, tipText));
      }
    },

    drawLink(a, b, clear) {
      if (link) { map.removeLayer(link); link = null; }
      if (distLabel) { map.removeLayer(distLabel); distLabel = null; }
      if (!a || !b) return;
      const color = clear ? '#6fd388' : '#ff6b6b';
      link = L.polyline([a, b], { color, weight: 3, dashArray: '7 5', opacity: 0.95 }).addTo(map);
      const km = (map.distance(a, b) / 1000).toFixed(1);
      const mid = [(a.lat + b.lat) / 2, (a.lng + b.lng) / 2];
      distLabel = L.marker(mid, {
        icon: L.divIcon({ className: '', html: `<div class="dist-label">${km} ק"מ</div>`, iconSize: [64, 18], iconAnchor: [32, 9] }),
        interactive: false,
      }).addTo(map);
    },

    setRing(latlng) {
      if (!latlng) {
        if (ring) { map.removeLayer(ring); ring = null; }
        return;
      }
      if (ring) ring.setLatLng(latlng); // reuse — no flicker/GC churn during drag
      else ring = L.circle(latlng, { radius: 50000, color: '#fff', weight: 2, dashArray: '9 7', fill: false, opacity: 0.85 }).addTo(map);
    },

    fitTo(a, b) {
      if (a && b) map.fitBounds(L.latLngBounds([a, b]).pad(0.4));
      else if (a) map.setView(a, 11);
    },

    flyTo(latlng, zoom) { map.flyTo(latlng, zoom || 13); },

    // drop a temporary "found place" pin from the search and centre on it
    showFoundLocation(latlng, label) {
      if (foundMarker) { map.removeLayer(foundMarker); foundMarker = null; }
      if (!latlng) return;
      foundMarker = L.marker(latlng, {
        icon: L.divIcon({ className: '', html: '<div style="font-size:26px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))">📍</div>', iconSize: [26, 26], iconAnchor: [13, 26] }),
        zIndexOffset: 400,
      }).addTo(map);
      if (label) foundMarker.bindPopup(`<b>${label}</b><br><small>לחץ במפה כדי למקם כאן אנטנה</small>`).openPopup();
      map.flyTo(latlng, 13);
    },

    clearExplore() {
      if (exploreGroup) { map.removeLayer(exploreGroup); exploreGroup = null; }
      if (exploreHighlight) { map.removeLayer(exploreHighlight); exploreHighlight = null; }
    },

    // observer={lat,lon}; candidates have {lat,lon,routeOrder}; onPick(candidate)
    setExploreResults(observer, candidates, onPick) {
      this.clearExplore();
      exploreGroup = L.layerGroup().addTo(map);
      const route = candidates.filter((c) => Number.isFinite(c.routeOrder)).sort((a, b) => a.routeOrder - b.routeOrder);

      // faint dots for every non-route candidate (so they don't bury the route)
      candidates.forEach((c) => {
        if (Number.isFinite(c.routeOrder)) return;
        L.circleMarker([c.lat, c.lon], { radius: 3, weight: 0, fillColor: '#4f9af0', fillOpacity: 0.5 })
          .addTo(exploreGroup).on('click', () => onPick && onPick(c));
      });

      // the corridor route: a bold line (white casing + orange) from the observer through the route points
      if (route.length) {
        const pts = [[observer.lat, observer.lon], ...route.map((c) => [c.lat, c.lon])];
        L.polyline(pts, { color: '#fff', weight: 7, opacity: 0.85, lineJoin: 'round' }).addTo(exploreGroup);
        L.polyline(pts, { color: '#ff7f0e', weight: 4, opacity: 1, lineJoin: 'round' }).addTo(exploreGroup);
      }

      // numbered markers on the route points (on top of everything)
      route.forEach((c, i) => {
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:#ff7f0e;color:#fff;font-weight:800;font-size:12px;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.55)">${i + 1}</div>`,
          iconSize: [22, 22], iconAnchor: [11, 11],
        });
        L.marker([c.lat, c.lon], { icon, zIndexOffset: 600 }).addTo(exploreGroup).on('click', () => onPick && onPick(c));
      });

      // zoom to the candidate area so the route is actually visible
      const latlngs = candidates.map((c) => [c.lat, c.lon]);
      latlngs.push([observer.lat, observer.lon]);
      if (latlngs.length > 1) map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], animate: false });
    },

    highlightExplore(latlng) {
      if (exploreHighlight) map.removeLayer(exploreHighlight);
      if (!latlng) { exploreHighlight = null; return; }
      exploreHighlight = L.circleMarker(latlng, { radius: 11, color: '#fff', weight: 3, fill: false, opacity: 0.95 }).addTo(map);
    },

    clearScan() {
      scanMarkers.forEach((m) => map.removeLayer(m));
      scanMarkers = [];
      if (scanLine) { map.removeLayer(scanLine); scanLine = null; }
    },

    clearNational() {
      if (nationalGroup) { map.removeLayer(nationalGroup); nationalGroup = null; }
      this.clearNationalSite();
    },

    clearNationalSite() {
      if (nationalSiteGroup) { map.removeLayer(nationalSiteGroup); nationalSiteGroup = null; }
    },

    // drop the currently-focused site (its target fan + the highlight ring) so a click
    // away from a point "lets go" of it. Returns whether anything was focused.
    clearNationalFocus() {
      const had = !!(nationalSiteGroup || exploreHighlight);
      this.clearNationalSite();
      if (exploreHighlight) { map.removeLayer(exploreHighlight); exploreHighlight = null; }
      return had;
    },

    // sites = ranked [{lat,lon,...}]; numbered teal pins; onPick(site) on click
    setNationalResults(sites, onPick) {
      this.clearNational();
      if (!sites || !sites.length) return;
      nationalGroup = L.layerGroup().addTo(map);
      sites.forEach((s, i) => {
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:#16a085;color:#fff;font-weight:800;font-size:12px;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 3px rgba(0,0,0,.5)">${i + 1}</div>`,
          iconSize: [24, 24], iconAnchor: [12, 12],
        });
        L.marker([s.lat, s.lon], { icon, zIndexOffset: 500 }).addTo(nationalGroup).on('click', () => onPick && onPick(s));
      });
      map.fitBounds(L.latLngBounds(sites.map((s) => [s.lat, s.lon])), { padding: [50, 50], animate: false });
    },

    // Focus one result site: draw its observer + every 30/40/50 km target point the
    // scan found, with a line observer->target for each, so the user sees the spatial
    // layout (not just coordinates). Fits the view to the whole fan.
    showNationalSite(site) {
      this.clearNationalSite();
      if (!site) return;
      nationalSiteGroup = L.layerGroup().addTo(map);
      const o = [site.lat, site.lon];
      const found = (Array.isArray(site.bands) ? site.bands : [])
        .filter((b) => b.found && Number.isFinite(b.lat) && Number.isFinite(b.lon));

      // line observer -> each target (white casing + colour by clear/estimated)
      found.forEach((b) => {
        const col = b.clear ? '#2ecc71' : '#f39c12';
        L.polyline([o, [b.lat, b.lon]], { color: '#fff', weight: 5, opacity: 0.8 }).addTo(nationalSiteGroup);
        L.polyline([o, [b.lat, b.lon]], { color: col, weight: 3, opacity: 0.95, dashArray: b.clear ? null : '6 5' }).addTo(nationalSiteGroup);
      });

      // distance-labelled target markers
      found.forEach((b) => {
        const col = b.clear ? '#2ecc71' : '#f39c12';
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${col};color:#0b3d2e;font-weight:800;font-size:11px;padding:2px 7px;border-radius:999px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5);white-space:nowrap">${b.km} ק"מ</div>`,
          iconSize: [46, 20], iconAnchor: [23, 10],
        });
        L.marker([b.lat, b.lon], { icon, zIndexOffset: 700 }).addTo(nationalSiteGroup)
          .bindPopup(`<b>יעד ≈${b.km} ק"מ</b><br>${b.distanceKm.toFixed(1)} ק"מ · אזימוט ${Math.round(b.bearingDeg)}°<br>${b.lat.toFixed(4)}, ${b.lon.toFixed(4)} · ${b.clear ? '✓ קו ראייה' : '~ משוער'}`);
      });

      // observer marker on top
      const oIcon = L.divIcon({
        className: '',
        html: '<div style="background:#0e7c66;color:#fff;font-weight:800;font-size:12px;padding:3px 9px;border-radius:6px;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.55);white-space:nowrap">📡 משקיף</div>',
        iconSize: [74, 24], iconAnchor: [37, 24],
      });
      L.marker(o, { icon: oIcon, zIndexOffset: 800 }).addTo(nationalSiteGroup);

      const pts = [o, ...found.map((b) => [b.lat, b.lon])];
      if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], animate: true });
      else map.setView(o, 12);
    },

    // observer = {lat,lon}; points = ordered [{lat,lon,found,...}]; corridorAz optional
    setScanResults(observer, points, corridorAz, onPick) {
      this.clearScan();
      const found = points.filter((p) => p.found);
      if (corridorAz != null && found.length) {
        scanLine = L.polyline([[observer.lat, observer.lon], ...found.map((p) => [p.lat, p.lon])],
          { color: '#e67e22', weight: 2.5, dashArray: '6 6', opacity: 0.9 }).addTo(map);
      }
      found.forEach((p, i) => {
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:#e67e22;color:#fff;font-weight:800;font-size:13px;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 3px rgba(0,0,0,.5)">${i + 1}</div>`,
          iconSize: [24, 24], iconAnchor: [12, 12],
        });
        const m = L.marker([p.lat, p.lon], { icon, zIndexOffset: 500 }).addTo(map);
        m.on('click', () => onPick && onPick(p));
        scanMarkers.push(m);
      });
    },
  };
}
