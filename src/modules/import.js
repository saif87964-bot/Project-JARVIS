// ── JARVIS — src/modules/import.js ────────────────────────────
// Bank statement import (CSV / TSV / delimited text).
// Different banks export different layouts, so this is a mapping
// wizard: pick a file → preview rows → tell JARVIS which column is
// the date, description and amount(s) → import into an account.
// Duplicate rows (same day + amount + type + account) are skipped,
// so re-importing an overlapping statement is safe.
// Exports: setupImport()

import { storage }                     from '../core/storage.js';
import { bus }                         from '../core/bus.js';
import { esc }                         from '../utils.js';
import { addImportedTxs, getAccounts } from './cash.js';

let _rows    = [];   // parsed rows (arrays of cells)
let _headers = [];   // first row, used for column labels

// ── Public ─────────────────────────────────────────────────────

export function setupImport() {
  document.getElementById('stmt-file')?.addEventListener('change', _onFile);
  document.getElementById('stmt-wizard')?.addEventListener('click', e => {
    if (e.target.id === 'stmt-import-btn') _runImport();
    if (e.target.id === 'stmt-cancel-btn') _reset();
  });
  // Re-render preview when any mapping select changes
  document.getElementById('stmt-wizard')?.addEventListener('change', e => {
    if (e.target.id === 'stmt-amount-mode') _renderWizard(); // re-show right selects
  });
}

// ── File parsing ───────────────────────────────────────────────

function _onFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    _parseText(String(reader.result || ''));
    e.target.value = ''; // allow re-selecting the same file
  };
  reader.readAsText(file);
}

function _parseText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) { _msg('FILE LOOKS EMPTY OR HAS NO DATA ROWS', true); return; }

  // Detect delimiter by which one splits the most consistently
  const delims = [',', ';', '\t', '|'];
  let best = ',', bestCount = 0;
  for (const d of delims) {
    const count = _splitCsvLine(lines[0], d).length;
    if (count > bestCount) { bestCount = count; best = d; }
  }
  if (bestCount < 2) { _msg('COULD NOT DETECT COLUMNS — USE CSV EXPORT FROM YOUR BANK', true); return; }

  const parsed = lines.map(l => _splitCsvLine(l, best));
  _headers = parsed[0];
  _rows    = parsed.slice(1).filter(r => r.length >= 2);
  _renderWizard();
}

// Minimal CSV splitter that respects "quoted, fields"
function _splitCsvLine(line, delim) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === delim && !inQ) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// ── Wizard UI ──────────────────────────────────────────────────

