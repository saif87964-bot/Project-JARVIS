// ── JARVIS — src/modules/budget.js ────────────────────────────
// Monthly budget — digital version of Saif's salary-cycle sheet,
// now mirroring the Personal_Budget_System spreadsheet's method:
// zero-based envelopes + PAY-YOURSELF-FIRST savings taken off the
// top (not leftover scraps). A cycle = one salary month. Each has:
//   RECEIPTS         — income sources (asked fresh, prefilled from last)
//   SAVINGS          — pay-yourself-first, pulled BEFORE any expense
//   FIXED EXPENSES   — obligations, each with a PAID toggle ("kinda variable")
//   CASH FLOAT       — set-aside allowances, reviewed vs actuals at EOM
//   UNALLOCATED      — receipts − savings − fixed − float; should trend to 0
// GOALS is a separate, cross-cycle wealth layer (target/current/progress),
// the in-app analog of the spreadsheet's Savings & Goals tab.
// Exports:
//   setupBudget()  — one-time wiring
//   renderBudget() — re-render on navigate (route hook)

import { storage } from '../core/storage.js';
import { bus }     from '../core/bus.js';
import { esc, fmtTZS } from '../utils.js';
import { STORAGE_KEYS } from '../config.js';

const BUDGET_KEY = 'jv_budget';
const GOALS_KEY  = 'jv_goals';

// Seeded from the real spreadsheet so the first cycle starts familiar
const SEED = {
  receipts: [
    { l: 'CRDB',        a: 0 },
    { l: 'CASH SALARY', a: 0 },
    { l: 'OFFICE',      a: 0 },
  ],
  savings: [
    { l: 'SAVINGS (PAY YOURSELF FIRST)', a: 0 },
  ],
  fixed: [
    { l: 'ADVANCE',           a: 0, paid: false },
    { l: 'GOOGLE ONE - ME',   a: 0, paid: false },
    { l: 'GOOGLE ONE - MUM',  a: 0, paid: false },
    { l: 'YOUTUBE MUSIC',     a: 0, paid: false },
    { l: 'NETFLIX',           a: 0, paid: false },
    { l: 'CHATGPT',           a: 0, paid: false },
    { l: 'WI-FI CONTRIBUTION',a: 0, paid: false },
    { l: 'HOME CONTRIBUTION', a: 0, paid: false },
    { l: 'LOAN DEDUCTION',    a: 0, paid: false },
  ],
  float: [
    { l: 'HAIRCUT',             a: 0 },
    { l: 'LEISURE ALLOWANCE',   a: 0 },
    { l: 'TRANSPORT ALLOWANCE', a: 0 },
  ],
};

let viewKey = _monthKey(new Date());   // cycle currently shown, 'YYYY-MM'

// ── Storage ────────────────────────────────────────────────────

function _getState()    { return storage.get(BUDGET_KEY, { cycles: {} }); }
function _saveState(st) { storage.set(BUDGET_KEY, st); bus.emit('sync:trigger'); }

function _monthKey(d)   { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

function _shiftKey(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return _monthKey(d);
}

function _keyLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
}

// Most recent cycle BEFORE the given key (template source)
function _lastCycleBefore(state, key) {
  const keys = Object.keys(state.cycles).filter(k => k < key).sort();
  return keys.length ? state.cycles[keys[keys.length - 1]] : null;
}

// ── Public ─────────────────────────────────────────────────────

export function setupBudget() {
  const view = document.getElementById('view-budget');
  if (!view) return;

  view.addEventListener('click', e => {
    if (e.target.closest('#bgt-prev')) { viewKey = _shiftKey(viewKey, -1); renderBudget(); return; }
    if (e.target.closest('#bgt-next')) { viewKey = _shiftKey(viewKey, +1); renderBudget(); return; }
    if (e.target.closest('#bgt-start')) { _startCycle(); return; }

    const addRow = e.target.closest('[data-bgt-add]');
    if (addRow) { _addRow(addRow.dataset.bgtAdd); return; }

    const delRow = e.target.closest('[data-bgt-del]');
    if (delRow) { _delRow(delRow.dataset.bgtSec, +delRow.dataset.bgtDel); return; }

    const paid = e.target.closest('[data-bgt-paid]');
    if (paid) { _togglePaid(+paid.dataset.bgtPaid); return; }

    const left = e.target.closest('[data-bgt-left]');
    if (left) { _setLeftChoice(left.dataset.bgtLeft); return; }

    if (e.target.closest('#goal-add-btn')) { _addGoal(); return; }

    const goalDel = e.target.closest('[data-goal-del]');
    if (goalDel) { _deleteGoal(goalDel.dataset.goalDel); return; }

    const goalContrib = e.target.closest('[data-goal-contrib]');
    if (goalContrib) { _addGoalContribution(goalContrib.dataset.goalContrib); return; }
  });

  // Auto-save on any edit (debounced)
  let t = null;
  view.addEventListener('input', e => {
    if (e.target.matches('[data-bgt-l], [data-bgt-a]')) {
      clearTimeout(t);
      t = setTimeout(() => { _readFormIntoState(); _renderSummaryOnly(); }, 400);
      return;
    }
    if (e.target.matches('[data-goal-name], [data-goal-target]')) {
      clearTimeout(t);
      t = setTimeout(() => _readGoalFormIntoState(), 400);
    }
  });
}

