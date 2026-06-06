// ── JARVIS — src/modules/voice.js ──────────────────────────────
// Voice command input via Web Speech API.
// Supported intents:
//   CASH:     "add 50000 fuel" / "spent 30000 on food" / "received 100k"
//   NAVIGATE: "open calendar" / "go to tasks"
//   TASK:     "add task buy groceries" / "remind me to call Ahmed"
// Exports:
//   initVoice() — wire mic button; hides itself if API unavailable

import { navigate }       from '../core/router.js';
import { bus }            from '../core/bus.js';
import { storage }        from '../core/storage.js';
import { addTask }        from './tasks.js';
import { addCashTxVoice } from './cash.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const VIEW_MAP = {
  home:        'dashboard', dashboard: 'dashboard',
  tasks:       'reminders', reminders: 'reminders',
  task:        'reminders', reminder:  'reminders',
  calendar:    'calendar',  schedule:  'calendar',
  news:        'news',      feed:      'news',
  cash:        'cash',      money:     'cash',
  finance:     'cash',      wallet:    'cash',
  tools:       'tools',     calculator:'tools',
  settings:    'settings',  setting:   'settings',
};

let recognition = null;
let _active     = false;

// ── Public ─────────────────────────────────────────────────────

export function initVoice() {
  const btn = document.getElementById('voice-btn');
  if (!btn) return;

  if (!SR) { btn.style.display = 'none'; return; }

  btn.style.display = 'inline-flex';
  btn.addEventListener('click', _toggle);
}

// ── Listening ──────────────────────────────────────────────────

function _toggle() {
  _active ? recognition?.stop() : _start();
}

function _start() {
  const btn = document.getElementById('voice-btn');
  recognition                  = new SR();
  recognition.lang             = 'en-US';
  recognition.interimResults   = false;
  recognition.maxAlternatives  = 1;
  recognition.continuous       = false;

  recognition.onstart = () => {
    _active = true;
    btn?.classList.add('listening');
    _respond('LISTENING…', false);
  };

  recognition.onresult = e => {
    const text = e.results[0][0].transcript.trim();
    _respond('HEARD: ' + text.toUpperCase(), false);
    _parseAndExecute(text);
  };

  recognition.onerror = e => {
    if (e.error === 'no-speech') { _respond('NO SPEECH DETECTED', true); return; }
    if (e.error !== 'aborted')   _respond('MIC ERROR: ' + e.error.toUpperCase(), true);
  };

  recognition.onend = () => {
    _active = false;
    btn?.classList.remove('listening');
  };

  recognition.start();
}

// ── Intent parser ──────────────────────────────────────────────

function _parseAndExecute(raw) {
  const t = raw.toLowerCase().trim();

  // ── NAVIGATE ──────────────────────────────────────────────
  const navM = t.match(/^(?:open|go(?:\s+to)?|show|switch\s+to|navigate\s+to)\s+(\w+)/);
  if (navM) {
    const viewId = VIEW_MAP[navM[1]];
    if (viewId) {
      navigate(viewId);
      _respond('→ OPENING ' + navM[1].toUpperCase(), false);
      return;
    }
  }

  // ── ADD TASK ──────────────────────────────────────────────
  const taskM = t.match(
    /^(?:add\s+(?:a\s+)?task|new\s+task|remind(?:er)?(?:\s+me)?(?:\s+to)?)\s+(.+)/
  );
  if (taskM) {
    const text = taskM[1].trim();
    addTask(text);
    _respond('✓ TASK: ' + text.toUpperCase(), false);
    bus.emit('sync:trigger');
    return;
  }

  // ── CASH ──────────────────────────────────────────────────
  const isCredit = /\b(received?|income|got|earned?|salary|credit|payment\s+in)\b/.test(t);
  const type     = isCredit ? 'credit' : 'debit';

  // Amount: digits optionally followed by k / m
  const amtM = t.match(/\b(\d[\d,]*(?:\.\d+)?\s*[km]?)\b/i);
  if (amtM) {
    const amount = _parseAmount(amtM[1]);
    if (amount && amount > 0) {
      // Description = everything after the number, filler words stripped
      const afterIdx = t.indexOf(amtM[0]) + amtM[0].length;
      const note = t.slice(afterIdx)
        .replace(/^\s*(?:for|on|from|to|as|in)\s+/i, '')
        .trim();

      const category = _guessCategory(note || t);
      addCashTxVoice(amount, type, category, note);

      const sign = isCredit ? '+' : '−';
      _respond(`${sign} TZS ${amount.toLocaleString()} — ${(note || category).toUpperCase()}`, false);
      bus.emit('sync:trigger');
      return;
    }
  }

  _respond('? COULD NOT UNDERSTAND — TRY AGAIN', true);
}

function _parseAmount(str) {
  const s = str.replace(/,/g, '').toLowerCase().trim();
  const m = s.match(/^([\d.]+)\s*m$/); if (m) return Math.round(parseFloat(m[1]) * 1_000_000);
  const k = s.match(/^([\d.]+)\s*k$/); if (k) return Math.round(parseFloat(k[1]) * 1_000);
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function _guessCategory(text) {
  const n    = text.toLowerCase();
  const cats = storage.get('jv_cash_cats') || [];

  // Try stored category id or label first
  for (const c of cats) {
    if (n.includes(c.id) || n.includes(c.label.toLowerCase())) return c.id;
  }

  // Keyword fallbacks — includes common Swahili terms
  if (/food|eat|lunch|dinner|breakfast|snack|restaurant|groceri|kuku|ugali|nyama|chips/.test(n))
    return 'food';
  if (/fuel|petrol|diesel|gas/.test(n))
    return 'fuel';
  if (/transport|taxi|uber|bolt|bus|daladala|boda|fare/.test(n))
    return 'transport';
  if (/util|electric|water|stima|maji|internet|wifi|airtime|data/.test(n))
    return 'utilities';
  if (/shop|buy|purchase|market|mall|duka|clothes/.test(n))
    return 'shopping';
  if (/business|client|invoice|office|meeting|contract/.test(n))
    return 'business';

  return cats[0]?.id || 'misc';
}

function _respond(msg, isErr) {
  bus.emit('cmd:response', { msg, err: isErr });
}
