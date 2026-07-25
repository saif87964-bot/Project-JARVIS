// ── JARVIS — src/modules/cash.js ─────────────────────────────
// Petty cash tracker — running balance, transaction CRUD, CSV export.
// Exports:
//   setupCash()  — one-time wiring (event listeners)
//   initCash()   — called on every navigate-to-cash (re-renders)

import { STORAGE_KEYS, CASH_CATS } from '../config.js';
import { storage }                  from '../core/storage.js';
import { bus }                      from '../core/bus.js';
import { esc, fmtTZS }              from '../utils.js';
import { getCurrentEnvelopes }      from './budget.js';

let cashTxType = 'debit';
let cashTxCat  = 'misc';
let cashTxEnv  = null;    // envelope id (from budget FLOAT rows) or null
let activeAcc  = 'all';   // 'all' or an account id

// ── Storage ────────────────────────────────────────────────────
function getCashData() {
  return storage.get(STORAGE_KEYS.CASH, { balance: 0, transactions: [] });
}
function saveCashData(d) {
  storage.set(STORAGE_KEYS.CASH, d);
}

// ── Categories (user-editable, stored in localStorage) ────────
const CAT_KEY = 'jv_cash_cats';

function getCategories() {
  const saved = storage.get(CAT_KEY);
  if (!saved) {
    const defaults = CASH_CATS.map(c => ({ ...c }));
    storage.set(CAT_KEY, defaults);
    return defaults;
  }
  return saved;
}
function saveCategories(cats) {
  storage.set(CAT_KEY, cats);
}

function addCategory(rawLabel) {
  const label = rawLabel.trim().toUpperCase().slice(0, 20);
  if (!label) return;
  const id  = rawLabel.trim().toLowerCase()
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || ('cat' + Date.now());
  const cats = getCategories();
  if (cats.find(c => c.id === id || c.label === label)) return; // no dupes
  cats.push({ id, label });
  saveCategories(cats);
  renderCategoryChips();
}

function removeCategory(id) {
  const cats = getCategories().filter(c => c.id !== id);
  if (cats.length === 0) return; // always keep at least one
  saveCategories(cats);
  if (cashTxCat === id) cashTxCat = cats[0].id;
  renderCategoryChips();
}

// ── Envelope chips (from budget FLOAT rows this month) ─────────
function _envSpentThisMonth() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const spent = {};
  getCashData().transactions.forEach(tx => {
    if (tx.type !== 'debit' || !tx.envelope) return;
    const d = new Date(tx.date);
    if (d.getFullYear() !== y || d.getMonth() !== m) return;
    spent[tx.envelope] = (spent[tx.envelope] || 0) + tx.amount;
  });
  return spent;
}

function renderEnvelopeChips() {
  const container = document.getElementById('cash-envs');
  if (!container) return;
  const envs = getCurrentEnvelopes();
  if (envs.length === 0) {
    container.innerHTML = '<div class="cash-envs-hint">START THIS MONTH’S BUDGET TO SEE ENVELOPES</div>';
    cashTxEnv = null;
    return;
  }
  if (cashTxEnv && !envs.find(e => e.id === cashTxEnv)) cashTxEnv = null;
  const spent = _envSpentThisMonth();
  container.innerHTML = envs.map(e => {
    const left = Math.max(0, (e.target || 0) - (spent[e.id] || 0));
    const over = (spent[e.id] || 0) > (e.target || 0) && e.target > 0;
    return `<button class="cash-env-chip${cashTxEnv === e.id ? ' active' : ''}${over ? ' over' : ''}" data-env="${esc(e.id)}">
      ${esc(e.label)}<span class="cash-env-left">${e.target ? fmtTZS(left).replace('TZS ', '') : '—'}</span>
    </button>`;
  }).join('');
}

function renderCategoryChips() {
  const container = document.getElementById('cash-cats');
  if (!container) return;
  const cats = getCategories();
  // Ensure active cat is still valid
  if (!cats.find(c => c.id === cashTxCat)) cashTxCat = cats[0]?.id || '';
  container.innerHTML = cats.map(cat => `
    <button class="cash-cat-chip${cashTxCat === cat.id ? ' active' : ''}" data-cat="${cat.id}">
      ${esc(cat.label)}<span class="cat-chip-del" data-del-cat="${esc(cat.id)}">×</span>
    </button>`).join('') +
    '<button class="cash-cat-chip cat-chip-add" id="cat-add-toggle">＋ NEW</button>';
}

function _showCatAddRow() {
  const row = document.getElementById('cash-cat-add-row');
  if (row) { row.classList.add('open'); document.getElementById('cash-cat-input')?.focus(); }
}
function _hideCatAddRow() {
  const row   = document.getElementById('cash-cat-add-row');
  const input = document.getElementById('cash-cat-input');
  if (row)   row.classList.remove('open');
  if (input) input.value = '';
}
function _submitCatAdd() {
  const val = document.getElementById('cash-cat-input')?.value?.trim();
  if (val) addCategory(val);
  _hideCatAddRow();
}

