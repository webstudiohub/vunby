'use strict';
const { query } = require('../lib/db');
const { ok, badRequest, notFound, forbidden, readBody } = require('../lib/http');
const { STATUS, isFinal } = require('../lib/status');

// Heurística anti-bot: exige user-agent real e tempo mínimo
const BOT_UA = /bot|crawl|spider|slurp|teoma|ia_archiver|facebookexternalhit|whatsapp|telegram|discord|slack/i;

function isLikelyBot(req) {
  const ua = req.headers['user-agent'] || '';
  return BOT_UA.test(ua);
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;

  // GET /api/public/quote/:token — dados públicos do orçamento
  const viewMatch = path.match(/^\/api\/public\/quote\/([A-Za-z0-9_-]+)$/);
  if (req.method === 'GET' && viewMatch) {
    const token = viewMatch[1];
    const qRes = await query(
      `SELECT q.*, c.nome as cliente_nome FROM quotes q
       JOIN clients c ON c.id = q.client_id
       WHERE q.public_token = $1`,
      [token]
    );
    if (!qRes.rows[0]) return notFound(res, 'Orçamento não encontrado.');
    const quote = qRes.rows[0];
    const pacs = await query('SELECT nome, conteudo, preco, destaque FROM quote_packages WHERE quote_id = $1', [quote.id]);
    const expirado = quote.validade ? new Date(quote.validade) < new Date() : false;

    // Registrar visualização (heurística anti-bot)
    if (!isLikelyBot(req) && quote.status === STATUS.ENVIADO) {
      // Marca como "Visualizado" na primeira view real
      await query("UPDATE quotes SET status = $1, viewed_at = NOW() WHERE id = $2 AND status = $3",
        [STATUS.VISUALIZADO, quote.id, STATUS.ENVIADO]);
    }

    return ok(res, {
      id: quote.id,
      servico: quote.servico,
      valor: quote.valor,
      validade: quote.validade,
      observacoes: quote.observacoes,
      status: quote.status,
      expirado,
      clienteNome: quote.cliente_nome,
      pacotes: pacs.rows,
    });
  }

  // POST /api/public/quote/:token/accept
  const acceptMatch = path.match(/^\/api\/public\/quote\/([A-Za-z0-9_-]+)\/(accept|reject)$/);
  if (req.method === 'POST' && acceptMatch) {
    const token = acceptMatch[1];
    const action = acceptMatch[2];
    const qRes = await query('SELECT * FROM quotes WHERE public_token = $1', [token]);
    if (!qRes.rows[0]) return notFound(res, 'Orçamento não encontrado.');
    const quote = qRes.rows[0];

    if (isFinal(quote.status)) return badRequest(res, 'Este orçamento já foi finalizado.');
    if (quote.validade && new Date(quote.validade) < new Date()) return badRequest(res, 'Este orçamento está expirado.');

    const newStatus = action === 'accept' ? STATUS.APROVADO : STATUS.RECUSADO;
    let body = {}; try { body = await readBody(req); } catch {}

    await query('UPDATE quotes SET status = $1, resposta_cliente = $2, responded_at = NOW() WHERE id = $3',
      [newStatus, body.observacao || null, quote.id]);

    return ok(res, { message: newStatus === STATUS.APROVADO ? 'Orçamento aprovado!' : 'Resposta registrada.' });
  }

  // POST /api/public/quote/:token/view-confirmed — frontend confirma visualização real (JS carregou)
  const viewConfirm = path.match(/^\/api\/public\/quote\/([A-Za-z0-9_-]+)\/view-confirmed$/);
  if (req.method === 'POST' && viewConfirm) {
    const token = viewConfirm[1];
    const qRes = await query('SELECT id, status FROM quotes WHERE public_token = $1', [token]);
    if (!qRes.rows[0]) return notFound(res);
    const quote = qRes.rows[0];
    if (quote.status === STATUS.ENVIADO) {
      await query("UPDATE quotes SET status = $1, viewed_at = NOW() WHERE id = $2 AND status = $3",
        [STATUS.VISUALIZADO, quote.id, STATUS.ENVIADO]);
    }
    return ok(res, { ok: true });
  }

  return null;
}

module.exports = { handle };
