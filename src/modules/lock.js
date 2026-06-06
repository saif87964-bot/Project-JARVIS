// ── JARVIS — src/modules/lock.js ──────────────────────────────
// App lock: WebAuthn biometric (fingerprint/Face ID) + PIN fallback.
// No server needed — the OS handles biometric verification.
// Exports:
//   initLock()          — call first at boot; shows lock screen if needed
//   setupLockSettings() — wire settings-page controls (call once)

import { storage } from '../core/storage.js';

const LOCK_KEY    = 'jv_lock_enabled';
const CRED_KEY    = 'jv_lock_cred_id';   // WebAuthn credential ID (array)
const PIN_KEY     = 'jv_lock_pin_hash';  // SHA-256 hash of PIN
const SESSION_KEY = 'jv_unlocked';       // sessionStorage — cleared on tab close

// ── Public ─────────────────────────────────────────────────────

export function initLock() {
  _renderSettings();

  const enabled = storage.get(LOCK_KEY);
  if (!enabled) return;                              // lock off
  if (sessionStorage.getItem(SESSION_KEY)) return;   // already unlocked this session

  _showLockScreen();
}

export function setupLockSettings() {
  document.getElementById('lock-toggle')
    ?.addEventListener('click', _toggleLock);

  document.getElementById('lock-register-bio')
    ?.addEventListener('click', _registerBiometric);

  document.getElementById('lock-set-pin-btn')
    ?.addEventListener('click', () => {
      document.getElementById('lock-pin-form')?.classList.toggle('open');
    });

  document.getElementById('lock-pin-form-cancel')
    ?.addEventListener('click', () => {
      document.getElementById('lock-pin-form')?.classList.remove('open');
      _clearPinForm();
    });

  document.getElementById('lock-pin-new')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') _savePin(); });
  document.getElementById('lock-pin-confirm')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') _savePin(); });
  document.getElementById('lock-pin-save')
    ?.addEventListener('click', _savePin);

  document.getElementById('lock-now-btn')
    ?.addEventListener('click', _lockNow);
}

// ── Lock screen ────────────────────────────────────────────────

function _showLockScreen() {
  const overlay = document.getElementById('lock-overlay');
  if (!overlay) return;
  overlay.classList.add('active');
  _updateLockButtons();

  // Wire once (use named functions so we can remove if needed)
  document.getElementById('lock-bio-btn')
    ?.addEventListener('click', _attemptBiometric);
  document.getElementById('lock-pin-toggle')
    ?.addEventListener('click', () => {
      document.getElementById('lock-pin-row')?.classList.toggle('open');
      document.getElementById('lock-pin-input')?.focus();
    });
  document.getElementById('lock-unlock-btn')
    ?.addEventListener('click', _verifyPin);
  document.getElementById('lock-pin-input')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') _verifyPin(); });

  // Auto-attempt biometric if registered
  if (storage.get(CRED_KEY) && window.PublicKeyCredential) {
    setTimeout(_attemptBiometric, 400);
  }
}

function _updateLockButtons() {
  const hasBio    = !!storage.get(CRED_KEY) && !!window.PublicKeyCredential;
  const hasPin    = !!storage.get(PIN_KEY);
  const bioWrap   = document.getElementById('lock-bio-wrap');
  const pinToggle = document.getElementById('lock-pin-toggle');

  if (bioWrap)   bioWrap.style.display   = hasBio ? 'flex'   : 'none';
  if (pinToggle) pinToggle.style.display = hasBio ? 'inline' : 'none';

  // If no biometric registered, show PIN entry directly
  if (!hasBio && hasPin) {
    document.getElementById('lock-pin-row')?.classList.add('open');
    document.getElementById('lock-pin-input')?.focus();
  }
}

function _unlock() {
  sessionStorage.setItem(SESSION_KEY, '1');
  document.getElementById('lock-overlay')?.classList.remove('active');
  document.getElementById('lock-pin-row')?.classList.remove('open');
  const inp = document.getElementById('lock-pin-input');
  if (inp) inp.value = '';
  _setLockError('');
}

function _lockNow() {
  if (!storage.get(LOCK_KEY)) return;
  sessionStorage.removeItem(SESSION_KEY);
  _showLockScreen();
}

async function _attemptBiometric() {
  const credId = storage.get(CRED_KEY);
  if (!credId || !window.PublicKeyCredential) return;

  const bioBtn = document.getElementById('lock-bio-btn');
  if (bioBtn) bioBtn.classList.add('loading');

  try {
    await navigator.credentials.get({
      publicKey: {
        challenge:        crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: new Uint8Array(credId) }],
        userVerification: 'required',
        timeout:          60000,
      }
    });
    _unlock();
  } catch (err) {
    if (bioBtn) bioBtn.classList.remove('loading');
    if (err.name !== 'NotAllowedError') {
      _setLockError('BIOMETRIC FAILED — USE PIN');
      document.getElementById('lock-pin-row')?.classList.add('open');
      document.getElementById('lock-pin-input')?.focus();
    }
  }
}

