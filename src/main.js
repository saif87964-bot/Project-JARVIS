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
import { setupTools, onEnterTools }   from './modules/tools.js';
import { initTheme }                  from './modules/theme.js';
import { initBriefing }               from './modules/briefing.js';
import { renderExpenseCharts }         from './modules/charts.js';
import { setupGCal, renderGCalStatus } from './modules/gcal.js';
import { initLock, setupLockSettings } from './modules/lock.js';
import { initVoice, setupVoiceSettings } from './modules/voice.js';
import { initSync, setupSyncSettings }   from './modules/sync.js';
import { setupWidgets, renderDashCash }  from './modules/widgets.js';
import { setupBudget, renderBudget }     from './modules/budget.js';
import { setupImport }                   from './modules/import.js';
import { initBoot }                      from './modules/boot.js';
import { setupDecisions, renderDecisions } from './modules/decisions.js';

// ── Route-change reactions ─────────────────────────────────────
// Modules don't know about the router; the bus decouples them.
bus.on('route:changed', ({ viewId }) => {
  if (viewId === 'dashboard') renderDashCash();
  if (viewId === 'reminders') renderTasks();
  if (viewId === 'news')      loadFullNews();
  if (viewId === 'calendar')  { initCalendar(); renderGCalStatus(); }
  if (viewId === 'cash')      { initCash(); renderExpenseCharts(); }
  if (viewId === 'budget')    renderBudget();
  if (viewId === 'decisions') renderDecisions();
  if (viewId === 'tools')     onEnterTools();
});

// ── Boot sequence ─────────────────────────────────────────────
// Type="module" scripts are deferred — DOM is always ready here.
initBoot();         // boot animation overlay (once per session, sits above lock)
initTheme();        // apply saved theme before first paint
initLock();         // show lock overlay immediately if enabled (must run early)
setupLockSettings();// wire settings-page lock controls
initClock();        // live clock & greeting
initTasks();        // seed, render dashboard tasks, badges, wire form + delegation
setupCalendar();    // seed, wire form + month nav + delete delegation
setupCash();        // wire type/cat buttons + form + delete delegation
setupTools();       // wire tools tab buttons, converter inputs, VAT/salary inputs
initNews();         // wire tabs, modal, delegation; kick off dashboard fetch
initWeather();      // fire-and-forget weather fetch
initCommandBar();   // wire input, keyboard shortcut, bus subscription
setupGCal();        // load GIS script, wire OAuth delegation
initVoice();        // wire mic button; hides itself if Web Speech API unavailable
setupVoiceSettings();// wire settings-page voice language buttons
initSync();         // render sync status, start periodic auto-backup
setupSyncSettings();// wire settings-page sync controls
setupWidgets();     // apply dashboard widget order/visibility, wire settings
setupBudget();      // wire budget view delegation + auto-save
setupDecisions();   // wire decisions add form + pro/con delegation
setupImport();      // wire statement-import file picker + wizard
initBriefing();     // auto-open daily briefing, wire close, listen for bus event
initPwa();          // SW registration + install prompt
initRouter();       // LAST — wires nav delegation + restores hash (fires route hooks)
