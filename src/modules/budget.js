// ── JARVIS — src/modules/budget.js ────────────────────────────
// Monthly budget — digital version of Saif's salary-cycle sheet,
// now mirroring the Personal_Budget_System spreadsheet's method:
// zero-based envelopes + PAY-YOURSELF-FIRST savings taken off the
// top (not leftover scraps). A cycle = one salary month. Each has:
//   RECEIPTS         — income sources (asked fresh, prefilled from last)
//   SAVINGS          — pay-yourself-first, pulled BEFORE any expense
//   FIXED EXPENSES   — obligations, each with a PAID toggle ("kinda variable")
//   WEEKLY BUDGET    — one amount, set at cycle start, that refreshes every
//                      week; unspent balance rolls into the next week
//                      (running total, not a reset). Everything not covered
//                      by a fixed expense comes out of this.
//   UNALLOCATED      — receipts − savings − fixed − (weekly × weeks); should trend to 0
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
  weekly: { amount: 0 },
};

let viewKey = _monthKey(new Date());   // cycle currently shown, 'YYYY-MM'

// ── Storage ────────────────────────────────────────────────────

function _getState()    { return storage.get(BUDGET_KEY, { cycles: {} }); }
function _saveState(st) { storage.set(BUDGET_KEY, st); bus.emit('sync:trigger'); }

// Public: the weekly budget as a single envelope (id 'weekly'), target =
// cumulative allocation to date so far this cycle (carries unspent weeks
// forward automatically). [] if no cycle or no amount set.
// Consumed by cash.js to render envelope chips.
export function getCurrentEnvelopes() {
  const key = _monthKey(new Date());
  const state = _getState();
  const cycle = state.cycles[key];
  const amount = _weeklyAmount(cycle);
  if (!cycle || amount <= 0) return [];
  return [{ id: 'weekly', label: 'WEEKLY BUDGET', target: _weeklyAllocatedToDate(key, amount, new Date()) }];
}

function _weeklyAmount(cycle) { return Math.max(0, +cycle?.weekly?.amount || 0); }

function _daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function _weeksInMonth(key) { return Math.ceil(_daysInMonth(key) / 7); }

// 0-based index of the 7-day block a given day-of-month falls in
function _weekIndexOfDay(day) { return Math.floor((day - 1) / 7); }

// Cumulative weekly allocation as of a date: a new week's money lands in
// full on day 1 of that week. Clipped to before/after the cycle's month.
function _weeklyAllocatedToDate(key, amount, asOf) {
  const [y, m] = key.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd   = new Date(y, m, 0, 23, 59, 59, 999);
  const weeks = _weeksInMonth(key);
  if (asOf < monthStart) return 0;
  if (asOf > monthEnd)   return amount * weeks;
  return amount * Math.min(weeks, _weekIndexOfDay(asOf.getDate()) + 1);
}

// Sum of logged debit spend for calendar month y/m (1-based), restricted
// to days [fromDay, toDay] inclusive. The weekly budget is the sole
// catch-all envelope, so this is simply everything spent in range.
function _debitSum(y, m, fromDay, toDay) {
  return (storage.get(STORAGE_KEYS.CASH, { transactions: [] }).transactions || [])
    .filter(tx => tx.type === 'debit' && (() => {
      const d = new Date(tx.date);
      return d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() >= fromDay && d.getDate() <= toDay;
    })())
    .reduce((s, t) => s + t.amount, 0);
}

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
    if (e.target.matches('[data-bgt-l], [data-bgt-a], [data-bgt-weekly]')) {
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
  if (cycle) cycle.weekly  = cycle.weekly  || { amount: 0 }; // back-compat for cycles saved before weekly budget

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
    _safeToSpendHero(cycle) +
    _sectionCard('receipts', 'RECEIPTS', cycle.receipts, { amountCls: 'green' }) +
    _sectionCard('savings',  'PAY YOURSELF FIRST — SAVINGS', cycle.savings, { amountCls: 'cyan' }) +
    _sectionCard('fixed',    'FIXED EXPENSES', cycle.fixed, { paidToggle: true }) +
    _weeklyCard(cycle) +
    _summaryCard(cycle) +
    _goalsCard() +
    _reviewCard(cycle);
}

