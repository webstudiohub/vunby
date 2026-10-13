/* VUNBY — "Montar pela minha tabela": o prestador marca quantidades na tabela de preços dele e o VUNBY cria os itens.
   Móveis somam m³, sugerem o veículo e geram desmontagem/montagem com o preço de cada móvel. m² tem calculadora L × C.
   uso: abrirMontarTabela(itens => editor.adicionarItens(itens), texto => observacoes += texto) */
'use strict';

async function abrirMontarTabela(aoGerarItens, aoGerarTexto) {
  const C = window.VCalc;
  const e = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const R = c => C.reais(c);
  let tabela = [];
  try { tabela = await api('/api/catalog'); } catch (err) { alert(err.message); return; }

  const q = {};       // id → quantidade (texto, aceita "2,5")
  const desm = {};    // id → peças a desmontar (null = igual à quantidade)
  const mont = {};
  const n = v => { const x = C.numeroBR(v); return Number.isFinite(x) && x > 0 ? x : 0; };
  let busca = '';

  const fundo = document.createElement('div');
  fundo.className = 'cm-fundo';
  fundo.innerHTML = '<div class="cm-folha" role="dialog" aria-modal="true" aria-label="Montar pela minha tabela"></div>';
  document.body.appendChild(fundo);
  document.body.style.overflow = 'hidden';
  const folha = fundo.firstChild;
  const fechar = () => { fundo.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', esc); };
  function esc(ev) { if (ev.key === 'Escape') fechar(); }
  document.addEventListener('keydown', esc);

  const qDesm = i => desm[i.id] == null ? n(q[i.id]) : n(desm[i.id]);
  const qMont = i => mont[i.id] == null ? n(q[i.id]) : n(mont[i.id]);

  function contas() {
    let total = 0, linhas = 0, m3 = 0, pecas = 0;
    for (const i of tabela) {
      const x = n(q[i.id]); if (!x) continue;
      if (i.m3) {
        m3 += x * i.m3; pecas += x;
        if (i.preco_cents) { total += Math.round(x * i.preco_cents); linhas++; }
        if (i.desmonta) {
          if (qDesm(i) && i.preco_desm_cents) { total += Math.round(qDesm(i) * i.preco_desm_cents); linhas++; }
          if (qMont(i) && i.preco_mont_cents) { total += Math.round(qMont(i) * i.preco_mont_cents); linhas++; }
        }
      } else { total += Math.round(x * i.preco_cents); linhas++; }
    }
    const veics = tabela.filter(i => i.capacidade_m3).sort((a, b) => a.capacidade_m3 - b.capacidade_m3);
    const carga = m3 * 1.1; // 10% de folga: a carga nunca encaixa perfeita
    let sug = null, viagens = 1;
    if (m3 && veics.length) { sug = veics.find(v => v.capacidade_m3 >= carga); if (!sug) { sug = veics[veics.length - 1]; viagens = Math.ceil(carga / sug.capacidade_m3); } }
    return { total, linhas, m3, pecas, sug, viagens };
  }

  function resumoHtml() {
    const c = contas();
    const veic = c.m3 ? `<div class="cm-res-veic">${C.qtdBR(Math.round(c.m3 * 100) / 100)} m³ em ${c.pecas} ${c.pecas === 1 ? 'peça' : 'peças'}${c.sug ? ` · sugerido: <strong>${e(c.sug.nome)}${c.viagens > 1 ? ` × ${c.viagens}` : ''}</strong>${n(q[c.sug.id]) ? ' ✓' : ` <button type="button" class="mt-usar" data-usar="${c.sug.id}" data-viagens="${c.viagens}">Usar</button>`}` : ''}</div>` : '';
    return c.linhas || c.m3 ? `<div class="cm-res-num"><strong>${R(c.total)}</strong> · ${c.linhas} ${c.linhas === 1 ? 'item' : 'itens'}</div>${veic}` : '<div class="cm-res-vazio">Marque as quantidades abaixo</div>';
  }

  function contador(chave, valor, rotulo) {
    return `<div class="cm-cont">
      <button type="button" data-menos="${chave}" aria-label="Menos ${e(rotulo)}">−</button>
      <input class="mt-qtd" data-qtd="${chave}" inputmode="decimal" value="${e(valor || '')}" placeholder="0" aria-label="Quantidade de ${e(rotulo)}"/>
      <button type="button" data-mais="${chave}" aria-label="Mais ${e(rotulo)}">+</button></div>`;
  }

  function linhaHtml(i) {
    const x = n(q[i.id]);
    const sub = i.m3 ? `${C.qtdBR(i.m3)} m³${i.preco_cents ? ` · carregar ${R(i.preco_cents)}` : ''}` : i.capacidade_m3 ? `cabe ${C.qtdBR(i.capacidade_m3)} m³ · ${R(i.preco_cents)}` : `${R(i.preco_cents)} por ${C.nomeUnidade(i.unidade)}`;
    let extra = '';
    if (i.m3 && i.desmonta && x) {
      extra = `<div class="mt-desm">
        <div><span>Desmontar <small>${R(i.preco_desm_cents)} cada</small></span>${contador('d|' + i.id, desm[i.id] == null ? C.qtdBR(x) : desm[i.id], 'desmontar ' + i.nome)}</div>
        <div><span>Montar <small>${R(i.preco_mont_cents)} cada</small></span>${contador('m|' + i.id, mont[i.id] == null ? C.qtdBR(x) : mont[i.id], 'montar ' + i.nome)}</div></div>`;
    }
    if (i.unidade === 'm²' && !i.m3) {
      extra += `<details class="mt-m2"><summary>📐 Calcular m²</summary>
        <div class="mt-m2-campos"><label class="cm-campo"><span>Largura (m)</span><input data-l="${i.id}" inputmode="decimal" placeholder="3,00"/></label>
        <span class="mt-x">×</span><label class="cm-campo"><span>Comprimento / altura (m)</span><input data-c="${i.id}" inputmode="decimal" placeholder="4,00"/></label></div>
        <button type="button" class="btn-outline btn-sm" data-m2="${i.id}" style="margin-top:8px">Somar à quantidade</button>
        <p class="cm-dica">Pode somar várias paredes ou cômodos, um de cada vez.</p></details>`;
    }
    return `<div class="cm-movel mt-linha${x ? ' cm-on' : ''}" data-id="${i.id}">
      <div class="mt-topo"><div class="cm-movel-nome">${e(i.nome)}<span>${sub}</span></div>${contador('q|' + i.id, q[i.id], i.nome)}</div>${extra}</div>`;
  }

  function corpoHtml() {
    if (!tabela.length) return `<div class="tb-vazia"><p style="font-size:var(--fs-md);margin:16px 0">Sua tabela de preços está vazia.</p>
      <a class="btn-primary btn-gold" href="tabela.html" style="text-decoration:none">Montar minha tabela</a>
      <p class="cm-dica">Escolha sua profissão e a tabela já vem pronta. Depois é só ajustar os preços.</p></div>`;
    const termo = busca.trim().toLowerCase();
    const grupos = {};
    tabela.filter(i => !termo || i.nome.toLowerCase().includes(termo) || i.grupo.toLowerCase().includes(termo))
      .forEach(i => (grupos[i.grupo] = grupos[i.grupo] || []).push(i));
    const blocos = Object.entries(grupos).map(([g, l]) => `<h3 class="cm-cat">${e(g)}</h3>${l.map(linhaHtml).join('')}`).join('');
    return blocos || '<p class="cm-dica">Nada encontrado com esse nome.</p>';
  }

  function render() {
    folha.innerHTML = `
      <div class="cm-topo"><div><h2>📋 Montar pela minha tabela</h2><p>Marque as quantidades. Os itens entram no orçamento com o seu preço.</p></div>
        <button type="button" class="cm-x" data-fechar aria-label="Fechar">✕</button></div>
      <div class="cm-resumo" id="mt-resumo">${resumoHtml()}</div>
      <div class="cm-corpo">
        ${tabela.length > 8 ? `<input class="mt-busca" id="mt-busca" type="search" placeholder="🔎 Procurar na tabela" value="${e(busca)}" aria-label="Procurar na tabela"/>` : ''}
        <div id="mt-lista">${corpoHtml()}</div>
        ${tabela.length ? '<p class="cm-dica" style="margin-top:16px">Falta algum serviço? Adicione depois no orçamento ou em <a href="tabela.html">Minha tabela de preços</a>.</p>' : ''}
      </div>
      ${tabela.length ? `<div class="cm-rodape"><p class="error" id="mt-msg"></p><button type="button" class="btn-primary btn-gold" data-gerar>Colocar no orçamento</button></div>` : ''}`;
  }
  function atualizarResumo() { folha.querySelector('#mt-resumo').innerHTML = resumoHtml(); }
  function redesenharLinha(id) {
    const i = tabela.find(x => x.id === id), el = folha.querySelector(`.mt-linha[data-id="${id}"]`);
    if (!i || !el || !el.isConnected) return;
    const aberto = el.querySelector('.mt-m2')?.open;
    el.outerHTML = linhaHtml(i);
    if (aberto) folha.querySelector(`.mt-linha[data-id="${id}"] .mt-m2`).open = true;
  }

  function gerar() {
    const c = contas(), itens = [], moveis = [];
    for (const i of tabela) {
      const x = n(q[i.id]); if (!x) continue;
      const p = i.preco_cents / 100;
      if (i.m3) {
        moveis.push(x > 1 ? `${i.nome} (${C.qtdBR(x)})` : i.nome);
        if (i.preco_cents) itens.push({ descricao: `Carregamento — ${i.nome}`, qtd: x, unidade: 'un', preco: p });
        if (i.desmonta && qDesm(i) && i.preco_desm_cents) itens.push({ descricao: `Desmontagem — ${i.nome}`, qtd: qDesm(i), unidade: 'un', preco: i.preco_desm_cents / 100 });
        if (i.desmonta && qMont(i) && i.preco_mont_cents) itens.push({ descricao: `Montagem — ${i.nome}`, qtd: qMont(i), unidade: 'un', preco: i.preco_mont_cents / 100 });
      } else itens.push({ descricao: i.nome, qtd: x, unidade: i.unidade, preco: p });
    }
    if (!itens.length && !moveis.length) { folha.querySelector('#mt-msg').textContent = 'Marque pelo menos uma quantidade.'; return; }
    if (moveis.length && !tabela.some(i => i.capacidade_m3 && n(q[i.id])) && tabela.some(i => i.capacidade_m3)) {
      if (!confirm('Você marcou móveis mas nenhum veículo/frete. Colocar assim mesmo?')) return;
    }
    aoGerarItens(itens);
    if (moveis.length && aoGerarTexto) aoGerarTexto(`Móveis (${C.qtdBR(Math.round(c.m3 * 10) / 10)} m³): ${moveis.join(', ')}.`);
    fechar();
  }

  folha.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-fechar')) return fechar();
    if (b.hasAttribute('data-gerar')) return gerar();
    if (b.dataset.usar) { q[b.dataset.usar] = String(b.dataset.viagens); redesenharLinha(b.dataset.usar); atualizarResumo(); return; }
    if (b.dataset.m2) {
      const id = b.dataset.m2, l = n(folha.querySelector(`[data-l="${id}"]`).value), c = n(folha.querySelector(`[data-c="${id}"]`).value);
      if (!l || !c) return;
      q[id] = C.qtdBR(Math.round((n(q[id]) + l * c) * 100) / 100);
      redesenharLinha(id); atualizarResumo(); return;
    }
    const ch = b.dataset.mais || b.dataset.menos; if (!ch) return;
    const [tipo, id] = ch.split('|'), d = b.dataset.mais ? 1 : -1;
    const alvo = tipo === 'q' ? q : tipo === 'd' ? desm : mont;
    const i = tabela.find(x => x.id === id);
    const atual = tipo === 'q' ? n(q[id]) : tipo === 'd' ? qDesm(i) : qMont(i);
    const novo = Math.max(0, Math.round((atual + d) * 1000) / 1000);
    alvo[id] = novo ? C.qtdBR(novo) : (tipo === 'q' ? '' : '0');
    if (tipo === 'q') { delete desm[id]; delete mont[id]; }
    redesenharLinha(id); atualizarResumo();
  });
  folha.addEventListener('input', ev => {
    const t = ev.target;
    if (t.id === 'mt-busca') { busca = t.value; folha.querySelector('#mt-lista').innerHTML = corpoHtml(); return; }
    if (!t.dataset.qtd) return;
    const [tipo, id] = t.dataset.qtd.split('|');
    (tipo === 'q' ? q : tipo === 'd' ? desm : mont)[id] = t.value;
    const linha = t.closest('.mt-linha'); linha.classList.toggle('cm-on', n(q[id]) > 0);
    atualizarResumo();
  });
  // Ao sair do campo de quantidade, mostra/esconde a parte de desmontar/montar
  // Só redesenha a linha quando precisa mostrar/esconder a parte de desmontar/montar (evita perder o toque seguinte)
  folha.addEventListener('change', ev => {
    const t = ev.target; if (!t.dataset.qtd || !t.dataset.qtd.startsWith('q|')) return;
    const id = t.dataset.qtd.split('|')[1], i = tabela.find(x => x.id === id), el = t.closest('.mt-linha');
    if (!i || !i.m3 || !i.desmonta || !el) return;
    if (!!el.querySelector('.mt-desm') !== n(q[id]) > 0) { delete desm[id]; delete mont[id]; redesenharLinha(id); }
  });
  fundo.addEventListener('click', ev => { if (ev.target === fundo) fechar(); });
  render();
}
