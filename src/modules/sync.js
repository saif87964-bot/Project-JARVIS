// ── JARVIS — src/modules/sync.js ──────────────────────────────
// Cloud backup & restore via JSONBin.io (free tier).
// Setup:
//   1. Create a free account at jsonbin.io
//   2. Copy your Master Key from the dashboard
//   3. Open JARVIS Settings → Cloud Sync, paste key, click SETUP
//   4. JARVIS creates a private bin and starts auto-syncing every 10 min
//
// Exports:
//   initSync()          — start periodic sync, render status
//   setupSyncSettings() — wire settings DOM controls
//   syncToCloud(manual) — backup now (also called automatically)

import { storage } from '../core/storage.js';
import { bus }     from '../core/bus.js';

const KEY_APIKEY = 'jv_sync_key';
const KEY_BIN    = 'jv_sync_bin';
const KEY_LAST   = 'jv_sync_last';
const BIN_API    = 'https://api.jsonbin.io/v3/b';

// Excluded from backup: sync config itself + device-specific WebAuthn credential
const SKIP = new Set([KEY_APIKEY, KEY_BIN, KEY_LAST, 'jv_lock_cred_id']);

// ── Public ─────────────────────────────────────────────────────

export function initSync() {
  _renderStatus();

  // Trigger sync (debounced 8 s) on bus events from voice / other modules
  bus.on('sync:trigger', _debounced);

  // Periodic sync every 10 minutes if configured
  setInterval(() => {
    if (storage.get(KEY_APIKEY) && storage.get(KEY_BIN)) syncToCloud(false);
  }, 10 * 60 * 1000);
}

export function setupSyncSettings() {
  document.getElementById('sync-setup-btn')
    ?.addEventListener('click', _setupBin);
  document.getElementById('sync-backup-btn')
    ?.addEventListener('click', () => syncToCloud(true));
  document.getElementById('sync-restore-btn')
    ?.addEventListener('click', _confirmRestore);
  document.getElementById('sync-disconnect-btn')
    ?.addEventListener('click', _disconnect);
}

export async function syncToCloud(manual = false) {
  const key = storage.get(KEY_APIKEY);
  const bin = storage.get(KEY_BIN);
  if (!key || !bin) {
    if (manual) _msg('SYNC NOT CONFIGURED — ENTER API KEY BELOW', true);
    return;
  }

  if (manual) _msg('SYNCING…', false);

  try {
    const res = await fetch(`${BIN_API}/${bin}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Master-Key': key },
      body:    JSON.stringify(_payload()),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    storage.set(KEY_LAST, new Date().toISOString());
    _renderStatus();
    if (manual) _msg('BACKUP COMPLETE ✓', false);
  } catch (e) {
    if (manual) _msg('BACKUP FAILED: ' + (e.message || 'NETWORK ERROR'), true);
  }
}

// ── Setup ──────────────────────────────────────────────────────

async function _setupBin() {
  const input = document.getElementById('sync-apikey-input');
  const key   = input?.value?.trim();
  if (!key) { _msg('PASTE YOUR JSONBIN MASTER KEY FIRST', true); return; }

  _msg('CREATING BIN…', false);
  try {
    const res = await fetch(BIN_API, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-Master-Key':  key,
        'X-Bin-Name':    'JARVIS-Backup',
        'X-Bin-Private': 'true',
      },
      body: JSON.stringify({ _init: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data  = await res.json();
    const binId = data?.metadata?.id;
    if (!binId) throw new Error('NO BIN ID RETURNED — CHECK KEY');

    storage.set(KEY_APIKEY, key);
    storage.set(KEY_BIN, binId);
    if (input) input.value = '';
    _renderStatus();
    _msg('CONFIGURED ✓ — RUNNING FIRST BACKUP…', false);
    await syncToCloud(false);
    _msg('ALL DONE — DATA IS BACKED UP ✓', false);
  } catch (e) {
    _msg('SETUP FAILED: ' + (e.message || 'CHECK API KEY'), true);
  }
}

// ── Restore ────────────────────────────────────────────────────

async function _confirmRestore() {
  if (!confirm('Restore from cloud? This will OVERWRITE all local data and reload the app.')) return;

  const key = storage.get(KEY_APIKEY);
  const bin = storage.get(KEY_BIN);
  if (!key || !bin) { _msg('SYNC NOT CONFIGURED', true); return; }

  _msg('RESTORING…', false);
  try {
    const res = await fetch(`${BIN_API}/${bin}/latest`, {
      headers: { 'X-Master-Key': key },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data    = await res.json();
    const payload = data?.record;
    if (!payload || typeof payload !== 'object') throw new Error('INVALID BACKUP DATA');

    for (const [k, v] of Object.entries(payload)) {
      if (k.startsWith('jv_') && !SKIP.has(k)) {
        localStorage.setItem(k, JSON.stringify(v));
      }
    }
    _msg('RESTORED ✓ — RELOADING…', false);
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    _msg('RESTORE FAILED: ' + (e.message || 'NETWORK ERROR'), true);
  }
}

function _disconnect() {
  if (!confirm('Disconnect cloud sync? Your local data is kept.')) return;
  localStorage.removeItem(KEY_APIKEY);
  localStorage.removeItem(KEY_BIN);
  localStorage.removeItem(KEY_LAST);
  _renderStatus();
  _msg('SYNC DISCONNECTED', false);
}

// ── Debounce helper ────────────────────────────────────────────

let _dTimer = null;
function _debounced() {
  clearTimeout(_dTimer);
  _dTimer = setTimeout(() => syncToCloud(false), 8000);
}

// ── Collect localStorage payload ───────────────────────────────

function _payload() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith('jv_') && !SKIP.has(k)) {
      try        { out[k] = JSON.parse(localStorage.getItem(k)); }
      catch (_)  { out[k] = localStorage.getItem(k); }
    }
  }
  return out;
}

// ── Settings UI ────────────────────────────────────────────────

function _renderStatus() {
  const key  = storage.get(KEY_APIKEY);
  const bin  = storage.get(KEY_BIN);
  const last = storage.get(KEY_LAST);
  const isOn = !!(key && bin);

  const dot     = document.getElementById('sync-status-dot');
  const label   = document.getElementById('sync-status-label');
  const setupEl = document.getElementById('sync-setup-section');
  const mgmtEl  = document.getElementById('sync-mgmt-section');
  const lastEl  = document.getElementById('sync-last-time');

  if (dot)     dot.className     = 'sync-dot' + (isOn ? ' on' : '');
  if (label)   label.textContent = isOn ? 'CONNECTED' : 'NOT CONNECTED';
  if (setupEl) setupEl.classList.toggle('hidden', isOn);
  if (mgmtEl)  mgmtEl.classList.toggle('hidden', !isOn);
  if (lastEl)  lastEl.textContent = last
    ? 'LAST SYNC: ' + new Date(last).toLocaleString('en-GB', {
        day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit',
      }).toUpperCase()
    : 'NEVER SYNCED';
}

function _msg(text, isErr) {
  const el = document.getElementById('sync-msg');
  if (!el) return;
  el.textContent = text;
  el.className   = ['sync-msg',
    text ? 'visible' : '',
    text ? (isErr ? 'err' : 'ok') : '',
  ].filter(Boolean).join(' ');
  // Auto-clear success messages after 5 s
  if (text && !isErr && !text.endsWith('…')) {
    setTimeout(() => _msg('', false), 5000);
  }
}