// Safe-to-spend today = running weekly balance (allocated-to-date minus all
// logged spend this cycle — unspent weeks already counted in) divided by
// days left in the CURRENT 7-day block, not the whole cycle.
function _safeToSpendHero(cycle) {
  const amount = _weeklyAmount(cycle);
  const weeks  = _weeksInMonth(viewKey);
  const [y, m] = viewKey.split('-').map(Number);
  const today  = new Date();
  const isCurrent = _monthKey(today) === viewKey;

  const asOf      = isCurrent ? today : new Date(y, m, 0, 23, 59, 59, 999);
  const allocated = _weeklyAllocatedToDate(viewKey, amount, asOf);
  const spent     = _debitSum(y, m, 1, isCurrent ? today.getDate() : _daysInMonth(viewKey));
  const balance   = allocated - spent;

  const weekIdx        = _weekIndexOfDay(asOf.getDate());
  const weekEndDay      = Math.min(weekIdx * 7 + 7, _daysInMonth(viewKey));
  const daysLeftInWeek  = isCurrent ? Math.max(1, weekEndDay - today.getDate() + 1) : 1;
  const perDay          = balance > 0 ? Math.floor(balance / daysLeftInWeek) : 0;

  const weekLbl = `WEEK ${weekIdx + 1} OF ${weeks}`;
  const daysLbl = isCurrent ? `${daysLeftInWeek} DAYS LEFT THIS WEEK` : 'CYCLE CLOSED';
  const balSign = balance < 0 ? '-' : '';

  return `
    <div class="bgt-safe-hero">
      <div class="lbl">SAFE TO SPEND TODAY</div>
      <div class="big"><span class="cur">TZS</span><span>${Math.round(perDay).toLocaleString('en-US')}</span></div>
      <div class="sub"><b>${balSign}${fmtTZS(balance)}</b> weekly balance · <b>${weekLbl}</b> · <b>${daysLbl}</b></div>
    </div>`;
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
        fixed: clone(last.fixed, true), weekly: { amount: _weeklyAmount(last) }, leftChoice: '' }
    : { receipts: clone(SEED.receipts), savings: clone(SEED.savings),
        fixed: clone(SEED.fixed, true), weekly: { amount: 0 }, leftChoice: '' };

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

// Single amount, set once per cycle. Refreshes every 7-day block; unspent
// balance rolls forward (see _weeklyAllocatedToDate) rather than resetting.
function _weeklyCard(cycle) {
  const amount = _weeklyAmount(cycle);
  const weeks  = _weeksInMonth(viewKey);
  return `
    <div class="card">
      <div class="card-header"><div class="card-title">WEEKLY BUDGET</div></div>
      <div class="bgt-rows">
        <div class="bgt-row">
          <span class="bgt-label-input" style="cursor:default">AMOUNT PER WEEK</span>
          <input class="bgt-amount-input" data-bgt-weekly="amount"
                 type="number" inputmode="numeric" value="${amount || ''}" placeholder="0" />
        </div>
      </div>
      <div class="bgt-section-foot">
        <span class="bgt-rev-hint" style="padding:0">SET ONCE — REFRESHES EVERY WEEK. UNSPENT MONEY ROLLS INTO THE NEXT WEEK. EVERYTHING NOT LISTED ABOVE COMES OUT OF THIS.</span>
        <span class="bgt-section-total" id="bgt-weekly-total">${fmtTZS(amount * weeks)}</span>
      </div>
    </div>`;
}

