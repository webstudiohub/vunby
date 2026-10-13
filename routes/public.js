'use strict';
const { query } = require('../lib/db');
const { ok, json, badRequest, notFound, forbidden, readBody } = require('../lib/http');
const { STATUS, isFinal } = require('../lib/status');
const { isExpired } = require('../lib/dates');
const { getSession } = require('./auth');
const I = require('../lib/itens');

// O próprio prestador abrindo o link do orçamento (ex.: "Ver página do cliente") não conta como visualização
async function isOwner(req, quoteUserId) {
  try { const u = await getSession(req); return !!u && String(u.id) === String(quoteUserId); }
  catch { return false; }
}

// Heurística anti-bot: exige user-agent real e tempo mínimo
const BOT_UA = /bot|crawl|spider|slurp|teoma|ia_archiver|facebookexternalhit|whatsapp|telegram|discord|slack/i;

function isLikelyBot(req) {
  const ua = req.headers['user-agent'] || '';
  return BOT_UA.test(ua);
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  // IP real (Render atrás da Cloudflare): guardado só no registro da aprovação
  const ip = req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

  // GET /api/public/quote/:token — dados públicos do orçamento
  const viewMatch = path.match(/^\/api\/public\/quote\/([A-Za-z0-9_-]+)$/);
  if (req.method === 'GET' && viewMatch) {
    const token = viewMatch[1];
    const qRes = await query(
      `SELECT q.*, c.nome as cliente_nome, u.nome as prestador_nome, u.nome_empresa, u.logo, u.profissao, u.cidade, u.whatsapp, u.documento, u.instagram
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
    if (!isLikelyBot(req) && quote.status === STATUS.ENVIADO && !(await isOwner(req, quote.user_id))) {
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
      prestador: {
        nome: quote.nome_empresa || quote.prestador_nome, logo: quote.logo || null,
        profissao: quote.profissao || '', cidade: quote.cidade || '',
        whatsapp: (quote.whatsapp || '').replace(/\D/g, ''), documento: quote.documento || '', instagram: quote.instagram || '',
      },
      pacotes: pacs.rows,
      usaItens: !!quote.usa_itens,
      itens: quote.usa_itens ? (await I.lerItens(quote.id)).map(({ id, descricao, qtd, unidade, preco_cents, tipo, escolhido }) => ({ id, descricao, qtd, unidade, preco_cents, tipo, escolhido })) : [],
      descontoCents: Number(quote.desconto_cents) || 0,
      taxaCents: Number(quote.taxa_cents) || 0,
      taxaNome: quote.taxa_nome || '',
      sinalPct: Number(quote.sinal_pct) || 0,
      condicoes: quote.condicoes || '',
      versao: Number(quote.versao) || 1,
      aprovacao: quote.aprovacao || null,
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

    // Orçamento por itens: o prestador pode ter editado depois que o cliente abriu a página
    if (quote.usa_itens && body.versao !== undefined && String(body.versao) !== String(quote.versao || 1)) {
      return json(res, 409, { error: 'Este orçamento foi atualizado agora há pouco. A página vai recarregar com a versão nova.', recarregar: true });
    }

    // Aprovação de orçamento por itens: o SERVIDOR recalcula o total com as escolhas do cliente e congela tudo
    let aprovacao = null, novoValor = null;
    if (newStatus === STATUS.APROVADO && quote.usa_itens) {
      const itens = await I.lerItens(quote.id);
      const validos = new Set(itens.filter(i => i.tipo !== 'incluido').map(i => i.id));
      const escolhidos = new Set((Array.isArray(body.escolhidos) ? body.escolhidos : []).map(String).filter(x => validos.has(x)));
      const pacPreco = pacoteEscolhido ? (await query('SELECT preco FROM quote_packages WHERE id = $1', [pacoteEscolhido.id])).rows[0].preco : null;
      const calc = I.calcular(I.paraCalculo(quote, itens, pacPreco), escolhidos);
      const usados = itens.filter(i => i.tipo === 'incluido' || escolhidos.has(i.id));
      aprovacao = {
        versao: Number(quote.versao) || 1,
        em: new Date().toISOString(),
        itens: usados.map(i => ({ descricao: i.descricao, qtd: i.qtd, unidade: i.unidade, preco_cents: i.preco_cents, tipo: i.tipo })),
        naoEscolhidos: itens.filter(i => i.tipo !== 'incluido' && !escolhidos.has(i.id)).map(i => i.descricao),
        pacote: pacoteEscolhido ? pacoteEscolhido.nome : null,
        resumo: calc, total: calc.total, sinal: calc.sinal,
        sinal_pct: Number(quote.sinal_pct) || 0,
        ip, ua: String(req.headers['user-agent'] || '').slice(0, 300),
      };
      novoValor = calc.total / 100;
      await query('UPDATE quote_items SET escolhido = (tipo = \'incluido\' OR id = ANY($2::bigint[])) WHERE quote_id = $1', [quote.id, [...escolhidos]]);
    }

    const observacao = typeof body.observacao === 'string' ? body.observacao.slice(0, 1000) : null;
    const upd = await query(
      `UPDATE quotes SET status = $1, resposta_cliente = $2, responded_at = NOW(),
         aprovacao = COALESCE($5::jsonb, aprovacao), valor = COALESCE($6, valor)
       WHERE id = $3 AND status <> ALL($4) RETURNING id`,
      [newStatus, observacao || null, quote.id, [STATUS.APROVADO, STATUS.RECUSADO], aprovacao ? JSON.stringify(aprovacao) : null, novoValor]);
    if (!upd.rows[0]) return badRequest(res, 'Este orçamento já foi finalizado.');

    return ok(res, { message: newStatus === STATUS.APROVADO ? 'Orçamento aprovado!' : 'Resposta registrada.' });
  }

  // POST /api/public/quote/:token/view-confirmed — frontend confirma visualização real (JS carregou)
  const viewConfirm = path.match(/^\/api\/public\/quote\/([A-Za-z0-9_-]+)\/view-confirmed$/);
  if (req.method === 'POST' && viewConfirm) {
    const token = viewConfirm[1];
    const qRes = await query('SELECT id, status, user_id FROM quotes WHERE public_token = $1', [token]);
    if (!qRes.rows[0]) return notFound(res);
    const quote = qRes.rows[0];
    if (quote.status === STATUS.ENVIADO && !(await isOwner(req, quote.user_id))) {
      await query("UPDATE quotes SET status = $1, viewed_at = NOW() WHERE id = $2 AND status = $3",
        [STATUS.VISUALIZADO, quote.id, STATUS.ENVIADO]);
    }
    return ok(res, { ok: true });
  }

  return null;
}

module.exports = { handle };
