# Antenna LOS WebUI — Design Spec

- **Date:** 2026-06-16
- **Status:** Approved (design), pending implementation plan
- **Project:** `antenna-los-test`
- **Replaces:** the current static `index.html` (hard-coded Negev points) with an interactive, in-browser LOS tool.

---

## 1. Purpose & Context

The existing app is a static Leaflet map that **displays pre-computed** LOS results: one fixed station (Har Amasa) and four hand-verified points at 20/30/40/50 km in the Negev. Nothing is computed in the browser.

This project replaces it with an **interactive, in-browser line-of-sight tool covering all of Israel**. The user picks locations on a satellite map and the app computes line-of-sight live against terrain elevation data. Two capabilities:

- **(A) Viewshed coverage** — pick one observer antenna; the app computes and shades every area within a **50 km radius** as **YES (has a working link) or NO (blocked)**.
- **(B) Point-to-point link test** — place two antennas (A and B); the app draws the terrain cross-section between them and reports a binary LOS verdict plus minimum Fresnel clearance.

It runs on a laptop **with an internet connection**, is **deployed to GitHub Pages**, and ships with a **foolproof run script**.

---

## 2. Goals / Non-Goals

**Goals**
- Interactive: click to place antennas, drag to fine-tune, live recompute for the link test.
- Accurate-enough LOS: earth curvature + 4/3 atmospheric refraction + first-Fresnel-zone clearance at a user-set frequency.
- **Binary output everywhere**: YES / NO. No "marginal" state.
- Live **50 km viewshed** from the observer, rendered as a colored overlay.
- **Satellite imagery of Israel** as the default base map (topographic + OSM switchable).
- Editable **frequency** (presets + custom) and **mast heights** per antenna.
- Hebrew / RTL UI, matching the current app's language.
- **Foolproof deployment & run**: GitHub Pages URL (zero install) + a double-click local run script.

**Non-Goals (YAGNI)**
- No backend / server-side compute. Pure client-side static app.
- No full RF link budget (no path-loss, antenna gain, EIRP, noise figure). Fresnel **geometry** only.
- No multi-link network planning or optimization.
- No fully-offline operation (terrain + map tiles need internet).
- No mobile-first design (desktop/laptop layout is the target).
- No preset Negev data carried over (start from a blank map).

---

## 3. Key Scenarios

1. **Find where a second antenna can go.** User clicks a candidate mast site (Antenna A), sets mast height and frequency, hits "compute 50 km coverage." The map shades green everywhere a 10 m receiver would have a clean link to A. User reads off candidate areas.
2. **Validate a specific pair.** User places Antenna A and Antenna B 34 km apart. The app shows distance, azimuth, a terrain cross-section with the curvature-corrected sightline and Fresnel envelope, and a binary verdict with the minimum clearance and the worst-obstruction point. User drags B or raises a mast and watches it flip from NO to YES.

---

## 4. Architecture & Stack

Static, client-side single-page app — **no backend, no API keys**.

- **Vanilla JS + Leaflet** (matches the current app), heavy compute in a **Web Worker**.
- **Base map layers:** Esri World Imagery (**satellite, default**), OpenTopoMap (topographic/contours), OpenStreetMap. All free, no key.
- **Elevation data:** AWS "Terrain Tiles" — **Terrarium-encoded PNG** at `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` (~30 m SRTM-grade, CORS-enabled, no key). Decoded in-browser; this is invisible (drives the math, not the picture). The tile source is a single config point so it can be swapped if the endpoint changes.

**Modules** (each focused, < ~500 lines per project conventions):

| File | Responsibility |
|------|----------------|
| `index.html` | Page shell, sidebar markup, Hebrew/RTL strings, loads modules |
| `src/terrain.js` | Fetch + decode + cache Terrarium tiles; bilinear elevation sampling at any lat/lon |
| `src/los.js` | Physics: curvature + 4/3 refraction, Fresnel-zone radius, point-to-point profile, clearance, binary verdict |
| `src/viewshed.js` | Orchestrates the 50 km viewshed: gathers terrain grid, spawns worker, renders overlay |
| `src/viewshed.worker.js` | Radial-sweep ray-casting viewshed (heavy compute, off main thread) |
| `src/profile-chart.js` | Terrain cross-section chart for the A↔B link (terrain, sightline, Fresnel zone) |
| `src/map.js` | Leaflet map, base layers, antenna markers, click/drag, ring, hover elevation |
| `src/ui.js` | Sidebar cards, frequency control, verdict, legend, button wiring |
| `src/state.js` | App state (antennas, frequency, fresnel %, observer selection, results) |
| `tests/los.test.*` | Unit tests for the `los.js` physics |