export function renderBudget() {
  const host = document.getElementById('budget-body');
  if (!host) return;

  const state = _getState();
  const cycle = state.cycles[viewKey];
  if (cycle) cycle.savings = cycle.savings || []; // back-compat for cycles saved before pay-yourself-first

  document.getElementById('bgt-month-label').textContent = _keyLabel(viewKey);

  if (!cycle) {
    const last = _lastCycleBefore(_getState(), viewKey);
    host.innerHTML = `
      <div class="card">
        <div class="module-stub" style="min-height:200px">
          <div class="module-stub-icon">◧</div>
          <div class="module-stub-title">NO BUDGET FOR ${_keyLabel(viewKey)}</div>
          <div class="module-stub-sub">${last ? 'STARTS PREFILLED FROM YOUR LAST CYCLE — REVIEW EVERY AMOUNT FRESH' : 'FIRST CYCLE — STARTS FROM YOUR SPREADSHEET TEMPLATE'}</div>
          <button class="task-add-btn" id="bgt-start" style="margin-top:10px">▸ START CYCLE</button>
        </div>
      </div>`;
    return;
  }

  host.innerHTML =
    _sectionCard('receipts', 'RECEIPTS', cycle.receipts, { amountCls: 'green' }) +
    _sectionCard('savings',  'PAY YOURSELF FIRST — SAVINGS', cycle.savings, { amountCls: 'cyan' }) +
    _sectionCard('fixed',    'FIXED EXPENSES', cycle.fixed, { paidToggle: true }) +
    _sectionCard('float',    'CASH FLOAT ALLOWANCES', cycle.float, {}) +
    _summaryCard(cycle) +
    _goalsCard() +
    _reviewCard(cycle);
}

// ── Cycle creation ─────────────────────────────────────────────

function _startCycle() {
  const state = _getState();
  const last  = _lastCycleBefore(state, viewKey);

  // Prefill labels + last amounts (user reviews fresh); PAID resets
  const clone = (rows, withPaid) => rows.map(r => ({
    l: r.l, a: r.a || 0, ...(withPaid ? { paid: false } : {}),
  }));

  state.cycles[viewKey] = last
    ? { receipts: clone(last.receipts), savings: clone(last.savings || SEED.savings),
        fixed: clone(last.fixed, true), float: clone(last.float), leftChoice: '' }
    : { receipts: clone(SEED.receipts), savings: clone(SEED.savings),
        fixed: clone(SEED.fixed, true), float: clone(SEED.float), leftChoice: '' };

  _saveState(state);
  renderBudget();
}

// ── Section rendering ──────────────────────────────────────────

function _sectionCard(sec, title, rows, opts) {
  return `
    <div class="card">
      <div class="card-header"><div class="card-title">${title}</div></div>
      <div class="bgt-rows" data-bgt-rows="${sec}">
        ${rows.map((r, i) => `
          <div class="bgt-row">
            ${opts.paidToggle ? `
              <button class="bgt-paid${r.paid ? ' on' : ''}" data-bgt-paid="${i}" title="Mark paid">
                ${r.paid ? '✓' : ''}
              </button>` : ''}
            <input class="bgt-label-input" data-bgt-l="${sec}:${i}" value="${esc(r.l)}" maxlength="30" />
            <input class="bgt-amount-input ${opts.amountCls || ''}" data-bgt-a="${sec}:${i}"
                   type="number" inputmode="numeric" value="${r.a || ''}" placeholder="0" />
            <span class="bgt-row-del" data-bgt-sec="${sec}" data-bgt-del="${i}">×</span>
          </div>`).join('')}
      </div>
      <div class="bgt-section-foot">
        <button class="bgt-add-btn" data-bgt-add="${sec}">＋ ADD ROW</button>
        <span class="bgt-section-total" data-bgt-total="${sec}">${fmtTZS(_sum(rows))}</span>
      </div>
    </div>`;
}

