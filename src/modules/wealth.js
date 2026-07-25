// ── JARVIS — src/modules/wealth.js ────────────────────────────
// Net-worth / wealth tab, ported from the "JARVIS Money" concept.
// Storage: jv_wealth = { accounts:[{id,name,type,autoSync}],
//                        investments:[{id,name,current,growth}],
//                        history:[{monthKey, netWorth}] }
//
// AUTO-SYNC accounts read their balance from cash.js (match by id).
// MANUAL investments hold their own numbers.
// A monthly netWorth snapshot is appended on view render for the
// sparkline. History keeps last 12 months.
//
// Exports:
//   setupWealth()  — one-time wiring (delegation)
//   renderWealth() — re-render on navigate

import { storage }     from '../core/storage.js';
import { STORAGE_KEYS } from '../config.js';
import { bus }         from '../core/bus.js';
import { esc, fmtTZS } from '../utils.js';

const WEALTH_KEY = 'jv_wealth';

const SEED = {
  accounts: [
    { id: 'crdb',        name: 'CRDB BANK',    type: 'CURRENT',      autoSync: true },
    { id: 'cash',        name: 'CASH',         type: 'WALLET',       autoSync: true },
    { id: 'selcom-pesa', name: 'SELCOM PESA',  type: 'MOBILE MONEY', autoSync: true },
    { id: 'absa',        name: 'ABSA',         type: 'SAVINGS',      autoSync: true },
  ],
  investments: [
    { id: 'gb', name: 'GOVT BOND · 10YR', current: 1_500_000, growth: '+8.0%' },
    { id: 'ut', name: 'UNIT TRUST',       current: 900_000,   growth: '+12.1%' },
    { id: 'eq', name: 'BUSINESS EQUITY',  current: 857_000,   growth: '+7.4%' },
  ],
  history: [],
};

function _getState() {
  const s = storage.get(WEALTH_KEY);
  if (!s) { storage.set(WEALTH_KEY, SEED); return SEED; }
  s.accounts    = s.accounts    || [];
  s.investments = s.investments || [];
  s.history     = s.history     || [];
  return s;
}
function _saveState(s) { storage.set(WEALTH_KEY, s); bus.emit('sync:trigger'); }

function _monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

// Pull latest per-account balance from cash.js data
function _cashBalances() {
  const data = storage.get(STORAGE_KEYS.CASH, { transactions: [] });
  const bal  = {};
  (data.transactions || []).forEach(tx => {
    const acc = tx.account || 'cash';
    bal[acc] = (bal[acc] || 0) + (tx.type === 'credit' ? tx.amount : -tx.amount);
  });
  return bal;
}

function _resolveAccountBalance(acc, cashBal) {
  if (!acc.autoSync) return +acc.balance || 0;
  return cashBal[acc.id] || 0;
}

// Append a snapshot for the current month if we don't have one yet.
// Keeps history capped at 12 entries (rolling year).
function _maybeSnapshot(state, netWorth) {
  const key = _monthKey(new Date());
  const last = state.history[state.history.length - 1];
  if (last && last.monthKey === key) {
    last.netWorth = netWorth;                        // refresh mid-month
  } else {
    state.history.push({ monthKey: key, netWorth });
    if (state.history.length > 12) state.history.shift();
  }
  _saveState(state);
}

// ── SVG sparkline over the history[] snapshots ─────────────────
function _sparkline(history, currentNw) {
  const pts = history.map(h => h.netWorth);
  if (currentNw != null && (pts.length === 0 || pts[pts.length - 1] !== currentNw)) pts.push(currentNw);
  if (pts.length < 2) return '<svg class="wealth-spark" viewBox="0 0 320 66"></svg>';

  const W = 320, H = 66, pad = 6;
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = max - min || 1;
  const x = i => i * (W / (pts.length - 1));
  const y = v => H - pad - ((v - min) / range) * (H - 2 * pad);
  let d = `M ${x(0)} ${y(pts[0])}`;
  pts.forEach((v, i) => { if (i) d += ` L ${x(i)} ${y(v)}`; });
  const area = d + ` L ${W} ${H} L 0 ${H} Z`;

  return `<svg class="wealth-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/>
      <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#wgrad)"/>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(pts.length - 1)}" cy="${y(pts[pts.length - 1])}" r="3.5" fill="var(--accent)"/>
  </svg>`;
}

