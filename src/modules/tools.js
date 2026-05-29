// ── JARVIS — src/modules/tools.js ─────────────────────────────
// Tools view: Currency Tracker/Converter, VAT Calculator, Salary Calculator.
// Exports:
//   setupTools()   — one-time event wiring
//   onEnterTools() — called on navigate-to-tools (triggers rate fetch)

import { TZ_TAX, RATE_PAIRS, CURRENCIES } from '../config.js';
import { storage }                         from '../core/storage.js';
import { fmtTZS }                          from '../utils.js';

// Per-session currency rate cache
let _rates     = null; // { base:'USD', rates:{...}, time_last_update_utc }
let _activeTab = 'currency';

// ── Currency helpers ───────────────────────────────────────────
function _getRate(from, to) {
  if (!_rates) return null;
  const r = _rates.rates;
  if (from === to)   return 1;
  if (from === 'USD') return r[to];
  if (to   === 'USD') return 1 / r[from];
  return r[to] / r[from];
}

async function loadRates(force = false) {
  const el = document.getElementById('currency-rates');
  if (!el) return;

  // Use persisted cache (30-min TTL) unless forced
  if (!force) {
    const cached = storage.get('jv_fx_cache');
    if (cached && Date.now() - cached.fetchedAt < 30 * 60 * 1000) {
      _rates = cached;
      _renderRates(true);
      _updateConverter();
      return;
    }
  }

  el.innerHTML = '<div class="loading">FETCHING RATES...</div>';
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD');
    const d = await r.json();
    _rates = { ...d, fetchedAt: Date.now() };
    storage.set('jv_fx_cache', _rates);
    _renderRates(false);
    _updateConverter();
  } catch {
    const cached = storage.get('jv_fx_cache');
    if (cached) {
      _rates = cached;
      _renderRates(true);
      _updateConverter();
    } else {
      el.innerHTML = '<div class="loading">FETCH FAILED — CHECK CONNECTION</div>';
    }
  }
}

function _renderRates(fromCache = false) {
  const el = document.getElementById('currency-rates');
  if (!el || !_rates) return;

  el.innerHTML = RATE_PAIRS.map(p => {
    const rate = _getRate(p.from, 'TZS');
    if (rate === null) return '';
    return `
      <div class="fx-row">
        <span class="fx-pair">${p.label}</span>
        <span class="fx-rate">${rate.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
      </div>`;
  }).join('') +
  `<div class="fx-updated">${fromCache ? 'CACHED · ' : ''}UPDATED: ${
    _rates.time_last_update_utc
      ? new Date(_rates.time_last_update_utc).toLocaleString()
      : '—'
  }</div>`;
}