function _summaryCard(cycle) {
  const rec   = _sum(cycle.receipts);
  const sav   = _sum(cycle.savings);
  const fix   = _sum(cycle.fixed);
  const flo   = _sum(cycle.float);
  const left  = rec - sav - fix - flo;
  const paid  = _sum(cycle.fixed.filter(r => r.paid));
  const choice = cycle.leftChoice || '';

  const zeroState = Math.abs(left) < 1 ? 'balanced' : left > 0 ? 'under' : 'over';
  const zeroMsg = {
    balanced: '✓ ZERO-BASED — EVERY SHILLING IS ASSIGNED',
    under:    `UNALLOCATED: ${fmtTZS(left)} — ASSIGN IT BELOW`,
    over:     `OVER-ALLOCATED BY ${fmtTZS(-left)} — CUT SOMETHING`,
  }[zeroState];

  return `
    <div class="card">
      <div class="card-header"><div class="card-title">SUMMARY</div></div>
      <div class="calc-row"><span class="calc-lbl">TOTAL RECEIPTS</span><span class="calc-val cyan"   id="bgt-sum-rec">${fmtTZS(rec)}</span></div>
      <div class="calc-row"><span class="calc-lbl">PAY YOURSELF FIRST</span><span class="calc-val cyan" id="bgt-sum-sav">${fmtTZS(sav)}</span></div>
      <div class="calc-row"><span class="calc-lbl">FIXED EXPENSES</span><span class="calc-val orange" id="bgt-sum-fix">${fmtTZS(fix)}</span></div>
      <div class="calc-row"><span class="calc-lbl">— OF WHICH PAID</span><span class="calc-val muted" id="bgt-sum-paid">${fmtTZS(paid)}</span></div>
      <div class="calc-row"><span class="calc-lbl">CASH FLOAT</span><span class="calc-val orange"     id="bgt-sum-flo">${fmtTZS(flo)}</span></div>
      <div class="calc-row total"><span class="calc-lbl">UNALLOCATED</span>
        <span class="calc-val ${left >= 0 ? 'cyan' : 'orange'}" id="bgt-sum-left">${fmtTZS(left)}</span>
      </div>
      <div class="bgt-zero-check ${zeroState}" id="bgt-zero-check">${zeroMsg}</div>
      <div class="bgt-left-row">
        <span class="bgt-left-lbl">UNALLOCATED GOES TO:</span>
        <div class="bgt-left-btns">
          ${['savings', 'carry over', 'spend'].map(c => `
            <button class="bgt-left-btn${choice === c ? ' active' : ''}" data-bgt-left="${c}">
              ${c.toUpperCase()}
            </button>`).join('')}
        </div>
      </div>
      ${_savingsLine()}
    </div>`;
}

function _savingsLine() {
  const state = _getState();
  let total = 0;
  for (const c of Object.values(state.cycles)) {
    total += _sum(c.savings || []);              // pay-yourself-first always counts
    if (c.leftChoice === 'savings') {            // plus any leftovers explicitly sent to savings
      total += _sum(c.receipts) - _sum(c.savings || []) - _sum(c.fixed) - _sum(c.float);
    }
  }
  if (total <= 0) return '';
  return `<div class="bgt-savings-line">◈ TOTAL SAVED ACROSS CYCLES: <b>${fmtTZS(total)}</b></div>`;
}

// ── Goals (cross-cycle wealth layer) ───────────────────────────

function _getGoals()   { return storage.get(GOALS_KEY, []); }
function _saveGoals(g) { storage.set(GOALS_KEY, g); bus.emit('sync:trigger'); }