// ── Render ─────────────────────────────────────────────────────
export function renderWealth() {
  const host = document.getElementById('wealth-body');
  if (!host) return;

  const state   = _getState();
  const cashBal = _cashBalances();

  const liquid = state.accounts.reduce((s, a) => s + _resolveAccountBalance(a, cashBal), 0);
  const invested = state.investments.reduce((s, i) => s + (+i.current || 0), 0);
  const nw = liquid + invested;

  // Monthly snapshot (side effect — safe to run every render)
  _maybeSnapshot(state, nw);

  const prev = state.history.length >= 2 ? state.history[state.history.length - 2].netWorth : nw;
  const delta = nw - prev;
  const deltaPct = prev ? (delta / prev * 100) : 0;
  const deltaClass = delta >= 0 ? 'up' : 'down';
  const deltaSign  = delta >= 0 ? '▲' : '▼';

  const accRows = state.accounts.length ? state.accounts.map(a => {
    const bal = _resolveAccountBalance(a, cashBal);
    const initials = a.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2);
    return `
      <div class="wealth-acct">
        <div class="wealth-acct-ic">${esc(initials)}</div>
        <div class="wealth-acct-nm">${esc(a.name)}<small>${esc(a.type || '')} ${a.autoSync ? '· AUTO' : '· MANUAL'}</small></div>
        <div class="wealth-acct-bal">${fmtTZS(bal)}</div>
        ${!a.autoSync ? `<input class="wealth-manual-input" data-acc-bal="${esc(a.id)}" type="number" inputmode="numeric" value="${+a.balance || 0}" />` : ''}
        <span class="bgt-row-del" data-wealth-del-acc="${esc(a.id)}">×</span>
      </div>`;
  }).join('') : '<div class="loading">NO ACCOUNTS YET</div>';

  const invRows = state.investments.length ? state.investments.map(i => {
    const initials = i.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2);
    return `
      <div class="wealth-acct">
        <div class="wealth-acct-ic">${esc(initials)}</div>
        <div class="wealth-acct-nm">
          <input class="bgt-label-input" data-inv-name="${esc(i.id)}" value="${esc(i.name)}" maxlength="30" />
          <small class="wealth-inv-growth">${esc(i.growth || '')}</small>
        </div>
        <input class="wealth-manual-input" data-inv-current="${esc(i.id)}" type="number" inputmode="numeric" value="${+i.current || 0}" />
        <span class="bgt-row-del" data-wealth-del-inv="${esc(i.id)}">×</span>
      </div>`;
  }).join('') : '<div class="loading">NO INVESTMENTS YET</div>';

  host.innerHTML = `
    <div class="card wealth-hero">
      <div class="wealth-label">NET WORTH</div>
      <div class="wealth-big">${fmtTZS(nw)}</div>
      <div class="wealth-chg ${deltaClass}">${deltaSign} ${fmtTZS(Math.abs(delta))} (${(deltaPct >= 0 ? '+' : '') + deltaPct.toFixed(1)}%) since last snapshot</div>
      ${_sparkline(state.history, nw)}
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">WHERE IT SITS</div>
        <span class="wealth-sum">LIQUID ${fmtTZS(liquid)}</span>
      </div>
      ${accRows}
      <div class="bgt-section-foot">
        <button class="bgt-add-btn" id="wealth-add-acc">＋ ADD ACCOUNT</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">INVESTED</div>
        <span class="wealth-sum green">${fmtTZS(invested)}</span>
      </div>
      ${invRows}
      <div class="bgt-section-foot">
        <button class="bgt-add-btn" id="wealth-add-inv">＋ ADD INVESTMENT</button>
      </div>
    </div>`;
}

// ── Mutations ──────────────────────────────────────────────────
function _addAccount() {
  const name = prompt('Account name (e.g. NMB BANK):');
  if (!name) return;
  const type = prompt('Type (BANK / WALLET / MOBILE MONEY / SAVINGS):', 'BANK') || 'ACCOUNT';
  const auto = confirm('Auto-sync from Cash tracker?\n\nOK = auto (must match a cash account id)\nCancel = manual balance');
  const state = _getState();
  const id = name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || ('a' + Date.now());
  state.accounts.push({ id, name: name.toUpperCase(), type: type.toUpperCase(), autoSync: auto, balance: 0 });
  _saveState(state);
  renderWealth();
}

function _deleteAccount(id) {
  const state = _getState();
  state.accounts = state.accounts.filter(a => a.id !== id);
  _saveState(state);
  renderWealth();
}

function _addInvestment() {
  const name = prompt('Investment name (e.g. TREASURY BILL):');
  if (!name) return;
  const state = _getState();
  const id = 'i' + Date.now().toString(36);
  state.investments.push({ id, name: name.toUpperCase(), current: 0, growth: '' });
  _saveState(state);
  renderWealth();
}

function _deleteInvestment(id) {
  const state = _getState();
  state.investments = state.investments.filter(i => i.id !== id);
  _saveState(state);
  renderWealth();
}

function _readManualEdits() {
  const state = _getState();
  document.querySelectorAll('#view-wealth [data-acc-bal]').forEach(inp => {
    const a = state.accounts.find(x => x.id === inp.dataset.accBal);
    if (a) a.balance = Math.max(0, parseFloat(inp.value) || 0);
  });
  document.querySelectorAll('#view-wealth [data-inv-current]').forEach(inp => {
    const i = state.investments.find(x => x.id === inp.dataset.invCurrent);
    if (i) i.current = Math.max(0, parseFloat(inp.value) || 0);
  });
  document.querySelectorAll('#view-wealth [data-inv-name]').forEach(inp => {
    const i = state.investments.find(x => x.id === inp.dataset.invName);
    if (i) i.name = inp.value.toUpperCase();
  });
  _saveState(state);
}

// ── Wiring ─────────────────────────────────────────────────────
export function setupWealth() {
  const view = document.getElementById('view-wealth');
  if (!view) return;

  view.addEventListener('click', e => {
    if (e.target.closest('#wealth-add-acc')) { _addAccount(); return; }
    if (e.target.closest('#wealth-add-inv')) { _addInvestment(); return; }
    const delA = e.target.closest('[data-wealth-del-acc]');
    if (delA) { _deleteAccount(delA.dataset.wealthDelAcc); return; }
    const delI = e.target.closest('[data-wealth-del-inv]');
    if (delI) { _deleteInvestment(delI.dataset.wealthDelInv); return; }
  });

  let t = null;
  view.addEventListener('input', e => {
    if (!e.target.matches('[data-acc-bal], [data-inv-current], [data-inv-name]')) return;
    clearTimeout(t);
    t = setTimeout(() => { _readManualEdits(); renderWealth(); }, 400);
  });
}
