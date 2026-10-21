'use strict';
// Notificações push (Web Push, RFC 8030 + VAPID RFC 8292 + criptografia RFC 8291), sem dependências:
// usa só o módulo "crypto" do Node. Chaves em VAPID_PUBLIC / VAPID_PRIVATE (base64url, formato cru).
const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');
const { query } = require('./db');

const b64u = (b) => Buffer.from(b).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:adiminvunby@gmail.com';

function configurado() { return !!(process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE); }
function chavePublica() { return process.env.VAPID_PUBLIC || null; }

// Gera um par de chaves VAPID novo (usado uma vez só, na configuração)
function gerarChaves() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });
  return {
    publica: b64u(Buffer.concat([Buffer.from([4]), fromB64u(pub.x), fromB64u(pub.y)])),
    privada: priv.d,
  };
}

function chavePrivadaVapid() {
  const pub = fromB64u(process.env.VAPID_PUBLIC);
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: process.env.VAPID_PRIVATE, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
}

function jwtVapid(audience) {
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: chavePrivadaVapid(), dsaEncoding: 'ieee-p1363' });
  return head + '.' + body + '.' + b64u(sig);
}

// Criptografia do conteúdo (aes128gcm). Devolve o corpo pronto para enviar.
function criptografar(payload, p256dhB64, authB64, opts) {
  const uaPublic = fromB64u(p256dhB64);
  const authSecret = fromB64u(authB64);
  const ecdh = crypto.createECDH('prime256v1');
  if (opts && opts.privadaEfemera) ecdh.setPrivateKey(opts.privadaEfemera); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(uaPublic);
  const salt = (opts && opts.salt) || crypto.randomBytes(16);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const data = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, data]);
}

function enviarUma(insc, mensagem) {
  return new Promise((resolve) => {
    try {
      const u = new URL(insc.endpoint);
      const corpo = criptografar(JSON.stringify(mensagem), insc.p256dh, insc.auth);
      const req = https.request({
        hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'POST', timeout: 10000,
        headers: {
          'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', 'Content-Length': corpo.length,
          TTL: String(24 * 3600), Urgency: 'normal',
          Authorization: `vapid t=${jwtVapid(u.protocol + '//' + u.host)}, k=${process.env.VAPID_PUBLIC}`,
        },
      }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('timeout', () => { req.destroy(); resolve(0); });
      req.on('error', () => resolve(0));
      req.write(corpo);
      req.end();
    } catch (e) { resolve(0); }
  });
}

// Envia para todos os aparelhos do usuário. mensagem = { titulo, texto, url }
async function notificar(userId, mensagem) {
  if (!configurado()) return { enviados: 0 };
  const r = await query('SELECT id, endpoint, p256dh, auth FROM push_inscricoes WHERE user_id = $1', [userId]);
  let enviados = 0;
  for (const insc of r.rows) {
    const st = await enviarUma(insc, mensagem);
    if (st >= 200 && st < 300) {
      enviados++;
      await query('UPDATE push_inscricoes SET ultimo_ok = NOW() WHERE id = $1', [insc.id]).catch(() => {});
    } else if (st === 404 || st === 410) {
      await query('DELETE FROM push_inscricoes WHERE id = $1', [insc.id]).catch(() => {}); // aparelho desinstalou/negou
    } else {
      console.error('push falhou', st, new URL(insc.endpoint).hostname);
    }
  }
  return { enviados };
}

// Atalho que nunca derruba o fluxo principal
function notificarSilencioso(userId, mensagem) {
  notificar(userId, mensagem).catch(e => console.error('push:', e.message));
}

// Avisos do orçamento para o prestador (visualizou / aprovou / recusou)
async function avisarOrcamento(quoteId, tipo) {
  if (!configurado()) return;
  const r = await query(`SELECT q.user_id, q.servico, c.nome AS cliente FROM quotes q JOIN clients c ON c.id = q.client_id WHERE q.id = $1`, [quoteId]);
  const q = r.rows[0];
  if (!q) return;
  const nome = String(q.cliente || 'Seu cliente').split(' ')[0];
  const m = {
    visualizado: { titulo: `${nome} abriu seu orçamento`, texto: 'Chame agora no WhatsApp: quem responde primeiro costuma fechar.' },
    aprovado: { titulo: `${nome} aprovou seu orçamento!`, texto: `${q.servico || 'Orçamento'}: parabéns, venda fechada.` },
    recusado: { titulo: `${nome} recusou o orçamento`, texto: 'Veja o motivo e tente uma nova proposta.' },
  }[tipo];
  if (!m) return;
  await notificar(q.user_id, { ...m, url: '/orcamento-detalhe.html?id=' + quoteId, tag: 'orc-' + quoteId });
}
function avisarOrcamentoSilencioso(quoteId, tipo) { avisarOrcamento(quoteId, tipo).catch(e => console.error('push orc:', e.message)); }

module.exports = { configurado, chavePublica, gerarChaves, notificar, notificarSilencioso, criptografar, jwtVapid, avisarOrcamento, avisarOrcamentoSilencioso };
