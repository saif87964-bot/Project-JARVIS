// ── JARVIS — src/modules/clock.js ─────────────────────────────
// Live clock and context-aware greeting.
// Updates every second: topbar time, greeting headline, date sub-line.

import { DAYS, MONTHS } from '../config.js';

function tick() {
  const now = new Date();

  const timeEl = document.getElementById('live-time');
  if (timeEl) timeEl.textContent = now.toTimeString().split(' ')[0];

  const hr    = now.getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const greetEl = document.getElementById('greeting-main');
  if (greetEl) greetEl.innerHTML = `${greet}, <span>Saif.</span>`;

  const sub = document.getElementById('greeting-sub');
  if (sub) {
    sub.innerHTML = `// ${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  }
}

export function initClock() {
  tick();
  setInterval(tick, 1000);
}
