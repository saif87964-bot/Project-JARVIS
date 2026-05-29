// ── JARVIS — src/modules/weather.js ──────────────────────────
// Fetches and displays current weather for Dar es Salaam via wttr.in.
// No API key required. Falls back silently to the placeholder HTML.

import { esc } from '../utils.js';

const CITY_URL = 'https://wttr.in/Dar+es+Salaam?format=j1';

function wxIcon(code) {
  code = parseInt(code);
  if (code === 113)                   return '☀️';
  if (code === 116)                   return '⛅';
  if (code === 119 || code === 122)   return '☁️';
  if (code >= 176 && code <= 263)     return '🌦️';
  if (code >= 296 && code <= 321)     return '🌧️';
  if (code >= 386)                    return '⛈️';
  return '🌤️';
}

export async function loadWeather() {
  const el = document.getElementById('weather-block');
  if (!el) return;
  try {
    const r    = await fetch(CITY_URL, { cache: 'no-cache' });
    const d    = await r.json();
    const c    = d.current_condition[0];
    const desc = c.weatherDesc?.[0]?.value || 'Clear';
    el.innerHTML = `
      <div class="weather-icon">${wxIcon(c.weatherCode)}</div>
      <div>
        <div class="weather-temp">${c.temp_C}°C</div>
        <div class="weather-city">DAR ES SALAAM, TZ</div>
        <div class="weather-desc">${esc(desc)} · ${c.humidity}% humidity</div>
      </div>`;
  } catch { /* keep placeholder HTML */ }
}

export function initWeather() {
  loadWeather();
}
