// state.js — single source of truth for the app. Plain object + tiny pub/sub.

export const state = {
  antennaA: null, // { lat, lon, groundElev, mast }
  antennaB: null,
  frequencyMHz: 5800,
  fresnelPct: 0.6,
  observer: 'A', // whose 50 km viewshed is shown
  link: null,    // last analyzeLink() result
  viewshed: null, // last viewshed stats
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function update(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state);
}

export const freqHz = () => state.frequencyMHz * 1e6;

export const DEFAULT_MAST = 3;
