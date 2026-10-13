/* VUNBY — PDF do orçamento gerado no próprio aparelho (sem servidor, sem biblioteca).
   Escreve um PDF A4 com Helvetica (acentos via WinAnsi), logo em JPEG e link clicável para aprovar online. */
'use strict';

const PDF_LARG = { // larguras Helvetica / Helvetica-Bold (1/1000 do tamanho), caracteres 32..126
  n: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
  b: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584],
};
const PDF_WIN = { '€':0x80,'‚':0x82,'„':0x84,'…':0x85,'‘':0x91,'’':0x92,'“':0x93,'”':0x94,'•':0x95,'–':0x96,'—':0x97,'‹':0x8B,'›':0x9B };

// Texto → bytes WinAnsi (string de 1 byte por caractere). Emojis e símbolos sem equivalente somem.
function pdfTexto(s) {
  let o = '';
  for (const ch of String(s || '')) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c <= 126) o += ch;
    else if (c === 0xA0) o += ' ';
    else if (c > 0xA0 && c <= 0xFF) o += String.fromCharCode(c);
    else if (PDF_WIN[ch]) o += String.fromCharCode(PDF_WIN[ch]);
    else if (c === 10) o += '\n';
    else if (c === 9) o += '  ';
  }
  return o;
}
function pdfLargChar(code, bold) {
  const t = bold ? PDF_LARG.b : PDF_LARG.n;
  if (code >= 32 && code <= 126) return t[code - 32];
  if (code >= 0xC0) { // letra acentuada: usa a largura da letra base
    const base = String.fromCharCode(code).normalize('NFD').charCodeAt(0);
    if (base >= 32 && base <= 126) return t[base - 32];
  }
  return 556;
}
function pdfLargura(txt, tam, bold) { let w = 0; for (let i = 0; i < txt.length; i++) w += pdfLargChar(txt.charCodeAt(i), bold); return w * tam / 1000; }

// Quebra o texto (já em WinAnsi) em linhas que cabem na largura
function pdfQuebrar(txt, tam, bold, max) {
  const linhas = [];
  for (const par of txt.split(/\r?\n/)) {
    let atual = '';
    for (const palavra of par.split(' ')) {
      const tent = atual ? atual + ' ' + palavra : palavra;
      if (pdfLargura(tent, tam, bold) <= max) { atual = tent; continue; }
      if (atual) linhas.push(atual);
      atual = palavra;
      while (pdfLargura(atual, tam, bold) > max) { // palavra gigante (ex.: link): corta
        let k = atual.length; while (k > 1 && pdfLargura(atual.slice(0, k), tam, bold) > max) k--;
        linhas.push(atual.slice(0, k)); atual = atual.slice(k);
      }
    }
    linhas.push(atual);
  }
  return linhas;
}
function pdfEsc(t) { return t.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function pdfCor(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, (n >> 8 & 255) / 255, (n & 255) / 255].map(v => v.toFixed(3)).join(' '); }

