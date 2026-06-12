// ── JARVIS — src/modules/voice.js ──────────────────────────────
// Voice command input via Web Speech API. English + Swahili.
// Supported intents (both languages):
//   CASH:     "add 50000 fuel" / "nimetumia elfu hamsini kwa chakula"
//   NAVIGATE: "open calendar"  / "fungua kalenda"
//   TASK:     "remind me to call Ahmed" / "nikumbushe kumpigia Ahmed"
// Exports:
//   initVoice()          — wire mic button; hides itself if API unavailable
//   setupVoiceSettings() — wire settings-page language buttons

import { navigate }       from '../core/router.js';
import { bus }            from '../core/bus.js';
import { storage }        from '../core/storage.js';
import { addTask }        from './tasks.js';
import { addCashTxVoice } from './cash.js';

const SR       = window.SpeechRecognition || window.webkitSpeechRecognition;
const LANG_KEY = 'jv_voice_lang';          // 'en-US' | 'sw-TZ'

const VIEW_MAP = {
  // English
  home:        'dashboard', dashboard: 'dashboard',
  tasks:       'reminders', reminders: 'reminders',
  task:        'reminders', reminder:  'reminders',
  calendar:    'calendar',  schedule:  'calendar',
  news:        'news',      feed:      'news',
  cash:        'cash',      money:     'cash',
  finance:     'cash',      wallet:    'cash',
  tools:       'tools',     calculator:'tools',
  settings:    'settings',  setting:   'settings',
  budget:      'budget',
  // Swahili
  nyumbani:    'dashboard', mwanzo:    'dashboard',
  kazi:        'reminders', orodha:    'reminders',
  kalenda:     'calendar',  ratiba:    'calendar',
  habari:      'news',      taarifa:   'news',
  pesa:        'cash',      fedha:     'cash',  hela: 'cash',
  zana:        'tools',     vifaa:     'tools',
  mipangilio:  'settings',  mpangilio: 'settings',
  bajeti:      'budget',
};

// Swahili number words
const SW_NUM = {
  moja: 1, mbili: 2, tatu: 3, nne: 4, tano: 5,
  sita: 6, saba: 7, nane: 8, tisa: 9, kumi: 10,
  ishirini: 20, thelathini: 30, arobaini: 40, hamsini: 50,
  sitini: 60, sabini: 70, themanini: 80, tisini: 90,
};
const SW_MULT = { mia: 100, elfu: 1000, laki: 100000, milioni: 1000000 };

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

export function setupVoiceSettings() {
  _renderLangButtons();
  document.getElementById('voice-lang-en')?.addEventListener('click', () => _setLang('en-US'));
  document.getElementById('voice-lang-sw')?.addEventListener('click', () => _setLang('sw-TZ'));
}

function _setLang(lang) {
  storage.set(LANG_KEY, lang);
  _renderLangButtons();
}

function _renderLangButtons() {
  const lang = storage.get(LANG_KEY, 'en-US');
  document.getElementById('voice-lang-en')?.classList.toggle('active', lang === 'en-US');
  document.getElementById('voice-lang-sw')?.classList.toggle('active', lang === 'sw-TZ');
}

// ── Listening ──────────────────────────────────────────────────

function _toggle() {
  _active ? recognition?.stop() : _start();
}

