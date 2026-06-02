// ── JARVIS — src/modules/charts.js ────────────────────────────
// Expense charts for the Cash view.
//   renderExpenseCharts() — call on every navigate-to-cash

import { storage }      from '../core/storage.js';
import { STORAGE_KEYS } from '../config.js';
import { fmtTZS }       from '../utils.js';

export function renderExpenseCharts() {
  _renderDailyChart();
  _renderCategoryChart();
}

// ── Helpers ────────────────────────────────────────────────────
function _getLast30DayKeys() {
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().split('T')[0]); // YYYY-MM-DD
  }
  return days;
}

// ── 30-Day Bar Chart ───────────────────────────────────────────
function _renderDailyChart() {
  const el = document.getElementById('chart-daily');
  if (!el) return;

  const { transactions = [] } = storage.get(STORAGE_KEYS.CASH, { balance: 0, transactions: [] });
  const days = _getLast30DayKeys();

  const dayData = days.map(date => {
    const txs = transactions.filter(tx => tx.date && tx.date.startsWith(date));
    return {
      date,
      in:  txs.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0),
      out: txs.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0),
    };
  });

  const maxVal = Math.max(...dayData.map(d => Math.max(d.in, d.out)), 1);
  const W = 600, H = 80;
  const slotW = W / 30;
  const barW  = Math.max(slotW - 3, 2);
  const half  = (barW / 2) - 0.5;

  const bars = dayData.map((d, i) => {
    const x    = i * slotW + (slotW - barW) / 2;
    const inH  = Math.round((d.in  / maxVal) * H);
    const outH = Math.round((d.out / maxVal) * H);
    return [
      inH  ? `<rect x="${x.toFixed(1)}"                y="${(H - inH).toFixed(1)}"  width="${half.toFixed(1)}" height="${inH}"  fill="rgba(57,255,20,0.6)"  rx="1"/>` : '',
      outH ? `<rect x="${(x + half + 1).toFixed(1)}"   y="${(H - outH).toFixed(1)}" width="${half.toFixed(1)}" height="${outH}" fill="rgba(255,107,43,0.7)" rx="1"/>` : '',
    ].join('');
  }).join('');

  // X-axis date labels every 10 days
  const labels = days.map((date, i) => {
    if (i !== 0 && i !== 9 && i !== 19 && i !== 29) return '';
    const d   = new Date(date + 'T00:00:00');
    const lbl = `${d.getDate()}/${d.getMonth() + 1}`;
    const x   = (i * slotW + slotW / 2).toFixed(1);
    return `<text x="${x}" y="10" text-anchor="middle" fill="rgba(74,106,122,0.9)" font-size="7" font-family="'Share Tech Mono',monospace">${lbl}</text>`;
  }).join('');

  const totalIn  = dayData.reduce((s, d) => s + d.in,  0);
  const totalOut = dayData.reduce((s, d) => s + d.out, 0);
  const net      = totalIn - totalOut;
  const netClass = net >= 0 ? 'green' : 'orange';

  el.innerHTML = `
    <div class="chart-legend">
      <span class="chart-leg-item green">▮ IN &nbsp;${fmtTZS(totalIn)}</span>
      <span class="chart-leg-item orange">▮ OUT ${fmtTZS(totalOut)}</span>
      <span class="chart-leg-item ${netClass}">NET ${net >= 0 ? '+' : ''}${fmtTZS(net)}</span>
      <span class="chart-leg-period">30 DAYS</span>
    </div>
    <svg viewBox="0 0 ${W} ${H + 14}" preserveAspectRatio="none"
         style="width:100%;height:80px;display:block;overflow:visible;">
      ${bars}
      <g transform="translate(0,${H + 2})">${labels}</g>
    </svg>`;
}

// ── Category Breakdown ─────────────────────────────────────────
function _renderCategoryChart() {
  const el = document.getElementById('chart-categories');
  if (!el) return;

  const { transactions = [] } = storage.get(STORAGE_KEYS.CASH, { balance: 0, transactions: [] });
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const debits = transactions.filter(tx =>
    tx.type === 'debit' && tx.date && new Date(tx.date) >= cutoff
  );

  if (debits.length === 0) {
    el.innerHTML = '<div class="loading">NO EXPENSES IN LAST 30 DAYS</div>';
    return;
  }

  const cats   = {};
  debits.forEach(tx => { cats[tx.category] = (cats[tx.category] || 0) + tx.amount; });
  const total  = Object.values(cats).reduce((s, v) => s + v, 0);
  const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);

  el.innerHTML = sorted.map(([cat, amount]) => {
    const pct = (amount / total * 100).toFixed(1);
    return `
      <div class="cat-bar-row">
        <div class="cat-bar-label">${cat.toUpperCase()}</div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="cat-bar-stats">
          <span class="cat-bar-val">${fmtTZS(amount)}</span>
          <span class="cat-bar-pct">${pct}%</span>
        </div>
      </div>`;
  }).join('');
}
