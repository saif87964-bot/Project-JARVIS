'use strict';

// ── JARVIS News Proxy — api/news.js ───────────────────────────
// Vercel serverless function. Server-side RSS fetcher:
// bypasses CORS & client-side rate limits.
// Usage: /api/news?feed=tz|tech|biz
// Returns: { items: [{ tag, h, t, u, d }] }

const httpGet = require('./shared/httpGet');

const SOURCES = {
  tz:   { url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml',  label: 'BBC Africa'   },
  tech: { url: 'https://techcrunch.com/feed/',                          label: 'TechCrunch'   },
  biz:  { url: 'https://www.theguardian.com/business/rss',              label: 'The Guardian' },
};

const RSS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; JARVIS-RSS/1.0)',
  'Accept':     'application/rss+xml, application/atom+xml, text/xml, */*',
};

// ── RSS / Atom XML parser ─────────────────────────────────────
function parseRSS(xml, label, tag) {
  var items = [];
  var re    = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/g;
  var m;

  while ((m = re.exec(xml)) !== null) {
    if (items.length >= 10) break;
    var block = m[1];

    var field = function (name) {
      var fr = new RegExp(
        '<' + name + '[^>]*>' +
        '(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?' +
        '<\\/' + name + '>',
        'i'
      );
      var fm = block.match(fr);
      if (!fm) return '';
      return fm[1].replace(/<[^>]+>/g, '').trim()
        .replace(/&amp;/g,  '&').replace(/&lt;/g,   '<')
        .replace(/&gt;/g,   '>').replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
    };

    var title = field('title');
    var pub   = field('pubDate') || field('published') || field('updated') || field('dc:date');

    var link = field('link');
    if (!link) {
      var linkAtom = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (linkAtom) link = linkAtom[1];
    }

    var desc = field('description') || field('summary') || field('content') || '';
    desc = desc.slice(0, 400).replace(/\s+/g, ' ').trim();

    if (title) {
      items.push({ tag: tag, h: title, t: label + (pub ? ' · ' + pub : ''), u: link || '', d: desc });
    }
  }
  return items;
}

// ── Vercel handler ────────────────────────────────────────────
module.exports = async function (req, res) {
  var feed = req.query.feed;

  if (!SOURCES[feed]) {
    return res.status(400).json({ items: [], error: 'Unknown feed. Use: tz, tech, biz' });
  }

  var src = SOURCES[feed];
  try {
    var xml   = await httpGet(src.url, { headers: RSS_HEADERS, timeout: 7000 });
    var items = parseRSS(xml, src.label, feed);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ items: items });
  } catch (err) {
    console.error('[JARVIS news] feed=' + feed, err.message);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(502).json({ items: [], error: err.message });
  }
};
