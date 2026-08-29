// ── JARVIS — src/modules/news.js ─────────────────────────────
// News: Vercel serverless proxy fetch → rss2json fallback, tab
// filtering, dashboard preview, article summary modal.
//
// Exports:
//   initNews()          — one-time setup (tabs, modal, delegation)
//   loadDashboardNews() — compact preview for dashboard card
//   loadFullNews()      — full filterable feed (caches per session)

import { RSS_SOURCES, TAG_CLASS, TAG_LABEL, FALLBACK_NEWS } from '../config.js';
import { esc, timeAgo, fetchWithTimeout }                    from '../utils.js';

// Per-session cache: key → items[] (success) | null (failed) | undefined (not tried)
let newsCache       = {};
let currentNewsFeed = 'all';

// ── Shared item renderer ───────────────────────────────────────
function renderNewsItem(it) {
  const clickable = !!it.u;
  return `
    <div class="news-item${clickable ? ' news-clickable' : ''}"
         ${clickable
           ? `data-url="${esc(it.u)}" data-headline="${esc(it.h)}" data-meta="${esc(it.t)}" data-desc="${esc(it.d || '')}"`
           : ''}>
      <span class="news-tag ${TAG_CLASS[it.tag]}">${TAG_LABEL[it.tag]}</span>
      <div style="flex:1;min-width:0">
        <div class="news-headline">${esc(it.h)}</div>
        <div class="news-meta">${esc(it.t)}</div>
      </div>
      ${clickable ? '<div class="news-arrow">›</div>' : ''}
    </div>`;
}

// ── Dashboard preview — compact, mixed sources ─────────────────
export async function loadDashboardNews() {
  const feed = document.getElementById('news-feed');
  if (!feed) return;
  feed.innerHTML = '<div class="loading">FETCHING FEED...</div>';

  const items = [];

  for (const [key, src] of Object.entries(RSS_SOURCES)) {
    let fetched = false;

    // 1. Vercel Function (server-side — no CORS, no rate-limit)
    try {
      const r = await fetchWithTimeout(`/api/news?feed=${key}`, 7000);
      if (r.ok) {
        const d = await r.json();
        if (d.items?.length) {
          d.items.slice(0, 2).forEach(it => items.push(it));
          fetched = true;
        }
      }
    } catch { /* fall through */ }

    // 2. rss2json fallback (client-side, rate-limited free tier)
    if (!fetched) {
      try {
        const rssUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(src.url)}&count=2`;
        const d      = await (await fetchWithTimeout(rssUrl, 5000)).json();
        if (d.status === 'ok' && d.items?.length) {
          d.items.forEach(it => items.push({
            tag: key,
            h:   it.title,
            t:   `${src.label} · ${timeAgo(new Date(it.pubDate))}`,
            u:   it.link || '',
            d:   (it.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
          }));
        }
      } catch { /* skip source */ }
    }
  }

  const result = items.length ? items.slice(0, 5) : FALLBACK_NEWS;
  const gsEl   = document.getElementById('gs-news');
  if (gsEl) gsEl.textContent = result.length;

  feed.innerHTML = result.map(renderNewsItem).join('');
}

// ── Full news view — parallel fetch, per-session cache ────────
export async function loadFullNews() {
  const container = document.getElementById('news-full');
  if (!container) return;
  container.innerHTML = '<div class="loading">FETCHING FEED...</div>';

  // Fetch all sources in parallel; skip already-cached keys
  const fetches = Object.entries(RSS_SOURCES).map(async ([key, src]) => {
    if (newsCache[key] !== undefined) return; // cached or previously failed

    // 1. Vercel Function
    try {
      const r = await fetchWithTimeout(`/api/news?feed=${key}`, 8000);
      if (r.ok) {
        const d = await r.json();
        if (d.items?.length) { newsCache[key] = d.items; return; }
      }
    } catch { /* fall through */ }

    // 2. rss2json fallback
    try {
      const rssUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(src.url)}&count=8`;
      const d      = await (await fetchWithTimeout(rssUrl, 6000)).json();
      if (d.status === 'ok' && d.items?.length) {
        newsCache[key] = d.items.map(it => ({
          tag: key,
          h:   it.title,
          t:   `${src.label} · ${timeAgo(new Date(it.pubDate))}`,
          u:   it.link || '',
          d:   (it.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
        }));
        return;
      }
    } catch { /* fall through */ }

    // Both failed — mark as null so we don't retry until explicit Refresh
    newsCache[key] = null;
  });

  await Promise.all(fetches);
  _renderFullNews();
}

