# National Scan — find the best antenna observer sites across Israel

- **Date:** 2026-06-17
- **Status:** Approved (design), pending implementation plan
- **Author:** Claude + user (segev.solomon@payme.io)

---

## סיכום למשתמש (Hebrew summary — read this first)

המטרה: כפתור אחד שסורק **לבד** את כל ישראל ומחזיר בסרגל הצד **רשימה מדורגת של אתרי המשקיף הכי טובים** — בלי שתסמן ותבדוק נקודות ידנית.

**מה זו "נקודה מתאימה" (אתר משקיף טוב):**
- 🚗 נגישה לרכב — עד ~1 ק"מ מכביש שאפשר לנסוע בו.
- 🇮🇱 בטוחה — בתוך ישראל בלבד (בלי יו"ש / עזה / מחוץ לגבול).
- 📡 קו ראייה טוב לטווח רחוק — מהנקודה (תורן 3 מ') יש קו ראייה פתוח (כולל פרנל + עקמומיות כדור הארץ) שמגיע ל‑~30, 40 ו‑50 ק"מ.

**איך זה רץ מהר מספיק (שני שלבים):**
1. **סינון מהיר על כל ישראל** — רשת נקודות על כל המדינה, ציון "תצפית" מהיר לכל נקודה לפי גובה/פתיחוּת השטח (בלי בדיקת קו ראייה מלאה). שומרים רק את המבטיחות.
2. **בדיקה מדויקת רק על המובילות** — מנוע קו הראייה האמיתי מאשר 30/40/50 ק"מ, מודד מרווח מדויק ובודק מרחק מכביש, וזורק את מי שנכשלת.

**תוצאה:** רשימה מדורגת בסרגל הצד (הכי טובות למעלה, עדיפות לדרום בשוויון), נקודות ממוספרות על המפה, לחיצה → טיסה והדגשה. בכנות: לא בודקים *כל מטר* (זה שעות) — אומרים לך כמה נסרקו וכמה אושרו.

---

## 1. Problem & goal

Today the app is **manual**: the user places one observer, then runs viewshed / scan / explore to evaluate *that* spot. The user instead wants an **automatic, country-wide search** that — without manual point-picking — produces a ranked sidebar list of the best **observer sites** in Israel.

A site is "good" if, with a 3 m mast, it (a) is reachable by car, (b) is inside safe Israel, and (c) has clear line-of-sight reaching the 30 / 40 / 50 km bands.

This is a search/ranking problem over the whole country, not a single-point check. A naive "full viewshed at every cell of Israel" is infeasible in a browser (hours of compute + hundreds of MB of tiles). The design uses a **cheap prefilter → precise confirm** pipeline to make it tractable.

## 2. Definitions

- **Candidate cell** — a grid point inside the safe-Israel polygon, spaced `gridSpacingKm` apart.
- **Vantage score** — a cheap proxy for "sees far": local terrain prominence (cell elevation minus a smoothed/mean elevation of its neighbourhood). Computed from a coarse national elevation grid; no viewshed.
- **Band** — a target distance the site must reach: `[30, 40, 50]` km, tolerance ±3 km.
- **Qualifies** — survives the precise confirm: has clear LOS (margin ≥ 0) at the required bands. Default requirement: **all three bands clear**. Fallback: if zero candidates clear all three, present those clearing the most bands, clearly labelled as partial.
- **Car-accessible** — observer is within `maxRoadM` (default 1000 m) of a drivable road (`fetchRoads` DRIVABLE set, already excludes `track`/`service`).

## 3. Algorithm (pipeline)

### Stage 0 — Build candidate grid (pure)
- Source bbox = safe-Israel bbox (`safezone.BBOX`: lon 34.2–35.95, lat 29.4–33.45).
- Step the bbox every `gridSpacingKm` (default **3 km**) → keep only cells where `isSafe(lat, lon)`.
- Result: ~2,400 safe candidate cells at 3 km (≈880 at 5 km). Coarser spacing = fewer cells = faster, exposed as a setting.

### Stage 1 — Cheap vantage prefilter (covers ALL Israel)
- `ensureCovered(bbox, PREFILTER_ZOOM)` then `buildGrid(...)` one coarse national elevation grid. `PREFILTER_ZOOM = 11` (~65 m) — Israel ≈ a few hundred tiles, loads in seconds.
- For each candidate cell compute `vantageScore = h(cell) − mean(h within prominenceRadiusKm)` (default radius 4 km). High positive ⇒ ridge/hilltop ⇒ likely good far-LOS.
- Sort candidates by `vantageScore` desc; keep the **top `maxConfirm`** (default **60**) for Stage 2. Log: "scanned N cells, confirming top K".
- (Road proximity is NOT checked here — Overpass over all Israel would time out. Deferred to Stage 2 on the short list.)

### Stage 2 — Precise confirm (top candidates only)
- For each shortlisted candidate, reuse **`runScan`** from `scan.js`:
  `runScan({ observer:{lat,lon,mast:3,groundElev:NaN}, distancesKm:[30,40,50], toleranceKm:3, rxMast:3, freqHz, fresnelPct:0.6, mode:'best' })`.
  - `runScan` already: loads the 50 km tile box (z11), samples observer ground (throws `observer-no-data` on sea), sweeps physics, selects best-per-band, **confirms each pick at z12 with `analyzeLink`**, and keeps only safe points.
  - Wrap each call in try/catch: `observer-no-data` / `terrain-unavailable` / `cancelled` → candidate dropped (not qualifying), loop continues.
- A candidate **qualifies** if its confirmed points clear the required bands (default all three). Compute per-candidate:
  - `bandsClear` (0–3), `clearanceSum` (Σ margin of clear bands), `maxReachKm`.
- **Road check** on qualifying candidates: fetch roads per-candidate small bbox (reuse `roadsBox` + `fetchRoads`, limited concurrency, mirror fallback), `roadDistM = nearestRoadM(cand, ways)`. Drop those with `roadDistM > maxRoadM` (default 1000). If Overpass fails entirely, keep candidates with `roadDistM = null` and surface a "road data unavailable" warning rather than returning empty.

### Stage 3 — Rank & output
- Sort qualifying, accessible observers by: `bandsClear` desc → `clearanceSum` desc → **south first** (lower lat) as tiebreak.
- Return `{ sites:[…], scanned, confirmed, hasRoads }`. Each site: `{ lat, lon, groundElev, bandsClear, maxReachKm, clearanceSum, roadDistM, bands:[{km,marginM,clear}] }`.

## 4. Architecture & files

New, reuse-heavy. Keep each file < 500 lines (per CLAUDE.md).

- **`src/national.js`** (new) — orchestrator. Exposes:
  - `buildCandidateGrid(bbox, spacingKm, isSafe)` — pure.
  - `scoreVantage(grid, gridN, box, candidates, prominenceRadiusKm)` — pure.
  - `qualifies(scanResult, bands, tolKm, mode)` and `rankSites(sites)` — pure.
  - `runNationalScan({ bbox, gridSpacingKm, maxConfirm, freqHz, fresnelPct, maxRoadM, onProgress, signal })` — async pipeline; cancellable via a token (mirrors `cancelScan`).
- **`src/national-view.js`** (new) — renders the ranked list **in the main sidebar** (not an overlay): group header (count + "scanned N / confirmed K"), one row per site (rank, max reach, clearance, road dist, coords, Waze/Maps), row click → `onFly`. Small, ~100 lines.
- **`src/map.js`** — add `setNationalResults(sites, onPick)`: numbered pins (reuse the scan/explore pin style) + `fitBounds`; plus reuse `highlightExplore`/a `clearNational`.
- **`src/ui.js`** — wire a new sidebar button `#national-btn` → run `runNationalScan`, stream progress to a progress bar, render via `national-view` + `map.setNationalResults`. Reuse the existing progress/cancel patterns.
- **`index.html`** — add a prominent sidebar block: button **"🔭 סריקה ארצית"**, a progress bar, an area-scope note, and a `#national-results` container. (Mobile drawer already wraps the sidebar — inherits responsiveness.)
- **Reused as-is:** `terrain.js` (`ensureCovered`, `buildGrid`, `elevation`), `scan.js` (`runScan`, `cancelScan`), `safezone.js` (`isSafe`, `BBOX`), `roads.js` (`fetchRoads`, `nearestRoadM`), `explore.js` (`roadsBox` helper — export it), `geo.js`.

No new Web Worker: Stage 1 is cheap (main thread); Stage 2 reuses `runScan`'s existing chunked/`await`-yielding sweep, so the UI stays responsive with a progress bar.

## 5. Data flow

```
[National Scan button]
  → buildCandidateGrid(BBOX, 3km, isSafe)            // ~2400 safe cells
  → ensureCovered + buildGrid (z11 national)         // tiles, seconds
  → scoreVantage → sort → top 60                     // cheap, pure
  → for each of 60: runScan([30,40,50]) (z11→z12)    // precise, minutes, yields
       → qualifies? collect bandsClear/clearance
  → fetchRoads per qualifying site → nearestRoadM     // drop > 1km
  → rankSites (bands, clearance, south)
  → national-view list + map numbered pins + fitBounds
```

Progress phases reported to the UI: `grid` → `prefilter-tiles` → `prefilter-score` → `confirm` (i/K) → `roads` → `done`.

## 6. Performance & honesty

- Stage 1 national z11 grid: a few hundred tiles (cached, shared with later scans), seconds.
- Stage 2: `maxConfirm` (60) precise scans. Each `runScan` ≈ 2–5 s incl. tile loading; nearby candidates reuse cached tiles. Expect **a few minutes** for all Israel — matches the user's accepted "slow". A progress bar shows phase + i/K.
- Tile cache: `terrain.MAX_TILES = 400`. All-Israel z11 + 50 km buffers can approach this; process the shortlist in spatial (e.g. lat-sorted) order to maximise cache reuse, and consider raising `MAX_TILES` if eviction thrashes (validate during implementation).
- **No silent truncation:** the result header always states `scanned N cells, precisely checked K, confirmed M`. The prefilter is an explicit heuristic — extreme-vantage cells are kept; we never claim full per-meter coverage.
- Scope control: a region mode (scan the current map view bbox instead of all-Israel) is a cheap variant for speed; default action is all-Israel per the user's choice.

## 7. Error handling

- Candidate on sea / no terrain → `runScan` throws `observer-no-data` → drop, continue.
- `terrain-unavailable` (mostly nodata) for a candidate → drop, continue.
- Overpass roads fail → keep LOS-qualified sites with `roadDistM=null`, show warning; do not return empty.
- Zero qualifiers at "all three bands" → fallback to best `bandsClear`, labelled partial.
- Cancellation (new run / navigation) → token bump aborts the loop promptly (reuse `cancelScan`).
- All user-facing strings in Hebrew/RTL.

## 8. Testing

`tests/national.test.js` (Node, pure functions — no DOM/network):
- `buildCandidateGrid` — spacing count, every returned cell `isSafe`, points outside the polygon excluded.
- `scoreVantage` — a synthetic grid with one hill ranks the hilltop above the plain; flat grid → ~0 scores.
- `qualifies` — all-three vs partial vs none; tolerance handling.
- `rankSites` — ordering by bandsClear → clearance → south tiebreak.

Keep the existing 65 assertions green; `npm test` runs all.

## 9. Out of scope (YAGNI)

- Far-end (target) accessibility — only the **observer** must be road-accessible (user deferred; easy add later via a flag).
- Multi-hop relay/network optimisation between sites.
- Server-side / precomputed national index — stays fully client-side.
- Saving/exporting the result set.

## 10. Open decision (carried, non-blocking)

Qualifier strictness defaults to **all three bands clear**; if that yields too few sites in practice we relax to "best bandsClear" automatically (Stage 2 fallback already specified). No further input needed to start.

## 11. Implementation refinements (post adversarial review)

A multi-agent adversarial review (4 dimensions, each finding independently verified) ran after the first build; these refinements were applied and re-tested:

- **Roads — per-candidate boxes, not one `roadsBox`.** National candidates are scattered country-wide, so a single bbox would time out Overpass. We query small deduped per-candidate boxes (`fetchRoads`, concurrency 3, mirror fallback). `fetchRoads(box, {withStatus})` now returns `{ok, ways}` so a genuine **outage** (`ok:false`) is distinguished from a successful **roadless** query (`ok:true, ways:[]`). Outage/unknown sites are **kept** (`roadDistM=null`) and flagged; genuinely-too-far sites (`roadDistM=Infinity`) are dropped. The accessibility filter is `roadDistM == null || roadDistM <= maxRoadM`.
- **Bands require precise confirmation.** A band counts as clear only if `p.confirmed` (the z12 confirm had terrain data), so unconfirmed/"estimated" picks don't inflate `bandsClear` — matching the conservative manual-scan UI.
- **Partial fallback = best tier only.** When no site clears all bands, only the **maximum** achieved `bandsClear` tier is shown (`pickDisplaySites`), not the whole pool.
- **Isolated cancellation.** `runScan` takes an optional `isCancelled` hook; the national scan passes its own token so it neither shares nor clobbers the manual-scan token (`cancelNationalScan` no longer calls `cancelScan`). Fixes the shared-`scanToken` collision.
- **Prefilter de-biasing.** The terrain grid is padded by the prominence radius so edge candidates get a full, unbiased neighbourhood.
- **Guards.** `runNationalScan` clamps `gridSpacingKm` (≥0.5 km) and `maxConfirm`, and throws `empty-bbox` on a degenerate box. Header reports the confirmed-LOS count (`losCount`); the empty-result message distinguishes "no LOS" from "LOS found but none car-accessible".
- **Tile cache is now true LRU** (`loadTile` refreshes recency on hit), so the spatial-order reuse survives eviction; `MAX_TILES` raised to 700.

Tests: `tests/national.test.js` (25 assertions) plus the existing suites — **90 assertions, all green**.
