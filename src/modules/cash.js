// ── JARVIS — src/modules/cash.js ─────────────────────────────
// Petty cash tracker — running balance, transaction CRUD, CSV export.
// Exports:
//   setupCash()  — one-time wiring (event listeners)
//   initCash()   — called on every navigate-to-cash (re-renders)

import { STORAGE_KEYS, CASH_CATS } from '../config.js';
import { storage }                  from '../core/storage.js';
import { bus }                      from '../core/bus.js';
import { esc, fmtTZS }              from '../utils.js';

let cashTxType = 'debit';
let cashTxCat  = 'misc';

// ── Storage ────────────────────────────────────────────────────
function getCashData() {
  return storage.get(STORAGE_KEYS.CASH, { balance: 0, transactions: [] });
}
function saveCashData(d) {
  storage.set(STORAGE_KEYS.CASH, d);
}

// ── Recalculate all running balances from oldest to newest ─────
// Required after a delete, since balanceAfter values shift.
function recalcCash(data) {
  const oldest = [...data.transactions].reverse(); // oldest first
  let running  = 0;
  oldest.forEach(tx => {
    running = tx.type === 'credit' ? running + tx.amount : running - tx.amount;
    tx.balanceAfter = running;
  });
  data.balance      = running;
  data.transactions = oldest.reverse(); // back to newest-first
}

// ── CRUD ───────────────────────────────────────────────────────
function addCashTx(amount, type, cat, note) {
  const data   = getCashData();
  const newBal = type === 'credit' ? data.balance + amount : data.balance - amount;
  data.transactions.unshift({
    id:           'tx' + Date.now(),
    type, amount, category: cat,
    note:         note.trim(),
    date:         new Date().toISOString(),
    balanceAfter: newBal,
  });
  data.balance = newBal;
  saveCashData(data);
  renderCash();
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
  const data = getCashData();

  // Balance card
  const balEl = document.getElementById('cash-balance');
  if (balEl) {
    balEl.textContent = fmtTZS(data.balance);
    balEl.className   = 'cash-bal-amount' + (data.balance < 0 ? ' negative' : '');
  }

  // Today's totals
  const todayStr = new Date().toDateString();
  let todayIn = 0, todayOut = 0;
  data.transactions.forEach(tx => {
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

  if (data.transactions.length === 0) {
    logEl.innerHTML = '<div class="loading">NO ENTRIES YET</div>';
    return;
  }

  const yesterdayStr = new Date(Date.now() - 86400000).toDateString();

  logEl.innerHTML = data.transactions.map(tx => {
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

    return `
      <div class="cash-tx">
        <div class="cash-tx-cat c-${tx.category}">${catLbl}</div>
        <div class="cash-tx-body">
          <div class="cash-tx-note">${esc(display)}</div>
          <div class="cash-tx-time">${dateLbl} · ${timeStr}</div>
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

  const rows = [['Date', 'Time', 'Type', 'Category', 'Note', 'Amount (TZS)', 'Balance After (TZS)']];
  [...data.transactions].reverse().forEach(tx => {
    const d = new Date(tx.date);
    rows.push([
      d.toLocaleDateString('en-GB'),
      d.toTimeString().slice(0, 5),
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
  addCashTx(amt, cashTxType, cashTxCat, noteEl?.value || '');
  if (amtEl)  amtEl.value  = '';
  if (noteEl) noteEl.value = '';
  amtEl?.focus();
}

// ── initCash — called on every navigate-to-cash ────────────────
export function initCash() {
  renderCash();
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

  // Category chips
  document.querySelectorAll('.cash-cat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      cashTxCat = chip.dataset.cat;
      document.querySelectorAll('.cash-cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    });
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
