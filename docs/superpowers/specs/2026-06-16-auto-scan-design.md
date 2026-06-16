# Automated Multi-Distance LOS Scan — Design Spec

- **Date:** 2026-06-16
- **Status:** Approved (design), implementing
- **Builds on:** the interactive LOS app (`index.html` + `src/*`).

---

## 1. Purpose

Fix one antenna (the observer) and, in a **single run**, automatically find good line-of-sight
candidate points at **several target distances** (default 30 / 40 / 50 km). Two modes:

- **Corridor (default):** prefer points that line up along **one direction** from the observer, so the
  field team drives a single route outward and stops at each range ("on the way to the farthest").
- **Best at each distance (toggle):** pick the single strongest LOS point at each distance, regardless of direction.

This reuses the existing physics (4/3 curvature + 60 % Fresnel) and the radial-sweep machinery already
built for the viewshed.

## 2. Goals / Non-Goals

**Goals**
- One-button scan from the current observer (A or B per the existing observer toggle).
- Configurable target distances (default 30/40/50, editable) with a ±tolerance band (default ±3 km).
- Mode toggle: Corridor ⇄ Best-at-each.
- Ranked result cards (per distance): confirmed YES/NO, min Fresnel clearance, actual distance, ground
  height, coordinates, Waze + Google-Maps links; click flies the map there and **sets it as antenna B**
  so the user gets the precise profile.
- Numbered pins on the map + a corridor line through the chosen points (corridor mode).
- Graceful fallback: corridor finds nothing aligned → fall back to best-at-each and say so; no point at a
  distance → that card shows "none found".

**Non-Goals (YAGNI)**
- No real road routing (geographic-corridor proxy only; road-aware routing is a possible future add).
- No new map/data dependencies; stays a static client-side app.
- No change to the existing manual link test or viewshed behaviour.

## 3. Algorithm (two-stage: discover fast, confirm precise)

**Stage 1 — Discover (z11 radial sweep, reuses viewshed physics).**
- Cast bearings every 1° from the observer to 50 km, stepping ~60 m. Maintain the running-max required
  angle (curvature drop + conservative Fresnel inflation `0.6·F1(d, 50km−d)`), exactly as the viewshed.
- Within each target band (`|d − target| ≤ tol`), record the **best vertical clearance margin**
  (receiver-top metres above the blocking horizon) and its point — only where margin ≥ 0 (LOS + Fresnel clean).
- Produces a `candidates[distance][bearing]` matrix.

**Stage 2 — Select per mode (pure functions).**
- **Best:** for each distance, the bearing with the largest margin.
- **Corridor:** slide a ±5° window over bearings; for each window centre take each distance's best
  in-window candidate; score = (#distances covered)·10⁶ + Σmargin; pick the best centre. If it covers
  zero distances, fall back to Best (flagged).

**Stage 3 — Confirm (z12 precise).**
- For each chosen point, fetch only the **tiles along that path** (`ensurePath`, a thin strip — not the
  whole 50 km box) and run the exact `analyzeLink` (z12, Fresnel) so the displayed verdict/clearance
  matches the manual 2-antenna test. Display the precise min-margin; fall back to the scan estimate if a
  strip tile is missing.

## 4. UI (new "🎯 סריקה אוטומטית" panel, Hebrew/RTL)

- Target-distance text input (default `30, 40, 50`) + tolerance input (±3 km).
- Mode toggle button: `מסדרון — נסיעה אחת` ⇄ `הכי טוב בכל מרחק`.
- "🔍 סרוק נקודות" button + progress bar (loading / scanning / confirming).
- Result cards (one per target distance), each: distance badge, ✓/✗ confirmed, min Fresnel clearance,
  actual distance, ground height, coords, Waze/Maps links; **click → set as antenna B + fly there**.
- Map: numbered pins at the chosen points + a corridor polyline from the observer through them.
- The scan is centred on the **current observer** (the same A/B toggle the viewshed uses); receiver mast =
  antenna B's mast (or the default 10 m).

## 5. Architecture

- **New `src/scan.js`** — pure `sweep()`, `selectBest()`, `selectCorridor()` + async `runScan()`
  orchestrator. Reuses `los.js` (`analyzeLink`, curvature, Fresnel) and `terrain.js`.
- **`terrain.js`** — add `ensurePath(a, b, zoom)` to fetch only the tiles a path crosses.
- **`map.js`** — add `setScanResults(observer, points, corridorAz)` / `clearScan()` (numbered pins + line).
- **`ui.js`** — wire the scan panel; clicking a result reuses `placeAntenna('B', …)` + map fly.
- **`index.html`** — the scan panel markup + styles.
- **`tests/scan.test.js`** — unit tests for the pure `sweep`/`selectBest`/`selectCorridor` logic on
  synthetic candidate data.

## 6. Edge cases

- Observer on no-data terrain → message, no scan (same guard as the link test).
- No LOS at a distance → "לא נמצאה נקודה במרחק X".
- Corridor empty → fall back to best-at-each, flagged in the UI.
- Re-scan clears previous pins/line; clearing is also tied to the existing observer/antenna changes.

## 7. Testing

- Unit: `selectBest` picks the max-margin bearing; `selectCorridor` prefers a window covering all
  distances over scattered higher-margin singletons; `sweep` on a flat synthetic sampler yields LOS
  candidates and on a walled sampler yields none.
- In-browser: scan from Har Amasa, confirm cards + pins + corridor line; toggle modes; click a result →
  it becomes antenna B with a matching precise verdict.
