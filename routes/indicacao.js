'use strict';
const crypto = require('crypto');
// Indique e ganhe: /api/indicacao (meu link e números) e /api/ref/visita (contagem de cliques no link, público)
const { query } = require('../lib/db');
const { requireAuth } = require('./auth');
const { json, ok, badRequest, readBody } = require('../lib/http');
const { rateLimit } = require('../lib/rateLimit');
const { BASE_URL } = require('../lib/config');
const IND = require('../lib/indicacao');

function ipDe(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

let cacheVagas = null;
let vistosDia = null, vistos = new Set();   // visitantes únicos do dia (só em memória)

async function handle(req, res) {
  const path = new URL(req.url, 'http://x').pathname;

  // POST /api/ref/visita { codigo } — alguém abriu o site por um link de indicação
  if (req.method === 'POST' && path === '/api/ref/visita') {
    let b; try { b = await readBody(req, 1_000); } catch { return badRequest(res); }
    const r = await IND.resolver(b.codigo).catch(() => null);
    if (!r) return ok(res, { valido: false });
    if (await rateLimit('refvis:' + ipDe(req) + ':' + r.codigo, 1, 6 * 60 * 60_000)) {
      await query('INSERT INTO ref_visitas (codigo) VALUES ($1)', [r.codigo]);
    }
    return ok(res, { valido: true, bonusDias: IND.BONUS_INDICADO_DIAS });
  }

  // POST /api/v { p: 'landing'|'cadastro', o: origem } — conta visitas do site (sem cookie, sem guardar IP)
  if (req.method === 'POST' && path === '/api/v') {
    let b; try { b = await readBody(req, 1_000); } catch { return ok(res, {}); }
    const pagina = ['landing', 'cadastro'].includes(b.p) ? b.p : null;
    const ua = String(req.headers['user-agent'] || '');
    if (!pagina || /bot|crawl|spider|slurp|preview|headless|lighthouse/i.test(ua)) return ok(res, {});
    const origem = String(b.o || 'direto').toLowerCase().replace(/[^a-z0-9:.-]/g, '').slice(0, 40) || 'direto';
    const dia = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);   // dia no horário de Brasília
    const chave = crypto.createHash('sha256').update(dia + '|' + pagina + '|' + ipDe(req) + '|' + ua).digest('hex').slice(0, 24);
    if (vistosDia !== dia) { vistosDia = dia; vistos = new Set(); }
    const novo = !vistos.has(chave);
    if (novo) { vistos.add(chave); if (vistos.size > 200_000) vistos = new Set(); }
    if (await rateLimit('v:' + chave, 30, 60 * 60_000)) {
      await query(
        `INSERT INTO site_visitas (dia, pagina, origem, visitas, unicos) VALUES ($1,$2,$3,1,$4)
         ON CONFLICT (dia, pagina, origem) DO UPDATE SET visitas = site_visitas.visitas + 1, unicos = site_visitas.unicos + EXCLUDED.unicos`,
        [dia, pagina, origem, novo ? 1 : 0]).catch(() => {});
    }
    return ok(res, {});
  }

  // GET /api/vagas — vagas de fundador que ainda restam (público, para o site)
  if (req.method === 'GET' && path === '/api/vagas') {
    const B = require('../lib/billing');
    const agora = Date.now();
    if (!cacheVagas || agora - cacheVagas.em > 60_000) cacheVagas = { em: agora, restam: await B.vagasFundadorRestantes() };
    return ok(res, { restam: cacheVagas.restam, total: B.VAGAS_FUNDADOR });
  }

  if (!path.startsWith('/api/indicacao')) return null;
  const user = await requireAuth(req, res);
  if (!user) return true;

  // GET /api/indicacao — link e resultados de quem está indicando
  if (req.method === 'GET' && path === '/api/indicacao') {
    const codigo = await IND.codigoDoUsuario(user.id);
    const n = await query(
      `SELECT COUNT(*)::int AS cadastros, COUNT(*) FILTER (WHERE indicacao_premiada)::int AS pagantes
         FROM users WHERE indicado_por = $1`, [user.id]);
    const base = String(BASE_URL || 'https://vunby.com.br').replace(/\/$/, '');
    return ok(res, {
      codigo, link: base + '/?ref=' + codigo,
      cadastros: n.rows[0].cadastros, pagantes: n.rows[0].pagantes, mesesGanhos: n.rows[0].pagantes,
      bonusDias: IND.BONUS_INDICADO_DIAS,
    });
  }
  return json(res, 404, { error: 'Rota não encontrada' });
}

module.exports = { handle };
