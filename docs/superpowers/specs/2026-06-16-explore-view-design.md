# Explore View — All LOS Points, Sortable/Filterable, Corridor-First

- **Date:** 2026-06-16
- **Status:** Approved (design), implementing
- **Builds on:** the LOS app (viewshed, scan, safezone).

---

## 1. Purpose

A new "custom view": from a fixed observer, find **all** worthwhile line-of-sight candidate points
within 50 km (inside safe Israel) and present them in a **sortable / filterable table overlaid on the
map**, with **corridor-first** ranking (a *bending* route, not a straight line).

## 2. Goals / Non-Goals

**Goals**
- Exhaustive but **curated** candidate list (best point per ~2.5 km cell; tens–~150 spots).
- **Bending-route corridor** ranked first (default sort).
- Sort by: route order · distance · clearance · ground height.
- Filter by: distance min–max · min clearance · direction sector · min ground height.
- A **📋 table overlay** toggled over the map; row click flies the map + can drop an antenna there
  (precise z12 confirm).
- Curated points as pins + the route as a line on the map.
- Safe-area (Green Line, no Gaza/neighbors) always enforced.

**Non-Goals (YAGNI)**
- No search beyond 50 km; no point-to-point pairs; no precise z12 check on every point (only on click).
- Does not replace the existing fixed-distance scan — this is the broader "browse everything" view.

## 3. Engine (reuses the viewshed sweep)

- **Refactor the viewshed to a clearance-*margin* grid:** the worker outputs a `Float32` margin grid
  (metres above the Fresnel-inflated horizon per cell; `NaN` = no data). The viewshed still renders
  green/red from `margin ≥ 0` (behavior unchanged, re-verified); the explore view reuses the same grid.
- **Curate:** bucket the safe LOS area into **~2.5 km cells**; keep the **max-margin LOS point per cell**
  that `isSafe`. Each candidate: `{ lat, lon, distanceKm, bearingDeg, marginM (z11 estimate), groundElev }`.
  Cap the list (e.g. 200).
- **Bending route:** greedy outward path from the observer — repeatedly hop to the unvisited candidate
  that progresses outward (`distance > current`) within a max hop (~8 km), maximizing clearance; stop when
  no valid hop. Route points get a `routeOrder`; others `Infinity`.
- **Confirm-on-click:** the table shows the z11 estimate; clicking a row drops the antenna and runs the
  precise `analyzeLink` (z12) — same as the scan.

## 4. Sorting & filtering (pure functions over the candidate list)

- **Sort** `route` (default: routeOrder then distance) · `distance` · `clearance` · `height`, asc/desc.
- **Filter** distanceKm ∈ [min,max] · marginM ≥ minClearance · bearing ∈ [from,to] (wrap-aware) ·
  groundElev ≥ minHeight. Safe-area always applied at curation time.

## 5. View / UI (Hebrew, RTL)

- **Toggle button** (📋 טבלת תוצאות) slides a large table over the map; toggle back to the map.
- **Filter bar** (distance min–max, min clearance, direction from–to, min height) + **sort menu / sortable
  column headers**.
- **Columns:** # (route order) · מרחק · אזימוט · מרווח · גובה · קואורדינטות · Waze/Maps · "הצב".
- **Row click** → fly map to the point + highlight; "הצב" sets it as the non-observer antenna (precise check).
- Map shows curated **pins** + the **route polyline**.

## 6. Architecture

- **`src/explore.js`** — pure `curate(grid, box, gridN, isSafe, opts)` + `buildRoute(candidates, observer, opts)`
  + `sortCandidates` / `filterCandidates`, and async `runExplore({observer,…})` orchestrator.
- **`viewshed.js` / `viewshed.worker.js`** — refactor to a margin grid; add `computeMarginGrid()` shared by
  `computeViewshed()` (render) and explore.
- **`src/explore-view.js`** — the table overlay: render rows, sort/filter controls, row→map, set-as-antenna.
- **`map.js`** — reuse pins + route line; **`index.html`** — overlay markup, toggle, filter controls + styles.
- **`tests/explore.test.js`** — `curate`, `buildRoute`, `sortCandidates`, `filterCandidates` unit tests.

## 7. Edge cases

- No LOS / no safe candidates → empty-state message in the table.
- Observer on no-data terrain → message, no compute (same guard as viewshed/scan).
- Observer changed/moved → clear the explore results (like the viewshed/scan).
- List cap + a note when truncated.

## 8. Testing

- Unit: `curate` picks the best-margin safe point per bucket and drops unsafe/no-data; `buildRoute`
  yields an outward, bending order with bounded hops; `sortCandidates`/`filterCandidates` honor each
  field (incl. wrap-aware direction sector).
- In-browser: open the table from Har Amasa, confirm corridor-first order, sort by clearance/distance,
  filter by sector/min-clearance, click a row → map flies + precise verdict matches.
