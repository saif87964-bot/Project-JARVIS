'use strict';

// ── JARVIS News Proxy — netlify/functions/news.js ─────────────────
// Server-side RSS fetcher: bypasses CORS & client-side rate limits.
// Usage: /.netlify/functions/news?feed=tz|tech|biz
// Returns: { items: [{ tag, h, t }] }
// ─────────────────────────────────────────────────────────────────

const https   = require('https');
const http    = require('http');
const { URL } = require('url');

const SOURCES = {
  tz:   { url: 'https://feeds.bbci.co.uk/news/world/africa/rss.xml',  label: 'BBC Africa'   },
  tech: { url: 'https://techcrunch.com/feed/',                          label: 'TechCrunch'   },
  biz:  { url: 'https://www.theguardian.com/business/rss',              label: 'The Guardian' },
};

// ── HTTP GET with redirect following ─────────────────────────────
function httpGet(rawUrl, hops) {
  hops = (hops | 0);
  if (hops > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise(function (resolve, reject) {
    var parsed;
    try { parsed = new URL(rawUrl); } catch (e) { return reject(e); }
    var mod = parsed.protocol === 'https:' ? https : http;
    var req = mod.get(rawUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JARVIS-RSS/1.0)',
        'Accept':     'application/rss+xml, application/atom+xml, text/xml, */*',
      },
    }, function (res) {
      if ([301, 302, 303, 307, 308].indexOf(res.statusCode) !== -1 && res.headers.location) {
        res.resume();
        return httpGet(res.headers.location, hops + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode));
      }
      var parts = [];
      res.on('data',  function (c) { parts.push(c); });
      res.on('end',   function ()  { resolve(Buffer.concat(parts).toString('utf8')); });
      res.on('error', reject);
    });
    req.setTimeout(7000, function () { req.destroy(new Error('Request timeout')); });
    req.on('error', reject);
  });
}

// ── RSS / Atom XML parser ─────────────────────────────────────────
function parseRSS(xml, label, tag) {
  var items = [];
  // Match both <item> (RSS) and <entry> (Atom)
  var re = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/g;
  var m;
  while ((m = re.exec(xml)) !== null) {
    if (items.length >= 10) break;
    var block = m[1];
    // Extract a field, stripping CDATA wrappers and inner tags
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
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
    };
    var title = field('title');
    var pub   = field('pubDate') || field('published') || field('updated') || field('dc:date');
    // URL: RSS <link> text content, or Atom <link href="...">
    var link  = field('link');
    if (!link) {
      var linkAtom = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (linkAtom) link = linkAtom[1];
    }
    // Description snippet (strip HTML, trim)
    var desc = field('description') || field('summary') || field('content') || '';
    desc = desc.slice(0, 400).replace(/\s+/g, ' ').trim();
    if (title) {
      items.push({ tag: tag, h: title, t: label + (pub ? ' · ' + pub : ''), u: link || '', d: desc });
    }
  }
  return items;
}

// ── Netlify Function handler ──────────────────────────────────────
exports.handler = async function (event) {
  var q    = event.queryStringParameters || {};
  var feed = q.feed;

  if (!SOURCES[feed]) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [], error: 'Unknown feed. Use: tz, tech, biz' }),
    };
  }

  var src = SOURCES[feed];
  try {
    var xml   = await httpGet(src.url);
    var items = parseRSS(xml, src.label, feed);
    return {
      statusCode: 200,
      headers: {
        'Content-Type':                'application/json',
        'Cache-Control':               'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ items: items }),
    };
  } catch (err) {
    console.error('[JARVIS news] feed=' + feed, err.message);
    return {
      statusCode: 502,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ items: [], error: err.message }),
    };
  }
};
