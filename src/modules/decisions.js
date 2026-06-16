// ── JARVIS — src/modules/decisions.js ─────────────────────────
// Pros & Cons decision tracker.
// Exports: setupDecisions(), renderDecisions()

import { storage } from '../core/storage.js';
import { esc }     from '../utils.js';

const KEY = 'jv_decisions';

function _load()         { return storage.get(KEY, []); }
function _save(list)     { storage.set(KEY, list); }
function _uid()          { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function _verdict(dec) {
  const p = dec.pros.length;
  const c = dec.cons.length;
  if (!p && !c) return null;
  if (p === c) return { cls: 'balanced', text: `${p} vs ${c} — Balanced ⚖` };
  if (p > c)   return { cls: 'for',      text: `${p} vs ${c} — Leaning For ✓` };
  return            { cls: 'against',  text: `${p} vs ${c} — Leaning Against ✗` };
}

function _decCard(dec) {
  const v = _verdict(dec);
  const verdictHtml = v
    ? `<div class="dec-verdict ${v.cls}">${esc(v.text)}</div>`
    : '';

  const prosHtml = dec.pros.map(p =>
    `<div class="dec-item">
      <span class="dec-item-text">${esc(p.text)}</span>
      <span class="dec-item-del" data-del-pro="${esc(dec.id)}" data-item-id="${esc(p.id)}" title="Remove">×</span>
    </div>`
  ).join('');

  const consHtml = dec.cons.map(c =>
    `<div class="dec-item">
      <span class="dec-item-text">${esc(c.text)}</span>
      <span class="dec-item-del" data-del-con="${esc(dec.id)}" data-item-id="${esc(c.id)}" title="Remove">×</span>
    </div>`
  ).join('');

  return `
  <div class="card dec-card" data-dec-id="${esc(dec.id)}">
    <div class="dec-card-head">
      <span class="dec-card-title">${esc(dec.title)}</span>
      <button class="btn-ghost-sm dec-del-btn" data-del-dec="${esc(dec.id)}" title="Delete decision">✕</button>
    </div>
    <div class="dec-split">
      <div class="dec-col">
        <div class="dec-col-head pros">▲ PROS</div>
        ${prosHtml}
        <div class="dec-add-row">
          <input class="dec-add-input" data-add-pro="${esc(dec.id)}" placeholder="Add a pro…" maxlength="200">
          <button class="btn-pill btn-sm dec-add-btn" data-add-pro-btn="${esc(dec.id)}">+</button>
        </div>
      </div>
      <div class="dec-col">
        <div class="dec-col-head cons">▼ CONS</div>
        ${consHtml}
        <div class="dec-add-row">
          <input class="dec-add-input" data-add-con="${esc(dec.id)}" placeholder="Add a con…" maxlength="200">
          <button class="btn-pill btn-sm dec-add-btn" data-add-con-btn="${esc(dec.id)}">+</button>
        </div>
      </div>
    </div>
    ${verdictHtml}
  </div>`;
}

export function renderDecisions() {
  const list = document.getElementById('dec-list');
  if (!list) return;
  const decisions = _load();
  if (!decisions.length) {
    list.innerHTML = `<div class="loading" style="padding:32px 0;text-align:center;color:var(--muted)">NO DECISIONS YET — ADD ONE ABOVE</div>`;
    return;
  }
  list.innerHTML = decisions.map(_decCard).join('');
}

function _addPro(decId, text) {
  const decisions = _load();
  const dec = decisions.find(d => d.id === decId);
  if (!dec || !text.trim()) return;
  dec.pros.push({ id: _uid(), text: text.trim() });
  _save(decisions);
  renderDecisions();
}

function _addCon(decId, text) {
  const decisions = _load();
  const dec = decisions.find(d => d.id === decId);
  if (!dec || !text.trim()) return;
  dec.cons.push({ id: _uid(), text: text.trim() });
  _save(decisions);
  renderDecisions();
}

function _deletePro(decId, itemId) {
  const decisions = _load();
  const dec = decisions.find(d => d.id === decId);
  if (!dec) return;
  dec.pros = dec.pros.filter(p => p.id !== itemId);
  _save(decisions);
  renderDecisions();
}

function _deleteCon(decId, itemId) {
  const decisions = _load();
  const dec = decisions.find(d => d.id === decId);
  if (!dec) return;
  dec.cons = dec.cons.filter(c => c.id !== itemId);
  _save(decisions);
  renderDecisions();
}

function _deleteDecision(decId) {
  const decisions = _load().filter(d => d.id !== decId);
  _save(decisions);
  renderDecisions();
}

export function setupDecisions() {
  // Add decision form toggle
  const addBtn    = document.getElementById('dec-add-btn');
  const addForm   = document.getElementById('dec-add-form');
  const saveBtn   = document.getElementById('dec-save-btn');
  const cancelBtn = document.getElementById('dec-cancel-btn');
  const titleInput = document.getElementById('dec-title-input');

  addBtn?.addEventListener('click', () => {
    addForm?.classList.remove('hidden');
    titleInput?.focus();
  });

  cancelBtn?.addEventListener('click', () => {
    addForm?.classList.add('hidden');
    if (titleInput) titleInput.value = '';
  });

  saveBtn?.addEventListener('click', _submitDecision);
  titleInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') _submitDecision();
  });

  function _submitDecision() {
    const text = titleInput?.value.trim();
    if (!text) return;
    const decisions = _load();
    decisions.unshift({ id: _uid(), title: text, created: Date.now(), pros: [], cons: [] });
    _save(decisions);
    titleInput.value = '';
    addForm?.classList.add('hidden');
    renderDecisions();
  }

  // Delegation on dec-list for pro/con add + delete
  const decList = document.getElementById('dec-list');
  decList?.addEventListener('click', e => {
    // Delete decision
    const delDec = e.target.closest('[data-del-dec]');
    if (delDec) { _deleteDecision(delDec.dataset.delDec); return; }

    // Delete pro
    const delPro = e.target.closest('[data-del-pro]');
    if (delPro) { _deletePro(delPro.dataset.delPro, delPro.dataset.itemId); return; }

    // Delete con
    const delCon = e.target.closest('[data-del-con]');
    if (delCon) { _deleteCon(delCon.dataset.delCon, delCon.dataset.itemId); return; }

    // Add pro button
    const addProBtn = e.target.closest('[data-add-pro-btn]');
    if (addProBtn) {
      const decId = addProBtn.dataset.addProBtn;
      const input = decList.querySelector(`[data-add-pro="${decId}"]`);
      if (input) { _addPro(decId, input.value); input.value = ''; }
      return;
    }

    // Add con button
    const addConBtn = e.target.closest('[data-add-con-btn]');
    if (addConBtn) {
      const decId = addConBtn.dataset.addConBtn;
      const input = decList.querySelector(`[data-add-con="${decId}"]`);
      if (input) { _addCon(decId, input.value); input.value = ''; }
      return;
    }
  });

  // Enter key in add-input fields
  decList?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const proInput = e.target.closest('[data-add-pro]');
    if (proInput) {
      _addPro(proInput.dataset.addPro, proInput.value);
      proInput.value = '';
      return;
    }
    const conInput = e.target.closest('[data-add-con]');
    if (conInput) {
      _addCon(conInput.dataset.addCon, conInput.value);
      conInput.value = '';
      return;
    }
  });
}
