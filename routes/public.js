'use strict';
const { query } = require('../lib/db');
const { ok, badRequest, notFound, forbidden, readBody } = require('../lib/http');
const { STATUS, isFinal } = require('../lib/status');
const { isExpired } = require('../lib/dates');

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
      `SELECT q.*, c.nome as cliente_nome, u.nome as prestador_nome, u.nome_empresa, u.logo
       FROM quotes q
       JOIN clients c ON c.id = q.client_id
       JOIN users u ON u.id = q.user_id
       WHERE q.public_token = $1`,
      [token]
    );
    if (!qRes.rows[0]) return notFound(res, 'Orçamento não encontrado.');
    const quote = qRes.rows[0];
    const pacs = await query('SELECT id, nome, conteudo, preco, destaque, escolhido FROM quote_packages WHERE quote_id = $1 ORDER BY id', [quote.id]);
    const expirado = isExpired(quote.validade);

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
      prestador: { nome: quote.nome_empresa || quote.prestador_nome, logo: quote.logo || null },
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
    if (isExpired(quote.validade)) return badRequest(res, 'Este orçamento está expirado.');

    const newStatus = action === 'accept' ? STATUS.APROVADO : STATUS.RECUSADO;
    let body = {}; try { body = await readBody(req); } catch {}

    // Escolha do pacote: se o orçamento tem opções, o cliente escolhe uma ao aprovar
    let pacoteEscolhido = null;
    if (newStatus === STATUS.APROVADO) {
      const pacs = await query('SELECT id, nome FROM quote_packages WHERE quote_id = $1', [quote.id]);
      if (pacs.rows.length > 0) {
        const pid = parseInt(body.pacoteId, 10);
        // ids BIGINT chegam do pg como texto: compara como string
        pacoteEscolhido = pacs.rows.find(p => String(p.id) === String(pid)) || (pacs.rows.length === 1 ? pacs.rows[0] : null);
        if (!pacoteEscolhido) return badRequest(res, 'Escolha uma das opções antes de aprovar.');
        await query('UPDATE quote_packages SET escolhido = (id = $2) WHERE quote_id = $1', [quote.id, pacoteEscolhido.id]);
      }
    }

    const observacao = typeof body.observacao === 'string' ? body.observacao.slice(0, 1000) : null;
    await query('UPDATE quotes SET status = $1, resposta_cliente = $2, responded_at = NOW() WHERE id = $3',
      [newStatus, observacao || null, quote.id]);

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