async function _verifyPin() {
  const input  = document.getElementById('lock-pin-input');
  const pin    = input?.value?.trim();
  if (!pin) return;

  const stored = storage.get(PIN_KEY);
  if (!stored) { _setLockError('NO PIN SET — REGISTER IN SETTINGS'); return; }

  const hash = await _hashPin(pin);
  if (hash === stored) {
    _unlock();
  } else {
    _setLockError('INCORRECT PIN');
    if (input) { input.value = ''; input.focus(); }
  }
}

function _setLockError(msg) {
  const el = document.getElementById('lock-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('visible', !!msg);
}

// ── Settings ───────────────────────────────────────────────────

function _toggleLock() {
  const now = !storage.get(LOCK_KEY);
  storage.set(LOCK_KEY, now);
  _renderSettings();
  // If disabling, make sure session is marked unlocked
  if (!now) sessionStorage.setItem(SESSION_KEY, '1');
}

async function _registerBiometric() {
  if (!window.PublicKeyCredential) {
    _setSettingsMsg('WEBAUTHN NOT SUPPORTED ON THIS BROWSER', true);
    return;
  }

  const btn = document.getElementById('lock-register-bio');
  if (btn) btn.textContent = 'WAITING...';

  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp:  { name: 'JARVIS', id: window.location.hostname },
        user: {
          id:          crypto.getRandomValues(new Uint8Array(16)),
          name:        'jarvis-user',
          displayName: 'Saif',
        },
        pubKeyCredParams: [
          { alg: -7,   type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',    // device biometric only
          userVerification:        'required',
          residentKey:             'preferred',
        },
        timeout: 60000,
      }
    });
    storage.set(CRED_KEY, Array.from(new Uint8Array(cred.rawId)));
    _renderSettings();
    _setSettingsMsg('FINGERPRINT REGISTERED ✓', false);
  } catch (err) {
    _renderSettings();
    if (err.name !== 'NotAllowedError') {
      _setSettingsMsg('REGISTRATION FAILED: ' + (err.message || err.name), true);
    }
  }
}

async function _savePin() {
  const newPin  = document.getElementById('lock-pin-new')?.value?.trim();
  const confirm = document.getElementById('lock-pin-confirm')?.value?.trim();

  if (!newPin)               { _setSettingsMsg('ENTER A PIN', true);                   return; }
  if (newPin.length < 4)     { _setSettingsMsg('PIN MUST BE AT LEAST 4 DIGITS', true); return; }
  if (newPin !== confirm)    { _setSettingsMsg('PINs DO NOT MATCH', true);             return; }

  storage.set(PIN_KEY, await _hashPin(newPin));
  document.getElementById('lock-pin-form')?.classList.remove('open');
  _clearPinForm();
  _renderSettings();
  _setSettingsMsg('PIN SAVED ✓', false);
}

function _clearPinForm() {
  const n = document.getElementById('lock-pin-new');
  const c = document.getElementById('lock-pin-confirm');
  if (n) n.value = '';
  if (c) c.value = '';
  _setSettingsMsg('', false);
}

function _setSettingsMsg(msg, isErr) {
  const el = document.getElementById('lock-settings-msg');
  if (!el) return;
  el.textContent = msg;
  el.className   = ['lock-settings-msg',
    msg ? 'visible' : '',
    msg ? (isErr ? 'err' : 'ok') : '',
  ].filter(Boolean).join(' ');
}

function _renderSettings() {
  const enabled   = !!storage.get(LOCK_KEY);
  const hasBio    = !!storage.get(CRED_KEY);
  const hasPin    = !!storage.get(PIN_KEY);
  const supported = !!window.PublicKeyCredential;

  const toggle = document.getElementById('lock-toggle');
  if (toggle) {
    toggle.textContent    = enabled ? 'ON'  : 'OFF';
    toggle.dataset.state  = enabled ? 'on'  : 'off';
  }

  const bioStatus = document.getElementById('lock-bio-status');
  if (bioStatus) bioStatus.textContent =
    !supported ? 'NOT SUPPORTED ON THIS DEVICE/BROWSER' :
    hasBio     ? 'REGISTERED ✓' : 'NOT YET REGISTERED';

  const bioBtn = document.getElementById('lock-register-bio');
  if (bioBtn) {
    bioBtn.textContent    = hasBio ? 'UPDATE' : 'REGISTER';
    bioBtn.style.display  = supported ? '' : 'none';
  }

  const pinStatus = document.getElementById('lock-pin-status');
  if (pinStatus) pinStatus.textContent = hasPin ? 'SET ✓' : 'NOT SET';

  const setPinBtn = document.getElementById('lock-set-pin-btn');
  if (setPinBtn) setPinBtn.textContent = hasPin ? 'CHANGE' : 'SET PIN';

  // Show/hide per-method rows based on lock being enabled
  document.querySelectorAll('.lock-config-row').forEach(r =>
    r.classList.toggle('hidden', !enabled)
  );

  // LOCK NOW button in topbar — only when lock is on AND unlocked
  const lockNow = document.getElementById('lock-now-btn');
  if (lockNow) lockNow.style.display = enabled ? 'inline-flex' : 'none';
}

// ── Crypto ─────────────────────────────────────────────────────

async function _hashPin(pin) {
  const data   = new TextEncoder().encode(pin + ':jarvis:lock:v1');
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}
