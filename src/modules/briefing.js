// ── JARVIS — src/modules/briefing.js ──────────────────────────
// Daily Briefing modal — auto-opens once per day on first visit.
// Also triggered via bus event 'briefing:open'.
// Exports: initBriefing()

import { storage }      from '../core/storage.js';
import { bus }          from '../core/bus.js';
import { STORAGE_KEYS } from '../config.js';
import { fmtTZS }       from '../utils.js';

const BRIEF_DATE_KEY = 'jv_brief_date';

export function initBriefing() {
  // Wire close button, dismiss button, + backdrop click
  document.getElementById('briefing-close')?.addEventListener('click', _closeBriefing);
  document.getElementById('briefing-close-btn')?.addEventListener('click', _closeBriefing);
  document.getElementById('briefing-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'briefing-overlay') _closeBriefing();
  });

  // Manual open via command or nav
  bus.on('briefing:open', _openBriefing);

  // Auto-open once per calendar day
  const today = new Date().toDateString();
  if (storage.get(BRIEF_DATE_KEY) !== today) {
    storage.set(BRIEF_DATE_KEY, today);
    setTimeout(_openBriefing, 1000);
  }
}

function _openBriefing() {
  const overlay = document.getElementById('briefing-overlay');
  if (!overlay) return;
  _renderBriefing();
  overlay.classList.add('active');
}

function _closeBriefing() {
  document.getElementById('briefing-overlay')?.classList.remove('active');
}

function _renderBriefing() {
  const el = document.getElementById('briefing-body');
  if (!el) return;

  const now     = new Date();
  const h       = now.getHours();
  const greet   = h < 12 ? 'GOOD MORNING' : h < 17 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
  const dateStr = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).toUpperCase();
  const todayKey = now.toISOString().split('T')[0]; // YYYY-MM-DD

  // ── Tasks ──────────────────────────────────────────────────────
  const tasks  = storage.get(STORAGE_KEYS.TASKS, []);
  const active = tasks.filter(t => !t.done);
  const urgent = active.filter(t => t.urgent);

  // ── Events (today) ────────────────────────────────────────────
  const allEvts   = storage.get(STORAGE_KEYS.EVENTS, []);
  const todayEvts = allEvts
    .filter(e => e.date === todayKey)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  // ── Cash ──────────────────────────────────────────────────────
  const cashData   = storage.get(STORAGE_KEYS.CASH, { balance: 0, transactions: [] });
  const txs        = cashData.transactions || [];
  const todayTxs   = txs.filter(tx => tx.date && tx.date.startsWith(todayKey));
  const todayIn    = todayTxs.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const todayOut   = todayTxs.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const balance    = cashData.balance || 0;

  el.innerHTML = `
    <div class="brief-greeting">${greet}, SAIF</div>
    <div class="brief-date">${dateStr}</div>

    <div class="brief-section">
      <div class="brief-section-title">▸ TASKS &amp; REMINDERS</div>
      ${active.length === 0
        ? '<div class="brief-empty">Nothing pending — inbox zero achieved.</div>'
        : [
            ...urgent.map(t => `<div class="brief-item urgent">⚑ ${t.text}${t.time ? ` <span class="brief-time">@ ${t.time}</span>` : ''}</div>`),
            ...active.filter(t => !t.urgent).slice(0, 5 - Math.min(urgent.length, 3)).map(t =>
              `<div class="brief-item">◎ ${t.text}${t.time ? ` <span class="brief-time">@ ${t.time}</span>` : ''}</div>`
            ),
            active.length > 5 ? `<div class="brief-more">+ ${active.length - 5} more tasks</div>` : '',
          ].join('')
      }
    </div>

    <div class="brief-section">
      <div class="brief-section-title">▸ TODAY'S SCHEDULE</div>
      ${todayEvts.length === 0
        ? '<div class="brief-empty">No events scheduled today.</div>'
        : todayEvts.map(e =>
            `<div class="brief-item">◷ ${e.title}${e.time ? ` <span class="brief-time">@ ${e.time}</span>` : ''}</div>`
          ).join('')
      }
    </div>

    <div class="brief-section">
      <div class="brief-section-title">▸ CASH POSITION</div>
      <div class="brief-cash-grid">
        <div class="brief-cash-cell">
          <div class="brief-cash-val">${fmtTZS(balance)}</div>
          <div class="brief-cash-lbl">CASH IN HAND</div>
        </div>
        <div class="brief-cash-cell">
          <div class="brief-cash-val green">+ ${fmtTZS(todayIn)}</div>
          <div class="brief-cash-lbl">TODAY IN</div>
        </div>
        <div class="brief-cash-cell">
          <div class="brief-cash-val orange">− ${fmtTZS(todayOut)}</div>
          <div class="brief-cash-lbl">TODAY OUT</div>
        </div>
      </div>
    </div>
  `;
}
