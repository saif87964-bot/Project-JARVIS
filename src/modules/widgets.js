// ── JARVIS — src/modules/widgets.js ───────────────────────────
// Dashboard widget configuration — show/hide + reorder the cards
// on the home screen. Cards are tagged with [data-widget] in the
// HTML; this module applies CSS flex `order` + display from a
// saved config, and renders the control rows in Settings.
// Exports:
//   setupWidgets()   — call once at boot (applies config, wires settings)
//   renderDashCash() — refresh the cash snapshot widget (route hook)

import { storage }      from '../core/storage.js';
import { STORAGE_KEYS } from '../config.js';
import { fmtTZS }       from '../utils.js';

const WIDGETS_KEY = 'jv_widgets';

const WIDGETS = [
  { id: 'greeting', label: 'GREETING & STATS' },
  { id: 'cash',     label: 'CASH SNAPSHOT'    },
  { id: 'tasks',    label: 'TASKS PREVIEW'    },
  { id: 'news',     label: 'NEWS PREVIEW'     },
];

// ── Config ─────────────────────────────────────────────────────

function _getConfig() {
  const saved = storage.get(WIDGETS_KEY);
  const order = (saved?.order || []).filter(id => WIDGETS.find(w => w.id === id));
  // Append any widgets missing from a stale saved order (new widgets ship later)
  WIDGETS.forEach(w => { if (!order.includes(w.id)) order.push(w.id); });
  const hidden = (saved?.hidden || []).filter(id => WIDGETS.find(w => w.id === id));
  return { order, hidden };
}

function _saveConfig(cfg) {
  storage.set(WIDGETS_KEY, cfg);
}

// ── Apply to dashboard ─────────────────────────────────────────

function applyWidgets() {
  const cfg = _getConfig();
  cfg.order.forEach((id, i) => {
    const el = document.querySelector(`#view-dashboard [data-widget="${id}"]`);
    if (!el) return;
    el.style.order   = i;
    el.style.display = cfg.hidden.includes(id) ? 'none' : '';
  });
}

// ── Cash snapshot widget ───────────────────────────────────────

export function renderDashCash() {
  const balEl = document.getElementById('dash-cash-bal');
  if (!balEl) return;

  const data     = storage.get(STORAGE_KEYS.CASH, { balance: 0, transactions: [] });
  const todayStr = new Date().toDateString();
  let todayIn = 0, todayOut = 0;
  (data.transactions || []).forEach(tx => {
    if (new Date(tx.date).toDateString() === todayStr) {
      if (tx.type === 'credit') todayIn  += tx.amount;
      else                      todayOut += tx.amount;
    }
  });

  balEl.textContent = fmtTZS(data.balance || 0);
  balEl.classList.toggle('negative', (data.balance || 0) < 0);
  const inEl  = document.getElementById('dash-cash-in');
  const outEl = document.getElementById('dash-cash-out');
  if (inEl)  inEl.textContent  = '+ ' + fmtTZS(todayIn);
  if (outEl) outEl.textContent = '− ' + fmtTZS(todayOut);
}

// ── Settings UI ────────────────────────────────────────────────

function _renderSettingsRows() {
  const list = document.getElementById('widget-settings-list');
  if (!list) return;
  const cfg = _getConfig();

  list.innerHTML = cfg.order.map((id, i) => {
    const w      = WIDGETS.find(x => x.id === id);
    const hidden = cfg.hidden.includes(id);
    return `
      <div class="setting-row widget-row">
        <div class="setting-label">
          <div class="setting-name">${w.label}</div>
        </div>
        <div class="widget-controls">
          <button class="widget-move-btn" data-w-act="up"   data-w-id="${id}" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button class="widget-move-btn" data-w-act="down" data-w-id="${id}" ${i === cfg.order.length - 1 ? 'disabled' : ''}>▼</button>
          <button class="setting-toggle" data-w-act="toggle" data-w-id="${id}" data-state="${hidden ? 'off' : 'on'}">
            ${hidden ? 'OFF' : 'ON'}
          </button>
        </div>
      </div>`;
  }).join('');
}

function _handleAction(act, id) {
  const cfg = _getConfig();

  if (act === 'toggle') {
    cfg.hidden = cfg.hidden.includes(id)
      ? cfg.hidden.filter(x => x !== id)
      : [...cfg.hidden, id];
  } else {
    const idx  = cfg.order.indexOf(id);
    const swap = act === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= cfg.order.length) return;
    [cfg.order[idx], cfg.order[swap]] = [cfg.order[swap], cfg.order[idx]];
  }

  _saveConfig(cfg);
  applyWidgets();
  _renderSettingsRows();
}

// ── Boot ───────────────────────────────────────────────────────

export function setupWidgets() {
  applyWidgets();
  renderDashCash();
  _renderSettingsRows();

  document.getElementById('widget-settings-list')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-w-act]');
    if (!btn || btn.disabled) return;
    _handleAction(btn.dataset.wAct, btn.dataset.wId);
  });
}
