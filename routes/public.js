'use strict';
const push = require('../lib/push');
const { query } = require('../lib/db');
const { ok, json, badRequest, notFound, forbidden, readBody } = require('../lib/http');
const { STATUS, isFinal } = require('../lib/status');
const { isExpired } = require('../lib/dates');
const { getSession } = require('./auth');
const I = require('../lib/itens');
const { rateLimit } = require('../lib/rateLimit');
const { sendAlteracaoEmail } = require('../lib/email');

// Motivos de recusa que o cliente pode escolher (vira dado para o prestador entender por que perde vendas)
const MOTIVOS_RECUSA = ['Achei caro', 'Fechei com outro', 'Desisti do serviço', 'O prazo não atende', 'Outro motivo'];

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


// Nota verificada: só clientes com orçamento aprovado avaliam (1 por orçamento)
function nomeCurto(n) { const p = String(n || '').trim().split(/\s+/).filter(Boolean); return p.length ? p[0] + (p.length > 1 ? ' ' + p[p.length - 1][0] + '.' : '') : 'Cliente'; }
async function resumoAvaliacoes(userId) {
  const r = await query('SELECT COUNT(*)::int AS n, AVG(nota)::float AS media FROM avaliacoes WHERE user_id = $1', [userId]);
  const d = await query(`SELECT nota, comentario, nome_cliente FROM avaliacoes WHERE user_id = $1 AND nota >= 4 AND comentario IS NOT NULL AND length(comentario) >= 8
                         ORDER BY created_at DESC LIMIT 3`, [userId]);
  const n = r.rows[0].n;
  return { nota: n ? Math.round(r.rows[0].media * 10) / 10 : null, avaliacoes: n,
           depoimentos: d.rows.map(x => ({ nome: nomeCurto(x.nome_cliente), texto: x.comentario, nota: x.nota })) };
}