function _summaryCard(cycle) {
  const rec   = _sum(cycle.receipts);
  const sav   = _sum(cycle.savings);
  const fix   = _sum(cycle.fixed);
  const weeks = _weeksInMonth(viewKey);
  const flo   = _weeklyAmount(cycle) * weeks;
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
      <div class="calc-row"><span class="calc-lbl">WEEKLY BUDGET (×${weeks})</span><span class="calc-val orange" id="bgt-sum-flo">${fmtTZS(flo)}</span></div>
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

// Legacy cycles (pre-weekly-budget) stored a `float` row array; new cycles
// store a single `weekly` amount. Normalize either to a monthly total.
function _floatEquivalent(c, key) {
  return c.float ? _sum(c.float) : _weeklyAmount(c) * _weeksInMonth(key);
}

function _savingsLine() {
  const state = _getState();
  let total = 0;
  for (const [key, c] of Object.entries(state.cycles)) {
    total += _sum(c.savings || []);              // pay-yourself-first always counts
    if (c.leftChoice === 'savings') {            // plus any leftovers explicitly sent to savings
      total += _sum(c.receipts) - _sum(c.savings || []) - _sum(c.fixed) - _floatEquivalent(c, key);
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
    const eta     = _goalEta(g);
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
        ${eta ? `<div class="goal-eta">${eta}</div>` : ''}
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

// ETA = "ready · Mon YYYY" or "on track · Mon YYYY", based on the
// average pay-yourself-first amount across the last 3 cycles as a
// proxy monthly funding rate. Returns '' if we can't project.
function _goalEta(g) {
  const target = Math.max(0, +g.target || 0);
  const current = Math.max(0, +g.current || 0);
  if (!target) return '';
  if (current >= target) return '✓ REACHED';

  const state = _getState();
  const cycles = Object.entries(state.cycles).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3);
  if (!cycles.length) return '';
  const goals = _getGoals();
  const goalCount = Math.max(1, goals.length);
  const avgSavings = cycles.reduce((s, [, c]) => s + _sum(c.savings || []), 0) / cycles.length;
  const perGoal = avgSavings / goalCount;
  if (perGoal <= 0) return 'ADD SAVINGS TO PROJECT ETA';

  const monthsNeeded = Math.ceil((target - current) / perGoal);
  const eta = new Date();
  eta.setMonth(eta.getMonth() + monthsNeeded);
  const label = eta.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase();
  const prefix = monthsNeeded <= 3 ? 'READY ·' : 'ON TRACK ·';
  return `${prefix} ${label}`;
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

// ── EOM review: week-by-week weekly-budget breakdown ───────────

function _reviewCard(cycle) {
  const [y, m]   = viewKey.split('-').map(Number);
  const amount   = _weeklyAmount(cycle);
  const weeksTotal = _weeksInMonth(viewKey);
  const today    = new Date();
  const todayKey = _monthKey(today);
  const weeksShown = todayKey === viewKey ? _weekIndexOfDay(today.getDate()) + 1
                    : (viewKey < todayKey ? weeksTotal : 0);

  let running = 0;
  const rowsArr = [];
  for (let i = 0; i < weeksShown; i++) {
    const startDay = i * 7 + 1;
    const endDay   = Math.min(startDay + 6, _daysInMonth(viewKey));
    const spent    = _debitSum(y, m, startDay, endDay);
    running += amount - spent;
    const pct  = amount > 0 ? Math.min(Math.round(spent / amount * 100), 999) : 0;
    const over = amount > 0 && spent > amount;
    const balSign = running < 0 ? '-' : '';
    rowsArr.push(`
      <div class="bgt-rev-row">
        <span class="bgt-rev-lbl">WEEK ${i + 1} · ${startDay}–${endDay}</span>
        <div class="bgt-rev-track">
          <div class="bgt-rev-fill${over ? ' over' : ''}" style="width:${Math.min(pct, 100)}%"></div>
        </div>
        <span class="bgt-rev-val${running < 0 ? ' over' : ''}">${fmtTZS(spent)} / ${fmtTZS(amount)} · BAL ${balSign}${fmtTZS(running)}</span>
      </div>`);
  }

  const totalOut = _debitSum(y, m, 1, _daysInMonth(viewKey));

  return `
    <div class="card">
      <div class="card-header">
        <div class="card-title">EOM REVIEW — WEEKLY BUDGET</div>
        <span class="task-counter">${_keyLabel(viewKey)}</span>
      </div>
      ${amount <= 0
        ? '<div class="loading">NO WEEKLY BUDGET SET</div>'
        : weeksShown === 0
          ? '<div class="loading">CYCLE HAS NOT STARTED YET</div>'
          : `<div class="bgt-rev-rows">${rowsArr.join('')}</div>`}
      <div class="calc-row total">
        <span class="calc-lbl">TOTAL LOGGED SPEND THIS MONTH (ALL CATEGORIES)</span>
        <span class="calc-val orange">${fmtTZS(totalOut)}</span>
      </div>
      <div class="bgt-rev-hint">UNSPENT WEEKS ROLL FORWARD — A NEGATIVE BALANCE MEANS YOU HAVE DIPPED INTO NEXT WEEK'S MONEY.</div>
    </div>`;
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
  const weeklyInp = document.querySelector('#view-budget [data-bgt-weekly="amount"]');
  if (weeklyInp) {
    cycle.weekly = cycle.weekly || { amount: 0 };
    cycle.weekly.amount = Math.max(0, parseFloat(weeklyInp.value) || 0);
  }
  _saveState(state);
}

// Update totals without a full re-render (keeps input focus)
function _renderSummaryOnly() {
  const cycle = _getState().cycles[viewKey];
  if (!cycle) return;
  const rec = _sum(cycle.receipts), sav = _sum(cycle.savings || []),
        fix = _sum(cycle.fixed),    flo = _weeklyAmount(cycle) * _weeksInMonth(viewKey);
  const left = rec - sav - fix - flo;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmtTZS(v); };
  set('bgt-sum-rec',  rec);
  set('bgt-sum-sav',  sav);
  set('bgt-sum-fix',  fix);
  set('bgt-sum-paid', _sum(cycle.fixed.filter(r => r.paid)));
  set('bgt-sum-flo',  flo);
  set('bgt-weekly-total', flo);
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
