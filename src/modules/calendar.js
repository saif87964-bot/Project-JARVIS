// ── JARVIS — src/modules/calendar.js ─────────────────────────
// Monthly calendar grid, day-event panel, upcoming 7-day list.
// Exports:
//   setupCalendar()      — one-time wiring (seeds, event listeners)
//   initCalendar()       — called on every navigate-to-calendar
//   addEvent(title, time, dateStr) — used by command.js
//   updateMeetingsStat() — updates greeting-card meeting count

import { STORAGE_KEYS, DAYS, MONTHS }                         from '../config.js';
import { storage }                                            from '../core/storage.js';
import { bus }                                                from '../core/bus.js';
import { esc, toDateStr }                                     from '../utils.js';
import { getGCalEventsForDate, getAllGCalEvents, loadGCalMonth } from './gcal.js';

let calYear      = new Date().getFullYear();
let calMonth     = new Date().getMonth(); // 0-indexed
let selectedDate = null;
let calFormOpen  = false;

// ── Storage ────────────────────────────────────────────────────
function getEvents() {
  return storage.get(STORAGE_KEYS.EVENTS, []);
}
function saveEvents(evs) {
  storage.set(STORAGE_KEYS.EVENTS, evs);
}
function getEventsForDate(dateStr) {
  return getEvents().filter(e => e.date === dateStr);
}
// Merges local + Google Calendar events for a date
function getAllEventsForDate(dateStr) {
  return [...getEventsForDate(dateStr), ...getGCalEventsForDate(dateStr)];
}

// ── Seed sample events on first run ───────────────────────────
function seedDefaultEvents() {
  if (getEvents().length > 0) return;
  const today    = new Date();
  const tomorrow = new Date(today.getTime() + 86400000);
  const nextWeek = new Date(today.getTime() + 7 * 86400000);
  saveEvents([
    { id: 'ev1', title: 'TRA compliance review',     date: toDateStr(today),    time: '10:00', createdAt: Date.now() - 3 },
    { id: 'ev2', title: 'Twigaz factory inspection', date: toDateStr(tomorrow), time: '09:30', createdAt: Date.now() - 2 },
    { id: 'ev3', title: 'EASWIL board meeting',       date: toDateStr(nextWeek), time: '14:00', createdAt: Date.now() - 1 },
  ]);
}

// ── CRUD ───────────────────────────────────────────────────────
/**
 * Add an event.
 * @param {string} title   Event title
 * @param {string} time    Time string, e.g. "10:00" (optional)
 * @param {string} dateStr "YYYY-MM-DD" — defaults to currently selected date
 */
export function addEvent(title, time = '', dateStr = selectedDate) {
  if (!dateStr || !title.trim()) return;
  const evs = getEvents();
  evs.push({
    id:        'ev' + Date.now(),
    title:     title.trim(),
    date:      dateStr,
    time:      time.trim(),
    createdAt: Date.now(),
  });
  saveEvents(evs);
  _afterChange();
}

function deleteEvent(id) {
  saveEvents(getEvents().filter(e => e.id !== id));
  _afterChange();
}

function _afterChange() {
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

  const firstDow  = new Date(calYear, calMonth, 1).getDay();
  const offset    = (firstDow + 6) % 7; // shift to Mon-start
  const daysTotal = new Date(calYear, calMonth + 1, 0).getDate();
  const today     = new Date();
  const isCurMon  = today.getFullYear() === calYear && today.getMonth() === calMonth;

  let html = '';
  for (let i = 0; i < offset; i++) html += '<div class="cal-day cal-empty"></div>';

  for (let d = 1; d <= daysTotal; d++) {
    const dateStr  = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const evCount  = getAllEventsForDate(dateStr).length;
    const isToday    = isCurMon && d === today.getDate();
    const isSelected = dateStr === selectedDate;
    const cls  = ['cal-day', isToday ? 'cal-today' : '', isSelected ? 'cal-selected' : ''].filter(Boolean).join(' ');
    const dots = evCount > 0
      ? `<div class="cal-dots">${'<div class="cal-dot"></div>'.repeat(Math.min(evCount, 3))}</div>`
      : '';
    html += `<div class="${cls}" data-date="${dateStr}"><span class="cal-day-num">${d}</span>${dots}</div>`;
  }

  grid.innerHTML = html;

  // Day cell click — re-bind on every grid rebuild
  grid.querySelectorAll('.cal-day:not(.cal-empty)').forEach(cell => {
    cell.addEventListener('click', () => selectDay(cell.dataset.date));
  });
}