function _start() {
  const btn = document.getElementById('voice-btn');
  recognition                  = new SR();
  recognition.lang             = storage.get(LANG_KEY, 'en-US');
  recognition.interimResults   = false;
  recognition.maxAlternatives  = 1;
  recognition.continuous       = false;

  recognition.onstart = () => {
    _active = true;
    btn?.classList.add('listening');
    _respond(recognition.lang === 'sw-TZ' ? 'NASIKILIZA…' : 'LISTENING…', false);
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

// ── Intent parser (EN + SW) ────────────────────────────────────

function _parseAndExecute(raw) {
  const t = raw.toLowerCase().trim();

  // ── NAVIGATE ──────────────────────────────────────────────
  const navM = t.match(
    /^(?:open|go(?:\s+to)?|show|switch\s+to|navigate\s+to|fungua|nenda(?:\s+kwenye)?|onyesha|twende)\s+(\w+)/
  );
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
    /^(?:add\s+(?:a\s+)?task|new\s+task|remind(?:er)?(?:\s+me)?(?:\s+to)?|ongeza\s+kazi|kazi\s+mpya|nikumbushe(?:\s+ku)?|kumbusha)\s+(.+)/
  );
  if (taskM) {
    const text = taskM[1].trim();
    addTask(text);
    _respond('✓ TASK: ' + text.toUpperCase(), false);
    bus.emit('sync:trigger');
    return;
  }

  // ── CASH ──────────────────────────────────────────────────
  const isCredit =
    /\b(received?|income|got|earned?|salary|credit|payment\s+in)\b/.test(t) ||
    /\b(nimepokea|nimepata|pokea|nimelipwa|mapato|mshahara)\b/.test(t);
  const type = isCredit ? 'credit' : 'debit';

  const amt = _extractAmount(t);
  if (amt && amt.value > 0) {
    // Note = text minus the amount phrase, verbs and fillers
    const note = t
      .replace(amt.match, ' ')
      .replace(/\b(add|spent|spend|paid|pay|bought|buy|received?|got|earned?|expense|income|salary|credit|debit)\b/g, ' ')
      .replace(/\b(nimetumia|tumia|nimenunua|nunua|nimelipa|lipa|gharama|nimepokea|nimepata|pokea|nimelipwa|mapato|mshahara|shilingi|tzs)\b/g, ' ')
      .replace(/\b(for|on|from|to|as|in|of|kwa|ya|za|wa|kutoka|kwenye|na)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const category = _guessCategory(note || t);
    addCashTxVoice(amt.value, type, category, note);

    const sign = isCredit ? '+' : '−';
    _respond(`${sign} TZS ${amt.value.toLocaleString()} — ${(note || category).toUpperCase()}`, false);
    bus.emit('sync:trigger');
    return;
  }

  _respond('? COULD NOT UNDERSTAND — TRY AGAIN', true);
}

// ── Amount extraction ──────────────────────────────────────────
// Tries, in order:
//   1. Digits with optional k/m suffix:  "50000", "50k", "1.5m", "50,000"
//   2. Digits + Swahili multiplier:      "elfu 50", "50 elfu", "laki 2"
//   3. Swahili words:                    "elfu hamsini", "laki mbili",
//                                        "milioni moja na nusu", "elfu ishirini na tano"
// Returns { value, match } or null.

function _extractAmount(t) {
  // 1. Plain digits / k / m
  const digM = t.match(/\b(\d[\d,]*(?:\.\d+)?)\s*([km])?\b/i);

  // 2 + 3. Swahili multiplier constructs (multiplier before or after qty)
  const multNames = Object.keys(SW_MULT).join('|');
  const numNames  = Object.keys(SW_NUM).join('|');
  const qtyPart   = `(?:\\d[\\d,]*(?:\\.\\d+)?|(?:${numNames})(?:\\s+na\\s+(?:${numNames}|nusu))?)`;

  const swM =
    t.match(new RegExp(`\\b(${multNames})\\s+(${qtyPart})\\b`)) ||   // "elfu hamsini"
    t.match(new RegExp(`\\b(${qtyPart})\\s+(${multNames})\\b`));     // "hamsini elfu"

  if (swM) {
    const a = swM[1], b = swM[2];
    const mult = SW_MULT[a] ? SW_MULT[a] : SW_MULT[b];
    const qtyStr = SW_MULT[a] ? b : a;
    const qty = _swQty(qtyStr);
    if (mult && qty !== null) {
      return { value: Math.round(qty * mult), match: swM[0] };
    }
  }

  if (digM) {
    let v = parseFloat(digM[1].replace(/,/g, ''));
    if (isNaN(v)) return null;
    const suffix = (digM[2] || '').toLowerCase();
    if (suffix === 'k') v *= 1_000;
    if (suffix === 'm') v *= 1_000_000;
    return { value: Math.round(v), match: digM[0] };
  }

  return null;
}

// Parse a Swahili quantity: "hamsini", "ishirini na tano", "moja na nusu", "2.5"
function _swQty(str) {
  const s = str.trim();
  const asNum = parseFloat(s.replace(/,/g, ''));
  if (!isNaN(asNum)) return asNum;

  const parts = s.split(/\s+na\s+/);
  let total = 0;
  for (const p of parts) {
    if (p === 'nusu') { total += 0.5; continue; }
    if (SW_NUM[p] !== undefined) { total += SW_NUM[p]; continue; }
    return null;
  }
  return total || null;
}

// ── Category guesser (EN + SW keywords) ────────────────────────

function _guessCategory(text) {
  const n    = text.toLowerCase();
  const cats = storage.get('jv_cash_cats') || [];

  // Try stored category id or label first
  for (const c of cats) {
    if (n.includes(c.id) || n.includes(c.label.toLowerCase())) return c.id;
  }

  if (/food|eat|lunch|dinner|breakfast|snack|restaurant|groceri|chakula|kula|kuku|ugali|nyama|samaki|chips|wali|maharage/.test(n))
    return 'food';
  if (/fuel|petrol|diesel|gas|mafuta/.test(n))
    return 'fuel';
  if (/transport|taxi|uber|bolt|bus|daladala|boda|fare|nauli|usafiri|safari/.test(n))
    return 'transport';
  if (/util|electric|water|stima|umeme|maji|internet|wifi|airtime|data|vocha|luku/.test(n))
    return 'utilities';
  if (/shop|buy|purchase|market|mall|duka|soko|nguo|clothes|manunuzi/.test(n))
    return 'shopping';
  if (/business|client|invoice|office|meeting|contract|biashara|mteja|ofisi|mkataba|kikao/.test(n))
    return 'business';

  return cats.find(c => c.id === 'misc') ? 'misc' : (cats[0]?.id || 'misc');
}

function _respond(msg, isErr) {
  bus.emit('cmd:response', { msg, err: isErr });
}
