# Car-Access Ranking for the Explore View

- **Date:** 2026-06-16
- **Status:** Approved (design), implementing
- **Builds on:** the explore view (all LOS points table).

---

## 1. Purpose

Help find LOS spots you can **drive to**, in the **south**, with **~3 m antennas**. In the 📋 explore
table, compute each spot's **distance to the nearest road**, rank reachable + southern spots first, and
show the road distance — without removing far-from-road spots (keep all, rank).

## 2. Goals / Non-Goals

**Goals**
- Per-candidate **distance to nearest road** (paved roads *and* dirt tracks).
- New **road column** + **road sort** + optional **max-distance-to-road filter** in the explore table.
- The orange **corridor route prefers drivable + southern** spots (plus clearance + short hops).
- **Default mast = 3 m** for both antennas.
- Graceful fallback if road data can't load (column shows "—", ranking falls back).

**Non-Goals (YAGNI)**
- No true drive-time routing; nearest-road distance is the signal.
- No hard "car-only" filter by default (keep all; user can filter).
- 3 m is low — LOS will be limited; that's expected, not a bug.

## 3. Road-distance engine

- **`src/roads.js`** — `fetchRoads(box)` queries **OpenStreetMap Overpass** (free, no key) for drivable
  `highway` ways (motorway…residential, service, track, road) in the 50 km box; returns each way as
  `[[lat,lon],…]`; cached per box. POST, CORS-enabled, with timeout + try/catch.
- **`nearestRoadM(lat, lon, ways)`** (pure) — minimum point-to-segment distance (planar, metres) to any
  road segment; `Infinity` if no roads. Unit-tested.
- In `runExplore`: after curation, fetch roads once and set `c.roadDistM` on each candidate (`null` if
  roads unavailable).

## 4. Ranking & table

- **`buildRoute`** score adds a road penalty (prefer near-road) alongside clearance, short hops and the
  existing south bias → a drivable southern corridor.
- **`sortCandidates`**: new `road` mode (nearest first); default `route` non-route order blends
  access (≈250 m buckets) then south.
- **`filterCandidates`**: new `maxRoadKm` (only applied when a spot's road distance is known).
- **`explore-view.js`**: a **כביש** column (e.g. `120 מ'` / `1.4 ק"מ`, "—" if unknown), a sortable header,
  and a "כביש ≤ __ ק"מ" filter input.

## 5. Defaults & UI

- `state.DEFAULT_MAST = 3`; the A/B mast inputs default to `3`.
- Explore progress gains a **"טוען כבישים"** phase.

## 6. Architecture

- New `src/roads.js` + `tests/roads.test.js` (nearest-road math).
- Small edits: `explore.js` (road field + route scoring + sort/filter), `explore-view.js` (column/sort/
  filter), `ui.js` (progress label, default mast), `index.html` (mast defaults, table column, filter),
  `state.js` (DEFAULT_MAST).

## 7. Edge cases

- Overpass down / rate-limited → `fetchRoads` returns `[]`; road column "—"; ranking uses the non-road
  fallback (south + clearance); no error to the user beyond the empty column.
- 3 m masts may yield few/no LOS spots — the existing "no spots" message covers it.

## 8. Testing

- Unit: `nearestRoadM` distance to a known segment (on-road ≈ 0, perpendicular offset, beyond endpoints);
  sort `road` order; `maxRoadKm` filter; route prefers the nearer-road of two equal candidates.
- In-browser: explore from a southern observer at 3 m, confirm a road column populates, sort/filter by
  road, and the route favors near-road southern spots.
