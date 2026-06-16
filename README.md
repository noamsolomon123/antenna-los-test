# 📡 Antenna LOS — Line-of-Sight & Viewshed for Israel

Interactive, in-browser **line-of-sight** planning tool for point-to-point radio links over Israel.
Pick two antennas on a satellite map and instantly see **YES/NO** whether they have a clear link,
plus a live **50 km coverage map** (viewshed) from any chosen point.

**▶ Live app: https://noamsolomon123.github.io/antenna-los-test/**

---

## הפעלה (עברית)

**הדרך הכי פשוטה:** פשוט פתחו את הקישור — עובד על כל מחשב עם אינטרנט, בלי התקנה:
**https://noamsolomon123.github.io/antenna-los-test/**

**הרצה מקומית:** לחיצה כפולה על `run.bat`. הסקריפט מרים שרת מקומי ופותח את הדפדפן אוטומטית
(משתמש ב-Python או Node אם מותקנים; אחרת פותח את הגרסה המקוונת). צריך חיבור אינטרנט
לטעינת תמונות הלוויין ונתוני הגובה.

### איך משתמשים
1. לוחצים על המפה כדי למקם את **אנטנה A**, ואז שוב כדי למקם את **אנטנה B**. אפשר לגרור כל אנטנה לכוונון.
2. מגדירים **גובה תורן** לכל אנטנה ו**תדר עבודה** (יש קיצורי דרך: 2.4 / 5.0 / 5.8 GHz / 900 MHz).
3. כרטיס "מצב הקישור" מציג **כן/לא** לקו ראייה, מרווח פרנל מינימלי וחתך טופוגרפי של המסלול.
4. בוחרים מי המשקיף (A או B) ולוחצים **"חשב כיסוי 50 ק"מ"** — המפה נצבעת ירוק (יש קו ראייה) / אדום (אין).

---

## How it works

- **Base map:** Esri World Imagery (satellite, default), OpenTopoMap, OpenStreetMap — all free, no API key.
- **Elevation:** AWS *Terrain Tiles* (Terrarium-encoded, ~30 m SRTM-grade), decoded in the browser. This drives the
  math; it's invisible on screen.
- **Physics:** earth curvature with the standard **4/3 effective-radius** refraction model, plus **first
  Fresnel-zone** clearance at your chosen frequency. A link is **YES** only if the terrain clears **60 % of F1**
  everywhere along the path.
- **Viewshed:** a radial line-of-sight sweep (in a Web Worker, off the main thread) marks every cell within 50 km
  as YES/NO for a receiver at the other antenna's mast height. This is a **fast ~65 m approximation** (kept
  conservative so a green cell shouldn't false-positive); the link test and the scan's confirmed points use finer
  ~30 m data, so treat the viewshed as a coverage guide and confirm a specific spot with the link test.
- **Auto-scan (🎯):** fix one antenna and find good LOS spots at several target distances (e.g. 30/40/50 km) in one
  run — **corridor mode** keeps them along one bearing (one drive), or **best-at-each-distance**. Each result is
  re-checked with the precise link math; click a result to drop the antenna there.
- **Height map:** a toggleable colored elevation overlay (deep blue below sea → green → tan/brown → white peaks)
  so high and low ground are obvious at a glance.

It's a **planning tool**: bare-earth terrain only (no buildings/canopy), ~30 m resolution. Always confirm on site.

## Run locally

| OS | Command |
|----|---------|
| Windows | double-click **`run.bat`** |
| macOS / Linux | **`./run.sh`** |
| Manual (Windows) | `py serve.py 8080` then open `http://localhost:8080/` |
| Manual (macOS/Linux) | `python3 serve.py 8080` then open `http://localhost:8080/` |
| Manual (Node, no Python) | `node server.js 8080` |

> Opening `index.html` directly from disk (`file://`) will **not** work — browsers block module workers and
> cross-origin terrain fetches from local files. Use the run script or the live URL.

## Tests

Pure-physics unit tests, no dependencies:

```bash
node tests/los.test.js     # or: npm test
```

## Project layout

```
index.html                 app shell (Hebrew / RTL)
src/geo.js                 geodesy helpers
src/los.js                 curvature + Fresnel + link analysis (pure, tested)
src/terrain.js             terrain-tile fetch / decode / sample
src/viewshed.js            viewshed orchestration + overlay render
src/viewshed.worker.js     radial-sweep compute (Web Worker)
src/scan.js                automated multi-distance corridor scan (pure + async)
src/heightmap.js           colored elevation overlay (GridLayer)
src/profile-chart.js       terrain cross-section chart
src/map.js                 Leaflet map controller
src/ui.js                  sidebar + interaction glue
src/state.js               app state
tests/los.test.js          physics unit tests
tests/scan.test.js         scan-logic unit tests
run.bat / run.ps1 / run.sh foolproof launchers
serve.py / server.js       zero-dependency local servers (correct MIME)
```
