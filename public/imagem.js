/* VUNBY — imagem do orçamento (PNG) feita no próprio aparelho, com a logo e o nome da empresa.
   Vai pronta para o WhatsApp do cliente, junto com o link para aprovar. */
'use strict';

function imgCarregar(src) {
  return new Promise(ok => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
}

// d = { empresa:{nome,logo,profissao,cidade,whatsapp,instagram}, servico, clienteNome, data, validade,
//       itens?, resumo?, valor, taxaNome?, rotuloValor?, pacotes?, observacoes? }
async function gerarImagemOrcamento(d) {
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch {}
  const W = 1080, M = 64, LW = W - M * 2;
  const NAVY = '#0F3A8C', NAVY2 = '#0B2A66', OURO = '#E4C677', TXT = '#1C1C1E', MUTED = '#6B7280', LINHA = '#E5E7EB';
  const FONTE = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const R = c => 'R$ ' + (Math.round(c) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const emp = d.empresa || {};
  const logo = await imgCarregar(emp.logo);

  // Desenha duas vezes: a primeira só mede a altura
  const desenhar = (ctx, medir) => {
    let y = 0;
    const f = (tam, peso) => { ctx.font = `${peso || 400} ${tam}px ${FONTE}`; };
    const quebrar = (t, max) => {
      const out = [];
      for (const par of String(t || '').split(/\n/)) {
        let at = '';
        for (const p of par.split(/\s+/)) {
          const tent = at ? at + ' ' + p : p;
          if (ctx.measureText(tent).width > max && at) { out.push(at); at = p; } else at = tent;
        }
        out.push(at);
      }
      return out;
    };
    const texto = (t, x, yy, cor, alinha) => { if (medir) return; ctx.fillStyle = cor; ctx.textAlign = alinha || 'left'; ctx.fillText(t, x, yy); };
    const caixa = (x, yy, w, h, r, cor) => { if (medir) return; ctx.fillStyle = cor; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, yy, w, h, r) : ctx.rect(x, yy, w, h); ctx.fill(); };

    // ── Cabeçalho da empresa
    const topoH = 220;
    if (!medir) { const g = ctx.createLinearGradient(0, 0, W, topoH); g.addColorStop(0, NAVY2); g.addColorStop(1, NAVY); ctx.fillStyle = g; ctx.fillRect(0, 0, W, topoH); }
    let xNome = M;
    if (logo) {
      caixa(M, 50, 120, 120, 22, '#fff');
      if (!medir) { const s = Math.min(100 / logo.width, 100 / logo.height); const lw = logo.width * s, lh = logo.height * s; ctx.drawImage(logo, M + 60 - lw / 2, 110 - lh / 2, lw, lh); }
      xNome = M + 148;
    }
    f(44, 800); const nomeL = quebrar(emp.nome || '', W - M - xNome).slice(0, 2);
    const sub = [emp.profissao, emp.cidade].filter(Boolean).join(' · ');
    let yN = nomeL.length > 1 ? 100 : 118;
    nomeL.forEach((l, i) => texto(l, xNome, yN + i * 50, '#fff'));
    if (sub) { f(26, 500); texto(sub, xNome, yN + (nomeL.length - 1) * 50 + 42, '#C9D6F2'); }
    y = topoH + 64;

    // ── Título
    f(24, 800); texto('ORÇAMENTO', M, y, NAVY);
    if (d.data) { f(24, 500); texto(new Date(d.data).toLocaleDateString('pt-BR'), W - M, y, MUTED, 'right'); }
    y += 56;
    f(46, 800); for (const l of quebrar(d.servico || '', LW).slice(0, 3)) { texto(l, M, y, TXT); y += 56; }
    f(30, 500); if (d.clienteNome) { texto('Para: ' + d.clienteNome, M, y + 4, MUTED); y += 48; }
    y += 20;

    // ── Itens
    const itens = d.itens || [];
    if (itens.length) {
      if (!medir) { ctx.fillStyle = LINHA; ctx.fillRect(M, y, LW, 2); }
      y += 22;
      const MAX = 20;
      for (const i of itens.slice(0, MAX)) {
        const opc = i.tipo && i.tipo !== 'incluido';
        f(32, 700); const desc = quebrar(i.descricao || '', LW - 260).slice(0, 2);
        let yi = y + 38;
        desc.forEach((l, k) => texto(l, M, yi + k * 40, TXT));
        f(32, 700); texto(R(VCalc.linhaCents(i)), W - M, yi, TXT, 'right');
        yi += (desc.length - 1) * 40 + 40;
        f(26, 400);
        const det = `${VCalc.qtdBR(i.qtd)} × ${R(i.preco_cents)} por ${VCalc.nomeUnidade(i.unidade)}`;
        texto(det, M, yi, MUTED);
        if (opc) {
          const tag = i.tipo === 'opcional' ? 'opcional' : 'recomendado';
          f(22, 700); const tw = ctx.measureText(tag).width + 24;
          f(26, 400); const dw = ctx.measureText(det).width;
          caixa(M + dw + 16, yi - 26, tw, 34, 17, '#FFF3D6'); f(22, 700); texto(tag, M + dw + 28, yi - 2, '#8A6100');
        }
        y = yi + 26;
        if (!medir) { ctx.fillStyle = '#F2F2F7'; ctx.fillRect(M, y, LW, 2); }
        y += 4;
      }
      if (itens.length > MAX) { f(26, 600); texto(`+ ${itens.length - MAX} itens — veja todos no link`, M, y + 40, NAVY); y += 56; }
      y += 20;
    }

    // ── Pacotes (sem itens)
    const pacotes = (d.pacotes || []);
    if (!itens.length && pacotes.length) {
      for (const p of pacotes) {
        caixa(M, y, LW, 92, 18, p.destaque ? '#EEF4FA' : '#F7F7F9');
        f(32, 700); texto(p.nome || '', M + 28, y + 56, TXT);
        texto('R$ ' + Number(p.preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), W - M - 28, y + 56, NAVY, 'right');
        y += 108;
      }
      y += 8;
    }

    // ── Resumo
    const rs = d.resumo;
    const linhaRes = (rot, val, cor) => { f(28, 500); texto(rot, M, y + 32, MUTED); texto(val, W - M, y + 32, cor || TXT, 'right'); y += 48; };
    if (rs) {
      if (rs.desconto > 0 || rs.taxa > 0) linhaRes('Subtotal', R(rs.subtotal));
      if (rs.desconto > 0) linhaRes('Desconto', '− ' + R(rs.desconto), '#15803D');
      if (rs.taxa > 0) linhaRes(d.taxaNome || 'Taxa', R(rs.taxa));
      y += 8;
    }
    const total = rs ? rs.total : Math.round(Number(d.valor || 0) * 100);
    if (total > 0 || !pacotes.length) {
      caixa(M, y, LW, 140, 26, NAVY);
      f(26, 700); texto(d.rotuloValor || 'TOTAL', M + 36, y + 58, '#C9D6F2');
      f(60, 800); texto(R(total), W - M - 36, y + 94, '#fff', 'right');
      y += 160;
    }
    if (rs && rs.sinal > 0) { f(26, 600); texto(`Sinal para confirmar: ${R(rs.sinal)}`, M, y + 20, NAVY); y += 48; }
    if (d.validade) { f(26, 500); texto('Válido até ' + new Date(d.validade + 'T12:00:00').toLocaleDateString('pt-BR'), M, y + 24, MUTED); y += 52; }

    // ── Chamada para aprovar
    y += 16;
    caixa(M, y, LW, 110, 24, '#E9F9EF');
    f(30, 800); texto('Para aprovar, toque no link da mensagem', W / 2, y + 50, '#128C4B', 'center');
    f(24, 500); texto('Você também pode escolher opções e pedir ajustes por lá', W / 2, y + 86, '#3F7D5A', 'center');
    y += 140;

    // ── Rodapé
    const wa = String(emp.whatsapp || '').replace(/\D/g, '');
    const contato = [wa ? 'WhatsApp ' + wa.replace(/^55/, '').replace(/^(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3') : '', emp.instagram ? '@' + String(emp.instagram).replace(/^@/, '') : ''].filter(Boolean).join('   ·   ');
    if (contato) { f(24, 600); texto(contato, W / 2, y + 10, TXT, 'center'); y += 44; }
    f(20, 500); texto('Orçamento feito com VUNBY', W / 2, y + 10, '#A0A4AE', 'center');
    y += 50;
    if (!medir) { ctx.fillStyle = OURO; ctx.fillRect(0, y - 10, W, 10); }
    return y;
  };

  const c = document.createElement('canvas'); c.width = W; c.height = 10;
  const altura = Math.ceil(desenhar(c.getContext('2d'), true));
  c.height = altura;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, altura); ctx.textBaseline = 'alphabetic';
  desenhar(ctx, false);
  return await new Promise(ok => c.toBlob(ok, 'image/png'));
}

// Abre o compartilhar do celular com a imagem + texto (o WhatsApp aparece na lista).
// Sem suporte: baixa a imagem e devolve 'baixado'.
async function compartilharImagem(blob, nome, texto) {
  const arq = new File([blob], nome, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [arq] })) {
    try { await navigator.share({ files: [arq], text: texto }); return 'compartilhado'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelado'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'baixado';
}
