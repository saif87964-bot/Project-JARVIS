// ═══════════════════════════════════════════════════════════════
//  JARVIS — app.js
// ═══════════════════════════════════════════════════════════════


// ── Utils ──────────────────────────────────────────────────────
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function timeAgo(date) {
  const mins = Math.floor((Date.now() - date) / 60000);
  if (isNaN(mins) || mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}


// ── Clock & Greeting ───────────────────────────────────────────
const DAYS   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function tick() {
  const now = new Date();

  const timeEl = document.getElementById('live-time');
  if (timeEl) timeEl.textContent = now.toTimeString().split(' ')[0];

  const hr = now.getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const greetEl = document.getElementById('greeting-main');
  if (greetEl) greetEl.innerHTML = `${greet}, <span>Saif.</span>`;

  const sub = document.getElementById('greeting-sub');
  if (sub) {
    sub.innerHTML = `// ${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  }
}
tick();
setInterval(tick, 1000);


// ══════════════════════════════════════════════════════════════
//  SPA ROUTER
// ══════════════════════════════════════════════════════════════

let currentView = 'dashboard';

function navigate(viewId) {
  // Guard: view must exist
  if (!document.getElementById('view-' + viewId)) return;

  currentView = viewId;

  // Swap views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + viewId).classList.add('active');

  // Update sidebar + bottom nav active state
  document.querySelectorAll('.nav-item[data-view]').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewId);
  });
  document.querySelectorAll('.bnav-item[data-view]').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewId);
  });

  // Scroll center panel back to top
  document.querySelector('.center').scrollTop = 0;

  // View-specific on-enter actions
  if (viewId === 'reminders') renderTasks();
  if (viewId === 'news')      loadFullNews();
  if (viewId === 'calendar')  initCalendar();
  if (viewId === 'cash')      initCash();

  // Update hash (minus # for dashboard)
  history.replaceState(null, '', viewId === 'dashboard' ? ' ' : '#' + viewId);
}

// Nav clicks
document.querySelectorAll('.nav-item[data-view], [data-view]').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.view));
});

// Restore from hash on load
window.addEventListener('DOMContentLoaded', () => {
  const hash = window.location.hash.slice(1);
  if (hash && document.getElementById('view-' + hash)) navigate(hash);
});


// ══════════════════════════════════════════════════════════════
//  TASKS MODULE
// ══════════════════════════════════════════════════════════════

const TASKS_KEY = 'jv_tasks';
let taskFilter  = 'all';

// ── Storage helpers ────────────────────────────────────────────
function getTasks() {
  try { return JSON.parse(localStorage.getItem(TASKS_KEY)) || []; }
  catch { return []; }
}
function saveTasks(tasks) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

// ── Seed defaults on first run ─────────────────────────────────
function seedDefaultTasks() {
  if (getTasks().length > 0) return;
  saveTasks([
    { id: 't1', text: 'VAT reconciliation March 2025 — submit to TRA', time: '09:00', urgent: true,  done: false, createdAt: Date.now() - 4000 },
    { id: 't2', text: 'Twigaz WIP drum recount — factory floor',         time: '11:00', urgent: false, done: false, createdAt: Date.now() - 3000 },
    { id: 't3', text: 'Review EASWIL cash flow projection',               time: '',      urgent: false, done: true,  createdAt: Date.now() - 2000 },
    { id: 't4', text: 'Kariakoo business licence renewal',                time: 'EOD',   urgent: false, done: false, createdAt: Date.now() - 1000 },
  ]);
}

// ── CRUD ───────────────────────────────────────────────────────
function addTask(text, time = '') {
  const tasks = getTasks();
  tasks.unshift({
    id: 't' + Date.now(),
    text: text.trim(),
    time: time.trim(),
    urgent: false,
    done: false,
    createdAt: Date.now(),
  });
  saveTasks(tasks);
  afterTaskChange();
}

function toggleTask(id) {
  const tasks = getTasks();
  const t = tasks.find(t => t.id === id);
  if (t) t.done = !t.done;
  saveTasks(tasks);
  afterTaskChange();
}

function deleteTask(id) {
  saveTasks(getTasks().filter(t => t.id !== id));
  afterTaskChange();
}

function afterTaskChange() {
  renderTasks();
  updateDashboardTasks();
  updateBadges();
}

// ── Render — full tasks view ───────────────────────────────────
function renderTasks() {
  const tasks = getTasks();
  const active = tasks.filter(t => !t.done).length;

  // Counter
  const counter = document.getElementById('task-counter');
  if (counter) counter.textContent = `${active} REMAINING`;

  // List
  const list = document.getElementById('task-list');
  if (!list) return;

  const filtered = tasks.filter(t => {
    if (taskFilter === 'active') return !t.done;
    if (taskFilter === 'done')   return  t.done;
    return true;
  });

  if (filtered.length === 0) {
    const msg = taskFilter === 'done' ? 'NO COMPLETED TASKS' :
                taskFilter === 'active' ? 'ALL CAUGHT UP' : 'NO TASKS YET';
    list.innerHTML = `<div class="loading">${msg}</div>`;
    return;
  }

  list.innerHTML = filtered.map(t => `
    <div class="task-item${t.done ? ' task-done' : ''}${t.urgent ? ' task-urgent' : ''}" data-id="${t.id}">
      <div class="task-check" onclick="toggleTask('${t.id}')">${t.done ? '✓' : ''}</div>
      <div class="task-body">
        <div class="task-text">${esc(t.text)}</div>
      </div>
      ${t.time ? `<div class="task-time">${esc(t.time)}</div>` : ''}
      <div class="task-del" onclick="deleteTask('${t.id}')" title="Delete">×</div>
    </div>`).join('');
}

// ── Render — dashboard preview (top 3 active) ─────────────────
function updateDashboardTasks() {
  const el = document.getElementById('dashboard-tasks');
  if (!el) return;

  const tasks = getTasks();
  const active = tasks.filter(t => !t.done);
  const preview = tasks.slice(0, 4); // show first 4 regardless of status

  // Update greeting stat
  const gsEl = document.getElementById('gs-tasks');
  if (gsEl) gsEl.textContent = active.length;

  if (tasks.length === 0) {
    el.innerHTML = '<div class="loading">NO TASKS — ADD ONE ABOVE</div>';
    return;
  }

  el.innerHTML = preview.map(t => `
    <div class="task-item${t.done ? ' task-done' : ''}${t.urgent ? ' task-urgent' : ''}" data-id="${t.id}" onclick="toggleTask('${t.id}')">
      <div class="task-check">${t.done ? '✓' : ''}</div>
      <div class="task-body">
        <div class="task-text">${esc(t.text)}</div>
      </div>
      ${t.time ? `<div class="task-time">${esc(t.time)}</div>` : ''}
    </div>`).join('') +
    (tasks.length > 4 ? `<div class="task-more" data-view="reminders">+${tasks.length - 4} MORE →</div>` : '');

  // Re-bind "more" link
  el.querySelector('[data-view]')?.addEventListener('click', e => navigate(e.currentTarget.dataset.view));
}

// ── Filter tabs ────────────────────────────────────────────────
document.querySelectorAll('.task-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    taskFilter = btn.dataset.filter;
    document.querySelectorAll('.task-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTasks();
  });
});

// ── Add form ───────────────────────────────────────────────────
function submitTask() {
  const input = document.getElementById('task-input');
  const timeInput = document.getElementById('task-time');
  const text = input?.value.trim();
  if (!text) { input?.focus(); return; }
  addTask(text, timeInput?.value || '');
  input.value = '';
  if (timeInput) timeInput.value = '';
  input.focus();
}

document.getElementById('task-add-btn')?.addEventListener('click', submitTask);
document.getElementById('task-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitTask();
});

// ── Badges ─────────────────────────────────────────────────────
function updateBadges() {
  const active = getTasks().filter(t => !t.done).length;
  const val = active > 0 ? active : '';
  const badge  = document.getElementById('badge-reminders');
  const bnavBadge = document.getElementById('bnav-badge-reminders');
  if (badge)     badge.textContent     = val;
  if (bnavBadge) bnavBadge.textContent = val;
}


// ══════════════════════════════════════════════════════════════
//  CALENDAR MODULE
// ══════════════════════════════════════════════════════════════

const EVENTS_KEY = 'jv_events';
let calYear      = new Date().getFullYear();
let calMonth     = new Date().getMonth(); // 0-indexed
let selectedDate = null;
let calFormOpen  = false;

// ── Storage ────────────────────────────────────────────────────
function getEvents() {
  try { return JSON.parse(localStorage.getItem(EVENTS_KEY)) || []; }
  catch { return []; }
}
function saveEvents(ev) { localStorage.setItem(EVENTS_KEY, JSON.stringify(ev)); }
function getEventsForDate(dateStr) { return getEvents().filter(e => e.date === dateStr); }

// ── Seed defaults (first run) ──────────────────────────────────
function seedDefaultEvents() {
  if (getEvents().length > 0) return;
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today    = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const nextWeek = new Date(today.getTime() + 7 * 86400000);
  saveEvents([
    { id: 'ev1', title: 'TRA compliance review',       date: fmt(today),    time: '10:00', createdAt: Date.now()-3 },
    { id: 'ev2', title: 'Twigaz factory inspection',   date: fmt(tomorrow), time: '09:30', createdAt: Date.now()-2 },
    { id: 'ev3', title: 'EASWIL board meeting',         date: fmt(nextWeek), time: '14:00', createdAt: Date.now()-1 },
  ]);
}

// ── CRUD ───────────────────────────────────────────────────────
function addEvent(title, time = '') {
  if (!selectedDate || !title.trim()) return;
  const evs = getEvents();
  evs.push({ id: 'ev' + Date.now(), title: title.trim(), date: selectedDate, time: time.trim(), createdAt: Date.now() });
  saveEvents(evs);
  afterEventChange();
}

function deleteEvent(id) {
  saveEvents(getEvents().filter(e => e.id !== id));
  afterEventChange();
}

function afterEventChange() {
  buildCalendar();
  renderDayEvents();
  renderUpcoming();
  updateMeetingsStat();
}

// ── Build month grid ───────────────────────────────────────────
function buildCalendar() {
  const label = document.getElementById('cal-month-label');
  if (label) label.textContent = `${MONTHS[calMonth]} ${calYear}`;

  const grid = document.getElementById('cal-days');
  if (!grid) return;

  const firstDow  = new Date(calYear, calMonth, 1).getDay();       // 0=Sun
  const offset    = (firstDow + 6) % 7;                            // shift to Mon-start
  const daysTotal = new Date(calYear, calMonth + 1, 0).getDate();
  const today     = new Date();
  const isCurMon  = today.getFullYear() === calYear && today.getMonth() === calMonth;

  let html = '';

  // Empty leading cells
  for (let i = 0; i < offset; i++) html += `<div class="cal-day cal-empty"></div>`;

  // Day cells
  for (let d = 1; d <= daysTotal; d++) {
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const evCount = getEventsForDate(dateStr).length;
    const isToday    = isCurMon && d === today.getDate();
    const isSelected = dateStr === selectedDate;
    const cls = ['cal-day', isToday ? 'cal-today' : '', isSelected ? 'cal-selected' : ''].filter(Boolean).join(' ');
    const dots = evCount > 0
      ? `<div class="cal-dots">${'<div class="cal-dot"></div>'.repeat(Math.min(evCount, 3))}</div>`
      : '';
    html += `<div class="${cls}" data-date="${dateStr}"><span class="cal-day-num">${d}</span>${dots}</div>`;
  }

  grid.innerHTML = html;

  // Bind day clicks
  grid.querySelectorAll('.cal-day:not(.cal-empty)').forEach(cell => {
    cell.addEventListener('click', () => selectDay(cell.dataset.date));
  });
}

// ── Select a day ───────────────────────────────────────────────
function selectDay(dateStr) {
  selectedDate = dateStr;

  // Update selected highlight without full rebuild
  document.querySelectorAll('.cal-day').forEach(c => c.classList.toggle('cal-selected', c.dataset.date === dateStr));

  // Update day title
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const tomorrow = new Date(today.getTime() + 86400000);
  const label = d.getTime() === today.getTime()    ? 'TODAY' :
                d.getTime() === tomorrow.getTime() ? 'TOMORROW' :
                `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const titleEl = document.getElementById('cal-day-title');
  if (titleEl) titleEl.textContent = label;

  // Close add form on day switch
  closeEventForm();
  renderDayEvents();
}

// ── Render: events for selected day ───────────────────────────
function renderDayEvents() {
  const container = document.getElementById('cal-day-events');
  if (!container) return;
  if (!selectedDate) { container.innerHTML = '<div class="loading">SELECT A DAY TO VIEW EVENTS</div>'; return; }

  const evs = getEventsForDate(selectedDate).sort((a,b) => (a.time||'').localeCompare(b.time||''));
  if (evs.length === 0) {
    container.innerHTML = '<div class="loading">NO EVENTS — CLICK + EVENT TO ADD</div>';
    return;
  }
  container.innerHTML = evs.map(e => `
    <div class="cal-event-item">
      ${e.time ? `<div class="cal-event-time-badge">${esc(e.time)}</div>` : ''}
      <div class="cal-event-body">
        <div class="cal-event-title">${esc(e.title)}</div>
      </div>
      <div class="cal-event-del" onclick="deleteEvent('${e.id}')">×</div>
    </div>`).join('');
}

// ── Render: upcoming 7 days ────────────────────────────────────
function renderUpcoming() {
  const container = document.getElementById('cal-upcoming');
  if (!container) return;

  const now = new Date(); now.setHours(0,0,0,0);
  const weekOut = new Date(now.getTime() + 7 * 86400000);

  const evs = getEvents()
    .filter(e => { const d = new Date(e.date + 'T00:00:00'); return d >= now && d <= weekOut; })
    .sort((a,b) => a.date.localeCompare(b.date) || (a.time||'').localeCompare(b.time||''));

  if (evs.length === 0) {
    container.innerHTML = '<div class="loading">NO UPCOMING EVENTS THIS WEEK</div>';
    return;
  }

  container.innerHTML = evs.map(e => {
    const d = new Date(e.date + 'T00:00:00');
    const tomorrow = new Date(now.getTime() + 86400000);
    const badge = d.getTime() === now.getTime()      ? 'TODAY' :
                  d.getTime() === tomorrow.getTime() ? 'TOMORROW' :
                  `${DAYS[d.getDay()]} ${d.getDate()}`;
    return `
      <div class="cal-event-item">
        <div class="cal-event-date-badge">${badge}</div>
        ${e.time ? `<div class="cal-event-time-badge">${esc(e.time)}</div>` : ''}
        <div class="cal-event-body">
          <div class="cal-event-title">${esc(e.title)}</div>
        </div>
        <div class="cal-event-del" onclick="deleteEvent('${e.id}')">×</div>
      </div>`;
  }).join('');
}

// ── Event form ─────────────────────────────────────────────────
function openEventForm() {
  calFormOpen = true;
  document.getElementById('cal-event-form')?.classList.add('open');
  document.getElementById('cal-event-title')?.focus();
}
function closeEventForm() {
  calFormOpen = false;
  const form = document.getElementById('cal-event-form');
  if (form) { form.classList.remove('open'); }
  const inp = document.getElementById('cal-event-title');
  const t   = document.getElementById('cal-event-time');
  if (inp) inp.value = '';
  if (t)   t.value   = '';
}
function submitEvent() {
  const title = document.getElementById('cal-event-title')?.value.trim();
  const time  = document.getElementById('cal-event-time')?.value.trim();
  if (!title) { document.getElementById('cal-event-title')?.focus(); return; }
  addEvent(title, time);
  closeEventForm();
}

document.getElementById('cal-add-btn')?.addEventListener('click', () => {
  if (!selectedDate) return;
  calFormOpen ? closeEventForm() : openEventForm();
});
document.getElementById('cal-event-submit')?.addEventListener('click', submitEvent);
document.getElementById('cal-event-title')?.addEventListener('keydown', e => {
  if (e.key === 'Enter')  submitEvent();
  if (e.key === 'Escape') closeEventForm();
});

// ── Month navigation ───────────────────────────────────────────
document.getElementById('cal-prev')?.addEventListener('click', () => {
  calMonth--; if (calMonth < 0)  { calMonth = 11; calYear--; }
  buildCalendar();
});
document.getElementById('cal-next')?.addEventListener('click', () => {
  calMonth++; if (calMonth > 11) { calMonth = 0;  calYear++; }
  buildCalendar();
});

// ── Greeting stat — meetings today ────────────────────────────
function updateMeetingsStat() {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const count = getEventsForDate(dateStr).length;
  const el = document.getElementById('gs-meetings');
  if (el) el.textContent = count;
}

// ── Init calendar view ────────────────────────────────────────
function initCalendar() {
  calYear  = new Date().getFullYear();
  calMonth = new Date().getMonth();

  buildCalendar();
  renderUpcoming();

  // Auto-select today
  const t = new Date();
  const todayStr = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  selectDay(todayStr);
}


// ══════════════════════════════════════════════════════════════
//  PETTY CASH MODULE
// ══════════════════════════════════════════════════════════════

const CASH_KEY = 'jv_petty_cash';

const CASH_CATS = [
  { id: 'food',      label: 'FOOD'      },
  { id: 'transport', label: 'TRANSPORT' },
  { id: 'fuel',      label: 'FUEL'      },
  { id: 'business',  label: 'BUSINESS'  },
  { id: 'shopping',  label: 'SHOPPING'  },
  { id: 'utilities', label: 'UTILITIES' },
  { id: 'misc',      label: 'MISC'      },
];

let cashTxType = 'debit';
let cashTxCat  = 'misc';

// ── Storage ────────────────────────────────────────────────────
function getCashData() {
  try { return JSON.parse(localStorage.getItem(CASH_KEY)) || { balance: 0, transactions: [] }; }
  catch { return { balance: 0, transactions: [] }; }
}
function saveCashData(d) { localStorage.setItem(CASH_KEY, JSON.stringify(d)); }

// ── Format TZS ─────────────────────────────────────────────────
function fmtTZS(n) {
  return 'TZS ' + Math.abs(Math.round(n)).toLocaleString('en-US');
}

// ── Recalculate running balances after a delete ─────────────────
function recalcCash(data) {
  const oldest = [...data.transactions].reverse(); // oldest first
  let running = 0;
  oldest.forEach(tx => {
    running = tx.type === 'credit' ? running + tx.amount : running - tx.amount;
    tx.balanceAfter = running;
  });
  data.balance = running;
  data.transactions = oldest.reverse(); // back to newest first
}

// ── Add transaction ─────────────────────────────────────────────
function addCashTx(amount, type, cat, note) {
  const data = getCashData();
  const newBal = type === 'credit' ? data.balance + amount : data.balance - amount;
  data.transactions.unshift({
    id: 'tx' + Date.now(),
    type, amount, category: cat,
    note: note.trim(),
    date: new Date().toISOString(),
    balanceAfter: newBal,
  });
  data.balance = newBal;
  saveCashData(data);
  renderCash();
}

// ── Delete transaction ──────────────────────────────────────────
function deleteCashTx(id) {
  const data = getCashData();
  const idx = data.transactions.findIndex(t => t.id === id);
  if (idx === -1) return;
  data.transactions.splice(idx, 1);
  recalcCash(data);
  saveCashData(data);
  renderCash();
}

// ── Render ──────────────────────────────────────────────────────
function renderCash() {
  const data = getCashData();

  // Balance display
  const balEl = document.getElementById('cash-balance');
  if (balEl) {
    balEl.textContent = fmtTZS(data.balance);
    balEl.className = 'cash-bal-amount' + (data.balance < 0 ? ' negative' : '');
  }

  // Today's totals
  const todayStr = new Date().toDateString();
  let todayIn = 0, todayOut = 0;
  data.transactions.forEach(tx => {
    if (new Date(tx.date).toDateString() === todayStr) {
      if (tx.type === 'credit') todayIn  += tx.amount;
      else                       todayOut += tx.amount;
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
        <div class="cash-tx-del" onclick="deleteCashTx('${tx.id}')" title="Remove">×</div>
      </div>`;
  }).join('');
}

// ── Export CSV ──────────────────────────────────────────────────
function exportCashCSV() {
  const data = getCashData();
  if (!data.transactions.length) { showCmdResponse('NO DATA TO EXPORT', true); return; }

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
  a.href = url;
  a.download = `jarvis-cash-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Form submit ─────────────────────────────────────────────────
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

// ── Event bindings ──────────────────────────────────────────────
document.querySelectorAll('.cash-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    cashTxType = btn.dataset.type;
    document.querySelectorAll('.cash-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
});

document.querySelectorAll('.cash-cat-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    cashTxCat = chip.dataset.cat;
    document.querySelectorAll('.cash-cat-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
  });
});

document.getElementById('cash-add-btn')?.addEventListener('click', submitCashTx);
document.getElementById('cash-amount-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitCashTx();
});
document.getElementById('cash-note-input')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitCashTx();
});
document.getElementById('cash-export-btn')?.addEventListener('click', exportCashCSV);

// ── Init (called by navigate) ───────────────────────────────────
function initCash() { renderCash(); }


// ══════════════════════════════════════════════════════════════
//  WEATHER  (wttr.in — no API key)
// ══════════════════════════════════════════════════════════════

async function loadWeather() {
  const el = document.getElementById('weather-block');
  if (!el) return;
  try {
    const r = await fetch('https://wttr.in/Dar+es+Salaam?format=j1', { cache: 'no-cache' });
    const d = await r.json();
    const c = d.current_condition[0];
    const desc = c.weatherDesc?.[0]?.value || 'Clear';
    el.innerHTML = `
      <div class="weather-icon">${wxIcon(c.weatherCode)}</div>
      <div>
        <div class="weather-temp">${c.temp_C}°C</div>
        <div class="weather-city">DAR ES SALAAM, TZ</div>
        <div class="weather-desc">${esc(desc)} · ${c.humidity}% humidity</div>
      </div>`;
  } catch { /* keep fallback HTML */ }
}

function wxIcon(code) {
  code = parseInt(code);
  if (code === 113) return '☀️';
  if (code === 116) return '⛅';
  if (code === 119 || code === 122) return '☁️';
  if (code >= 176 && code <= 263) return '🌦️';
  if (code >= 296 && code <= 321) return '🌧️';
  if (code >= 386) return '⛈️';
  return '🌤️';
}


// ══════════════════════════════════════════════════════════════
//  NEWS  (rss2json — no API key)
// ══════════════════════════════════════════════════════════════

const RSS_SOURCES = {
  tz:   { url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml',  label: 'BBC Africa'   },
  tech: { url: 'https://techcrunch.com/feed/',                          label: 'TechCrunch'   },
  biz:  { url: 'https://www.theguardian.com/business/rss',              label: 'The Guardian' },
};

const TAG_CLASS = { tz: 'tag-tz', biz: 'tag-biz', tech: 'tag-tech' };
const TAG_LABEL = { tz: 'TZ',     biz: 'BIZ',     tech: 'TECH'     };

const FALLBACK_NEWS = [
  { tag:'tz',   h:'TRA announces updated EFD compliance requirements for Q3 2026',         t:'The Citizen' },
  { tag:'biz',  h:'Tanzania shilling stabilises at 2,640 against USD',                     t:'Bloomberg Africa' },
  { tag:'tech', h:'Anthropic releases Claude 4.6 with expanded agentic capabilities',      t:'TechCrunch' },
  { tag:'tz',   h:'Dar es Salaam port throughput hits record high in April 2026',          t:'Daily News' },
  { tag:'biz',  h:'East Africa manufacturing sector reports 8.2% growth in Q1 2026',      t:'Reuters Africa' },
];

let newsCache = {}; // keyed by feed type — value is array (success), null (failed), or undefined (not yet tried)
let currentNewsFeed = 'all';

// Fetch helper with abort timeout
function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(tid));
}

