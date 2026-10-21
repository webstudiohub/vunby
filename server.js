'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { PORT, NODE_ENV, BASE_URL } = require('./lib/config');

const authRoute = require('./routes/auth');
const clientsRoute = require('./routes/clients');
const quotesRoute = require('./routes/quotes');
const followupsRoute = require('./routes/followups');
const publicRoute = require('./routes/public');
const radarRoute = require('./routes/radar');
const dashboardRoute = require('./routes/dashboard');
const pdfRoute = require('./routes/pdf');
const billingRoute = require('./routes/billing');
const catalogRoute = require('./routes/catalog');
const pushRoute = require('./routes/push');
const adminRoute = require('./routes/admin');
const indicacaoRoute = require('./routes/indicacao');
const { sendEmail } = require('./lib/email');

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
  '.txt':   'text/plain; charset=utf-8',
  '.xml':   'application/xml; charset=utf-8',
  '.mp4':   'video/mp4',
  '.jpg':   'image/jpeg',
  '.webp':  'image/webp',
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
    // Endereço sem extensão (ex.: /redefinir-senha) → página .html correspondente
    if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) filePath += '.html';
  }

  // Segurança: impede path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  // Vídeo: responde por partes (Range), exigido pelo Safari do iPhone
  if (path.extname(filePath).toLowerCase() === '.mp4') {
    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
      const total = st.size;
      const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
      const base = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600' };
      if (!m) { res.writeHead(200, { ...base, 'Content-Length': total }); fs.createReadStream(filePath).pipe(res); return; }
      let ini = m[1] === '' ? Math.max(0, total - Number(m[2] || 0)) : Number(m[1]);
      let fim = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), total - 1) : total - 1;
      if (ini > fim || ini >= total) { res.writeHead(416, { 'Content-Range': `bytes */${total}` }); res.end(); return; }
      res.writeHead(206, { ...base, 'Content-Range': `bytes ${ini}-${fim}/${total}`, 'Content-Length': fim - ini + 1 });
      fs.createReadStream(filePath, { start: ini, end: fim }).pipe(res);
    });
    return;
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
      'Cache-Control': (ext === '.html' || ext === '.js' || ext === '.css') ? 'no-cache' : 'public, max-age=3600',
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
  // Cabeçalhos de segurança: impede abrir o VUNBY dentro de outro site, impede o navegador de
  // "adivinhar" tipos de arquivo e não vaza o link do orçamento (com o token) para outros sites
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');   // só o domínio (sem o caminho) vai para outros sites; o botão do Google precisa disso
  if (NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000');

  try {
    const urlPath = new URL(req.url, 'http://x').pathname;

    // Endereço antigo (*.onrender.com) leva para o domínio oficial (BASE_URL). Só páginas (GET/HEAD);
    // a API continua respondendo no endereço antigo para não quebrar webhooks já configurados.
    const host = String(req.headers.host || '').toLowerCase();
    if (NODE_ENV === 'production' && host.endsWith('.onrender.com') && !urlPath.startsWith('/api/')
        && (req.method === 'GET' || req.method === 'HEAD')) {
      let destino = null;
      try { destino = new URL(BASE_URL); } catch {}
      if (destino && destino.host !== host && !destino.host.endsWith('.onrender.com')) {
        res.writeHead(301, { Location: destino.origin + req.url });
        res.end();
        return;
      }
    }

    if (urlPath.startsWith('/api/')) {
      // Rotas da API
      let handled =
        await authRoute.handle(req, res) ??
        await clientsRoute.handle(req, res) ??
        await quotesRoute.handle(req, res) ??
        await followupsRoute.handle(req, res) ??
        await publicRoute.handle(req, res) ??
        await radarRoute.handle(req, res) ??
        await dashboardRoute.handle(req, res) ??
        await billingRoute.handle(req, res) ??
        await pushRoute.handle(req, res) ??
        await adminRoute.handle(req, res) ??
        await indicacaoRoute.handle(req, res) ??
        await catalogRoute.handle(req, res) ??
        await pdfRoute.handle(req, res);

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

// E-mails automáticos (fim do teste grátis e pesquisa de opinião): 1 min após subir e depois a cada hora
if (process.env.DISABLE_JOBS !== '1') {
  const tarefas = () => billingRoute.rodarTarefas(sendEmail).catch(e => console.error('tarefas:', e.message));
  setTimeout(tarefas, 60_000).unref();
  setInterval(tarefas, 3600_000).unref();
}
