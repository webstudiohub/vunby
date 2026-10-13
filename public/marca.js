/* VUNBY — cabeçalho com os dados da empresa do prestador.
   Usado no orçamento do cliente (orcamento.html) e na prévia da tela "Configure sua empresa". */
'use strict';

function marcaEsc(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }

function marcaDocumento(d) {
  d = String(d || '').replace(/\D/g, '');
  if (d.length === 14) return 'CNPJ ' + d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return 'CPF ' + d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return '';
}

// p = { nome, logo, profissao, cidade, whatsapp, documento, instagram }
function marcaHtml(p) {
  if (!p || !(p.nome || p.logo)) return '';
  const linha = [p.profissao, p.cidade].filter(Boolean).map(marcaEsc).join(' · ');
  const doc = marcaDocumento(p.documento);
  const wa = String(p.whatsapp || '').replace(/\D/g, '');
  const ig = String(p.instagram || '').replace(/^@/, '');
  const chip = 'display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.16);color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:6px 12px;border-radius:20px';
  const contatos = [
    wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener" style="${chip}">💬 WhatsApp</a>` : '',
    ig ? `<a href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener" style="${chip}">@${marcaEsc(ig)}</a>` : '',
  ].filter(Boolean).join('');
  return `<div class="marca-empresa" style="margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:12px">
      ${p.logo ? `<img src="${marcaEsc(p.logo)}" alt="" style="width:52px;height:52px;object-fit:contain;border-radius:10px;background:#fff;padding:4px;flex-shrink:0"/>` : ''}
      <div style="min-width:0">
        <div style="font-size:16px;font-weight:700;line-height:1.25">${marcaEsc(p.nome || '')}</div>
        ${linha ? `<div style="font-size:13px;opacity:.85;margin-top:2px">${linha}</div>` : ''}
        ${doc ? `<div style="font-size:12px;opacity:.7;margin-top:2px">${doc}</div>` : ''}
      </div>
    </div>
    ${contatos ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">${contatos}</div>` : ''}
  </div>`;
}
