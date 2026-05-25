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

  // Update nav active state
  document.querySelectorAll('.nav-item[data-view]').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewId);
  });

  // Scroll center panel back to top
  document.querySelector('.center').scrollTop = 0;

  // View-specific on-enter actions
  if (viewId === 'reminders') renderTasks();
  if (viewId === 'news')      loadFullNews();

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
  const badge = document.getElementById('badge-reminders');
  if (badge) badge.textContent = active > 0 ? active : '';
}


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
  tz:   { url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml', label: 'BBC Africa' },
  tech: { url: 'https://techcrunch.com/feed/',                        label: 'TechCrunch' },
  biz:  { url: 'https://feeds.reuters.com/reuters/businessNews',      label: 'Reuters'    },
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

let newsCache = {}; // keyed by feed type
let currentNewsFeed = 'all';

// ── Dashboard news preview (compact, mixed) ────────────────────
async function loadNews() {
  const feed = document.getElementById('news-feed');
  if (!feed) return;
  feed.innerHTML = '<div class="loading">FETCHING FEED...</div>';

  const items = [];
  for (const [key, src] of Object.entries(RSS_SOURCES)) {
    try {
      const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(src.url)}&count=2`;
      const d = await (await fetch(url)).json();
      if (d.status === 'ok' && d.items?.length) {
        d.items.forEach(it => items.push({ tag: key, h: it.title, t: `${src.label} · ${timeAgo(new Date(it.pubDate))}` }));
      }
    } catch { /* skip source */ }
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

  // Fetch all sources in parallel
  const fetches = Object.entries(RSS_SOURCES).map(async ([key, src]) => {
    if (newsCache[key]) return;
    try {
      const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(src.url)}&count=8`;
      const d = await (await fetch(url)).json();
      if (d.status === 'ok' && d.items?.length) {
        newsCache[key] = d.items.map(it => ({
          tag: key, h: it.title, t: `${src.label} · ${timeAgo(new Date(it.pubDate))}`
        }));
      }
    } catch { newsCache[key] = []; }
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
    container.innerHTML = '<div class="loading">NO ITEMS — REFRESH TO RETRY</div>';
    return;
  }
  container.innerHTML = items.map(renderNewsItem).join('');
}

function renderNewsItem(it) {
  return `
    <div class="news-item">
      <span class="news-tag ${TAG_CLASS[it.tag]}">${TAG_LABEL[it.tag]}</span>
      <div>
        <div class="news-headline">${esc(it.h)}</div>
        <div class="news-meta">${esc(it.t)}</div>
      </div>
    </div>`;
}

// ── News tab switching (full view) ─────────────────────────────
document.querySelectorAll('.news-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    currentNewsFeed = btn.dataset.feed;
    document.querySelectorAll('.news-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (Object.keys(newsCache).length === 0) loadFullNews();
    else renderFullNews();
  });
});

document.getElementById('news-refresh-btn')?.addEventListener('click', () => {
  newsCache = {};
  loadFullNews();
});


// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
seedDefaultTasks();
updateDashboardTasks();
updateBadges();
loadWeather();
loadNews();