// Logo (data URL) → JPEG com fundo branco, para embutir no PDF
function pdfLogoJpeg(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 300 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      resolve({ w: c.width, h: c.height, bytes: atob(c.toDataURL('image/jpeg', 0.9).split(',')[1]) });
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* Monta o PDF. dados = { empresa:{nome,profissao,cidade,whatsapp,documento,instagram,logo},
   servico, clienteNome, valor, validade, observacoes, data, pacotes:[{nome,conteudo,preco,destaque}], link,
   itens:[{descricao,qtd,unidade,preco_cents,tipo}], resumo:{itens,pacote,desconto,taxa,total,sinal}, taxaNome, condicoes, rotuloValor } */
async function gerarPdfOrcamento(dados) {
  const W = 595.28, H = 841.89, M = 40, LARG = W - 2 * M;
  const AZUL = '#0F3A8C', DOURADO = '#C9971C', ESCURO = '#0F1923', CINZA = '#6B7785', LINHA = '#E4E8EE';
  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataBR = d => d ? new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '';
  const logo = await pdfLogoJpeg(dados.empresa.logo);

  const paginas = []; let ops = [], links = [], y = 0;
  const novaPagina = () => { ops = []; links = []; paginas.push({ ops, links }); y = H - M; };
  const ret = (x, yy, w, h, cor) => ops.push(`${pdfCor(cor)} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  const txt = (t, x, yy, tam, bold, cor) => ops.push(`BT /${bold ? 'F2' : 'F1'} ${tam} Tf ${pdfCor(cor)} rg ${x.toFixed(2)} ${yy.toFixed(2)} Td (${pdfEsc(t)}) Tj ET`);
  const garantir = h => { if (y - h < M + 30) novaPagina(); };
  // Bloco de texto com quebra de linha; avança o y
  const paragrafo = (t, tam, bold, cor, x = M, max = LARG, entre = 1.4) => {
    for (const l of pdfQuebrar(pdfTexto(t), tam, bold, max)) { garantir(tam * entre); y -= tam * entre; txt(l, x, y + tam * 0.25, tam, bold, cor); }
  };

  novaPagina();

  // ── Cabeçalho azul cromado (degradê em faixas) com os dados da empresa ──
  const e = dados.empresa;
  const sub = [e.profissao, e.cidade].filter(Boolean).join(' · ');
  const doc = typeof marcaDocumento === 'function' ? marcaDocumento(e.documento) : '';
  const wa = String(e.whatsapp || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  const waFmt = wa.length === 11 ? `(${wa.slice(0, 2)}) ${wa.slice(2, 7)}-${wa.slice(7)}` : wa.length === 10 ? `(${wa.slice(0, 2)}) ${wa.slice(2, 6)}-${wa.slice(6)}` : '';
  const contatos = [waFmt && 'WhatsApp ' + waFmt, e.instagram && '@' + String(e.instagram).replace(/^@/, '')].filter(Boolean).join('   ·   ');
  const xTexto = logo ? M + 74 : M;
  const nomeLinhas = pdfQuebrar(pdfTexto(e.nome || ''), 18, true, W - M - xTexto);
  const altTexto = nomeLinhas.length * 22 + (sub ? 16 : 0) + (doc ? 14 : 0) + (contatos ? 16 : 0);
  const altCab = Math.max(logo ? 64 : 0, altTexto) + 2 * 28;
  const stops = [[0, '#6EA5EB'], [.35, '#285FBE'], [.55, '#0F378C'], [.8, '#2D64BE'], [1, '#0A286E']];
  const corEm = t => { let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++; const [t0, c0] = stops[i], [t1, c1] = stops[i + 1]; const k = (t - t0) / (t1 - t0); const a = parseInt(c0.slice(1), 16), b = parseInt(c1.slice(1), 16); const mix = s => Math.round((a >> s & 255) * (1 - k) + (b >> s & 255) * k); return '#' + [16, 8, 0].map(s => mix(s).toString(16).padStart(2, '0')).join(''); };
  const FAIXAS = 48;
  for (let i = 0; i < FAIXAS; i++) ret(0, H - altCab * (i + 1) / FAIXAS, W, altCab / FAIXAS + 0.6, corEm(i / (FAIXAS - 1)));
  ret(0, H - altCab - 3, W, 3, DOURADO);
  if (logo) {
    const lado = 64, k = Math.min(lado / logo.w, lado / logo.h), lw = logo.w * k, lh = logo.h * k, ly = H - 28 - lado;
    ret(M - 4, ly - 4, lado + 8, lado + 8, '#FFFFFF');
    ops.push(`q ${lw.toFixed(2)} 0 0 ${lh.toFixed(2)} ${(M + (lado - lw) / 2).toFixed(2)} ${(ly + (lado - lh) / 2).toFixed(2)} cm /Im1 Do Q`);
  }
  let yc = H - 28 - (logo ? Math.max(0, (64 - altTexto) / 2) : 0);
  for (const l of nomeLinhas) { yc -= 20; txt(l, xTexto, yc, 18, true, '#FFFFFF'); yc -= 2; }
  if (sub) { yc -= 15; txt(pdfTexto(sub), xTexto, yc, 11, false, '#E6EEFB'); }
  if (doc) { yc -= 14; txt(pdfTexto(doc), xTexto, yc, 9.5, false, '#C9D8F2'); }
  if (contatos) { yc -= 16; txt(pdfTexto(contatos), xTexto, yc, 10, true, '#FFFFFF'); }
  y = H - altCab - 3 - 30;

  // ── Título do orçamento ──
  txt(pdfTexto('ORÇAMENTO'), M, y, 9, true, DOURADO);
  const emissao = pdfTexto('Emitido em ' + dataBR(dados.data || new Date().toISOString()));
  txt(emissao, W - M - pdfLargura(emissao, 9, false), y, 9, false, CINZA);
  y -= 6;
  paragrafo(dados.servico, 20, true, ESCURO, M, LARG, 1.3);
  y -= 4;
  paragrafo('Para: ' + (dados.clienteNome || ''), 11, false, CINZA);
  y -= 18;

  // ── Itens (tabela) ──
  const temPacotes = dados.pacotes && dados.pacotes.length;
  const R = c => brl(Number(c || 0) / 100);
  if (dados.itens && dados.itens.length) {
    const COLV = 110; // largura da coluna de valor
    garantir(40);
    txt(pdfTexto('ITENS'), M, y, 9, true, DOURADO); y -= 8;
    ret(M, y - 22, LARG, 22, AZUL);
    txt(pdfTexto('Descrição'), M + 10, y - 15, 9.5, true, '#FFFFFF');
    const hv = pdfTexto('Valor'); txt(hv, W - M - 10 - pdfLargura(hv, 9.5, true), y - 15, 9.5, true, '#FFFFFF');
    y -= 22;
    dados.itens.forEach((it, k) => {
      const opc = it.tipo && it.tipo !== 'incluido';
      const desc = pdfQuebrar(pdfTexto(it.descricao), 11, true, LARG - COLV - 20);
      const det = pdfTexto(`${Number(it.qtd).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} × ${R(it.preco_cents)} por ${window.VCalc ? VCalc.nomeUnidade(it.unidade) : it.unidade}` + (opc ? (it.tipo === 'recomendado' ? '   ·   recomendado (opcional)' : '   ·   opcional') : ''));
      const alt = 12 + desc.length * 14 + 14;
      garantir(alt);
      if (k % 2 === 1) ret(M, y - alt, LARG, alt, '#F7F9FC');
      let yl = y - 6;
      desc.forEach(l => { yl -= 13; txt(l, M + 10, yl, 11, true, opc ? '#3A4550' : ESCURO); });
      yl -= 13; txt(det, M + 10, yl, 9, false, opc ? DOURADO : CINZA);
      const v = pdfTexto((it.tipo === 'opcional' ? '+ ' : '') + R(Math.round(Number(it.qtd) * Number(it.preco_cents))));
      txt(v, W - M - 10 - pdfLargura(v, 11, true), y - 19, 11, true, opc ? '#3A4550' : ESCURO);
      y -= alt;
    });
    ops.push(`${pdfCor(LINHA)} RG 1 w ${M} ${y.toFixed(2)} m ${W - M} ${y.toFixed(2)} l S`);
    y -= 6;
    const r = dados.resumo || {};
    const linhaR = (rot, val, bold) => { garantir(18); y -= 16; const t = pdfTexto(rot), v = pdfTexto(val); txt(t, W - M - 10 - COLV - pdfLargura(t, 10, bold), y, 10, bold, CINZA); txt(v, W - M - 10 - pdfLargura(v, 10, bold), y, 10, bold, ESCURO); };
    if (r.desconto || r.taxa || r.pacote) linhaR('Itens', R(r.itens));
    if (r.pacote) linhaR('Opção escolhida', R(r.pacote));
    if (r.desconto) linhaR('Desconto', '− ' + R(r.desconto));
    if (r.taxa) linhaR(dados.taxaNome || 'Taxa', R(r.taxa));
    if (dados.itens.some(i => i.tipo && i.tipo !== 'incluido')) { garantir(16); y -= 15; const n = pdfTexto('Itens opcionais: o total muda conforme o que você escolher no link.'); txt(n, M, y, 9, false, DOURADO); }
    y -= 18;
  }

  // ── Valor ──
  garantir(70);
  ret(M, y - 62, LARG, 62, '#F4F6F9'); ret(M, y - 62, 4, 62, AZUL);
  txt(pdfTexto(dados.rotuloValor || 'VALOR'), M + 18, y - 20, 9, true, CINZA);
  txt(pdfTexto(brl(dados.valor)), M + 18, y - 48, 24, true, AZUL);
  if (dados.resumo && dados.resumo.sinal) { const sn = pdfTexto(`Sinal para começar: ${R(dados.resumo.sinal)}`); txt(sn, W - M - 16 - pdfLargura(sn, 10, true), y - 26, 10, true, ESCURO); }
  if (dados.validade) { const v = pdfTexto('Válido até ' + dataBR(dados.validade)); txt(v, W - M - 16 - pdfLargura(v, 10, false), y - 44, 10, false, CINZA); }
  y -= 62 + 24;

  // ── Opções / pacotes ──
  if (temPacotes) {
    garantir(24); txt(pdfTexto('OPÇÕES'), M, y, 9, true, DOURADO); y -= 10;
    for (const p of dados.pacotes) {
      const conteudo = pdfQuebrar(pdfTexto(p.conteudo || ''), 10, false, LARG - 140).filter(l => l.trim());
      const alt = 30 + conteudo.length * 14;
      garantir(alt + 8);
      ret(M, y - alt, LARG, alt, p.destaque ? '#FFF8E1' : '#FFFFFF');
      ops.push(`${pdfCor(p.destaque ? DOURADO : LINHA)} RG 1 w ${M} ${(y - alt).toFixed(2)} ${LARG} ${alt.toFixed(2)} re S`);
      const nome = pdfTexto(p.nome) + (p.destaque ? pdfTexto('  (recomendado)') : '');
      txt(nome, M + 14, y - 19, 12, true, ESCURO);
      const preco = pdfTexto(brl(p.preco)); txt(preco, W - M - 14 - pdfLargura(preco, 13, true), y - 19, 13, true, AZUL);
      let yl = y - 19;
      for (const l of conteudo) { yl -= 14; txt(l, M + 14, yl, 10, false, '#3A4550'); }
      y -= alt + 8;
    }
    y -= 12;
  }

  // ── Observações ──
  if (dados.observacoes && String(dados.observacoes).trim()) {
    garantir(30); txt(pdfTexto('OBSERVAÇÕES'), M, y, 9, true, DOURADO); y -= 4;
    paragrafo(dados.observacoes, 11, false, '#3A4550', M, LARG, 1.5);
    y -= 20;
  }

  // ── Condições ──
  if (dados.condicoes && String(dados.condicoes).trim()) {
    garantir(30); txt(pdfTexto('CONDIÇÕES'), M, y, 9, true, DOURADO); y -= 4;
    paragrafo(dados.condicoes, 11, false, '#3A4550', M, LARG, 1.5);
    y -= 20;
  }

  // ── Aprovar online (link clicável) ──
  if (dados.link) {
    garantir(56);
    ret(M, y - 44, LARG, 44, AZUL);
    const t1 = pdfTexto((dados.linkTexto || 'Aprovar este orçamento online') + '  ›');
    txt(t1, M + (LARG - pdfLargura(t1, 13, true)) / 2, y - 27, 13, true, '#FFFFFF');
    links.push({ x: M, y: y - 44, w: LARG, h: 44, url: dados.link });
    y -= 44 + 10;
  }

  // ── Rodapé em todas as páginas ──
  paginas.forEach((pg, i) => {
    const r = pdfTexto('Orçamento feito com VUNBY' + (paginas.length > 1 ? `   ·   página ${i + 1} de ${paginas.length}` : ''));
    pg.ops.push(`BT /F1 8 Tf ${pdfCor('#9AA5B1')} rg ${((W - pdfLargura(r, 8, false)) / 2).toFixed(2)} 22 Td (${pdfEsc(r)}) Tj ET`);
  });

  // ── Serializa o PDF ──
  const objs = []; // índice = número do objeto - 1
  const add = s => { objs.push(s); return objs.length; };
  const catalogo = add(null), paginasRef = add(null);
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const im = logo ? add(`<< /Type /XObject /Subtype /Image /Width ${logo.w} /Height ${logo.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>\nstream\n${logo.bytes}\nendstream`) : 0;
  const kids = [];
  for (const pg of paginas) {
    const conteudo = pg.ops.join('\n');
    const cRef = add(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
    const annots = pg.links.map(l => add(`<< /Type /Annot /Subtype /Link /Rect [${l.x.toFixed(2)} ${l.y.toFixed(2)} ${(l.x + l.w).toFixed(2)} ${(l.y + l.h).toFixed(2)}] /Border [0 0 0] /A << /S /URI /URI (${pdfEsc(pdfTexto(l.url))}) >> >>`));
    kids.push(add(`<< /Type /Page /Parent ${paginasRef} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${im ? ` /XObject << /Im1 ${im} 0 R >>` : ''} >> /Contents ${cRef} 0 R${annots.length ? ` /Annots [${annots.map(a => a + ' 0 R').join(' ')}]` : ''} >>`));
  }
  objs[catalogo - 1] = `<< /Type /Catalog /Pages ${paginasRef} 0 R >>`;
  objs[paginasRef - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return new Blob([bytes], { type: 'application/pdf' });
}

// Gera e entrega: no celular abre o menu de compartilhar (WhatsApp etc.); no computador, baixa o arquivo
async function compartilharPdf(blob, nomeArquivo) {
  const arquivo = new File([blob], nomeArquivo, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try { await navigator.share({ files: [arquivo], title: nomeArquivo }); return 'compartilhado'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelado'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nomeArquivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'baixado';
}
