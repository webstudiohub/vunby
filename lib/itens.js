'use strict';
// Itens do orçamento: validação, gravação e leitura. O cálculo vem de public/calc.js (o mesmo do navegador).
const { query } = require('./db');
const C = require('../public/calc');

const MAX_ITENS = 80;
const MAX_CENTS = 10_000_000_00; // R$ 10 milhões

// Recebe a lista do app e devolve { itens } normalizados ou { erro }
function validarItens(lista) {
  if (lista == null) return { itens: [] };
  if (!Array.isArray(lista)) return { erro: 'Itens inválidos.' };
  if (lista.length > MAX_ITENS) return { erro: `Máximo de ${MAX_ITENS} itens por orçamento.` };
  const itens = [];
  for (const [i, it] of lista.entries()) {
    const n = i + 1;
    const descricao = String(it && it.descricao || '').trim().replace(/\s+/g, ' ');
    if (!descricao) return { erro: `Item ${n}: escreva a descrição.` };
    if (descricao.length > 200) return { erro: `Item ${n}: descrição muito longa (máximo 200 caracteres).` };
    const qtd = C.numeroBR(it.qtd === undefined || it.qtd === '' ? 1 : it.qtd);
    if (!Number.isFinite(qtd) || qtd <= 0 || qtd > 100000) return { erro: `Item ${n} (${descricao}): quantidade inválida.` };
    const preco = it.preco_cents !== undefined ? Number(it.preco_cents) : C.centavos(it.preco);
    if (!Number.isInteger(preco) || preco < 0 || preco > MAX_CENTS) return { erro: `Item ${n} (${descricao}): valor inválido.` };
    const unidade = C.UNIDADES.includes(it.unidade) ? it.unidade : 'un';
    const tipo = C.TIPOS.includes(it.tipo) ? it.tipo : 'incluido';
    if (Math.round(qtd * preco) > MAX_CENTS) return { erro: `Item ${n} (${descricao}): valor total muito alto.` };
    itens.push({ descricao, qtd: Math.round(qtd * 1000) / 1000, unidade, preco_cents: preco, tipo });
  }
  return { itens };
}

// Desconto, taxa e sinal enviados pelo app → valores validados (undefined = não mexer)
function validarExtras(body) {
  const out = {};
  for (const [campo, col] of [['desconto', 'desconto_cents'], ['taxa', 'taxa_cents']]) {
    if (body[campo] === undefined) continue;
    const c = body[campo] === '' || body[campo] === null ? 0 : C.centavos(body[campo]);
    if (!Number.isInteger(c) || c < 0 || c > MAX_CENTS) return { erro: campo === 'desconto' ? 'Desconto inválido.' : 'Valor da taxa inválido.' };
    out[col] = c;
  }
  if (body.taxaNome !== undefined) {
    const t = String(body.taxaNome || '').trim();
    if (t.length > 60) return { erro: 'Nome da taxa muito longo.' };
    out.taxa_nome = t || null;
  }
  if (body.sinalPct !== undefined) {
    const p = body.sinalPct === '' || body.sinalPct === null ? 0 : C.numeroBR(body.sinalPct);
    if (!Number.isFinite(p) || p < 0 || p > 100) return { erro: 'Sinal deve ser de 0 a 100%.' };
    out.sinal_pct = Math.round(p * 100) / 100;
  }
  if (body.condicoes !== undefined) {
    const t = String(body.condicoes || '').trim();
    if (t.length > 1000) return { erro: 'Condições muito longas (máximo 1000 caracteres).' };
    out.condicoes = t || null;
  }
  return { extras: out };
}

async function lerItens(quoteId) {
  const r = await query('SELECT id, posicao, descricao, qtd, unidade, preco_cents, tipo, escolhido FROM quote_items WHERE quote_id = $1 ORDER BY posicao, id', [quoteId]);
  return r.rows.map(x => ({ ...x, id: String(x.id), qtd: Number(x.qtd), preco_cents: Number(x.preco_cents) }));
}

// Substitui todos os itens do orçamento (edição = nova versão)
async function gravarItens(quoteId, itens) {
  await query('DELETE FROM quote_items WHERE quote_id = $1', [quoteId]);
  for (const [i, it] of itens.entries()) {
    await query('INSERT INTO quote_items (quote_id, posicao, descricao, qtd, unidade, preco_cents, tipo) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [quoteId, i, it.descricao, it.qtd, it.unidade, it.preco_cents, it.tipo]);
  }
}

// Dados que o calc.js precisa, a partir da linha do orçamento + itens + pacote escolhido
function paraCalculo(quote, itens, pacotePrecoReais) {
  return {
    itens,
    desconto_cents: Number(quote.desconto_cents) || 0,
    taxa_cents: Number(quote.taxa_cents) || 0,
    sinal_pct: Number(quote.sinal_pct) || 0,
    pacote_cents: pacotePrecoReais ? Math.round(Number(pacotePrecoReais) * 100) : 0,
  };
}

module.exports = { validarItens, validarExtras, lerItens, gravarItens, paraCalculo, calcular: C.calcular, MAX_ITENS };