function _goalsCard() {
  const goals = _getGoals();
  const rows = goals.length ? goals.map(g => {
    const target  = Math.max(0, +g.target || 0);
    const current = Math.max(0, +g.current || 0);
    const pct     = target > 0 ? Math.min(Math.round(current / target * 100), 100) : 0;
    const done    = target > 0 && current >= target;
    return `
      <div class="goal-row${done ? ' done' : ''}">
        <div class="goal-head">
          <input class="bgt-label-input" data-goal-name="${esc(g.id)}"   value="${esc(g.name)}"   maxlength="40" />
          <input class="bgt-amount-input" data-goal-target="${esc(g.id)}" type="number" inputmode="numeric"
                 value="${target || ''}" placeholder="TARGET" />
          <span class="bgt-row-del" data-goal-del="${esc(g.id)}">×</span>
        </div>
        <div class="goal-progress-wrap">
          <div class="goal-progress-track">
            <div class="goal-progress-fill" style="width:${pct}%"></div>
          </div>
          <span class="goal-progress-val">${fmtTZS(current)} / ${fmtTZS(target)}${target > 0 ? ` — ${pct}%` : ''}</span>
        </div>
        <div class="goal-actions">
          <button class="bgt-add-btn" data-goal-contrib="${esc(g.id)}">+ CONTRIBUTE</button>
          ${done ? '<span class="goal-badge">✓ REACHED</span>' : ''}
        </div>
      </div>`;
  }).join('') : '<div class="loading">NO GOALS YET — ADD ONE TO TRACK PROGRESS ACROSS CYCLES</div>';

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-title">SAVINGS & GOALS</div>
        <button class="bgt-add-btn" id="goal-add-btn">＋ NEW GOAL</button>
      </div>
      <div class="goal-list">${rows}</div>
    </div>`;
}

function _addGoal() {
  const goals = _getGoals();
  goals.push({
    id: 'g' + Date.now().toString(36),
    name: '', target: 0, current: 0,
  });
  _saveGoals(goals);
  renderBudget();
}

function _deleteGoal(id) {
  const goals = _getGoals().filter(g => g.id !== id);
  _saveGoals(goals);
  renderBudget();
}

function _addGoalContribution(id) {
  const raw = prompt('Contribution amount (TZS):');
  if (raw == null) return;
  const amt = Math.max(0, parseFloat(String(raw).replace(/[,\s]/g, '')) || 0);
  if (amt <= 0) return;
  const goals = _getGoals();
  const g = goals.find(x => x.id === id);
  if (!g) return;
  g.current = (+g.current || 0) + amt;
  _saveGoals(goals);
  renderBudget();
}

function _readGoalFormIntoState() {
  const goals = _getGoals();
  document.querySelectorAll('#view-budget [data-goal-name]').forEach(inp => {
    const g = goals.find(x => x.id === inp.dataset.goalName);
    if (g) g.name = inp.value;
  });
  document.querySelectorAll('#view-budget [data-goal-target]').forEach(inp => {
    const g = goals.find(x => x.id === inp.dataset.goalTarget);
    if (g) g.target = Math.max(0, parseFloat(inp.value) || 0);
  });
  _saveGoals(goals);
}

// ── EOM review: float targets vs actual logged spend ───────────

function _reviewCard(cycle) {
  const [y, m]  = viewKey.split('-').map(Number);
  const txs     = (storage.get(STORAGE_KEYS.CASH, { transactions: [] }).transactions || [])
    .filter(tx => {
      const d = new Date(tx.date);
      return tx.type === 'debit' && d.getFullYear() === y && d.getMonth() === m - 1;
    });
  const totalOut = txs.reduce((s, t) => s + t.amount, 0);

  const rows = cycle.float.map(f => {
    const actual = _matchedSpend(f.l, txs);
    const pct    = f.a > 0 ? Math.min(Math.round(actual / f.a * 100), 999) : 0;
    const over   = f.a > 0 && actual > f.a;
    return `
      <div class="bgt-rev-row">
        <span class="bgt-rev-lbl">${esc(f.l)}</span>
        <div class="bgt-rev-track">
          <div class="bgt-rev-fill${over ? ' over' : ''}" style="width:${Math.min(pct, 100)}%"></div>
        </div>
        <span class="bgt-rev-val${over ? ' over' : ''}">${fmtTZS(actual)} / ${fmtTZS(f.a)}</span>
      </div>`;
  }).join('');

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-title">EOM REVIEW — TARGET VS ACTUAL</div>
        <span class="task-counter">${_keyLabel(viewKey)}</span>
      </div>
      ${cycle.float.length === 0
        ? '<div class="loading">NO ALLOWANCES SET</div>'
        : `<div class="bgt-rev-rows">${rows}</div>`}
      <div class="calc-row total">
        <span class="calc-lbl">TOTAL LOGGED SPEND THIS MONTH (ALL CATEGORIES)</span>
        <span class="calc-val orange">${fmtTZS(totalOut)}</span>
      </div>
      <div class="bgt-rev-hint">ACTUALS MATCH BY KEYWORD — e.g. "TRANSPORT ALLOWANCE" PICKS UP YOUR TRANSPORT-CATEGORY SPEND</div>
    </div>`;
}