// ── Dashboard news preview (compact, mixed) ────────────────────
async function loadNews() {
  const feed = document.getElementById('news-feed');
  if (!feed) return;
  feed.innerHTML = '<div class="loading">FETCHING FEED...</div>';

  const items = [];
  for (const [key, src] of Object.entries(RSS_SOURCES)) {
    let fetched = false;

    // 1. Netlify Function (server-side — no CORS, no rate limit)
    try {
      const r = await fetchWithTimeout(`/.netlify/functions/news?feed=${key}`, 7000);
      if (r.ok) {
        const d = await r.json();
        if (d.items?.length) {
          d.items.slice(0, 2).forEach(it => items.push(it));
          fetched = true;
        }
      }
    } catch { /* fall through */ }

    // 2. rss2json fallback (client-side, rate-limited)
    if (!fetched) {
      try {
        const rssUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(src.url)}&count=2`;
        const d = await (await fetchWithTimeout(rssUrl, 5000)).json();
        if (d.status === 'ok' && d.items?.length) {
          d.items.forEach(it => items.push({
            tag: key, h: it.title,
            t: `${src.label} · ${timeAgo(new Date(it.pubDate))}`,
            u: it.link || '',
            d: (it.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
          }));
        }
      } catch { /* skip source */ }
    }
  }

  const result = items.length ? items.slice(0, 5) : FALLBACK_NEWS;
  const gsEl = document.getElementById('gs-news');
  if (gsEl) gsEl.textContent = result.length;

  feed.innerHTML = result.map(renderNewsItem).join('');
}

// ── Full news view (filterable) ────────────────────────────────
async function loadFullNews() {
  const container = document.getElementById('news-full');
  if (!container) return;
  container.innerHTML = '<div class="loading">FETCHING FEED...</div>';

  // Fetch all sources in parallel — each tries Netlify fn → rss2json
  const fetches = Object.entries(RSS_SOURCES).map(async ([key, src]) => {
    if (newsCache[key] !== undefined) return; // already fetched (array=success, null=failed)

    // 1. Netlify Function (server-side proxy — reliable, no CORS/rate limits)
    try {
      const r = await fetchWithTimeout(`/.netlify/functions/news?feed=${key}`, 8000);
      if (r.ok) {
        const d = await r.json();
        if (d.items?.length) { newsCache[key] = d.items; return; }
      }
    } catch { /* fall through */ }

    // 2. rss2json (client-side, free tier — rate-limited but worth trying)
    try {
      const rssUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(src.url)}&count=8`;
      const d = await (await fetchWithTimeout(rssUrl, 6000)).json();
      if (d.status === 'ok' && d.items?.length) {
        newsCache[key] = d.items.map(it => ({
          tag: key,
          h: it.title,
          t: `${src.label} · ${timeAgo(new Date(it.pubDate))}`,
          u: it.link || '',
          d: (it.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
        }));
        return;
      }
    } catch { /* fall through */ }

    // Both failed — mark null (falsy but defined, so retry only on explicit REFRESH)
    newsCache[key] = null;
  });
  await Promise.all(fetches);

  renderFullNews();
}

