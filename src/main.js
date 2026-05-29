// ── JARVIS — src/main.js ──────────────────────────────────────
// Application entry point (ES module, deferred by the browser).
// Initialises all modules in dependency order, then wires
// route-change reactions via the event bus.

import { initRouter }               from './core/router.js';
import { initPwa }                  from './core/pwa.js';
import { bus }                      from './core/bus.js';

import { initClock }                from './modules/clock.js';
import { initTasks, renderTasks }   from './modules/tasks.js';
import { setupCalendar, initCalendar } from './modules/calendar.js';
import { setupCash, initCash }      from './modules/cash.js';
import { initNews, loadFullNews }   from './modules/news.js';
import { initWeather }              from './modules/weather.js';
import { initCommandBar }           from './modules/command.js';

// ── Route-change reactions ─────────────────────────────────────
// Modules don't know about the router; the bus decouples them.
bus.on('route:changed', ({ viewId }) => {
  if (viewId === 'reminders') renderTasks();
  if (viewId === 'news')      loadFullNews();
  if (viewId === 'calendar')  initCalendar();
  if (viewId === 'cash')      initCash();
});

// ── Boot sequence ─────────────────────────────────────────────
// Type="module" scripts are deferred — DOM is always ready here.
initClock();        // live clock & greeting
initTasks();        // seed, render dashboard tasks, badges, wire form + delegation
setupCalendar();    // seed, wire form + month nav + delete delegation
setupCash();        // wire type/cat buttons + form + delete delegation
initNews();         // wire tabs, modal, delegation; kick off dashboard fetch
initWeather();      // fire-and-forget weather fetch
initCommandBar();   // wire input, keyboard shortcut, bus subscription
initPwa();          // SW registration + install prompt
initRouter();       // LAST — wires nav delegation + restores hash (fires route hooks)
