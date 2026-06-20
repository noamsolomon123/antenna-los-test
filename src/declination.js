// declination.js — magnetic declination for Israel (pure, no DOM).
// Antennas are aimed with a magnetic compass, but every azimuth the app computes is
// TRUE north. Over Israel the declination is a slowly-varying ~+4.5°…+5.3° East, so a
// compact local linear fit (NOAA WMM2025, epoch ~2026) is accurate to a few tenths of
// a degree across the country — plenty for pointing a dish. Labelled approximate.

const ISRAEL = { south: 29.4, north: 33.4, west: 34.2, east: 35.9 };

/** Magnetic declination (degrees East, positive) at lat/lon. Linear fit for Israel. */
export function magneticDeclination(lat, lon) {
  // anchored at (31.5, 35.0) ≈ +4.85°, gradients from WMM2025 over Israel
  const la = Math.min(ISRAEL.north, Math.max(ISRAEL.south, lat));
  const lo = Math.min(ISRAEL.east, Math.max(ISRAEL.west, lon));
  return 4.85 + 0.17 * (la - 31.5) + 0.05 * (lo - 35.0);
}

const norm360 = (d) => ((d % 360) + 360) % 360;

/** Convert a TRUE-north bearing to the magnetic bearing a compass would show. */
export function trueToMagnetic(azTrueDeg, lat, lon) {
  return norm360(azTrueDeg - magneticDeclination(lat, lon));
}

/** Convert a magnetic compass bearing to TRUE north. */
export function magneticToTrue(azMagDeg, lat, lon) {
  return norm360(azMagDeg + magneticDeclination(lat, lon));
}