function renderFullNews() {
  const container = document.getElementById('news-full');
  if (!container) return;

  let items = [];
  if (currentNewsFeed === 'all') {
    Object.keys(RSS_SOURCES).forEach(k => { if (newsCache[k]) items.push(...newsCache[k]); });
  } else {
    items = newsCache[currentNewsFeed] || [];
  }

  if (items.length === 0) {
    // Live feeds offline — show curated fallback so the view is never empty
    const fallback = currentNewsFeed === 'all'
      ? FALLBACK_NEWS
      : FALLBACK_NEWS.filter(n => n.tag === currentNewsFeed);
    if (fallback.length) {
      container.innerHTML =
        '<div class="news-stale-note">// LIVE FEED UNAVAILABLE — SHOWING CURATED HEADLINES</div>' +
        fallback.map(renderNewsItem).join('');
      return;
    }
    container.innerHTML = '<div class="loading">NO ITEMS — PRESS REFRESH TO RETRY</div>';
    return;
  }
  container.innerHTML = items.map(renderNewsItem).join('');
}

function renderNewsItem(it) {
  const clickable = !!it.u;
  return `
    <div class="news-item${clickable ? ' news-clickable' : ''}"
         ${clickable ? `data-url="${esc(it.u)}" data-headline="${esc(it.h)}" data-meta="${esc(it.t)}" data-desc="${esc(it.d || '')}"` : ''}>
      <span class="news-tag ${TAG_CLASS[it.tag]}">${TAG_LABEL[it.tag]}</span>
      <div style="flex:1;min-width:0">
        <div class="news-headline">${esc(it.h)}</div>
        <div class="news-meta">${esc(it.t)}</div>
      </div>
      ${clickable ? '<div class="news-arrow">›</div>' : ''}
    </div>`;
}

