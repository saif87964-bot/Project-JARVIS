// ── JARVIS — src/core/router.js ───────────────────────────────
// SPA router: view swapping, nav-item highlighting, URL hash sync.
// Uses document-level click delegation — works on dynamically rendered nav items.
// Emits 'route:changed' on the bus so modules can react without tight coupling.

import { bus } from './bus.js';

let currentView = 'dashboard';

/**
 * Navigate to a view by ID.
 * No-op if the target view element does not exist in the DOM.
 */
export function navigate(viewId) {
  if (!document.getElementById('view-' + viewId)) return;

  currentView = viewId;

  // Swap visible view
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewId).classList.add('active');

  // Highlight sidebar + bottom-nav items
  document.querySelectorAll('.nav-item[data-view], .bnav-item[data-view]').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewId);
  });

  // Scroll center panel back to top on view change
  document.querySelector('.center').scrollTop = 0;

  // Sync URL hash (dashboard = no hash)
  history.replaceState(null, '', viewId === 'dashboard' ? ' ' : '#' + viewId);

  // Notify subscribers (modules react here, not inside the router)
  bus.emit('route:changed', { viewId });
}

/** Returns the currently active view ID. */
export function getCurrentView() {
  return currentView;
}

/**
 * Call once at startup.
 * Wires document-level delegation for all [data-view] elements
 * and restores the view from the URL hash.
 */
export function initRouter() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-view]');
    if (!el) return;
    const viewId = el.dataset.view;
    if (viewId) navigate(viewId);
  });

  // Restore from URL hash on load (e.g. direct link or page refresh)
  const hash = window.location.hash.slice(1);
  if (hash && document.getElementById('view-' + hash)) {
    navigate(hash);
  }
}