function _renderWizard() {
  const wiz = document.getElementById('stmt-wizard');
  if (!wiz || _rows.length === 0) return;

  const prevMode = document.getElementById('stmt-amount-mode')?.value || 'single';
  const keep = id => document.getElementById(id)?.value;
  const saved = {
    date: keep('stmt-col-date'), desc: keep('stmt-col-desc'),
    amt:  keep('stmt-col-amt'),  deb:  keep('stmt-col-debit'),
    cred: keep('stmt-col-credit'), acc: keep('stmt-acc'),
  };

  const colOpts = sel => _headers.map((h, i) =>
    `<option value="${i}" ${String(i) === sel ? 'selected' : ''}>${esc(h || 'COL ' + (i + 1))}</option>`
  ).join('');

  const accOpts = getAccounts().map(a =>
    `<option value="${esc(a.id)}" ${a.id === saved.acc ? 'selected' : ''}>${esc(a.label)}</option>`
  ).join('');

  const guess = _guessColumns();

  wiz.innerHTML = `
    <div class="stmt-map-grid">
      <label class="stmt-map-cell">
        <span class="stmt-map-lbl">DATE COLUMN</span>
        <select class="conv-select" id="stmt-col-date">${colOpts(saved.date ?? String(guess.date))}</select>
      </label>
      <label class="stmt-map-cell">
        <span class="stmt-map-lbl">DESCRIPTION</span>
        <select class="conv-select" id="stmt-col-desc">${colOpts(saved.desc ?? String(guess.desc))}</select>
      </label>
      <label class="stmt-map-cell">
        <span class="stmt-map-lbl">AMOUNT LAYOUT</span>
        <select class="conv-select" id="stmt-amount-mode">
          <option value="single" ${prevMode === 'single' ? 'selected' : ''}>ONE SIGNED COLUMN</option>
          <option value="split"  ${prevMode === 'split'  ? 'selected' : ''}>DEBIT + CREDIT COLUMNS</option>
        </select>
      </label>
      ${prevMode === 'single' ? `
        <label class="stmt-map-cell">
          <span class="stmt-map-lbl">AMOUNT COLUMN</span>
          <select class="conv-select" id="stmt-col-amt">${colOpts(saved.amt ?? String(guess.amount))}</select>
        </label>` : `
        <label class="stmt-map-cell">
          <span class="stmt-map-lbl">DEBIT (MONEY OUT)</span>
          <select class="conv-select" id="stmt-col-debit">${colOpts(saved.deb ?? String(guess.amount))}</select>
        </label>
        <label class="stmt-map-cell">
          <span class="stmt-map-lbl">CREDIT (MONEY IN)</span>
          <select class="conv-select" id="stmt-col-credit">${colOpts(saved.cred ?? String(Math.min(guess.amount + 1, _headers.length - 1)))}</select>
        </label>`}
      <label class="stmt-map-cell">
        <span class="stmt-map-lbl">INTO ACCOUNT</span>
        <select class="conv-select" id="stmt-acc">${accOpts}</select>
      </label>
    </div>

    <div class="stmt-preview-wrap">
      <table class="stmt-preview">
        <thead><tr>${_headers.map(h => `<th>${esc(h || '—')}</th>`).join('')}</tr></thead>
        <tbody>
          ${_rows.slice(0, 4).map(r =>
            `<tr>${_headers.map((_, i) => `<td>${esc(r[i] || '')}</td>`).join('')}</tr>`
          ).join('')}
        </tbody>
      </table>
    </div>
    <div class="stmt-row-count">${_rows.length} DATA ROWS DETECTED</div>

    <div class="stmt-actions">
      <button class="task-add-btn" id="stmt-import-btn">IMPORT ${_rows.length} ROWS</button>
      <button class="cash-cat-cancel-btn" id="stmt-cancel-btn">CANCEL</button>
    </div>
    <div class="sync-msg" id="stmt-msg"></div>
  `;
  wiz.classList.add('open');
}

// Heuristics: first column whose values parse as dates → date;
// longest average text → description; numeric-looking → amount.
function _guessColumns() {
  const n = Math.min(_rows.length, 5);
  let date = 0, desc = 1, amount = _headers.length - 1;
  let bestTextLen = 0;

  for (let c = 0; c < _headers.length; c++) {
    let dates = 0, nums = 0, textLen = 0;
    for (let r = 0; r < n; r++) {
      const v = _rows[r][c] || '';
      if (_parseDate(v)) dates++;
      if (_parseAmount(v) !== null) nums++;
      textLen += v.length;
    }
    const h = (_headers[c] || '').toLowerCase();
    if (dates >= n - 1 || /date|tarehe/.test(h)) date = c;
    else if (nums >= n - 1 || /amount|debit|credit|kiasi/.test(h)) amount = c;
    else if (textLen > bestTextLen) { bestTextLen = textLen; desc = c; }
  }
  return { date, desc, amount };
}

// ── Import ─────────────────────────────────────────────────────