// ── News tab switching (full view) ─────────────────────────────
document.querySelectorAll('.news-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    currentNewsFeed = btn.dataset.feed;
    document.querySelectorAll('.news-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // If no successful data at all yet, do a fresh load; otherwise just re-render
    const hasData = Object.values(newsCache).some(v => v && v.length > 0);
    if (!hasData && Object.keys(newsCache).length === 0) loadFullNews();
    else renderFullNews();
  });
});

document.getElementById('news-refresh-btn')?.addEventListener('click', () => {
  newsCache = {};
  loadFullNews();
});


// ══════════════════════════════════════════════════════════════
//  ARTICLE SUMMARY MODAL
// ══════════════════════════════════════════════════════════════

const modalOverlay  = document.getElementById('article-modal-overlay');
const modalBadge    = document.getElementById('modal-badge');
const modalSource   = document.getElementById('modal-source');
const modalHeadline = document.getElementById('modal-headline');
const modalBody     = document.getElementById('modal-body');
const modalLink     = document.getElementById('modal-link');

function openArticleModal(url, headline, meta, rssDesc) {
  // Reset
  modalBadge.textContent = 'AI SUMMARY';
  modalBadge.className   = 'article-modal-badge';
  modalSource.textContent = meta || '';
  modalHeadline.textContent = headline;
  modalBody.innerHTML = `<div class="modal-loading"><span class="modal-spinner"></span>ANALYZING ARTICLE...</div>`;
  modalLink.href = url;
  modalLink.classList.remove('hidden');
  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Fetch summary
  fetchWithTimeout(`/.netlify/functions/summarize?url=${encodeURIComponent(url)}`, 18000)
    .then(r => r.json())
    .then(data => {
      if (data.summary) {
        // Full AI summary
        modalBody.innerHTML = data.summary
          .split(/\n+/).filter(Boolean)
          .map(p => `<p>${esc(p)}</p>`).join('');
      } else if (data.error === 'api_key_missing') {
        // No API key — show RSS snippet + setup instructions
        modalBadge.textContent = 'ARTICLE PREVIEW';
        modalBadge.className   = 'article-modal-badge badge-preview';
        modalBody.innerHTML = (rssDesc
          ? `<p>${esc(rssDesc)}</p>`
          : '<p>No preview available.</p>') +
          `<div class="modal-setup-note">
            ⚙ <strong>AI summaries</strong> require an Anthropic API key.<br>
            Add <code>ANTHROPIC_API_KEY</code> to your
            <a href="https://app.netlify.com" target="_blank" rel="noopener">Netlify environment variables</a>
            to enable this feature.
          </div>`;
      } else {
        // Fetch failed — show RSS snippet gracefully
        modalBadge.textContent = 'ARTICLE PREVIEW';
        modalBadge.className   = 'article-modal-badge badge-preview';
        modalBody.innerHTML = rssDesc
          ? `<p>${esc(rssDesc)}</p>`
          : '<p>Summary unavailable. Open the full article to read more.</p>';
      }
    })
    .catch(() => {
      modalBadge.textContent = 'ARTICLE PREVIEW';
      modalBadge.className   = 'article-modal-badge badge-preview';
      modalBody.innerHTML = rssDesc
        ? `<p>${esc(rssDesc)}</p>`
        : '<p>Summary unavailable. Open the full article to read more.</p>';
    });
}