---

## 5. LOS Physics (`los.js`)

- **Earth curvature + refraction:** use the standard 4/3-earth model — effective Earth radius `R_eff = k · 6371 km`, `k = 4/3` (≈ 8495 km). The terrain drop at distance is `d²/(2·R_eff)`. (Matches the old app's "8,495 km" note.)
- **Heights:** antenna effective height = ground elevation (from terrain) + mast height (default **10 m**, editable per antenna).
- **Fresnel zone:** first-Fresnel radius at a point `r = sqrt(λ · d1 · d2 / (d1 + d2))`, where `λ = c / f`, `d1`,`d2` are distances from each end, `f` is the user-set frequency. A link is **YES** only if the terrain (plus curvature bulge) stays below the sightline by at least **`fresnelPct` × r`** at every sampled point. Default threshold **60 % of F1** (industry standard for a clean link); configurable.
- **Profile sampling:** sample ~300–500 points along the great-circle path A→B; at each, compute terrain elevation, curvature-corrected sightline height, required Fresnel clearance, and the actual margin. Track the **minimum margin** and its location → that's the "determining point."
- **Verdict:** binary. `min_margin ≥ 0` → YES; else NO.

## 6. Viewshed Algorithm (`viewshed.js` + worker)

- **Radial-sweep ray casting.** Observer at the picked point. Fire **~1,000+ rays** (e.g. every 0.3°) out to 50 km. Along each ray, step at roughly the terrain resolution (~30–60 m); maintain the running maximum **required elevation angle** (including curvature + the Fresnel offset). A sample is **visible (YES)** if its own angle exceeds the running max; otherwise **blocked (NO)**.
- **Assumed receiver height:** the viewshed answers "could a receiver standing *here* reach the observer?" — so each target cell is evaluated at a **receiver mast height equal to the non-observer antenna's mast height** (default 10 m). Changing that mast height re-runs the viewshed.
- **Output:** a binary raster (YES/NO) over the 50 km disc. Cells with no terrain data (sea/missing tiles) are flagged separately as **no-data** (neutral, not "NO").
- **Render:** paint the raster to a canvas and place it as a Leaflet image/canvas overlay aligned to the disc, using the approved scheme — **green = YES, red = NO** (semi-transparent so the satellite imagery shows through), no-data left fully transparent.
- **Performance budget:** target the whole compute (tile fetch already cached + sweep + render) under a few seconds; runs in a Web Worker with a **progress bar** and is **cancellable**. Resolution is tunable if needed.

## 7. Terrain Data Pipeline (`terrain.js`)

- Given a lat/lon bounding box, compute the set of Terrarium tiles to fetch at a chosen zoom (≈ z12–13 for ~30 m). For the 50 km viewshed that's a ~100 km box ≈ a manageable tile count.
- **Decode:** `elevation_m = (R·256 + G + B/256) − 32768` per pixel.
- **Sample:** bilinear interpolation for any lat/lon; an in-memory **tile cache** so repeated queries and the viewshed share data.
- **No-data:** treat sea / fetch-miss tiles as no-data rather than elevation 0.

## 8. UI / UX (Hebrew, RTL)

Layout: **map fills the screen, sidebar pinned right** (matches approved mockup).

**Map:**
- Default **🛰️ Esri satellite**; layer switcher to 🗺️ topographic / OSM.
- Click places Antenna A, next click places Antenna B; both **draggable**.
- **50 km dashed ring** around the active observer.
- **Hover elevation chip** (top-right): live coordinates + ground elevation under the cursor.
- Viewshed legend (bottom-left): green = YES, red = NO.

**Sidebar:**
- **Antenna A / B cards** — coordinates, ground elevation (auto-read), editable **mast height** (default 10 m), effective height, Waze/Google-Maps links.
- **📻 Frequency control** — numeric MHz input + preset buttons (2.4 / 5.0 / 5.8 GHz / 900 MHz). Drives the Fresnel zone.
- **Link verdict card** — distance, azimuth, big **binary verdict** ("✓ יש קו ראייה — כן" / "✗ אין קו ראייה — לא"), minimum Fresnel clearance, determining point.
- **Terrain profile chart** — terrain cross-section, green sightline, blue Fresnel envelope, determining point marked.
- **Viewshed panel** — "⟳ חשב כיסוי 50 ק"מ" button with progress bar; legend.

Link test recomputes **live** on drag / height / frequency change. Viewshed computes **on button press**.

## 9. State Model (`state.js`)

```
antennaA / antennaB: { lat, lon, groundElev, mastHeight }   // groundElev auto-read from terrain
frequencyMHz: number          // default 5800
fresnelPct:   number          // default 0.6
observer:     'A' | 'B'        // whose 50 km viewshed
viewshedResult: raster | null
```

## 10. Error Handling

- **Tile fetch failure:** retry once, then a non-blocking Hebrew notice; affected cells → no-data.
- **Antenna in a no-data area** (e.g., sea): clear message instead of a bogus verdict.
- **Heavy compute:** isolated in the Web Worker behind a progress bar + cancel; UI never freezes.
- **`file://` limitation:** terrain fetch + workers don't run from a double-clicked local file → the run script always serves over `http://` (or the user uses the Pages URL).

## 11. Deployment & "Foolproof" Run

Two paths, both delivered:

**Primary — GitHub Pages (zero install, truly foolproof).**
- Repo pushed to GitHub; **Pages enabled** on the default branch (root). The app is then a plain **HTTPS URL** that opens and works on any laptop with internet — no Python, Node, or local server. AWS terrain tiles and Web Workers both work fine over HTTPS Pages.
- A `deploy` helper (documented commands using the `gh` CLI) creates the repo, pushes, and enables Pages. The live URL goes in the README.

**Secondary — local double-click run script** (`run.bat` for Windows, plus `run.sh`):
- Logic: if Python is available → `python -m http.server` and open `http://localhost:PORT`; else if Node → serve via a tiny bundled `server.js`; **else just open the GitHub Pages URL** so the user always lands on a working app.
- Opens the default browser automatically. Foolproof: every branch ends with a working app.

**README** (Hebrew + English): the one-line "double-click `run.bat`" instruction and the GitHub Pages URL.

## 12. Testing

- **Unit tests (`tests/`) for `los.js`:** curvature drop at 20/50 km vs. hand-computed values; Fresnel radius at known f/d; full-profile clearance on synthetic terrain (flat = YES, tall wall = NO, grazing = boundary).
- **Synthetic-DEM viewshed test:** a cone/ridge DEM where the visible set is known analytically; assert the worker's raster matches.
- **Regression sanity check:** the old hand-verified Negev links (Har Amasa → the four points) should compute to **YES** in the new engine — a real-world validation that the physics is right.
- **Manual checklist:** place/drag antennas, switch base layers, change frequency, run a viewshed, confirm progress + cancel, confirm no-data handling over the sea.

## 13. Repo Structure

```
antenna-los-test/
  index.html
  src/{terrain,los,viewshed,viewshed.worker,profile-chart,map,ui,state}.js
  tests/los.test.*
  run.bat   run.sh   server.js
  README.md
  .gitignore           # ignores .superpowers/, node_modules, etc.
  docs/superpowers/specs/2026-06-16-antenna-los-webui-design.md
  index-old-mitzpe-ramon.html   # kept for reference
```

## 14. Risks & Open Questions

- **AWS terrain-tile endpoint:** verify it returns valid data over Israel during implementation; keep the source swappable. (Fallback options noted in `terrain.js`.)
- **Accuracy:** ~30 m SRTM-grade terrain; bare-earth (no buildings/tree canopy). The old app noted forest canopy at Har Amasa — same limitation here; mast-height margin covers it.
- **Viewshed approximation:** radial sweep can leave thin gaps between far rays; mitigated by dense rays + splatting. Acceptable for a planning tool.
- **Performance:** very large radii or fine resolution could slow the worker; resolution is tunable and the compute is cancellable.
