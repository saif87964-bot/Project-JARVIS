// ── JARVIS — src/modules/command.js ──────────────────────────
// Command bar: parses text commands, triggers module actions.
// Keyboard shortcut: "/" focuses the bar; Escape blurs it.
// Subscribes to 'cmd:response' bus events so other modules
// (cash, pwa) can display messages without importing this file.

import { navigate }     from '../core/router.js';
import { bus }          from '../core/bus.js';
import { addTask }      from './tasks.js';
import { addEvent }     from './calendar.js';
import { loadWeather }  from './weather.js';
import { toDateStr }    from '../utils.js';

const HELP_TEXT = 'go · task [text] at [time] · event [text] at [time] · weather · clear · help';

const CMDS = [
  // ── Navigation ────────────────────────────────────────────────
  { re: /^(go\s+)?(home|dashboard)$/i,
    run: ()  => { navigate('dashboard'); return '→ DASHBOARD';  } },
  { re: /^(go\s+)?(tasks?|reminders?)$/i,
    run: ()  => { navigate('reminders'); return '→ TASKS';      } },
  { re: /^(go\s+)?(cal(endar)?)$/i,
    run: ()  => { navigate('calendar');  return '→ CALENDAR';   } },
  { re: /^(go\s+)?(news|feed)$/i,
    run: ()  => { navigate('news');      return '→ NEWS FEED';  } },
  { re: /^(go\s+)?(inbox|mail|email)$/i,
    run: ()  => { navigate('inbox');     return '→ INBOX';      } },

  // ── Task: "task Buy milk" / "task Buy milk at 14:00" ──────────
  { re: /^(?:add\s+)?task\s+(.+?)(?:\s+at\s+(\d{1,2}:\d{2}))?$/i,
    run: m  => {
      addTask(m[1].trim(), m[2] || '');
      return `✓ TASK ADDED${m[2] ? ' @ ' + m[2] : ''}`;
    }
  },

  // ── Event: "event Board meeting at 10:00" ─────────────────────
  { re: /^(?:add\s+)?event\s+(.+?)(?:\s+at\s+(\d{1,2}:\d{2}))?$/i,
    run: m  => {
      addEvent(m[1].trim(), m[2] || '', toDateStr(new Date()));
      return `✓ EVENT ADDED${m[2] ? ' @ ' + m[2] : ''} — TODAY`;
    }
  },

  // ── Weather ────────────────────────────────────────────────────
  { re: /^weather$/i,
    run: ()  => { loadWeather(); return '↺ REFRESHING WEATHER...'; } },

  // ── Clear ──────────────────────────────────────────────────────
  { re: /^clear$/i,
    run: ()  => { _hideCmdResponse(); return null; } },

  // ── Help ───────────────────────────────────────────────────────
  { re: /^(help|\?)$/i,
    run: ()  => HELP_TEXT },
];

let _fadeTimer = null;

function _showCmdResponse(msg, isErr = false) {
  const el = document.getElementById('cmd-response');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'cmd-response visible' + (isErr ? ' err' : '');
  clearTimeout(_fadeTimer);
  _fadeTimer = setTimeout(_hideCmdResponse, 4000);
}

function _hideCmdResponse() {
  const el = document.getElementById('cmd-response');
  if (el) el.className = 'cmd-response';
}

function _runCommand(raw) {
  const input = raw.trim();
  if (!input) return;
  for (const cmd of CMDS) {
    const m = input.match(cmd.re);
    if (m) {
      const msg = cmd.run(m);
      if (msg !== null && msg !== undefined) _showCmdResponse(msg, false);
      return;
    }
  }
  _showCmdResponse('? UNKNOWN COMMAND — type help', true);
}

export function initCommandBar() {
  // Listen for cross-module messages (cash, pwa, etc.)
  bus.on('cmd:response', ({ msg, err }) => _showCmdResponse(msg, !!err));

  const cmdInput = document.getElementById('cmd-input');

  // Enter to run command
  cmdInput?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const val = cmdInput.value.trim();
    cmdInput.value = '';
    _runCommand(val);
  });

  // "/" shortcut focuses bar; Escape blurs it
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== cmdInput) {
      e.preventDefault();
      cmdInput?.focus();
    }
    if (e.key === 'Escape' && document.activeElement === cmdInput) {
      cmdInput?.blur();
      _hideCmdResponse();
    }
  });
}
