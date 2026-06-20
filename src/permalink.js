// permalink.js — encode/decode the app scenario to/from a URL hash (pure, no DOM).
// Lets a whole line-of-sight setup (both antennas, masts, frequency, observer, link-budget
// inputs) be saved & shared as one link — no backend, perfect for GitHub Pages.

const ant = (x) => `${x.lat.toFixed(5)},${x.lon.toFixed(5)},${Number(x.mast) || 0}`;
const parseAnt = (v) => {
  const [lat, lon, mast] = String(v).split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon)
    ? { lat, lon, mast: Number.isFinite(mast) ? mast : 3 }
    : null;
};

/** Serialize state → compact query string (no leading '#'). Omits absent fields. */
export function encodeState(s) {
  const p = new URLSearchParams();
  if (s.antennaA) p.set('a', ant(s.antennaA));
  if (s.antennaB) p.set('b', ant(s.antennaB));
  if (s.frequencyMHz) p.set('f', String(s.frequencyMHz));
  if (s.observer === 'A' || s.observer === 'B') p.set('o', s.observer);
  if (s.budget) p.set('lb', `${s.budget.tx},${s.budget.gain},${s.budget.sens}`);
  if (s.modelA) p.set('ma', s.modelA);
  if (s.modelB) p.set('mb', s.modelB);
  return p.toString();
}

/** Parse a hash/query string → partial state. Ignores malformed fields. */
export function decodeState(str) {
  const p = new URLSearchParams(String(str || '').replace(/^#/, ''));
  const out = {};
  if (p.has('a')) { const a = parseAnt(p.get('a')); if (a) out.antennaA = a; }
  if (p.has('b')) { const b = parseAnt(p.get('b')); if (b) out.antennaB = b; }
  if (p.has('f')) { const f = Number(p.get('f')); if (Number.isFinite(f) && f > 0) out.frequencyMHz = f; }
  if (p.has('o')) { const o = p.get('o'); if (o === 'A' || o === 'B') out.observer = o; }
  if (p.has('lb')) {
    const [tx, gain, sens] = String(p.get('lb')).split(',').map(Number);
    if ([tx, gain, sens].every(Number.isFinite)) out.budget = { tx, gain, sens };
  }
  if (p.has('ma')) out.modelA = p.get('ma');
  if (p.has('mb')) out.modelB = p.get('mb');
  return out;
}