function closeArticleModal() {
  modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
}

// Close handlers
document.getElementById('article-modal-close')?.addEventListener('click', closeArticleModal);
modalOverlay?.addEventListener('click', e => {
  if (e.target === modalOverlay) closeArticleModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalOverlay?.classList.contains('open')) closeArticleModal();
});

// News item click delegation (covers dashboard + full news view)
document.addEventListener('click', e => {
  const item = e.target.closest('.news-item[data-url]');
  if (!item) return;
  const url  = item.dataset.url;
  const h    = item.dataset.headline;
  const meta = item.dataset.meta;
  const desc = item.dataset.desc;
  if (url) openArticleModal(url, h, meta, desc);
});


// ══════════════════════════════════════════════════════════════
//  PWA — INSTALL PROMPT
// ══════════════════════════════════════════════════════════════

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  // Small delay so it doesn't flash immediately on load
  setTimeout(() => {
    document.getElementById('install-banner')?.classList.add('visible');
  }, 3000);
});

document.getElementById('install-btn')?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('install-banner')?.classList.remove('visible');
});

document.getElementById('install-dismiss')?.addEventListener('click', () => {
  document.getElementById('install-banner')?.classList.remove('visible');
  // Don't re-show this session
  deferredInstallPrompt = null;
});