function _renderFullNews() {
  const container = document.getElementById('news-full');
  if (!container) return;

  let items = [];
  if (currentNewsFeed === 'all') {
    Object.keys(RSS_SOURCES).forEach(k => { if (newsCache[k]) items.push(...newsCache[k]); });
  } else {
    items = newsCache[currentNewsFeed] || [];
  }

  if (items.length === 0) {
    const fallback = currentNewsFeed === 'all'
      ? FALLBACK_NEWS
      : FALLBACK_NEWS.filter(n => n.tag === currentNewsFeed);
    if (fallback.length) {
      container.innerHTML =
        '<div class="news-stale-note">// LIVE FEED UNAVAILABLE — SHOWING CURATED HEADLINES</div>' +
        fallback.map(renderNewsItem).join('');
      return;
    }
    container.innerHTML = '<div class="loading">NO ITEMS — PRESS REFRESH TO RETRY</div>';
    return;
  }

  container.innerHTML = items.map(renderNewsItem).join('');
}

// ── Article summary modal ──────────────────────────────────────
function openArticleModal(url, headline, meta, rssDesc) {
  const overlay    = document.getElementById('article-modal-overlay');
  const badge      = document.getElementById('modal-badge');
  const source     = document.getElementById('modal-source');
  const headlineEl = document.getElementById('modal-headline');
  const body       = document.getElementById('modal-body');
  const link       = document.getElementById('modal-link');

  if (!overlay) return;

  badge.textContent      = 'AI SUMMARY';
  badge.className        = 'article-modal-badge';
  source.textContent     = meta || '';
  headlineEl.textContent = headline;
  body.innerHTML         = '<div class="modal-loading"><span class="modal-spinner"></span>ANALYZING ARTICLE...</div>';
  link.href              = url;
  link.classList.remove('hidden');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';

  fetchWithTimeout(`/api/summarize?url=${encodeURIComponent(url)}`, 18000)
    .then(r => r.json())
    .then(data => {
      if (data.summary) {
        body.innerHTML = data.summary
          .split(/\n+/).filter(Boolean)
          .map(p => `<p>${esc(p)}</p>`).join('');

      } else if (data.error === 'api_key_missing') {
        badge.textContent = 'ARTICLE PREVIEW';
        badge.className   = 'article-modal-badge badge-preview';
        body.innerHTML    = (rssDesc ? `<p>${esc(rssDesc)}</p>` : '<p>No preview available.</p>') +
          `<div class="modal-setup-note">
            ⚙ <strong>AI summaries</strong> require an Anthropic API key.<br>
            Add <code>ANTHROPIC_API_KEY</code> to your
            <a href="https://vercel.com/dashboard" target="_blank" rel="noopener">Vercel environment variables</a>
            to enable this feature.
          </div>`;

      } else {
        badge.textContent = 'ARTICLE PREVIEW';
        badge.className   = 'article-modal-badge badge-preview';
        body.innerHTML    = rssDesc
          ? `<p>${esc(rssDesc)}</p>`
          : '<p>Summary unavailable. Open the full article to read more.</p>';
      }
    })
    .catch(() => {
      badge.textContent = 'ARTICLE PREVIEW';
      badge.className   = 'article-modal-badge badge-preview';
      body.innerHTML    = rssDesc
        ? `<p>${esc(rssDesc)}</p>`
        : '<p>Summary unavailable. Open the full article to read more.</p>';
    });
}

function closeArticleModal() {
  document.getElementById('article-modal-overlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ── Init (call once at app startup) ────────────────────────────
export function initNews() {
  // Feed tabs
  document.querySelectorAll('.news-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentNewsFeed = btn.dataset.feed;
      document.querySelectorAll('.news-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const hasData = Object.values(newsCache).some(v => v && v.length > 0);
      if (!hasData && Object.keys(newsCache).length === 0) loadFullNews();
      else _renderFullNews();
    });
  });

  // Refresh button (full news view)
  document.getElementById('news-refresh-btn')?.addEventListener('click', () => {
    newsCache = {};
    loadFullNews();
  });

  // Refresh button (dashboard card)
  document.getElementById('dashboard-news-refresh')?.addEventListener('click', loadDashboardNews);

  // Modal close handlers
  const overlay = document.getElementById('article-modal-overlay');
  document.getElementById('article-modal-close')?.addEventListener('click', closeArticleModal);
  overlay?.addEventListener('click', e => { if (e.target === overlay) closeArticleModal(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay?.classList.contains('open')) closeArticleModal();
  });

  // Delegated news-item clicks (dashboard + full view)
  document.addEventListener('click', e => {
    const item = e.target.closest('.news-item[data-url]');
    if (!item) return;
    openArticleModal(item.dataset.url, item.dataset.headline, item.dataset.meta, item.dataset.desc);
  });

  // Initial dashboard load
  loadDashboardNews();
}
