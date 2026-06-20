// linkbudget.js — RF link-budget math (pure, no DOM). Importable in Node for tests.
// Turns a geometric "is there line of sight?" into "will the link actually close,
// and with how much fade margin?". All decibel arithmetic, no external data.
//
// FSPL uses the standard MHz/km form:  L = 32.44 + 20·log10(f_MHz) + 20·log10(d_km).

/** Free-space path loss (dB) for frequency f (MHz) over distance d (km). */
export function fsplDb(freqMHz, distKm) {
  if (freqMHz <= 0 || distKm <= 0) return 0;
  return 32.44 + 20 * Math.log10(freqMHz) + 20 * Math.log10(distKm);
}

/** Effective isotropic radiated power (dBm) = Tx power + Tx antenna gain − Tx feed loss. */
export function eirpDbm({ txPowerDbm, txGainDbi = 0, txCableLossDb = 0 }) {
  return txPowerDbm + txGainDbi - txCableLossDb;
}

/** Received power (dBm) at the far end. */
export function rxPowerDbm({ eirp, fspl, rxGainDbi = 0, rxCableLossDb = 0, extraLossDb = 0 }) {
  return eirp - fspl + rxGainDbi - rxCableLossDb - extraLossDb;
}

/** Fade margin (dB) = received power − receiver sensitivity. Higher = more robust. */
export function fadeMarginDb(rxPowerDbmValue, rxSensitivityDbm) {
  return rxPowerDbmValue - rxSensitivityDbm;
}

/** Theoretical max range (km) at which Rx power just equals receiver sensitivity. */
export function maxRangeKm({ eirp, freqMHz, rxGainDbi = 0, rxCableLossDb = 0, extraLossDb = 0, rxSensitivityDbm }) {
  if (freqMHz <= 0) return 0;
  const fsplMax = eirp + rxGainDbi - rxCableLossDb - extraLossDb - rxSensitivityDbm;
  const exp = (fsplMax - 32.44 - 20 * Math.log10(freqMHz)) / 20;
  return Math.pow(10, exp);
}

/**
 * Qualitative link grade from fade margin (dB).
 *  none   : margin < 0   — link does not close
 *  weak   : 0–6 dB       — closes but no headroom (rain/fade will drop it)
 *  ok     : 6–15 dB      — usable (~95–99% availability rule of thumb)
 *  strong : ≥ 15 dB      — robust
 */
export function linkQuality(marginDb) {
  if (!Number.isFinite(marginDb)) return 'unknown';
  if (marginDb < 0) return 'none';
  if (marginDb < 6) return 'weak';
  if (marginDb < 15) return 'ok';
  return 'strong';
}

/**
 * Full link budget from a single params object:
 *  { txPowerDbm, txGainDbi, txCableLossDb, rxGainDbi, rxCableLossDb,
 *    extraLossDb, rxSensitivityDbm, freqMHz, distKm }
 * Returns { eirp, fspl, rxPowerDbm, fadeMarginDb, quality, maxRangeKm }.
 */
export function computeLinkBudget(p) {
  const eirp = eirpDbm(p);
  const fspl = fsplDb(p.freqMHz, p.distKm);
  const rx = rxPowerDbm({
    eirp, fspl, rxGainDbi: p.rxGainDbi, rxCableLossDb: p.rxCableLossDb, extraLossDb: p.extraLossDb,
  });
  const margin = fadeMarginDb(rx, p.rxSensitivityDbm);
  return {
    eirp,
    fspl,
    rxPowerDbm: rx,
    fadeMarginDb: margin,
    quality: linkQuality(margin),
    maxRangeKm: maxRangeKm({
      eirp, freqMHz: p.freqMHz, rxGainDbi: p.rxGainDbi, rxCableLossDb: p.rxCableLossDb,
      extraLossDb: p.extraLossDb, rxSensitivityDbm: p.rxSensitivityDbm,
    }),
  };
}

/** Sensible defaults for a typical 5 GHz point-to-point dish link. */
export const DEFAULT_BUDGET = {
  txPowerDbm: 20,        // 100 mW
  txGainDbi: 20,
  txCableLossDb: 0.5,
  rxGainDbi: 20,
  rxCableLossDb: 0.5,
  extraLossDb: 0,        // reserved for diffraction/clutter/rain once wired in
  rxSensitivityDbm: -85,
};
