// ── JARVIS — src/modules/tasks.js ─────────────────────────────
// Reminders & tasks — CRUD, full-view rendering, dashboard preview,
// nav badges, filter tabs, add form.
//
// No inline onclick handlers — uses data-action delegation registered
// at the document level (covers both #task-list and #dashboard-tasks).

import { STORAGE_KEYS } from '../config.js';
import { storage }      from '../core/storage.js';
import { esc }          from '../utils.js';

let taskFilter = 'all';

// ── Storage ────────────────────────────────────────────────────
function getTasks() {
  return storage.get(STORAGE_KEYS.TASKS, []);
}
function saveTasks(tasks) {
  storage.set(STORAGE_KEYS.TASKS, tasks);
}

// ── Seed sample data on first run ─────────────────────────────
function seedDefaultTasks() {
  if (getTasks().length > 0) return;
  saveTasks([
    { id: 't1', text: 'VAT reconciliation March 2025 — submit to TRA', time: '09:00', urgent: true,  done: false, createdAt: Date.now() - 4000 },
    { id: 't2', text: 'Twigaz WIP drum recount — factory floor',        time: '11:00', urgent: false, done: false, createdAt: Date.now() - 3000 },
    { id: 't3', text: 'Review EASWIL cash flow projection',              time: '',      urgent: false, done: true,  createdAt: Date.now() - 2000 },
    { id: 't4', text: 'Kariakoo business licence renewal',               time: 'EOD',   urgent: false, done: false, createdAt: Date.now() - 1000 },
  ]);
}

// ── CRUD ───────────────────────────────────────────────────────
export function addTask(text, time = '') {
  const tasks = getTasks();
  tasks.unshift({
    id:        't' + Date.now(),
    text:      text.trim(),
    time:      time.trim(),
    urgent:    false,
    done:      false,
    createdAt: Date.now(),
  });
  saveTasks(tasks);
  _afterChange();
}

function toggleTask(id) {
  const tasks = getTasks();
  const t = tasks.find(t => t.id === id);
  if (t) t.done = !t.done;
  saveTasks(tasks);
  _afterChange();
}

function deleteTask(id) {
  saveTasks(getTasks().filter(t => t.id !== id));
  _afterChange();
}

function _afterChange() {
  renderTasks();
  updateDashboardTasks();
  updateBadges();
}

// ── Render: full task list (view-reminders) ────────────────────
export function renderTasks() {
  const tasks  = getTasks();
  const active = tasks.filter(t => !t.done).length;

  const counter = document.getElementById('task-counter');
  if (counter) counter.textContent = `${active} REMAINING`;

  const list = document.getElementById('task-list');
  if (!list) return;

  const filtered = tasks.filter(t => {
    if (taskFilter === 'active') return !t.done;
    if (taskFilter === 'done')   return  t.done;
    return true;
  });

  if (filtered.length === 0) {
    const msg = taskFilter === 'done'   ? 'NO COMPLETED TASKS' :
                taskFilter === 'active' ? 'ALL CAUGHT UP'       : 'NO TASKS YET';
    list.innerHTML = `<div class="loading">${msg}</div>`;
    return;
  }

  list.innerHTML = filtered.map(t => `
    <div class="task-item${t.done ? ' task-done' : ''}${t.urgent ? ' task-urgent' : ''}" data-id="${t.id}">
      <div class="task-check" data-action="toggle-task" data-id="${t.id}">${t.done ? '✓' : ''}</div>
      <div class="task-body">
        <div class="task-text">${esc(t.text)}</div>
      </div>
      ${t.time ? `<div class="task-time">${esc(t.time)}</div>` : ''}
      <div class="task-del" data-action="delete-task" data-id="${t.id}" title="Delete">×</div>
    </div>`).join('');
}

// ── Render: dashboard preview (top 4) ─────────────────────────
export function updateDashboardTasks() {
  const el = document.getElementById('dashboard-tasks');
  if (!el) return;

  const tasks   = getTasks();
  const active  = tasks.filter(t => !t.done);
  const preview = tasks.slice(0, 4);

  const gsEl = document.getElementById('gs-tasks');
  if (gsEl) gsEl.textContent = active.length;

  if (tasks.length === 0) {
    el.innerHTML = '<div class="loading">NO TASKS — ADD ONE ABOVE</div>';
    return;
  }

  el.innerHTML = preview.map(t => `
    <div class="task-item${t.done ? ' task-done' : ''}${t.urgent ? ' task-urgent' : ''}"
         data-action="toggle-task" data-id="${t.id}">
      <div class="task-check">${t.done ? '✓' : ''}</div>
      <div class="task-body">
        <div class="task-text">${esc(t.text)}</div>
      </div>
      ${t.time ? `<div class="task-time">${esc(t.time)}</div>` : ''}
    </div>`).join('') +
    (tasks.length > 4
      ? `<div class="task-more" data-view="reminders">+${tasks.length - 4} MORE →</div>`
      : '');
}

// ── Nav badges ─────────────────────────────────────────────────
export function updateBadges() {
  const active = getTasks().filter(t => !t.done).length;
  const val    = active > 0 ? active : '';
  const badge     = document.getElementById('badge-reminders');
  const bnavBadge = document.getElementById('bnav-badge-reminders');
  if (badge)     badge.textContent     = val;
  if (bnavBadge) bnavBadge.textContent = val;
}

// ── Init (call once at app startup) ────────────────────────────
export function initTasks() {
  seedDefaultTasks();
  updateDashboardTasks();
  updateBadges();

  // Filter tab buttons
  document.querySelectorAll('.task-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      taskFilter = btn.dataset.filter;
      document.querySelectorAll('.task-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderTasks();
    });
  });

  // Add-task form
  document.getElementById('task-add-btn')?.addEventListener('click', _submitTask);
  document.getElementById('task-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') _submitTask();
  });

  // Delegated actions — covers #task-list AND #dashboard-tasks without re-binding on render
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action="toggle-task"], [data-action="delete-task"]');
    if (!el) return;
    if (el.dataset.action === 'toggle-task') toggleTask(el.dataset.id);
    if (el.dataset.action === 'delete-task') deleteTask(el.dataset.id);
  });
}

function _submitTask() {
  const input     = document.getElementById('task-input');
  const timeInput = document.getElementById('task-time');
  const text      = input?.value.trim();
  if (!text) { input?.focus(); return; }
  addTask(text, timeInput?.value || '');
  input.value = '';
  if (timeInput) timeInput.value = '';
  input.focus();
}
