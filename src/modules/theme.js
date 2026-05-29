// ── JARVIS — src/modules/theme.js ─────────────────────────────
// Cycles DARK → DIM → LIGHT, persists to localStorage.
// Applies via data-theme attribute on <html>.

import { storage } from '../core/storage.js';

const THEMES = ['dark', 'dim', 'light'];
const LABELS  = { dark: '◑ DARK', dim: '◐ DIM', light: '○ LIGHT' };

export function initTheme() {
  const saved = storage.get('jv_theme') || 'dark';
  _apply(saved);
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    _apply(next);
    storage.set('jv_theme', next);
  });
}

function _apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = LABELS[theme];
}