// ── Accounts (multiple wallets: cash, bank, etc.) ──────────────
const ACC_KEY = 'jv_cash_accounts';

export function getAccounts() {
  const saved = storage.get(ACC_KEY);
  if (!saved) {
    const defaults = [
      { id: 'cash', label: 'CASH'      },
      { id: 'crdb', label: 'CRDB BANK' },
    ];
    storage.set(ACC_KEY, defaults);
    return defaults;
  }
  return saved;
}
function saveAccounts(accs) { storage.set(ACC_KEY, accs); }

// Old transactions have no account field — they belong to physical cash
function txAccount(tx) { return tx.account || 'cash'; }

function addAccount(rawLabel) {
  const label = rawLabel.trim().toUpperCase().slice(0, 20);
  if (!label) return;
  const id = rawLabel.trim().toLowerCase()
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || ('acc' + Date.now());
  const accs = getAccounts();
  if (accs.find(a => a.id === id || a.label === label)) return;
  accs.push({ id, label });
  saveAccounts(accs);
  renderAccountChips();
}

function removeAccount(id) {
  // Refuse if any transaction lives on this account
  const hasTxs = getCashData().transactions.some(tx => txAccount(tx) === id);
  if (hasTxs) {
    bus.emit('cmd:response', { msg: 'ACCOUNT HAS TRANSACTIONS — CANNOT REMOVE', err: true });
    return;
  }
  const accs = getAccounts().filter(a => a.id !== id);
  if (accs.length === 0) return;
  saveAccounts(accs);
  if (activeAcc === id) activeAcc = 'all';
  renderAccountChips();
  renderCash();
}

function renderAccountChips() {
  const container = document.getElementById('cash-accounts');
  if (!container) return;
  const accs = getAccounts();
  if (activeAcc !== 'all' && !accs.find(a => a.id === activeAcc)) activeAcc = 'all';
  container.innerHTML =
    `<button class="cash-acc-chip${activeAcc === 'all' ? ' active' : ''}" data-acc="all">ALL</button>` +
    accs.map(a => `
      <button class="cash-acc-chip${activeAcc === a.id ? ' active' : ''}" data-acc="${esc(a.id)}">
        ${esc(a.label)}<span class="acc-chip-del" data-del-acc="${esc(a.id)}">×</span>
      </button>`).join('') +
    '<button class="cash-acc-chip acc-chip-add" id="acc-add-toggle">＋</button>';
}

function _accountBalances(data) {
  const bal = {};
  data.transactions.forEach(tx => {
    const acc = txAccount(tx);
    bal[acc] = (bal[acc] || 0) + (tx.type === 'credit' ? tx.amount : -tx.amount);
  });
  return bal;
}