// Itens do orçamento + miniatura (só quando o item da tabela do prestador tem foto; 1 vez por item)
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^(carregamento|desmontagem|montagem)\s*[—-]\s*/, '').replace(/\s+/g, ' ').trim();
async function itensComFoto(quote, token) {
  const itens = await I.lerItens(quote.id);
  const cats = (await query('SELECT id, nome FROM catalog_items WHERE user_id = $1 AND foto IS NOT NULL', [quote.user_id])).rows;
  const mapa = new Map(cats.map(c => [norm(c.nome), c.id]));
  const usados = new Set();
  return itens.map(({ id, descricao, qtd, unidade, preco_cents, tipo, escolhido }) => {
    const cid = mapa.get(norm(descricao));
    let foto = null;
    if (cid && !usados.has(cid)) { usados.add(cid); foto = `/api/public/item-foto/${token}/${cid}`; }
    return { id, descricao, qtd, unidade, preco_cents, tipo, escolhido, foto };
  });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const path = url.pathname;
  // IP real (Render atrás da Cloudflare): guardado só no registro da aprovação
  const ip = req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

  // GET /api/public/depoimentos — avaliações do VUNBY feitas por prestadores (só as aprovadas no painel)
  if (req.method === 'GET' && path === '/api/public/depoimentos') {
    const r = await query(`SELECT d.nota, d.texto, u.nome, u.nome_empresa, u.profissao, u.cidade
                             FROM vunby_depoimentos d JOIN users u ON u.id = d.user_id
                            WHERE d.aprovado ORDER BY d.updated_at DESC LIMIT 12`);
    const nomeCurto = n => { const p = String(n || '').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0].toUpperCase()}.` : (p[0] || ''); };
    const cap = t => String(t || '').replace(/\b\p{L}/gu, c => c.toUpperCase());
    res.setHeader('Cache-Control', 'public, max-age=300');
    return ok(res, r.rows.map(x => ({ nota: x.nota, texto: x.texto, nome: cap(nomeCurto(x.nome)),
      empresa: x.nome_empresa || '', profissao: x.profissao || '', cidade: x.cidade || '' })));
  }

  // GET /api/public/logo/:token.png — logo da empresa dona do orçamento (para o e-mail do cliente)
  const logoMatch = path.match(/^\/api\/public\/logo\/([A-Za-z0-9_-]+)\.(png|jpg)$/);
  if (req.method === 'GET' && logoMatch) {
    const r = await query('SELECT u.logo FROM quotes q JOIN users u ON u.id = q.user_id WHERE q.public_token = $1', [logoMatch[1]]);
    const l = r.rows[0] && r.rows[0].logo;
    const m = l && /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(l);
    if (!m) return notFound(res, 'Sem logo.');
    const buf = Buffer.from(m[2], 'base64');
    res.writeHead(200, { 'Content-Type': m[1], 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=86400' });
    res.end(buf); return true;
  }

  // GET /api/public/item-foto/:token/:catId — foto do item da tabela do prestador dono do orçamento
  const itfMatch = path.match(/^\/api\/public\/item-foto\/([A-Za-z0-9_-]+)\/(\d+)$/);
  if (req.method === 'GET' && itfMatch) {
    const r = await query('SELECT ci.foto FROM quotes q JOIN catalog_items ci ON ci.user_id = q.user_id WHERE q.public_token = $1 AND ci.id = $2', [itfMatch[1], itfMatch[2]]);
    const f = r.rows[0] && r.rows[0].foto;
    const mm = f && /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(f);
    if (!mm) return notFound(res, 'Foto não encontrada.');
    const buf = Buffer.from(mm[2], 'base64');
    res.writeHead(200, { 'Content-Type': mm[1], 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=3600' }); res.end(buf); return true;
  }

  // GET /api/public/foto/:token/:i — foto de trabalho da empresa (vitrine)
  const fotoMatch = path.match(/^\/api\/public\/foto\/([A-Za-z0-9_-]+)\/(\d)$/);
  if (req.method === 'GET' && fotoMatch) {
    const r = await query(`SELECT u.fotos_trabalhos->>($2::int) AS f FROM quotes q JOIN users u ON u.id = q.user_id WHERE q.public_token = $1`, [fotoMatch[1], Number(fotoMatch[2])]);
    const f = r.rows[0] && r.rows[0].f;
    const m = f && /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(f);
    if (!m) return notFound(res, 'Foto não encontrada.');
    const buf = Buffer.from(m[2], 'base64');
    res.writeHead(200, { 'Content-Type': m[1], 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=3600' });
    res.end(buf); return true;
  }

  // GET/POST /api/public/avaliar/:token — o cliente avalia o serviço (só orçamento aprovado, 1 vez)
  const avlMatch = path.match(/^\/api\/public\/avaliar\/([A-Za-z0-9_-]+)$/);
  if (avlMatch && (req.method === 'GET' || req.method === 'POST')) {
    const r = await query(`SELECT q.id, q.user_id, q.status, q.servico, c.nome AS cliente_nome, u.nome_empresa, u.nome AS prestador_nome, u.logo IS NOT NULL AS tem_logo
                           FROM quotes q JOIN clients c ON c.id = q.client_id JOIN users u ON u.id = q.user_id WHERE q.public_token = $1`, [avlMatch[1]]);
    const q = r.rows[0];
    if (!q) return notFound(res, 'Orçamento não encontrado.');
    const ja = await query('SELECT nota FROM avaliacoes WHERE quote_id = $1', [q.id]);
    const empresa = q.nome_empresa || q.prestador_nome;
    if (req.method === 'GET') {
      return ok(res, { empresa, servico: q.servico, cliente: String(q.cliente_nome || '').split(' ')[0], podeAvaliar: q.status === STATUS.APROVADO, jaAvaliou: !!ja.rows[0],
        logo: q.tem_logo ? `/api/public/logo/${avlMatch[1]}.png` : null });
    }
    if (q.status !== STATUS.APROVADO) return badRequest(res, 'Só dá para avaliar depois que o orçamento foi aprovado.');
    if (ja.rows[0]) return badRequest(res, 'Este serviço já foi avaliado. Obrigado!');
    if (await isOwner(req, q.user_id)) return forbidden(res, 'O próprio prestador não pode avaliar o próprio serviço.');
    if (!(await rateLimit('avaliar:' + ip, 5, 60 * 60_000))) return json(res, 429, { error: 'Muitas tentativas. Tente mais tarde.' });
    let b; try { b = await readBody(req, 5_000); } catch { return badRequest(res); }
    const nota = parseInt(b.nota, 10);
    if (!(nota >= 1 && nota <= 5)) return badRequest(res, 'Escolha de 1 a 5 estrelas.');
    const com = String(b.comentario || '').trim().replace(/\s+/g, ' ').slice(0, 300) || null;
    const ins = await query('INSERT INTO avaliacoes (quote_id, user_id, nota, comentario, nome_cliente, ip) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (quote_id) DO NOTHING RETURNING id',
      [q.id, q.user_id, nota, com, q.cliente_nome, ip.slice(0, 64)]);
    if (ins.rows[0]) {
      try { push.notificarSilencioso(q.user_id, { titulo: `${'★'.repeat(nota)} Nova avaliação`, texto: `${String(q.cliente_nome || 'Cliente').split(' ')[0]} avaliou: ${q.servico}`, url: '/conta.html#vitrine', tag: 'avaliacao' }); } catch {}
    }
    return ok(res, { obrigado: true });
  }

  // GET /api/public/quote/:token — dados públicos do orçamento
  const viewMatch = path.match(/^\/api\/public\/quote\/([A-Za-z0-9_-]+)$/);
  if (req.method === 'GET' && viewMatch) {
    const token = viewMatch[1];
    const qRes = await query(
      `SELECT q.*, c.nome as cliente_nome, u.nome as prestador_nome, u.nome_empresa, u.logo, u.profissao, u.cidade, u.whatsapp, u.documento, u.instagram,
              u.google_nota, u.google_avaliacoes, u.diferenciais, u.depoimentos, jsonb_array_length(COALESCE(u.fotos_trabalhos,'[]'::jsonb)) AS n_fotos
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
      const v = await query("UPDATE quotes SET status = $1, viewed_at = NOW() WHERE id = $2 AND status = $3 RETURNING id",
        [STATUS.VISUALIZADO, quote.id, STATUS.ENVIADO]);
      if (v.rows[0]) push.avisarOrcamentoSilencioso(quote.id, 'visualizado');
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
      vitrine: {
        ...(await resumoAvaliacoes(quote.user_id)),
        diferenciais: quote.diferenciais || [],
        fotos: Array.from({ length: Number(quote.n_fotos) || 0 }, (_, i) => `/api/public/foto/${token}/${i}`),
      },
      pacotes: pacs.rows,
      usaItens: !!quote.usa_itens,
      itens: quote.usa_itens ? await itensComFoto(quote, token) : [],
      descontoCents: Number(quote.desconto_cents) || 0,
      taxaCents: Number(quote.taxa_cents) || 0,
      taxaNome: quote.taxa_nome || '',
      sinalPct: Number(quote.sinal_pct) || 0,
      condicoes: quote.condicoes || '',
      versao: Number(quote.versao) || 1,
      aprovacao: quote.aprovacao || null,
      alteracao: quote.alteracao_texto ? { texto: quote.alteracao_texto, em: quote.alteracao_em, pendente: !quote.alteracao_resolvida } : null,
      motivosRecusa: MOTIVOS_RECUSA,
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
    const motivo = newStatus === STATUS.RECUSADO && MOTIVOS_RECUSA.includes(body.motivo) ? body.motivo : null;
    if (motivo) await query('UPDATE quotes SET recusa_motivo = $2 WHERE id = $1', [quote.id, motivo]);
    const upd = await query(
      `UPDATE quotes SET status = $1, resposta_cliente = $2, responded_at = NOW(),
         aprovacao = COALESCE($5::jsonb, aprovacao), valor = COALESCE($6, valor)
       WHERE id = $3 AND status <> ALL($4) RETURNING id`,
      [newStatus, observacao || null, quote.id, [STATUS.APROVADO, STATUS.RECUSADO], aprovacao ? JSON.stringify(aprovacao) : null, novoValor]);
    if (!upd.rows[0]) return badRequest(res, 'Este orçamento já foi finalizado.');
    push.avisarOrcamentoSilencioso(quote.id, newStatus === STATUS.APROVADO ? 'aprovado' : 'recusado');

    return ok(res, { message: newStatus === STATUS.APROVADO ? 'Orçamento aprovado!' : 'Resposta registrada.' });
  }

  // POST /api/public/quote/:token/alteracao — cliente pede mudança no orçamento
  const altMatch = path.match(/^\/api\/public\/quote\/([A-Za-z0-9_-]+)\/alteracao$/);
  if (req.method === 'POST' && altMatch) {
    const token = altMatch[1];
    if (!(await rateLimit(`alteracao:${token}`, 5, 60 * 60_000))) return badRequest(res, 'Muitos pedidos seguidos. Aguarde um pouco ou fale pelo WhatsApp.');
    if (!(await rateLimit(`alteracao-ip:${ip}`, 15, 60 * 60_000))) return badRequest(res, 'Muitos pedidos seguidos. Aguarde um pouco.');
    let body = {}; try { body = await readBody(req); } catch { return badRequest(res); }
    const texto = String(body.texto || '').trim();
    if (texto.length < 3) return badRequest(res, 'Escreva o que você gostaria de mudar.');
    if (texto.length > 1000) return badRequest(res, 'Texto muito longo (máximo 1000 caracteres).');
    const r = await query(`SELECT q.id, q.status, q.validade, q.servico, c.nome AS cliente_nome, u.email AS prestador_email
      FROM quotes q JOIN clients c ON c.id = q.client_id JOIN users u ON u.id = q.user_id WHERE q.public_token = $1`, [token]);
    const quote = r.rows[0];
    if (!quote) return notFound(res, 'Orçamento não encontrado.');
    if (isFinal(quote.status)) return badRequest(res, 'Este orçamento já foi finalizado.');
    if (isExpired(quote.validade)) return badRequest(res, 'Este orçamento está expirado.');
    await query('UPDATE quotes SET alteracao_texto = $2, alteracao_em = NOW(), alteracao_resolvida = false WHERE id = $1', [quote.id, texto]);
    sendAlteracaoEmail(quote.prestador_email, { cliente: quote.cliente_nome, servico: quote.servico, texto, quoteId: quote.id }).catch(() => {});
    return ok(res, { message: 'Pedido de alteração enviado.' });
  }

  // POST /api/public/quote/:token/view-confirmed — frontend confirma visualização real (JS carregou)
  const viewConfirm = path.match(/^\/api\/public\/quote\/([A-Za-z0-9_-]+)\/view-confirmed$/);
  if (req.method === 'POST' && viewConfirm) {
    const token = viewConfirm[1];
    const qRes = await query('SELECT id, status, user_id FROM quotes WHERE public_token = $1', [token]);
    if (!qRes.rows[0]) return notFound(res);
    const quote = qRes.rows[0];
    if (quote.status === STATUS.ENVIADO && !(await isOwner(req, quote.user_id))) {
      const v = await query("UPDATE quotes SET status = $1, viewed_at = NOW() WHERE id = $2 AND status = $3 RETURNING id",
        [STATUS.VISUALIZADO, quote.id, STATUS.ENVIADO]);
      if (v.rows[0]) push.avisarOrcamentoSilencioso(quote.id, 'visualizado');
    }
    return ok(res, { ok: true });
  }

  return null;
}

module.exports = { handle };
