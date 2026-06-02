// ── JARVIS — src/modules/gcal.js ──────────────────────────────
// Google Calendar OAuth sync via Google Identity Services (GIS).
// Uses client-side token flow — no backend required.
// Exports:
//   setupGCal()               — one-time wiring (loads GIS, wires delegation)
//   renderGCalStatus()        — re-render the connection card
//   isGCalConnected()         — true if valid token in localStorage
//   getGCalEventsForDate(str) — cached events for a YYYY-MM-DD date
//   getAllGCalEvents()         — all cached events
//   loadGCalMonth(year, month)— fetch & cache events for a calendar month

import { storage } from '../core/storage.js';
import { bus }     from '../core/bus.js';

const TOKEN_KEY  = 'jv_gcal_token';
const CLIENT_KEY = 'jv_gcal_client_id';
const SCOPE      = 'https://www.googleapis.com/auth/calendar.readonly';
const API        = 'https://www.googleapis.com/calendar/v3';

let _tokenClient = null;
let _events      = []; // in-memory cache for the loaded month

// ── Public API ─────────────────────────────────────────────────

export function setupGCal() {
  _loadGIS();

  // Delegated click handler — covers dynamically rendered buttons
  document.addEventListener('click', e => {
    const id = e.target.id;
    if (id === 'gcal-connect-btn')    _requestToken();
    if (id === 'gcal-disconnect-btn') _disconnect();
    if (id === 'gcal-client-id-save') _saveClientId();
  });
}

export function renderGCalStatus() {
  const el = document.getElementById('gcal-status');
  if (!el) return;
  const clientId  = storage.get(CLIENT_KEY);
  const connected = isGCalConnected();

  if (!clientId) {
    el.innerHTML = `
      <div class="gcal-setup">
        <div class="gcal-setup-top">
          <span class="gcal-setup-title">GOOGLE CALENDAR SYNC</span>
          <span class="gcal-setup-sub">Enter your OAuth Client ID to connect</span>
        </div>
        <div class="gcal-setup-row">
          <input id="gcal-client-id-input" class="task-input gcal-client-input"
                 placeholder="123456789-abc.apps.googleusercontent.com" autocomplete="off" />
          <button class="task-add-btn" id="gcal-client-id-save">SAVE</button>
        </div>
        <div class="gcal-setup-hint">
          Google Cloud Console → APIs &amp; Services → Credentials → OAuth 2.0 Client ID (Web App)
          — add your Vercel URL as an Authorized JavaScript Origin
        </div>
      </div>`;
  } else if (connected) {
    el.innerHTML = `
      <div class="gcal-status-row">
        <span class="gcal-dot on"></span>
        <span class="gcal-label">GOOGLE CALENDAR SYNCED</span>
        <button class="gcal-action-btn" id="gcal-disconnect-btn">DISCONNECT</button>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="gcal-status-row">
        <span class="gcal-dot"></span>
        <span class="gcal-label">GOOGLE CALENDAR</span>
        <button class="gcal-action-btn" id="gcal-connect-btn">CONNECT</button>
      </div>`;
  }
}

export function isGCalConnected() {
  const t = storage.get(TOKEN_KEY);
  return !!(t?.token && t.expires > Date.now());
}

export function getGCalEventsForDate(dateStr) {
  return _events.filter(e => e.date === dateStr);
}

export function getAllGCalEvents() {
  return _events;
}

export async function loadGCalMonth(year, month) {
  if (!isGCalConnected()) return;
  const start = new Date(year, month, 1);
  const end   = new Date(year, month + 1, 1);
  _events = await _fetchRange(start, end);
  bus.emit('gcal:loaded');
}

// ── Private ────────────────────────────────────────────────────

function _loadGIS() {
  if (document.getElementById('gis-script')) {
    // Already loading or loaded — try init in case it finished
    if (window.google?.accounts?.oauth2) _initClient();
    return;
  }
  const s  = document.createElement('script');
  s.id     = 'gis-script';
  s.src    = 'https://accounts.google.com/gsi/client';
  s.async  = true;
  s.onload = _initClient;
  document.head.appendChild(s);
}

function _initClient() {
  const clientId = storage.get(CLIENT_KEY);
  if (!clientId || !window.google?.accounts?.oauth2) return;
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope:     SCOPE,
    callback:  _handleToken,
  });
}

function _handleToken(resp) {
  if (resp.error) { console.warn('GCal auth:', resp.error); return; }
  storage.set(TOKEN_KEY, {
    token:   resp.access_token,
    expires: Date.now() + resp.expires_in * 1000,
  });
  renderGCalStatus();
  bus.emit('gcal:connected');
}

function _requestToken() {
  // Re-try init in case GIS loaded after setupGCal ran
  if (!_tokenClient) _initClient();
  if (!_tokenClient) {
    bus.emit('cmd:response', { msg: '? SAVE YOUR GOOGLE CLIENT ID FIRST', err: true });
    return;
  }
  _tokenClient.requestAccessToken({ prompt: '' });
}

function _disconnect() {
  const t = storage.get(TOKEN_KEY);
  if (t?.token && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(t.token, () => {});
  }
  storage.set(TOKEN_KEY, null);
  _events = [];
  renderGCalStatus();
  bus.emit('gcal:disconnected');
}

function _saveClientId() {
  const input = document.getElementById('gcal-client-id-input');
  const id    = input?.value?.trim();
  if (!id) return;
  storage.set(CLIENT_KEY, id);
  _initClient();
  renderGCalStatus();
}

async function _fetchRange(start, end) {
  const t = storage.get(TOKEN_KEY);
  if (!t?.token) return [];
  try {
    const params = new URLSearchParams({
      timeMin:      start.toISOString(),
      timeMax:      end.toISOString(),
      singleEvents: 'true',
      orderBy:      'startTime',
      maxResults:   '500',
    });
    const res = await fetch(`${API}/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${t.token}` },
    });
    if (!res.ok) {
      if (res.status === 401) storage.set(TOKEN_KEY, null); // token expired
      return [];
    }
    const data = await res.json();
    return (data.items || [])
      .map(ev => ({
        id:     'gcal_' + ev.id,
        title:  ev.summary || '(no title)',
        date:   (ev.start?.date || ev.start?.dateTime || '').slice(0, 10),
        time:   ev.start?.dateTime ? ev.start.dateTime.slice(11, 16) : '',
        source: 'google',
      }))
      .filter(e => e.date);
  } catch (err) {
    console.warn('GCal fetch failed:', err);
    return [];
  }
}
