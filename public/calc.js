/* VUNBY — cálculo do orçamento por itens. O MESMO arquivo roda no navegador (mostrar o total ao vivo)
   e no servidor (total oficial na hora de salvar e de aprovar). Tudo em centavos inteiros. */
(function (raiz) {
  'use strict';

  const UNIDADES = ['un', 'm²', 'm', 'm³', 'kg', 'h', 'diária', 'ponto', 'km', 'andar', 'cento', 'vb'];
  const TIPOS = ['incluido', 'opcional', 'recomendado'];
  // Como a unidade aparece escrita para o prestador e o cliente ("R$ 50 por hora")
  const NOME_UNIDADE = { un: 'unidade', 'm²': 'm²', m: 'metro', 'm³': 'm³', kg: 'kg', h: 'hora', 'diária': 'diária', ponto: 'ponto', km: 'km', andar: 'andar', cento: 'cento', vb: 'serviço' };
  const nomeUnidade = u => NOME_UNIDADE[u] || u;

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

  // Desenho ilustrativo do item pelo nome (ex.: "Sofá 3 lugares" → 🛋️). A ordem importa: o mais específico primeiro.
  const ICONES = [
    [/guarda.?roupa|arm[aá]rio|roupeiro/, '🚪'], [/sof[aá]|poltrona|estofad/, '🛋️'], [/cama|beliche|ber[cç]o|colch[aã]o/, '🛏️'],
    [/geladeira|freezer|refrigerador/, '🧊'], [/fog[aã]o|cooktop/, '🍳'], [/micro.?ondas/, '♨️'], [/m[aá]quina de lavar|lavadora|tanquinho/, '🧺'],
    [/\btv\b|televis|monitor/, '📺'], [/ar.?condicionado|split|climatiz/, '❄️'], [/cadeira|banco\b/, '🪑'], [/mesa|escrivaninha|bancada/, '🪵'],
    [/estante|rack|prateleira|nicho|aparador|buffet|c[oô]moda|criado/, '🗄️'], [/espelho/, '🪞'], [/quadro|pintura de quadro/, '🖼️'],
    [/bicicleta|bike/, '🚲'], [/piano|instrumento/, '🎹'], [/planta|vaso|jardim|grama|poda|muda\b|paisag/, '🌿'],
    [/caixa|embalag|pl[aá]stico|papel[aã]o|fita/, '📦'], [/caminh[aã]o|ba[uú]|frete|carreto|utilit[aá]rio|transporte|viagem|km|quil[oô]metro/, '🚚'],
    [/ajudante|carregador|pessoa|m[aã]o de obra|di[aá]ria|equipe/, '🧑‍🔧'], [/desmont|montag|montar|mont/, '🔧'], [/i[cç]amento|guincho|corda/, '🏗️'],
    [/escada|andar|elevador/, '🪜'], [/seguro|prote[cç][aã]o/, '🛡️'], [/pintura|pintar|tinta|massa corrida|textura/, '🎨'],
    [/el[eé]tric|tomada|fia[cç][aã]o|disjuntor|chuveiro|l[aâ]mpada|ilumina/, '💡'], [/encan|hidr[aá]ul|vazamento|torneira|cano|esgoto|desentup/, '🚿'],
    [/piso|azulejo|cer[aâ]mica|porcelanato|revestimento/, '🧱'], [/parede|alvenaria|reboco|concreto|cimento|obra|reforma|pedreiro|gesso|drywall/, '🧱'],
    [/limpeza|faxina|lavagem|higieniza|diarista/, '🧹'], [/vidro|janela/, '🪟'], [/bolo/, '🎂'], [/doce|brigadeiro|cupcake|sobremesa/, '🧁'],
    [/salgad|coxinha|empada/, '🥟'], [/p[aã]o|padaria/, '🥖'], [/entrega|taxa de entrega|motoboy/, '🛵'], [/cabelo|corte|escova|progressiva|barba/, '💇'],
    [/unha|manicure|pedicure/, '💅'], [/maquiagem|make/, '💄'], [/sobrancelha|c[ií]lio/, '👁️'], [/foto|fotograf|ensaio/, '📸'], [/v[ií]deo|filmag/, '🎥'],
    [/decora[cç]|bal[aã]o|festa|evento/, '🎉'], [/som|dj|m[uú]sica/, '🎵'], [/visita|or[cç]amento|avalia/, '📋'], [/hora\b|horas|\bh\b/, '⏱️'],
  ];
  function iconeItem(nome) {
    const t = String(nome || '').toLowerCase();
    for (const [re, em] of ICONES) if (re.test(t)) return em;
    return '🔹';
  }

  const api = { iconeItem, UNIDADES, TIPOS, NOME_UNIDADE, nomeUnidade, numeroBR, centavos, itemConta, linhaCents, calcular, reais, qtdBR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.VCalc = api;
})(typeof window !== 'undefined' ? window : this);
