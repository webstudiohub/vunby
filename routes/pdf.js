'use strict';
const { requireAuth } = require('./auth');
const { query } = require('../lib/db');
const { notFound } = require('../lib/http');
const { BASE_URL } = require('../lib/config');

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

  // GET /api/quotes/:id/pdf
  const match = path.match(/^\/api\/quotes\/(\d+)\/pdf$/);
  if (req.method !== 'GET' || !match) return null;

  const user = await requireAuth(req, res);
  if (!user) return true;

  const id = parseInt(match[1], 10);
  const r = await query(
    `SELECT q.*, c.nome as cliente_nome FROM quotes q
     JOIN clients c ON c.id = q.client_id
     WHERE q.id = $1 AND q.user_id = $2`,
    [id, user.id]
  );
  const quote = r.rows[0];
  if (!quote) return notFound(res, 'Orçamento não encontrado.');

  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Puppeteer não instalado. Execute: npm install puppeteer' }));
    return true;
  }

  const pageUrl = `${BASE_URL}/orcamento.html?token=${encodeURIComponent(quote.public_token)}`;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.goto(pageUrl, { waitUntil: 'networkidle0', timeout: 15000 });

    // Aguarda o conteúdo renderizar
    await page.waitForSelector('#content .quote-card', { timeout: 10000 }).catch(() => {});

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
    });

    const filename = `orcamento-${id}.pdf`;
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  } catch (err) {
    console.error('PDF error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Erro ao gerar PDF.' }));
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  return true;
}

module.exports = { handle };