function _runImport() {
  const val  = id => parseInt(document.getElementById(id)?.value, 10);
  const mode = document.getElementById('stmt-amount-mode')?.value || 'single';
  const cDate = val('stmt-col-date'), cDesc = val('stmt-col-desc');
  const accId = document.getElementById('stmt-acc')?.value;
  if (isNaN(cDate) || !accId) { _msg('PICK THE DATE COLUMN AND ACCOUNT', true); return; }

  const out = [];
  let skipped = 0;

  for (const r of _rows) {
    const date = _parseDate(r[cDate]);
    if (!date) { skipped++; continue; }
    const note = isNaN(cDesc) ? '' : (r[cDesc] || '');

    let amount = null, type = 'debit';
    if (mode === 'single') {
      const v = _parseAmount(r[val('stmt-col-amt')]);
      if (v === null || v === 0) { skipped++; continue; }
      type   = v > 0 ? 'credit' : 'debit';
      amount = Math.abs(v);
    } else {
      const deb  = _parseAmount(r[val('stmt-col-debit')]);
      const cred = _parseAmount(r[val('stmt-col-credit')]);
      if (cred && Math.abs(cred) > 0)      { type = 'credit'; amount = Math.abs(cred); }
      else if (deb && Math.abs(deb) > 0)   { type = 'debit';  amount = Math.abs(deb);  }
      else { skipped++; continue; }
    }

    out.push({ date: date.toISOString(), amount: Math.round(amount), type,
               category: _guessCat(note), note });
  }

  if (out.length === 0) { _msg('NO VALID ROWS — CHECK COLUMN MAPPING', true); return; }

  const added = addImportedTxs(accId, out);
  const dupes = out.length - added;
  _msg(`IMPORTED ${added} TRANSACTIONS` +
       (dupes   > 0 ? ` · ${dupes} DUPLICATES SKIPPED`   : '') +
       (skipped > 0 ? ` · ${skipped} UNREADABLE SKIPPED` : ''), false);
  bus.emit('cmd:response', { msg: `✓ STATEMENT IMPORTED — ${added} NEW`, err: false });
  setTimeout(_reset, 4000);
}

// ── Parsers ────────────────────────────────────────────────────

// Handles: 2026-06-11 · 11/06/2026 · 11-06-26 · 11 Jun 2026 · 11.06.2026
function _parseDate(s) {
  if (!s) return null;
  const t = String(s).trim();

  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);            // YYYY-MM-DD
  if (m) return _mkDate(+m[1], +m[2], +m[3]);

  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);              // DD-MM-YYYY (TZ convention)
  if (m) {
    let y = +m[3]; if (y < 100) y += 2000;
    return _mkDate(y, +m[2], +m[1]);
  }

  m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})/);             // 11 Jun 2026
  if (m) {
    const mo = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
      .indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    if (mo > 0) { let y = +m[3]; if (y < 100) y += 2000; return _mkDate(y, mo, +m[1]); }
  }
  return null;
}

function _mkDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d, 12, 0, 0); // noon avoids TZ day-shift
  return isNaN(dt) ? null : dt;
}

// "1,470,000.00" · "(50,000)" → -50000 · "-30000" · "TZS 5,500"
function _parseAmount(s) {
  if (s === undefined || s === null) return null;
  let t = String(s).trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  t = t.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (!t || t === '-' || t === '.') return null;
  const v = parseFloat(t);
  if (isNaN(v)) return null;
  return neg ? -Math.abs(v) : v;
}

function _guessCat(note) {
  const n = (note || '').toLowerCase();
  const cats = storage.get('jv_cash_cats') || [];
  for (const c of cats) {
    if (n.includes(c.id) || n.includes(c.label.toLowerCase())) return c.id;
  }
  if (/fuel|petrol|diesel|total|puma|engen/.test(n))        return 'fuel';
  if (/restaurant|food|cafe|kfc|pizza/.test(n))             return 'food';
  if (/uber|bolt|taxi|fare|transport/.test(n))              return 'transport';
  if (/luku|dawasco|umeme|internet|airtime|vodacom|tigo|airtel|halotel|ttcl/.test(n)) return 'utilities';
  if (/salary|mshahara/.test(n))                            return 'business';
  return cats.find(c => c.id === 'misc') ? 'misc' : (cats[0]?.id || 'misc');
}

// ── Helpers ────────────────────────────────────────────────────

function _reset() {
  _rows = []; _headers = [];
  const wiz = document.getElementById('stmt-wizard');
  if (wiz) { wiz.classList.remove('open'); wiz.innerHTML = ''; }
}

function _msg(text, isErr) {
  const el = document.getElementById('stmt-msg');
  if (!el) { bus.emit('cmd:response', { msg: text, err: isErr }); return; }
  el.textContent = text;
  el.className = 'sync-msg visible ' + (isErr ? 'err' : 'ok');
}
