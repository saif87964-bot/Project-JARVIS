// ── JARVIS — src/core/router.js ───────────────────────────────
// SPA router: view swapping, nav-item highlighting, URL hash sync.
// Uses document-level click delegation — works on dynamically rendered nav items.
// Emits 'route:changed' on the bus so modules can react without tight coupling.

import { bus } from './bus.js';

const SUB_ICONS = {
  reminders: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  calendar:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>`,
  news:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h13v16H6a2 2 0 0 1-2-2z"/><path d="M17 8h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2"/><path d="M7 8h7M7 12h7M7 16h4"/></svg>`,
  decisions: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 7h14"/><path d="M5 7l-2 6h4zM19 7l-2 6h4z"/></svg>`,
  cash:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  budget:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M12 3a9 9 0 0 1 9 9h-9z"/></svg>`,
  tools:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5 5L4 17v3h3l5.7-5.7a4 4 0 0 0 5-5l-2.5 2.5-2-2z"/></svg>`,
  settings:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.2-1.3L14 2h-4l-.4 2.5a7 7 0 0 0-2.2 1.3l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.3l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.2 1.3L10 22h4l.4-2.5a7 7 0 0 0 2.2-1.3l2.3 1 2-3.4-2-1.5A7 7 0 0 0 19 12z"/></svg>`,
};
const GROUP_MAP = {
  DAILY:   [{ view: 'reminders', label: 'Tasks' }, { view: 'calendar', label: 'Calendar' }, { view: 'news', label: 'News' }, { view: 'decisions', label: 'Decisions' }],
  FINANCE: [{ view: 'cash', label: 'Cash' }, { view: 'budget', label: 'Budget' }],
  TOOLS:   [{ view: 'tools', label: 'Tools' }, { view: 'settings', label: 'Settings' }],
};
const VIEW_GROUP = { reminders:'DAILY', calendar:'DAILY', news:'DAILY', decisions:'DAILY', cash:'FINANCE', budget:'FINANCE', tools:'TOOLS', settings:'TOOLS' };

function _closeSubmenu() {
  document.getElementById('bnav-submenu')?.classList.remove('open');
  document.getElementById('bnav-backdrop')?.classList.remove('open');
  document.querySelectorAll('.bnav-group.open').forEach(g => g.classList.remove('open'));
}

function _openSubmenu(group) {
  const submenu = document.getElementById('bnav-submenu');
  const label   = document.getElementById('bnav-sub-label');
  const grid    = document.getElementById('bnav-sub-grid');
  if (!submenu || !grid) return;

  label.textContent = group;
  grid.innerHTML = (GROUP_MAP[group] || []).map(({ view, label: l }) => {
    const active = currentView === view ? ' active' : '';
    return `<div class="bnav-sub-tile${active}" data-view="${view}">
      <span class="bnav-sub-tile-icon">${SUB_ICONS[view] || ''}</span>
      <span class="bnav-sub-tile-label">${l}</span>
    </div>`;
  }).join('');

  submenu.classList.add('open');
  document.getElementById('bnav-backdrop')?.classList.add('open');
}

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

  // Highlight sidebar nav items
  document.querySelectorAll('.nav-item[data-view]').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewId);
  });

  // Highlight standalone HOME bnav item
  document.querySelectorAll('.bnav-item[data-view]').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewId);
  });

  // Highlight group as active when one of its sub-views is current
  document.querySelectorAll('.bnav-group').forEach(g => {
    const grp = g.dataset.group;
    g.classList.toggle('group-active', VIEW_GROUP[viewId] === grp);
  });

  // Close submenu after navigation
  _closeSubmenu();

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
    // Group face tap — toggle submenu
    const groupFace = e.target.closest('.bnav-group-face');
    if (groupFace) {
      const group = groupFace.closest('.bnav-group')?.dataset.group;
      const isOpen = groupFace.closest('.bnav-group')?.classList.contains('open');
      _closeSubmenu();
      if (!isOpen && group) {
        groupFace.closest('.bnav-group').classList.add('open');
        _openSubmenu(group);
      }
      return;
    }

    // Backdrop tap — close submenu
    if (e.target.id === 'bnav-backdrop') { _closeSubmenu(); return; }

    // Any [data-view] navigation
    const el = e.target.closest('[data-view]');
    if (!el) return;
    const viewId = el.dataset.view;
    if (viewId) navigate(viewId);
  });

  const hash = window.location.hash.slice(1);
  if (hash && document.getElementById('view-' + hash)) navigate(hash);
}
