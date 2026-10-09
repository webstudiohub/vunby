'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { PORT, NODE_ENV } = require('./lib/config');

const authRoute = require('./routes/auth');
const clientsRoute = require('./routes/clients');
const quotesRoute = require('./routes/quotes');
const followupsRoute = require('./routes/followups');
const publicRoute = require('./routes/public');
const radarRoute = require('./routes/radar');
const dashboardRoute = require('./routes/dashboard');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.svg':  'image/svg+xml',
  '.woff2': 'font/woff2',
};

const PUBLIC_DIR = path.join(__dirname, 'public');

function serveStatic(req, res) {
  const urlPath = new URL(req.url, 'http://x').pathname;
  let filePath;

  if (urlPath === '/') {
    filePath = path.join(PUBLIC_DIR, 'landing.html');
  } else if (urlPath === '/entrar') {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  } else if (urlPath === '/cadastro') {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  } else {
    filePath = path.join(PUBLIC_DIR, urlPath.replace(/^\//, ''));
  }

  // Segurança: impede path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS básico para dev
  if (NODE_ENV !== 'production') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    const urlPath = new URL(req.url, 'http://x').pathname;

    if (urlPath.startsWith('/api/')) {
      // Rotas da API
      let handled =
        await authRoute.handle(req, res) ??
        await clientsRoute.handle(req, res) ??
        await quotesRoute.handle(req, res) ??
        await followupsRoute.handle(req, res) ??
        await publicRoute.handle(req, res) ??
        await radarRoute.handle(req, res) ??
        await dashboardRoute.handle(req, res);

      if (handled === null) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Rota não encontrada' }));
      }
    } else {
      serveStatic(req, res);
    }
  } catch (err) {
    console.error('Unhandled error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Erro interno do servidor' }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`VUNBY rodando na porta ${PORT} [${NODE_ENV}]`);
});
