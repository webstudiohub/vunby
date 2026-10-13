'use strict';
const https = require('https');

const { BASE_URL } = require('./config');

// ── Modelo visual dos e-mails do VUNBY (azul-marinho + amarelo, com logo) ──
// Tabelas e estilos inline: é o que funciona no Gmail, Outlook e no app de e-mail do celular.
const NAVY = '#003D6B', GOLD = '#F5C000', TEXTO = '#1C1C1E', CINZA = '#6B7280';
function base() { return BASE_URL.replace(/\/$/, ''); }
function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function botao(href, texto) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 8px"><tr><td style="background:${GOLD};border-radius:12px">
    <a href="${escHtml(href)}" style="display:inline-block;padding:16px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:${TEXTO};text-decoration:none">${texto}</a>
  </td></tr></table>`;
}

// titulo: frase de destaque; corpo: HTML já pronto (parágrafos, código, botão)
function layout({ preheader = '', titulo, corpo, rodape = '' }) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VUNBY</title></head>
<body style="margin:0;padding:0;background:#EEF2F6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F6;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden">
    <tr><td style="background:${NAVY};padding:28px 24px;text-align:center">
      <img src="${base()}/icons/logo-email.png" width="150" alt="VUNBY" style="display:inline-block;width:150px;height:auto;border:0">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#BFD3E6;margin-top:10px">Orçamentos e vendas para autônomos</div>
    </td></tr>
    <tr><td style="height:5px;background:${GOLD};font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="padding:32px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:${TEXTO}">
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${NAVY}">${titulo}</h1>
      ${corpo}
    </td></tr>
    <tr><td style="padding:18px 28px 26px;border-top:1px solid #E5E7EB;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${CINZA};text-align:center">
      ${rodape ? rodape + '<br><br>' : ''}VUNBY · <a href="${base()}" style="color:${CINZA}">vunby.com.br</a><br>Você recebeu este e-mail porque tem uma conta no VUNBY.
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function p(t) { return `<p style="margin:0 0 14px">${t}</p>`; }

function sendVerificationEmail(to, code) {
  const digitos = String(code).split('').join('&nbsp;');
  return sendEmail({
    to,
    subject: `${code} é o seu código do VUNBY`,
    html: layout({
      preheader: `Seu código de confirmação é ${code}. Ele vale por 15 minutos.`,
      titulo: 'Confirme seu e-mail',
      corpo: p('Use o código abaixo para confirmar seu e-mail e entrar no VUNBY:') +
        `<div style="margin:24px 0;padding:22px 12px;background:#F3F7FB;border:2px dashed #C9D8E8;border-radius:14px;text-align:center;font-family:'Courier New',Courier,monospace;font-size:38px;font-weight:bold;letter-spacing:6px;color:${NAVY}">${digitos}</div>` +
        p(`<span style="color:${CINZA};font-size:14px">O código vale por <strong>15 minutos</strong>. Se não foi você que pediu, é só ignorar este e-mail.</span>`),
    }),
  });
}

function sendPasswordResetEmail(to, link) {
  return sendEmail({
    to,
    subject: 'Redefinir sua senha do VUNBY',
    html: layout({
      preheader: 'Clique no botão para criar uma nova senha. O link vale por 1 hora.',
      titulo: 'Vamos criar uma nova senha',
      corpo: p('Recebemos um pedido para redefinir a senha da sua conta. Toque no botão abaixo para criar uma nova:') +
        botao(link, 'Criar nova senha') +
        p(`<span style="color:${CINZA};font-size:14px">O link vale por <strong>1 hora</strong>. Se não foi você que pediu, ignore este e-mail: sua senha continua a mesma.</span>`),
    }),
  });
}

function sendEmail({ to, subject, html }) {
  return new Promise((resolve) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) { console.error('RESEND_API_KEY nao configurada'); return resolve({ ok: false }); }
    const body = JSON.stringify({ from: 'VUNBY <noreply@vunby.com.br>', to, subject, html });
    const req = https.request({ hostname: 'api.resend.com', path: '/emails', method: 'POST', headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { if (res.statusCode === 200 || res.statusCode === 201) resolve({ ok: true }); else { console.error('Resend erro:', data); resolve({ ok: false }); } });
    });
    req.on('error', e => { console.error('Resend erro:', e); resolve({ ok: false }); });
    req.write(body);
    req.end();
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail, sendEmail, layout, botao, p, escHtml };