window.addEventListener('appinstalled', () => {
  document.getElementById('install-banner')?.classList.remove('visible');
  deferredInstallPrompt = null;
  showCmdResponse('✓ JARVIS INSTALLED');
});

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}


// ══════════════════════════════════════════════════════════════
//  COMMAND BAR
// ══════════════════════════════════════════════════════════════

const HELP_TEXT = 'go · task [text] at [time] · event [text] at [time] · weather · clear · help';

const CMDS = [
  // ── Navigation ───────────────────────────────────────────────
  { re: /^(go\s+)?(home|dashboard)$/i,
    run: ()  => { navigate('dashboard'); return '→ DASHBOARD'; } },
  { re: /^(go\s+)?(tasks?|reminders?)$/i,
    run: ()  => { navigate('reminders'); return '→ TASKS'; } },
  { re: /^(go\s+)?(cal(endar)?)$/i,
    run: ()  => { navigate('calendar');  return '→ CALENDAR'; } },
  { re: /^(go\s+)?(news|feed)$/i,
    run: ()  => { navigate('news');      return '→ NEWS FEED'; } },
  { re: /^(go\s+)?(inbox|mail|email)$/i,
    run: ()  => { navigate('inbox');     return '→ INBOX'; } },

  // ── Task: "task Buy milk" / "task Buy milk at 14:00" ─────────
  { re: /^(?:add\s+)?task\s+(.+?)(?:\s+at\s+(\d{1,2}:\d{2}))?$/i,
    run: (m) => {
      addTask(m[1].trim(), m[2] || '');
      return `✓ TASK ADDED${m[2] ? ' @ ' + m[2] : ''}`;
    }
  },

  // ── Event: "event Board meeting at 10:00" ────────────────────
  { re: /^(?:add\s+)?event\s+(.+?)(?:\s+at\s+(\d{1,2}:\d{2}))?$/i,
    run: (m) => {
      const t  = new Date();
      const ds = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
      selectedDate = ds;
      addEvent(m[1].trim(), m[2] || '');
      return `✓ EVENT ADDED${m[2] ? ' @ ' + m[2] : ''} — TODAY`;
    }
  },

  // ── Weather ───────────────────────────────────────────────────
  { re: /^weather$/i,
    run: () => { loadWeather(); return '↺ REFRESHING WEATHER...'; } },

  // ── Clear ─────────────────────────────────────────────────────
  { re: /^clear$/i,
    run: () => { hideCmdResponse(); return null; } },

  // ── Help ──────────────────────────────────────────────────────
  { re: /^(help|\?)$/i,
    run: () => HELP_TEXT },
];

