'use strict';
// "Entrar com Google": confere o token (ID token) que o Google entrega ao navegador.
// Sem bibliotecas: baixa as chaves públicas do Google e verifica a assinatura RS256.
const https = require('https');
const crypto = require('crypto');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
let chaves = null, chavesAte = 0;

function baixarChaves() {
  return new Promise((ok, erro) => {
    https.get('https://www.googleapis.com/oauth2/v3/certs', (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          const m = /max-age=(\d+)/.exec(String(res.headers['cache-control'] || ''));
          chavesAte = Date.now() + (m ? Number(m[1]) * 1000 : 3600_000);
          chaves = j.keys || [];
          ok(chaves);
        } catch (e) { erro(e); }
      });
    }).on('error', erro);
  });
}

function b64(s) { return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64'); }

async function verificarIdToken(token) {
  if (!CLIENT_ID) throw new Error('Login com Google não configurado');
  const partes = String(token || '').split('.');
  if (partes.length !== 3) throw new Error('Token inválido');
  const cab = JSON.parse(b64(partes[0]).toString('utf8'));
  const dados = JSON.parse(b64(partes[1]).toString('utf8'));
  if (cab.alg !== 'RS256' || !cab.kid) throw new Error('Token inválido');
  if (!chaves || Date.now() > chavesAte || !chaves.some(k => k.kid === cab.kid)) await baixarChaves();
  const jwk = chaves.find(k => k.kid === cab.kid);
  if (!jwk) throw new Error('Chave do Google não encontrada');
  const chave = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const valido = crypto.verify('RSA-SHA256', Buffer.from(partes[0] + '.' + partes[1]), chave, b64(partes[2]));
  if (!valido) throw new Error('Assinatura inválida');
  const agora = Math.floor(Date.now() / 1000);
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(dados.iss)) throw new Error('Emissor inválido');
  if (dados.aud !== CLIENT_ID) throw new Error('Token de outro app');
  if (!dados.exp || dados.exp < agora - 30) throw new Error('Token expirado');
  if (!dados.email || dados.email_verified !== true && dados.email_verified !== 'true') throw new Error('E-mail do Google não verificado');
  return { sub: String(dados.sub), email: String(dados.email).trim().toLowerCase(), nome: String(dados.name || '').trim(), foto: dados.picture || '' };
}

module.exports = { CLIENT_ID, verificarIdToken, configurado: () => !!CLIENT_ID };
