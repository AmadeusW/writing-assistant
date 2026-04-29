'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const PORT = process.env.PORT || 7777;
const ROOT = path.resolve(__dirname);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.var':  'text/plain; charset=utf-8',
  '.ico':  'image/x-icon',
};

// ---------------------------------------------------------------------------
// Static file handler
// ---------------------------------------------------------------------------

function serveStatic(req, res) {
  const rel  = req.url.split('?')[0];
  const file = path.normalize(path.join(ROOT, rel === '/' ? 'index.html' : rel));

  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    res.writeHead(403); res.end(); return;
  }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ct = MIME[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': ct });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// Proxy handler — forwards POST /proxy to the URL given in x-target-url
// ---------------------------------------------------------------------------

function handleProxy(req, res) {
  const targetUrl = req.headers['x-target-url'];
  const headerApiKey = req.headers['x-api-key'];
  const envApiKey = process.env.API_KEY;
  const apiKey = (typeof headerApiKey === 'string' && headerApiKey.trim())
    ? headerApiKey.trim()
    : (typeof envApiKey === 'string' && envApiKey.trim() ? envApiKey.trim() : '');

  console.log('[proxy] incoming headers:',
    'x-target-url =', JSON.stringify(targetUrl),
    '| auth source =', headerApiKey ? 'request header' : (envApiKey ? 'API_KEY env' : 'none'));

  if (!targetUrl) {
    console.warn('[proxy] rejected: missing x-target-url');
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing x-target-url header' }));
    return;
  }

  let parsed;
  try { parsed = new URL(targetUrl); }
  catch (e) {
    console.warn('[proxy] rejected: URL parse failed for', JSON.stringify(targetUrl), '—', e.message);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Invalid x-target-url: ${e.message}` }));
    return;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    console.warn('[proxy] rejected: unsupported protocol', parsed.protocol);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Unsupported protocol: ${parsed.protocol}` }));
    return;
  }

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body    = Buffer.concat(chunks);
    const isHttps = parsed.protocol === 'https:';

    const upstreamHeaders = {
      'content-type':   'application/json',
      'content-length': body.length,
      'user-agent':     req.headers['user-agent'] || 'writing-assistant',
      'referer':        `http://localhost:${PORT}`,
      'x-title':        'writing-assistant',
    };
    if (apiKey) upstreamHeaders['authorization'] = `Bearer ${apiKey}`;

    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   'POST',
      headers:  upstreamHeaders,
    };

    console.log('[proxy] forwarding to', `${parsed.protocol}//${parsed.hostname}:${opts.port}${opts.path}`,
      '| body', body.length, 'bytes', '| auth:', !!apiKey);

    const transport = isHttps ? https : http;
    const upstream  = transport.request(opts, upRes => {
      console.log('[proxy] upstream response:', upRes.statusCode, upRes.headers['content-type']);
      res.writeHead(upRes.statusCode, {
        'content-type': upRes.headers['content-type'] || 'application/json',
      });
      upRes.pipe(res);
    });

    upstream.on('error', e => {
      console.error('[proxy] upstream error:', e.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });

    upstream.write(body);
    upstream.end();
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const server = http.createServer((req, res) => {
  console.log(req.method, req.url);

  if (req.method === 'POST' && req.url === '/proxy') {
    handleProxy(req, res); return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res); return;
  }
  res.writeHead(405); res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Writing Assistant → http://localhost:${PORT}`);
});
