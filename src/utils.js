// ── JARVIS — src/utils.js ─────────────────────────────────────
// Pure utility functions — no side-effects, no DOM, no state.

/** HTML-escape a value for safe injection into innerHTML. */
export function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Human-friendly relative time label, e.g. "3 hr ago". */
export function timeAgo(date) {
  const mins = Math.floor((Date.now() - date) / 60000);
  if (isNaN(mins) || mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Format a number as "TZS 1,234,567". */
export function fmtTZS(n) {
  return 'TZS ' + Math.abs(Math.round(n)).toLocaleString('en-US');
}

/** fetch() wrapped with an AbortController timeout. */
export function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(tid));
}

/** Format a Date object as "YYYY-MM-DD". */
export function toDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
