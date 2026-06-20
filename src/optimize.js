// optimize.js — minimum mast-height optimizer (pure, no DOM).
// Answers "how high must I raise one end for the link to clear?" by binary-searching
// the mast height on that side against the existing analyzeLink clearance physics.
import { analyzeLink } from './los.js';

/**
 * Smallest mast height (m) on `side` ('A'|'B') that makes the A↔B link clear
 * (60% Fresnel + 4/3 curvature), holding the other end fixed.
 *   { a, b, freqHz, fresnelPct, sampleElev, side, maxMast?, toleranceM? }
 * Returns an integer height, 0 if it already clears, or null if even maxMast can't
 * clear it (or terrain data is missing).
 */
export function minMastForClearance({ a, b, freqHz, fresnelPct, sampleElev, side, maxMast = 120, toleranceM = 0.5 }) {
  const base = side === 'A' ? a : b;
  const marginAt = (mast) => {
    const cand = { ...base, mast };
    const r = analyzeLink({
      a: side === 'A' ? cand : a,
      b: side === 'B' ? cand : b,
      freqHz, fresnelPct, sampleElev,
    });
    return r.hasData ? r.minMargin : NaN;
  };
  if (!(marginAt(maxMast) >= 0)) return null; // unreachable even at the ceiling (or no data)
  if (marginAt(0) >= 0) return 0;             // already clears with no mast
  let lo = 0, hi = maxMast;
  while (hi - lo > toleranceM) {
    const mid = (lo + hi) / 2;
    if (marginAt(mid) >= 0) hi = mid; else lo = mid;
  }
  return Math.ceil(hi);
}
