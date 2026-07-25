// ── JARVIS — src/modules/theme.js ─────────────────────────────
// Two independent axes:
//   THEME (lightness): dark → dim → light  — data-theme attribute
//   SKIN  (identity):  hud  → money        — data-skin  attribute
// Both persist to localStorage.

import { storage } from '../core/storage.js';

const THEMES = ['dark', 'dim', 'light'];
const LABELS  = { dark: '◑ DARK', dim: '◐ DIM', light: '○ LIGHT' };

const SKINS      = ['hud', 'money'];
const SKIN_LABELS = { hud: '◈ HUD', money: '◈ MONEY' };

export function initTheme() {
  const savedTheme = storage.get('jv_theme') || 'dark';
  const savedSkin  = storage.get('jv_skin')  || 'hud';
  _applyTheme(savedTheme);
  _applySkin(savedSkin);

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
    _applyTheme(next);
    storage.set('jv_theme', next);
  });

  document.getElementById('skin-toggle')?.addEventListener('click', () => {
    const cur  = document.documentElement.getAttribute('data-skin') || 'hud';
    const next = SKINS[(SKINS.indexOf(cur) + 1) % SKINS.length];
    _applySkin(next);
    storage.set('jv_skin', next);
  });
}

function _applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = LABELS[theme];
}

function _applySkin(skin) {
  document.documentElement.setAttribute('data-skin', skin);
  const btn = document.getElementById('skin-toggle');
  if (btn) btn.textContent = SKIN_LABELS[skin];
}
