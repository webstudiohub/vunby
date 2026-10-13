/* VUNBY — cálculo do orçamento por itens. O MESMO arquivo roda no navegador (mostrar o total ao vivo)
   e no servidor (total oficial na hora de salvar e de aprovar). Tudo em centavos inteiros. */
(function (raiz) {
  'use strict';

  const UNIDADES = ['un', 'm²', 'm', 'm³', 'kg', 'h', 'diária', 'ponto', 'km', 'andar', 'cento', 'vb'];
  const TIPOS = ['incluido', 'opcional', 'recomendado'];

  // "1.234,56" | "1234,56" | "1234.56" | 1234.56 → número (NaN se inválido)
  function numeroBR(v) {
    if (typeof v === 'number') return v;
    let s = String(v == null ? '' : v).trim().replace(/[R$\s]/g, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); // "1.500" = mil e quinhentos
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }
  const centavos = v => Math.round(numeroBR(v) * 100);

  // Item entra no total? Incluído sempre; recomendado/opcional conforme a escolha do cliente
  // (sem escolha: recomendado entra, opcional não).
  function itemConta(item, escolhidos) {
    if (item.tipo === 'opcional' || item.tipo === 'recomendado') {
      if (escolhidos) return escolhidos.has(String(item.id));
      return item.tipo === 'recomendado';
    }
    return true;
  }
  function linhaCents(item) { return Math.round(Number(item.qtd) * Number(item.preco_cents)); }

  /* q = { itens:[{id,qtd,preco_cents,tipo}], desconto_cents, taxa_cents, sinal_pct, pacote_cents }
     escolhidos = Set de ids de opcionais/recomendados marcados (ou null = padrão) */
  function calcular(q, escolhidos) {
    let itens = 0;
    for (const it of q.itens || []) if (itemConta(it, escolhidos)) itens += linhaCents(it);
    const pacote = Math.max(0, Math.round(Number(q.pacote_cents) || 0));
    const subtotal = itens + pacote;
    const desconto = Math.min(Math.max(0, Math.round(Number(q.desconto_cents) || 0)), subtotal);
    const taxa = Math.max(0, Math.round(Number(q.taxa_cents) || 0));
    const total = subtotal - desconto + taxa;
    const pct = Math.min(100, Math.max(0, Number(q.sinal_pct) || 0));
    const sinal = Math.round(total * pct / 100);
    return { itens, pacote, subtotal, desconto, taxa, total, sinal };
  }

  function reais(c) { return (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function qtdBR(n) { return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 }); }

  const api = { UNIDADES, TIPOS, numeroBR, centavos, itemConta, linhaCents, calcular, reais, qtdBR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.VCalc = api;
})(typeof window !== 'undefined' ? window : this);