function runCommand(raw) {
  const input = raw.trim();
  if (!input) return;
  for (const cmd of CMDS) {
    const m = input.match(cmd.re);
    if (m) {
      const msg = cmd.run(m);
      if (msg) showCmdResponse(msg, false);
      return;
    }
  }
  showCmdResponse('? UNKNOWN COMMAND — type help', true);
}

let cmdFadeTimer = null;
function showCmdResponse(msg, isErr = false) {
  const el = document.getElementById('cmd-response');
  if (!el) return;
  el.textContent = msg;
  el.className = 'cmd-response visible' + (isErr ? ' err' : '');
  clearTimeout(cmdFadeTimer);
  cmdFadeTimer = setTimeout(hideCmdResponse, 4000);
}
function hideCmdResponse() {
  const el = document.getElementById('cmd-response');
  if (el) el.className = 'cmd-response';
}

// Wire up
const cmdInput = document.getElementById('cmd-input');
cmdInput?.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const val = cmdInput.value.trim();
  cmdInput.value = '';
  runCommand(val);
});
// Focus command bar with keyboard shortcut (desktop: /)
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== cmdInput) {
    e.preventDefault();
    cmdInput?.focus();
  }
  if (e.key === 'Escape' && document.activeElement === cmdInput) {
    cmdInput?.blur();
    hideCmdResponse();
  }
});


// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
seedDefaultTasks();
seedDefaultEvents();
updateDashboardTasks();
updateBadges();
updateMeetingsStat();
loadWeather();
loadNews();