// ── Select a day ───────────────────────────────────────────────
function selectDay(dateStr) {
  selectedDate = dateStr;

  document.querySelectorAll('.cal-day').forEach(c =>
    c.classList.toggle('cal-selected', c.dataset.date === dateStr)
  );

  const d        = new Date(dateStr + 'T00:00:00');
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 86400000);
  const label    = d.getTime() === today.getTime()    ? 'TODAY' :
                   d.getTime() === tomorrow.getTime() ? 'TOMORROW' :
                   `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

  const titleEl = document.getElementById('cal-day-title');
  if (titleEl) titleEl.textContent = label;

  closeEventForm();
  renderDayEvents();
}

// ── Render: events for selected day ───────────────────────────
function renderDayEvents() {
  const container = document.getElementById('cal-day-events');
  if (!container) return;

  if (!selectedDate) {
    container.innerHTML = '<div class="loading">SELECT A DAY TO VIEW EVENTS</div>';
    return;
  }

  const evs = getAllEventsForDate(selectedDate)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  if (evs.length === 0) {
    container.innerHTML = '<div class="loading">NO EVENTS — CLICK + EVENT TO ADD</div>';
    return;
  }

  container.innerHTML = evs.map(e => `
    <div class="cal-event-item">
      ${e.source === 'google' ? '<span class="gcal-badge">G</span>' : ''}
      ${e.time ? `<div class="cal-event-time-badge">${esc(e.time)}</div>` : ''}
      <div class="cal-event-body">
        <div class="cal-event-title">${esc(e.title)}</div>
      </div>
      ${e.source !== 'google'
        ? `<div class="cal-event-del" data-action="delete-event" data-id="${e.id}">×</div>`
        : '<div class="cal-event-del" style="visibility:hidden">×</div>'
      }
    </div>`).join('');
}

// ── Render: upcoming 7 days ────────────────────────────────────
function renderUpcoming() {
  const container = document.getElementById('cal-upcoming');
  if (!container) return;

  const now     = new Date(); now.setHours(0, 0, 0, 0);
  const weekOut = new Date(now.getTime() + 7 * 86400000);

  const _inRange = e => { const d = new Date(e.date + 'T00:00:00'); return d >= now && d <= weekOut; };
  const evs = [...getEvents().filter(_inRange), ...getAllGCalEvents().filter(_inRange)]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));

  if (evs.length === 0) {
    container.innerHTML = '<div class="loading">NO UPCOMING EVENTS THIS WEEK</div>';
    return;
  }

  container.innerHTML = evs.map(e => {
    const d        = new Date(e.date + 'T00:00:00');
    const tomorrow = new Date(now.getTime() + 86400000);
    const badge    = d.getTime() === now.getTime()      ? 'TODAY' :
                     d.getTime() === tomorrow.getTime() ? 'TOMORROW' :
                     `${DAYS[d.getDay()]} ${d.getDate()}`;
    return `
      <div class="cal-event-item">
        ${e.source === 'google' ? '<span class="gcal-badge">G</span>' : ''}
        <div class="cal-event-date-badge">${badge}</div>
        ${e.time ? `<div class="cal-event-time-badge">${esc(e.time)}</div>` : ''}
        <div class="cal-event-body">
          <div class="cal-event-title">${esc(e.title)}</div>
        </div>
        ${e.source !== 'google'
          ? `<div class="cal-event-del" data-action="delete-event" data-id="${e.id}">×</div>`
          : '<div class="cal-event-del" style="visibility:hidden">×</div>'
        }
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
  if (form) form.classList.remove('open');
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

// ── Greeting stat: meetings today ─────────────────────────────
export function updateMeetingsStat() {
  const count = getEventsForDate(toDateStr(new Date())).length;
  const el = document.getElementById('gs-meetings');
  if (el) el.textContent = count;
}

// ── initCalendar — called on every navigate-to-calendar ───────
export function initCalendar() {
  calYear  = new Date().getFullYear();
  calMonth = new Date().getMonth();
  buildCalendar();
  renderUpcoming();
  selectDay(toDateStr(new Date())); // auto-select today
  loadGCalMonth(calYear, calMonth); // async — re-renders via bus when done
}

// ── setupCalendar — call once at app startup ──────────────────
export function setupCalendar() {
  seedDefaultEvents();
  updateMeetingsStat();

  // Re-render when Google Calendar events arrive or connection changes
  bus.on('gcal:loaded',       () => { buildCalendar(); renderUpcoming(); if (selectedDate) renderDayEvents(); });
  bus.on('gcal:connected',    () => loadGCalMonth(calYear, calMonth));
  bus.on('gcal:disconnected', () => { buildCalendar(); renderUpcoming(); if (selectedDate) renderDayEvents(); });


  document.getElementById('cal-add-btn')?.addEventListener('click', () => {
    if (!selectedDate) return;
    calFormOpen ? closeEventForm() : openEventForm();
  });

  document.getElementById('cal-event-submit')?.addEventListener('click', submitEvent);

  document.getElementById('cal-event-title')?.addEventListener('keydown', e => {
    if (e.key === 'Enter')  submitEvent();
    if (e.key === 'Escape') closeEventForm();
  });

  document.getElementById('cal-prev')?.addEventListener('click', () => {
    if (--calMonth < 0)  { calMonth = 11; calYear--; }
    buildCalendar();
  });

  document.getElementById('cal-next')?.addEventListener('click', () => {
    if (++calMonth > 11) { calMonth = 0;  calYear++; }
    buildCalendar();
  });

  // Delegated delete — covers both #cal-day-events and #cal-upcoming
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action="delete-event"]');
    if (!el) return;
    deleteEvent(el.dataset.id);
  });
}
