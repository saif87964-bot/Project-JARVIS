'use strict';

// ── JARVIS Article Summariser — netlify/functions/summarize.js ──
// Fetches an article URL server-side, strips HTML, calls Claude API
// to produce a 3-4 sentence summary.
//
// Usage:  /.netlify/functions/summarize?url=<encoded_article_url>
// Returns: { summary: "...", error?: "..." }
//
// Requires:  ANTHROPIC_API_KEY environment variable set in Netlify.
// If missing: returns { summary: null, error: "api_key_missing" }
//   → client falls back to RSS description snippet.
// ────────────────────────────────────────────────────────────────

const https   = require('https');
const http    = require('http');
const { URL } = require('url');

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
        'User-Agent': 'Mozilla/5.0 (compatible; JARVIS/1.0)',
        'Accept':     'text/html,application/xhtml+xml,*/*',
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
    req.setTimeout(5000, function () { req.destroy(new Error('Article fetch timeout')); });
    req.on('error', reject);
  });
}

// ── Strip HTML → plain text ───────────────────────────────────────
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Call Anthropic Messages API ───────────────────────────────────
function callClaude(articleText) {
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Promise.reject(new Error('api_key_missing'));

  var prompt =
    'Summarize this news article in 3-4 concise sentences. ' +
    'Focus on the key facts: what happened, who is involved, and why it matters. ' +
    'Write in plain English, no bullet points.\n\nArticle:\n' +
    articleText.slice(0, 4000);

  var payload = JSON.stringify({
    model: 'claude-haiku-4-5',   // fast + cheap — update if needed
    max_tokens: 280,
    messages: [{ role: 'user', content: prompt }],
  });

  return new Promise(function (resolve, reject) {
    var req = https.request({
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key':         apiKey,
        'Content-Length':    Buffer.byteLength(payload),
      },
    }, function (res) {
      var data = '';
      res.on('data',  function (c) { data += c; });
      res.on('end',   function () {
        try {
          var d = JSON.parse(data);
          if (d.error) return reject(new Error(d.error.message || 'Claude API error'));
          if (d.content && d.content[0]) return resolve(d.content[0].text);
          reject(new Error('Unexpected Claude response'));
        } catch (e) { reject(e); }
      });
      res.on('error', reject);
    });
    req.setTimeout(9000, function () { req.destroy(new Error('Claude API timeout')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async function (event) {
  var q   = event.queryStringParameters || {};
  var url = q.url;

  if (!url) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing url parameter' }),
    };
  }

  // No API key → tell the client so it can show the RSS snippet instead
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ summary: null, error: 'api_key_missing' }),
    };
  }

  try {
    var html    = await httpGet(url);
    var text    = stripHtml(html);
    var summary = await callClaude(text);

    return {
      statusCode: 200,
      headers: {
        'Content-Type':                'application/json',
        'Cache-Control':               'private, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ summary: summary }),
    };
  } catch (err) {
    var isKeyMissing = err.message === 'api_key_missing';
    return {
      statusCode: isKeyMissing ? 200 : 502,
      headers: {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ summary: null, error: err.message }),
    };
  }
};