// Match an allowance label to logged spend: by category id/label
// keyword, falling back to note text matching.
function _matchedSpend(label, txs) {
  const words = label.toLowerCase().split(/\s+/).filter(w => w.length > 3 && w !== 'allowance');
  if (words.length === 0) return 0;
  return txs.reduce((s, tx) => {
    const hay = (tx.category + ' ' + (tx.note || '')).toLowerCase();
    return words.some(w => hay.includes(w)) ? s + tx.amount : s;
  }, 0);
}

// ── Mutations ──────────────────────────────────────────────────

function _addRow(sec) {
  _readFormIntoState();
  const state = _getState();
  const cycle = state.cycles[viewKey];
  if (!cycle) return;
  cycle[sec].push(sec === 'fixed' ? { l: '', a: 0, paid: false } : { l: '', a: 0 });
  _saveState(state);
  renderBudget();
}

function _delRow(sec, idx) {
  _readFormIntoState();
  const state = _getState();
  state.cycles[viewKey]?.[sec]?.splice(idx, 1);
  _saveState(state);
  renderBudget();
}

function _togglePaid(idx) {
  _readFormIntoState();
  const state = _getState();
  const row = state.cycles[viewKey]?.fixed?.[idx];
  if (row) row.paid = !row.paid;
  _saveState(state);
  renderBudget();
}

function _setLeftChoice(choice) {
  _readFormIntoState();
  const state = _getState();
  const cycle = state.cycles[viewKey];
  if (!cycle) return;
  cycle.leftChoice = cycle.leftChoice === choice ? '' : choice;
  _saveState(state);
  renderBudget();
}

// Pull current input values into storage (labels + amounts)
function _readFormIntoState() {
  const state = _getState();
  const cycle = state.cycles[viewKey];
  if (!cycle) return;

  document.querySelectorAll('#view-budget [data-bgt-l]').forEach(inp => {
    const [sec, i] = inp.dataset.bgtL.split(':');
    if (cycle[sec]?.[+i]) cycle[sec][+i].l = inp.value.toUpperCase();
  });
  document.querySelectorAll('#view-budget [data-bgt-a]').forEach(inp => {
    const [sec, i] = inp.dataset.bgtA.split(':');
    if (cycle[sec]?.[+i]) cycle[sec][+i].a = Math.max(0, parseFloat(inp.value) || 0);
  });
  _saveState(state);
}

// Update totals without a full re-render (keeps input focus)
function _renderSummaryOnly() {
  const cycle = _getState().cycles[viewKey];
  if (!cycle) return;
  const rec = _sum(cycle.receipts), sav = _sum(cycle.savings || []),
        fix = _sum(cycle.fixed),    flo = _sum(cycle.float);
  const left = rec - sav - fix - flo;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmtTZS(v); };
  set('bgt-sum-rec',  rec);
  set('bgt-sum-sav',  sav);
  set('bgt-sum-fix',  fix);
  set('bgt-sum-paid', _sum(cycle.fixed.filter(r => r.paid)));
  set('bgt-sum-flo',  flo);
  const leftEl = document.getElementById('bgt-sum-left');
  if (leftEl) {
    leftEl.textContent = fmtTZS(left);
    leftEl.className   = 'calc-val ' + (left >= 0 ? 'cyan' : 'orange');
  }
  const zeroEl = document.getElementById('bgt-zero-check');
  if (zeroEl) {
    const st = Math.abs(left) < 1 ? 'balanced' : left > 0 ? 'under' : 'over';
    zeroEl.className = 'bgt-zero-check ' + st;
    zeroEl.textContent = st === 'balanced'
      ? '✓ ZERO-BASED — EVERY SHILLING IS ASSIGNED'
      : st === 'under' ? `UNALLOCATED: ${fmtTZS(left)} — ASSIGN IT BELOW`
                       : `OVER-ALLOCATED BY ${fmtTZS(-left)} — CUT SOMETHING`;
  }
  document.querySelectorAll('[data-bgt-total]').forEach(el => {
    el.textContent = fmtTZS(_sum(cycle[el.dataset.bgtTotal] || []));
  });
}

function _sum(rows) { return rows.reduce((s, r) => s + (r.a || 0), 0); }
