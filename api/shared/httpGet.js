'use strict';

// ── JARVIS — api/shared/httpGet.js ──────────────────────────────
// Shared HTTP GET helper with redirect following (up to 5 hops).
// Used by news.js and summarize.js to eliminate duplication.
//
// Usage:
//   const httpGet = require('./shared/httpGet');
//   const body = await httpGet(url, { headers: {...}, timeout: 7000 });

const https   = require('https');
const http    = require('http');
const { URL } = require('url');

/**
 * Fetch a URL with redirect following.
 *
 * @param {string} rawUrl          URL to fetch
 * @param {object} [opts]          Options
 * @param {object} [opts.headers]  HTTP request headers (default: {})
 * @param {number} [opts.timeout]  Request timeout in ms (default: 10000)
 * @param {number} [_hops]         Internal — redirect counter, do not pass
 * @returns {Promise<string>}      Response body as UTF-8 string
 */
function httpGet(rawUrl, opts, _hops) {
  _hops = (_hops | 0);
  if (_hops > 5) return Promise.reject(new Error('Too many redirects'));

  var headers = (opts && opts.headers) || {};
  var timeout = (opts && opts.timeout) || 10000;

  return new Promise(function (resolve, reject) {
    var parsed;
    try { parsed = new URL(rawUrl); } catch (e) { return reject(e); }

    var mod = parsed.protocol === 'https:' ? https : http;
    var req = mod.get(rawUrl, { headers: headers }, function (res) {
      if ([301, 302, 303, 307, 308].indexOf(res.statusCode) !== -1 && res.headers.location) {
        res.resume();
        return httpGet(res.headers.location, opts, _hops + 1).then(resolve, reject);
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

    req.setTimeout(timeout, function () { req.destroy(new Error('Request timeout')); });
    req.on('error', reject);
  });
}

module.exports = httpGet;