function _updateConverter() {
  const amtEl    = document.getElementById('conv-amount');
  const fromEl   = document.getElementById('conv-from');
  const toEl     = document.getElementById('conv-to');
  const resultEl = document.getElementById('conv-result');
  if (!amtEl || !fromEl || !toEl || !resultEl || !_rates) return;

  const amount = parseFloat(amtEl.value) || 0;
  if (!amount) { resultEl.textContent = '—'; return; }

  const rate = _getRate(fromEl.value, toEl.value);
  if (rate === null) { resultEl.textContent = '—'; return; }

  const result = amount * rate;
  resultEl.textContent = result.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// ── VAT Calculator ─────────────────────────────────────────────
function _calcVAT() {
  const amtEl    = document.getElementById('vat-amount');
  const modeEl   = document.querySelector('.vat-mode-btn.active');
  const resultEl = document.getElementById('vat-result');
  if (!amtEl || !resultEl) return;

  const amount = parseFloat(amtEl.value) || 0;
  const mode   = modeEl?.dataset.mode || 'exclusive';

  if (!amount) {
    resultEl.innerHTML = '<div class="loading">ENTER AN AMOUNT ABOVE</div>';
    return;
  }

  let net, vat, total;
  if (mode === 'exclusive') {
    // Amount is ex-VAT: add 18%
    net   = amount;
    vat   = amount * TZ_TAX.VAT_RATE;
    total = amount + vat;
  } else {
    // Amount is VAT-inclusive: extract 18%
    net   = amount / (1 + TZ_TAX.VAT_RATE);
    vat   = amount - net;
    total = amount;
  }

  resultEl.innerHTML = `
    <div class="calc-row"><span class="calc-lbl">NET AMOUNT</span><span class="calc-val">${fmtTZS(net)}</span></div>
    <div class="calc-row"><span class="calc-lbl">VAT (18%)</span><span class="calc-val orange">+ ${fmtTZS(vat)}</span></div>
    <div class="calc-row total"><span class="calc-lbl">TOTAL</span><span class="calc-val cyan">${fmtTZS(total)}</span></div>`;
}

// ── Salary Calculator ──────────────────────────────────────────
function _calcPAYE(taxable) {
  if (taxable <= 270000) return 0;
  for (const b of TZ_TAX.PAYE_BRACKETS) {
    if (taxable > b.min && taxable <= b.max) {
      return b.base + b.rate * (taxable - b.min);
    }
  }
  return 0;
}

function _calcSalary() {
  const grossEl  = document.getElementById('salary-gross');
  const resultEl = document.getElementById('salary-result');
  if (!grossEl || !resultEl) return;

  const gross = parseFloat(grossEl.value) || 0;
  if (!gross) {
    resultEl.innerHTML = '<div class="loading">ENTER GROSS SALARY ABOVE</div>';
    return;
  }

  const nssfEmp  = gross * TZ_TAX.NSSF_EMPLOYEE;
  const nssfEmpr = gross * TZ_TAX.NSSF_EMPLOYER;
  const taxable  = gross - nssfEmp;
  const paye     = _calcPAYE(taxable);
  const net      = gross - nssfEmp - paye;
  const sdl      = gross * TZ_TAX.SDL_RATE;
  const wcf      = gross * TZ_TAX.WCF_RATE;
  const totalCost = gross + nssfEmpr + sdl + wcf;

  resultEl.innerHTML = `
    <div class="salary-block">
      <div class="salary-block-label">EMPLOYEE — TAKE HOME</div>
      <div class="calc-row"><span class="calc-lbl">GROSS SALARY</span><span class="calc-val">${fmtTZS(gross)}</span></div>
      <div class="calc-row"><span class="calc-lbl">NSSF (10%)</span><span class="calc-val orange">− ${fmtTZS(nssfEmp)}</span></div>
      <div class="calc-row"><span class="calc-lbl">TAXABLE INCOME</span><span class="calc-val muted">${fmtTZS(taxable)}</span></div>
      <div class="calc-row"><span class="calc-lbl">PAYE</span><span class="calc-val orange">− ${fmtTZS(paye)}</span></div>
      <div class="calc-row total"><span class="calc-lbl">NET PAY</span><span class="calc-val cyan">${fmtTZS(net)}</span></div>
    </div>
    <div class="salary-block">
      <div class="salary-block-label">EMPLOYER — TOTAL COST</div>
      <div class="calc-row"><span class="calc-lbl">NSSF CONTRIBUTION (10%)</span><span class="calc-val orange">+ ${fmtTZS(nssfEmpr)}</span></div>
      <div class="calc-row"><span class="calc-lbl">SDL (4.5%)</span><span class="calc-val orange">+ ${fmtTZS(sdl)}</span></div>
      <div class="calc-row"><span class="calc-lbl">WCF (0.5%)</span><span class="calc-val orange">+ ${fmtTZS(wcf)}</span></div>
      <div class="calc-row total"><span class="calc-lbl">TOTAL EMPLOYER COST</span><span class="calc-val orange">${fmtTZS(totalCost)}</span></div>
    </div>`;
}

// ── Tab switching ──────────────────────────────────────────────
function _switchTab(tab) {
  _activeTab = tab;
  document.querySelectorAll('.tools-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  document.querySelectorAll('.tools-panel').forEach(p =>
    p.classList.toggle('active', p.id === 'tools-' + tab)
  );
}

// ── Init (call once at startup) ────────────────────────────────
export function setupTools() {
  // Tab buttons
  document.querySelectorAll('.tools-tab').forEach(btn => {
    btn.addEventListener('click', () => _switchTab(btn.dataset.tab));
  });

  // Currency refresh
  document.getElementById('currency-refresh')?.addEventListener('click', () => loadRates(true));

  // Converter inputs
  ['conv-amount', 'conv-from', 'conv-to'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', _updateConverter);
    document.getElementById(id)?.addEventListener('change', _updateConverter);
  });

  // VAT toggle + input
  document.querySelectorAll('.vat-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.vat-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _calcVAT();
    });
  });
  document.getElementById('vat-amount')?.addEventListener('input', _calcVAT);

  // Salary input
  document.getElementById('salary-gross')?.addEventListener('input', _calcSalary);
}

// ── onEnterTools — called on navigate-to-tools ─────────────────
export function onEnterTools() {
  loadRates();
}
