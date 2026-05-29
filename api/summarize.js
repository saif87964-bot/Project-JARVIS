'use strict';

// ── JARVIS Article Summariser — api/summarize.js ──────────────
// Vercel serverless function. Fetches an article URL server-side,
// strips HTML, calls Claude API to produce a 3-4 sentence summary.
//
// Usage:  /api/summarize?url=<encoded_article_url>
// Returns: { summary: "...", error?: "..." }
//
// Requires: ANTHROPIC_API_KEY environment variable set in Vercel.
// If missing: returns { summary: null, error: "api_key_missing" }

const https   = require('https');
const httpGet = require('./shared/httpGet');

const ARTICLE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; JARVIS/1.0)',
  'Accept':     'text/html,application/xhtml+xml,*/*',
};

// ── Strip HTML → plain text ───────────────────────────────────
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi,   '')
    .replace(/<!--[\s\S]*?-->/g,            '')
    .replace(/<[^>]+>/g,  ' ')
    .replace(/&nbsp;/g,   ' ').replace(/&amp;/g,  '&')
    .replace(/&lt;/g,     '<').replace(/&gt;/g,   '>')
    .replace(/&quot;/g,   '"').replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Call Anthropic Messages API ───────────────────────────────
function callClaude(articleText) {
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Promise.reject(new Error('api_key_missing'));

  var prompt =
    'Summarize this news article in 3-4 concise sentences. ' +
    'Focus on the key facts: what happened, who is involved, and why it matters. ' +
    'Write in plain English, no bullet points.\n\nArticle:\n' +
    articleText.slice(0, 4000);

  var payload = JSON.stringify({
    model:      'claude-haiku-4-5',
    max_tokens: 280,
    messages:   [{ role: 'user', content: prompt }],
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
          if (d.error)              return reject(new Error(d.error.message || 'Claude API error'));
          if (d.content?.[0]?.text) return resolve(d.content[0].text);
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

// ── Vercel handler ────────────────────────────────────────────
module.exports = async function (req, res) {
  var url = req.query.url;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // No API key → tell the client so it shows the RSS snippet instead
  if (!process.env.ANTHROPIC_API_KEY) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ summary: null, error: 'api_key_missing' });
  }

  try {
    var html    = await httpGet(url, { headers: ARTICLE_HEADERS, timeout: 5000 });
    var text    = stripHtml(html);
    var summary = await callClaude(text);

    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ summary: summary });
  } catch (err) {
    var isKeyMissing = err.message === 'api_key_missing';
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(isKeyMissing ? 200 : 502).json({ summary: null, error: err.message });
  }
};
