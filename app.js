// ── Clock & Greeting ──────────────────────────────────────────
function tick() {
  const now = new Date();

  // Live clock in topbar
  const timeEl = document.getElementById('live-time');
  if (timeEl) timeEl.textContent = now.toTimeString().split(' ')[0];

  // Time-aware greeting
  const hr = now.getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const greetEl = document.querySelector('.greeting-main');
  if (greetEl) greetEl.innerHTML = `${greet}, <span>Saif.</span>`;

  // Date line
  const DAYS  = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const sub = document.getElementById('greeting-sub');
  if (sub) {
    sub.innerHTML = `// ${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()} &nbsp;·&nbsp; LOADING STATUS...`;
  }
}
tick();
setInterval(tick, 1000);


// ── Reminders ─────────────────────────────────────────────────
function toggleDone(el) {
  const isDone = el.classList.toggle('reminder-done');
  el.querySelector('.reminder-check').textContent = isDone ? '✓' : '';
}


// ── Weather (wttr.in — no API key needed) ─────────────────────
async function loadWeather() {
  const el = document.getElementById('weather-block');
  if (!el) return;

  try {
    const r = await fetch('https://wttr.in/Dar+es+Salaam?format=j1', { cache: 'no-cache' });
    const d = await r.json();
    const c = d.current_condition[0];
    const desc = c.weatherDesc?.[0]?.value || 'Clear';
    el.innerHTML = `
      <div class="weather-icon">${wxIcon(c.weatherCode)}</div>
      <div>
        <div class="weather-temp">${c.temp_C}°C</div>
        <div class="weather-city">DAR ES SALAAM, TZ</div>
        <div class="weather-desc">${desc} · ${c.humidity}% humidity</div>
      </div>`;
  } catch {
    // fallback content already in HTML
  }
}

function wxIcon(code) {
  code = parseInt(code);
  if (code === 113) return '☀️';
  if (code === 116) return '⛅';
  if (code === 119 || code === 122) return '☁️';
  if (code >= 176 && code <= 263) return '🌦️';
  if (code >= 296 && code <= 321) return '🌧️';
  if (code >= 386) return '⛈️';
  return '🌤️';
}


// ── News (rss2json — free, no API key) ────────────────────────
const RSS = {
  tz:   'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
  tech: 'https://techcrunch.com/feed/',
  biz:  'https://feeds.reuters.com/reuters/businessNews',
};

const FALLBACK_NEWS = [
  { tag:'tz',   h:'TRA announces updated EFD compliance requirements for Q3 2026',        t:'The Citizen · just now' },
  { tag:'biz',  h:'Tanzania shilling stabilises at 2,640 against USD after brief volatility', t:'Bloomberg Africa · 1 hr ago' },
  { tag:'tech', h:'Anthropic releases Claude 4.6 with expanded agentic capabilities',    t:'TechCrunch · 2 hr ago' },
  { tag:'tz',   h:'Dar es Salaam port throughput hits record high in April 2026',        t:'Daily News · 3 hr ago' },
  { tag:'biz',  h:'East Africa manufacturing sector reports 8.2% growth in Q1 2026',    t:'Reuters Africa · 4 hr ago' },
];

async function loadNews() {
  const feed = document.getElementById('news-feed');
  if (!feed) return;
  feed.innerHTML = '<div class="loading">FETCHING FEED...</div>';

  // Try each source in order of relevance
  const sources = [
    { key: 'tz',   label: 'BBC Africa' },
    { key: 'tech', label: 'TechCrunch' },
    { key: 'biz',  label: 'Reuters' },
  ];

  const items = [];

  for (const src of sources) {
    try {
      const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS[src.key])}&count=2`;
      const r = await fetch(url);
      const d = await r.json();
      if (d.status === 'ok' && d.items?.length) {
        d.items.forEach(it => items.push({
          tag: src.key,
          h: it.title,
          t: `${src.label} · ${timeAgo(new Date(it.pubDate))}`,
        }));
      }
    } catch { /* skip this source */ }
  }

  renderNews(feed, items.length ? items.slice(0, 6) : FALLBACK_NEWS);
}

function renderNews(feed, items) {
  const TAG_CLASS = { tz: 'tag-tz', biz: 'tag-biz', tech: 'tag-tech' };
  const TAG_LABEL = { tz: 'TZ', biz: 'BIZ', tech: 'TECH' };
  feed.innerHTML = items.map(it => `
    <div class="news-item">
      <span class="news-tag ${TAG_CLASS[it.tag]}">${TAG_LABEL[it.tag]}</span>
      <div>
        <div class="news-headline">${esc(it.h)}</div>
        <div class="news-meta">${esc(it.t)}</div>
      </div>
    </div>`).join('');
}

function timeAgo(date) {
  const mins = Math.floor((Date.now() - date) / 60000);
  if (isNaN(mins) || mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function esc(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}


// ── Init ──────────────────────────────────────────────────────
loadWeather();
loadNews();
