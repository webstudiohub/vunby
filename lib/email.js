'use strict';
const https = require('https');

function sendVerificationEmail(to, code) {
  return sendEmail({
    to,
    subject: 'Seu codigo de verificacao - VUNBY',
    html: '<div style="font-family:Arial,sans-serif;max-width:480px"><h2 style="color:#6C47FF">VUNBY</h2><p>Seu codigo de verificacao:</p><div style="font-size:36px;font-weight:bold;color:#6C47FF;letter-spacing:8px;margin:24px 0">' + code + '</div><p>Expira em 15 minutos.</p></div>'
  });
}

function sendPasswordResetEmail(to, link) {
  return sendEmail({
    to,
    subject: 'Redefinir senha - VUNBY',
    html: '<div style="font-family:Arial,sans-serif;max-width:480px"><h2 style="color:#6C47FF">VUNBY</h2><p>Clique para redefinir sua senha:</p><a href="' + link + '" style="display:inline-block;background:#6C47FF;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;margin:16px 0">Redefinir senha</a><p>Expira em 1 hora.</p></div>'
  });
}

function sendEmail({ to, subject, html }) {
  return new Promise((resolve) => {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) { console.error('RESEND_API_KEY nao configurada'); return resolve({ ok: false }); }
    const body = JSON.stringify({ from: 'VUNBY <onboarding@resend.dev>', to, subject, html });
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

module.exports = { sendVerificationEmail, sendPasswordResetEmail }