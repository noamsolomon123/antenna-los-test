// mobile.js — wires the phone controls drawer (the ☰ button, scrim, and ×).
// Side-effect on import; safe on desktop (the elements are hidden by CSS there).
function wireDrawer() {
  const open = () => document.body.classList.add('drawer-open');
  const close = () => document.body.classList.remove('drawer-open');
  document.getElementById('menu-btn')?.addEventListener('click', open);
  document.getElementById('scrim')?.addEventListener('click', close);
  document.getElementById('drawer-close')?.addEventListener('click', close);
}

/** Programmatically close the drawer (e.g. when a full-screen overlay opens). */
export function closeDrawer() { document.body.classList.remove('drawer-open'); }

if (document.readyState !== 'loading') wireDrawer();
else document.addEventListener('DOMContentLoaded', wireDrawer);
