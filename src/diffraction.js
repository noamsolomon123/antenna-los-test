// diffraction.js — single knife-edge diffraction loss (ITU-R P.526), pure/no-DOM.
// Upgrades the binary "blocked / clear" answer into a real attenuation in dB for an
// obstacle that intrudes into (or near) the line of sight, which then feeds the link
// budget so a "grazing" hill costs signal instead of being all-or-nothing.

/**
 * Fresnel-Kirchhoff diffraction parameter v for an obstacle of height h (m) ABOVE the
 * straight line of sight, at distances d1/d2 (m) from the two endpoints, wavelength λ (m).
 *   v = h · sqrt( 2·(d1+d2) / (λ·d1·d2) )
 * h > 0 ⇒ obstacle pokes above the LOS (loss); h < 0 ⇒ clearance below the LOS.
 */
export function diffractionParamV(hMeters, d1m, d2m, lambdaM) {
  const tot = d1m + d2m;
  if (tot <= 0 || lambdaM <= 0 || d1m <= 0 || d2m <= 0) return -Infinity;
  return hMeters * Math.sqrt((2 * tot) / (lambdaM * d1m * d2m));
}

/**
 * Knife-edge diffraction loss J(v) in dB (ITU-R P.526 §4.1 approximation, valid v > −0.78;
 * ~0 dB below that). J(0)=6 dB, J(1)≈14 dB, J(2.4)≈20 dB.
 */
export function knifeEdgeLossDb(v) {
  if (!Number.isFinite(v) || v <= -0.78) return 0;
  const t = Math.sqrt((v - 0.1) ** 2 + 1) + v - 0.1;
  return 6.9 + 20 * Math.log10(t);
}
