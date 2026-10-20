#!/usr/bin/env node
'use strict';
// A loopback-only static viewer. Never accepts a preview, upload, cookie or body.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const FILES = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/pilot.css': ['pilot.css', 'text/css; charset=utf-8'],
  '/pilot.js': ['pilot.js', 'text/javascript; charset=utf-8'],
  '/protocol.js': ['protocol.js', 'text/javascript; charset=utf-8'],
  '/decoder.js': ['decoder.js', 'text/javascript; charset=utf-8'],
  '/vendor/jsqr-1.4.0.js': ['vendor/jsqr-1.4.0.js', 'text/javascript; charset=utf-8'],
  '/vendor/jsqr-1.4.0.LICENSE.txt': ['vendor/jsqr-1.4.0.LICENSE.txt', 'text/plain; charset=utf-8'],
});
const CSP = "default-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src blob:; worker-src 'self'; connect-src 'none'; manifest-src 'none'";
const HEADERS = Object.freeze({
  'Content-Security-Policy': CSP,
  'Permissions-Policy': 'camera=(self), display-capture=(self), microphone=(), geolocation=(), payment=(), usb=()',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
});
function createServer() {
  let boundPort;
  const counts = {staticGet: 0, staticHead: 0, refusedMethod: 0, refusedHost: 0, notFound: 0};
  const server = http.createServer((req, res) => {
    // No body listener, parsing, buffering, logging or persistence is installed.
    // No request data is echoed into an error response.
    const finish = (status, body, type = 'text/plain; charset=utf-8') => {
      const bytes = Buffer.from(body);
      res.writeHead(status, {...HEADERS, 'Content-Type': type, 'Content-Length': bytes.length,
        ...(status === 405 ? {Allow: 'GET, HEAD'} : {})});
      res.end(req.method === 'HEAD' ? undefined : bytes);
    };
    const allowedHosts = [`127.0.0.1:${boundPort}`, `localhost:${boundPort}`];
    if (!allowedHosts.includes(req.headers.host)) {counts.refusedHost++;finish(403, 'Local viewer only.');return;}
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      counts.refusedMethod++;req.resume();finish(405, 'This viewer accepts no submissions.');return;
    }
    const file = Object.hasOwn(FILES, req.url || '') ? FILES[req.url] : undefined;
    if (!file) {counts.notFound++;finish(404, 'Not found.');return;}
    let bytes;
    try {bytes = fs.readFileSync(path.join(__dirname, file[0]));}
    catch {finish(503, 'Local viewer files are incomplete.');return;}
    counts[req.method === 'HEAD' ? 'staticHead' : 'staticGet']++;
    res.writeHead(200, {...HEADERS, 'Content-Type': file[1], 'Content-Length': bytes.length});
    res.end(req.method === 'HEAD' ? undefined : bytes);
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.on('listening', () => {boundPort = server.address().port;});
  return {server, counts, origin: () => `http://127.0.0.1:${boundPort}`};
}
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('node tools/guild-qr-pilot/serve.cjs [--port 1024..65535]\nLoopback only; GET/HEAD static files; no uploads, storage or production connection.');
    process.exit(0);
  }
  let port = 0;
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--port' || !/^\d{4,5}$/.test(args[1]) ||
      Number(args[1]) < 1024 || Number(args[1]) > 65535) throw Error('Expected --port 1024..65535');
    port = Number(args[1]);
  }
  const app = createServer();
  app.server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({kind: 'local-only-guild-qr-pilot',
    origin: app.origin(), pid: process.pid, acceptsUploads: false, storesObservations: false})));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.server.close(() => {
    console.log(JSON.stringify({kind: 'local-viewer-stopped', counts: app.counts}));
  }));
}
module.exports = {createServer, FILES, HEADERS};