// ── Recalculate all running balances from oldest to newest ─────
// Required after a delete or import. Running balance is tracked
// PER ACCOUNT; data.balance is the total across all accounts.
function recalcCash(data) {
  const oldest  = [...data.transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const running = {};
  oldest.forEach(tx => {
    const acc = txAccount(tx);
    running[acc] = (running[acc] || 0) + (tx.type === 'credit' ? tx.amount : -tx.amount);
    tx.balanceAfter = running[acc];
  });
  data.balance      = Object.values(running).reduce((s, v) => s + v, 0);
  data.transactions = oldest.reverse(); // back to newest-first
}

// ── CRUD ───────────────────────────────────────────────────────
function addCashTx(amount, type, cat, note, envelope) {
  const data    = getCashData();
  const account = activeAcc === 'all' ? 'cash' : activeAcc;
  data.transactions.unshift({
    id:           'tx' + Date.now(),
    type, amount, category: cat, account,
    envelope:     envelope || null,
    note:         note.trim(),
    date:         new Date().toISOString(),
    balanceAfter: 0, // set by recalc
  });
  recalcCash(data);
  saveCashData(data);
  renderCash();
  renderEnvelopeChips();
}

// ── Bulk import (called from import.js) ────────────────────────
// rows: [{ date:ISO, amount, type, category, note }]
// Dedupes against existing transactions by (day, amount, type, account).
export function addImportedTxs(accountId, rows) {
  const data = getCashData();
  const keyOf = (date, amount, type, acc) =>
    `${String(date).slice(0, 10)}|${amount}|${type}|${acc}`;
  const existing = new Set(
    data.transactions.map(tx => keyOf(tx.date, tx.amount, tx.type, txAccount(tx)))
  );

  let added = 0;
  rows.forEach((r, i) => {
    const key = keyOf(r.date, r.amount, r.type, accountId);
    if (existing.has(key)) return;
    existing.add(key);
    data.transactions.push({
      id:           'imp' + Date.now() + '_' + i,
      type:         r.type,
      amount:       r.amount,
      category:     r.category || 'misc',
      account:      accountId,
      note:         (r.note || '').trim().slice(0, 120),
      date:         r.date,
      balanceAfter: 0,
    });
    added++;
  });

  if (added > 0) {
    recalcCash(data);
    saveCashData(data);
    renderCash();
    renderAccountChips();
    bus.emit('sync:trigger');
  }
  return added;
}

function deleteCashTx(id) {
  const data = getCashData();
  const idx  = data.transactions.findIndex(t => t.id === id);
  if (idx === -1) return;
  data.transactions.splice(idx, 1);
  recalcCash(data);
  saveCashData(data);
  renderCash();
}

// ── Render ─────────────────────────────────────────────────────
function renderCash() {
  const data    = getCashData();
  const accs    = getAccounts();
  const balByAcc = _accountBalances(data);
  const viewAll  = activeAcc === 'all';
  const viewBal  = viewAll ? data.balance : (balByAcc[activeAcc] || 0);
  const shown    = viewAll
    ? data.transactions
    : data.transactions.filter(tx => txAccount(tx) === activeAcc);

  // Balance card
  const balEl = document.getElementById('cash-balance');
  if (balEl) {
    balEl.textContent = fmtTZS(viewBal);
    balEl.className   = 'cash-bal-amount' + (viewBal < 0 ? ' negative' : '');
  }
  const balLbl = document.querySelector('.cash-bal-label');
  if (balLbl) {
    balLbl.textContent = viewAll
      ? 'TOTAL — ALL ACCOUNTS'
      : (accs.find(a => a.id === activeAcc)?.label || 'CASH') + ' BALANCE';
  }

  // Today's totals (within current account view)
  const todayStr = new Date().toDateString();
  let todayIn = 0, todayOut = 0;
  shown.forEach(tx => {
    if (new Date(tx.date).toDateString() === todayStr) {
      if (tx.type === 'credit') todayIn  += tx.amount;
      else                      todayOut += tx.amount;
    }
  });
  const inEl  = document.getElementById('cash-today-in');
  const outEl = document.getElementById('cash-today-out');
  if (inEl)  inEl.textContent  = fmtTZS(todayIn);
  if (outEl) outEl.textContent = fmtTZS(todayOut);

  // Transaction log
  const logEl = document.getElementById('cash-log');
  if (!logEl) return;

  if (shown.length === 0) {
    logEl.innerHTML = '<div class="loading">NO ENTRIES YET</div>';
    return;
  }

  const yesterdayStr = new Date(Date.now() - 86400000).toDateString();

  logEl.innerHTML = shown.map(tx => {
    const d       = new Date(tx.date);
    const dStr    = d.toDateString();
    const timeStr = d.toTimeString().slice(0, 5);
    const dateLbl = dStr === todayStr     ? 'TODAY' :
                    dStr === yesterdayStr ? 'YESTERDAY' :
                    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
    const catObj  = CASH_CATS.find(c => c.id === tx.category);
    const catLbl  = catObj ? catObj.label : tx.category.toUpperCase();
    const display = tx.note || catLbl;
    const sign    = tx.type === 'debit' ? '−' : '+';
    const accLbl  = viewAll
      ? (accs.find(a => a.id === txAccount(tx))?.label || txAccount(tx).toUpperCase())
      : '';

    return `
      <div class="cash-tx ${tx.type}">
        <div class="cash-tx-cat c-${tx.category}">${catLbl}</div>
        <div class="cash-tx-body">
          <div class="cash-tx-note">${esc(display)}</div>
          <div class="cash-tx-time">${dateLbl} · ${timeStr}${accLbl ? ` · <span class="cash-tx-acc">${esc(accLbl)}</span>` : ''}</div>
        </div>
        <div class="cash-tx-right">
          <div class="cash-tx-amount ${tx.type}">${sign}${fmtTZS(tx.amount)}</div>
          <div class="cash-tx-balance">→ ${fmtTZS(tx.balanceAfter)}</div>
        </div>
        <div class="cash-tx-del" data-action="delete-cash" data-id="${tx.id}" title="Remove">×</div>
      </div>`;
  }).join('');
}

// ── Export CSV ─────────────────────────────────────────────────
function exportCashCSV() {
  const data = getCashData();
  if (!data.transactions.length) {
    bus.emit('cmd:response', { msg: 'NO DATA TO EXPORT', err: true });
    return;
  }

  const rows = [['Date', 'Time', 'Account', 'Type', 'Category', 'Note', 'Amount (TZS)', 'Balance After (TZS)']];
  [...data.transactions].reverse().forEach(tx => {
    const d = new Date(tx.date);
    rows.push([
      d.toLocaleDateString('en-GB'),
      d.toTimeString().slice(0, 5),
      txAccount(tx).toUpperCase(),
      tx.type.toUpperCase(),
      tx.category.toUpperCase(),
      tx.note || '',
      tx.type === 'debit' ? -tx.amount : tx.amount,
      tx.balanceAfter,
    ]);
  });

  const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `jarvis-cash-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Add-transaction form ────────────────────────────────────────
function submitCashTx() {
  const amtEl  = document.getElementById('cash-amount-input');
  const noteEl = document.getElementById('cash-note-input');
  const amt    = parseFloat(amtEl?.value);
  if (!amt || amt <= 0) { amtEl?.focus(); return; }
  addCashTx(amt, cashTxType, cashTxCat, noteEl?.value || '', cashTxEnv);
  if (amtEl)  amtEl.value  = '';
  if (noteEl) noteEl.value = '';
  amtEl?.focus();
}

// ── Voice entry point (called from voice.js) ──────────────────
export function addCashTxVoice(amount, type, category, note) {
  addCashTx(amount, type, category, note);
}

// ── initCash — called on every navigate-to-cash ────────────────
export function initCash() {
  renderCash();
  renderEnvelopeChips();
}

// ── setupCash — call once at app startup ───────────────────────
export function setupCash() {
  // Type toggle (debit / credit)
  document.querySelectorAll('.cash-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      cashTxType = btn.dataset.type;
      document.querySelectorAll('.cash-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Account chips — rendered dynamically; use delegation
  renderAccountChips();
  document.addEventListener('click', e => {
    // × remove an account (blocked if it has transactions)
    const delAcc = e.target.closest('.acc-chip-del');
    if (delAcc && delAcc.closest('#cash-accounts')) {
      e.stopPropagation();
      removeAccount(delAcc.dataset.delAcc);
      return;
    }
    // ＋ add account
    if (e.target.closest('#acc-add-toggle')) {
      const label = prompt('New account name (e.g. NMB BANK, M-PESA):');
      if (label) addAccount(label);
      return;
    }
    // Select an account chip
    const accChip = e.target.closest('.cash-acc-chip');
    if (accChip && accChip.closest('#cash-accounts') && accChip.dataset.acc) {
      activeAcc = accChip.dataset.acc;
      renderAccountChips();
      renderCash();
    }
  });

  // Envelope chips — rendered dynamically; use delegation
  renderEnvelopeChips();
  document.addEventListener('click', e => {
    const chip = e.target.closest('.cash-env-chip');
    if (chip && chip.closest('#cash-envs')) {
      const id = chip.dataset.env;
      cashTxEnv = cashTxEnv === id ? null : id;  // tap-again to clear
      document.querySelectorAll('#cash-envs .cash-env-chip').forEach(c => c.classList.remove('active'));
      if (cashTxEnv) chip.classList.add('active');
    }
  });

  // Refresh envelope chips whenever the budget saves (targets moved,
  // rows added, etc.) so remaining amounts stay accurate.
  bus.on('sync:trigger', () => renderEnvelopeChips());

  // Category chips — rendered dynamically; use delegation
  renderCategoryChips();
  document.addEventListener('click', e => {
    // ×  delete a category
    const del = e.target.closest('.cat-chip-del');
    if (del && del.closest('#cash-cats')) {
      e.stopPropagation();
      removeCategory(del.dataset.delCat);
      return;
    }
    // ＋ NEW — show add row
    if (e.target.closest('#cat-add-toggle')) {
      _showCatAddRow();
      return;
    }
    // Save / cancel new category
    if (e.target.id === 'cash-cat-save')   { _submitCatAdd(); return; }
    if (e.target.id === 'cash-cat-cancel') { _hideCatAddRow(); return; }
    // Select a chip
    const chip = e.target.closest('.cash-cat-chip');
    if (chip && chip.closest('#cash-cats') && chip.dataset.cat) {
      cashTxCat = chip.dataset.cat;
      document.querySelectorAll('#cash-cats .cash-cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    }
  });
  document.getElementById('cash-cat-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter')  _submitCatAdd();
    if (e.key === 'Escape') _hideCatAddRow();
  });

  // Form submit
  document.getElementById('cash-add-btn')?.addEventListener('click', submitCashTx);
  document.getElementById('cash-amount-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitCashTx();
  });
  document.getElementById('cash-note-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitCashTx();
  });

  // CSV export
  document.getElementById('cash-export-btn')?.addEventListener('click', exportCashCSV);

  // Delegated delete on transaction log
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action="delete-cash"]');
    if (!el) return;
    deleteCashTx(el.dataset.id);
  });
}
