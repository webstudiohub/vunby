/* VUNBY — calculadora de mudança: marca os móveis, soma os m³, sugere o veículo e gera os itens do orçamento.
   uso: abrirCalcMudanca(itens => editor.adicionarItens(itens), texto => observacoes += texto)
   Volumes médios de mercado (calculadoras públicas de empresas de mudança); o prestador ajusta nos "Outros móveis". */
'use strict';

const MUD_MOVEIS = [
  ['Sala', [['Sofá 2 lugares', 1.0], ['Sofá 3 lugares', 1.5], ['Sofá 4 lugares / com chaise', 2.0], ['Poltrona', 0.5], ['Rack / estante baixa', 0.3], ['Estante alta', 0.6], ['Mesa de centro', 0.3], ['TV até 50"', 0.15], ['TV 55" a 65"', 0.27], ['Mesa de jantar', 0.8, 1], ['Cadeira', 0.2], ['Buffet / aparador', 1.0]]],
  ['Quarto', [['Cama de casal', 1.8, 1], ['Cama de solteiro', 1.2, 1], ['Colchão de casal', 0.8], ['Colchão de solteiro', 0.5], ['Beliche', 2.1, 1], ['Berço', 0.6, 1], ['Guarda-roupa 2 portas', 1.7, 1], ['Guarda-roupa 3 ou 4 portas', 2.2, 1], ['Guarda-roupa 5 ou 6 portas', 3.0, 1], ['Cômoda', 1.2], ['Criado-mudo', 0.2], ['Escrivaninha', 0.6, 1]]],
  ['Cozinha', [['Geladeira', 0.9], ['Geladeira duplex / inverse', 1.3], ['Freezer', 0.8], ['Fogão', 0.3], ['Micro-ondas', 0.3], ['Armário de cozinha (módulo)', 1.0, 1], ['Mesa pequena', 0.5]]],
  ['Lavanderia e outros', [['Máquina de lavar', 0.5], ['Ar-condicionado', 0.5], ['Bicicleta', 0.3], ['Caixa de papelão', 0.2]]],
];
const MUD_PADRAO = {
  precoKm: 4, precoAndar: 5, precoDesmontagem: 100, precoMontagem: 100, precoAjudante: 150, precoCaixa: 10, seguroPct: 1, folgaPct: 10,
  veiculos: [{ nome: 'Utilitário', m3: 10, preco: 250 }, { nome: 'Caminhão 3/4', m3: 20, preco: 600 }, { nome: 'Caminhão toco', m3: 35, preco: 900 }],
};

async function abrirCalcMudanca(aoGerarItens, aoGerarTexto) {
  const C = window.VCalc, R = v => C.reais(Math.round(v * 100));
  const e = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let cfgSalva = null;
  try { cfgSalva = (await api('/api/auth/calc-config')).mudanca || null; } catch { }
  const cfg = JSON.parse(JSON.stringify(cfgSalva || MUD_PADRAO));
  if (!cfg.veiculos || !cfg.veiculos.length) cfg.veiculos = MUD_PADRAO.veiculos.slice();
  const qtd = {};          // "Categoria|Nome" → quantidade
  // Móveis e serviços criados pelo prestador ficam salvos para as próximas mudanças
  const outros = (cfg.moveisExtras || []).map(o => ({ ...o, qtd: 0 }));       // { nome, m3, qtd, desmonta }
  const servicos = (cfg.servicos || []).map(x => ({ ...x, qtd: 0 }));         // { nome, unidade, preco, qtd }
  let editandoServicos = false;
  const st = { km: '', andaresOrigem: '', andaresDestino: '', desmontar: null, montar: null, ajudantes: '2', caixas: '', valorDeclarado: '' };

  const fundo = document.createElement('div');
  fundo.className = 'cm-fundo';
  fundo.innerHTML = '<div class="cm-folha" role="dialog" aria-modal="true" aria-label="Calculadora de mudança"></div>';
  document.body.appendChild(fundo);
  document.body.style.overflow = 'hidden';
  const folha = fundo.firstChild;
  const fechar = () => { fundo.remove(); document.body.style.overflow = ''; };

  const n = v => { const x = C.numeroBR(v); return Number.isFinite(x) && x > 0 ? x : 0; };
  function contas() {
    let m3 = 0, pecas = 0, desm = 0;
    const lista = [];
    for (const [cat, moveis] of MUD_MOVEIS) for (const [nome, vol, d] of moveis) {
      const q = qtd[cat + '|' + nome] || 0; if (!q) continue;
      m3 += q * vol; pecas += q; if (d) desm += q; lista.push([q, nome]);
    }
    for (const o of outros) { if (!o.qtd) continue; m3 += o.qtd * o.m3; pecas += o.qtd; if (o.desmonta) desm += o.qtd; lista.push([o.qtd, o.nome]); }
    const carga = m3 * (1 + (Number(cfg.folgaPct) || 0) / 100);
    const veics = cfg.veiculos.filter(v => v.m3 > 0).sort((a, b) => a.m3 - b.m3);
    let veic = veics.find(v => v.m3 >= carga) || null, viagens = 1;
    if (!veic && veics.length) { veic = veics[veics.length - 1]; viagens = Math.ceil(carga / veic.m3); }
    return { m3, carga, pecas, desm, lista, veic, viagens };
  }

  function resumoHtml() {
    const c = contas();
    if (!c.pecas) return '<div class="cm-res-vazio">Marque os móveis abaixo</div>';
    return `<div class="cm-res-num"><strong>${C.qtdBR(Math.round(c.m3 * 100) / 100)} m³</strong> · ${c.pecas} ${c.pecas === 1 ? 'peça' : 'peças'}</div>
      <div class="cm-res-veic">${c.veic ? `🚚 ${e(c.veic.nome)}${c.viagens > 1 ? ` × ${c.viagens} viagens` : ''} <span>(carga com folga: ${C.qtdBR(Math.round(c.carga * 10) / 10)} m³)</span>` : 'Cadastre um veículo em "Seus preços"'}</div>`;
  }

  function contador(chave, nome, vol, atual, extra) {
    return `<div class="cm-movel${atual ? ' cm-on' : ''}">
      <div class="cm-movel-nome">${e(nome)}<span>${C.qtdBR(vol)} m³</span>${extra || ''}</div>
      <div class="cm-cont">
        <button type="button" data-menos="${e(chave)}" aria-label="Menos ${e(nome)}">−</button>
        <span aria-live="polite">${atual || 0}</span>
        <button type="button" data-mais="${e(chave)}" aria-label="Mais ${e(nome)}">+</button>
      </div></div>`;
  }

  function campo(rot, chave, ph, dica) {
    return `<label class="cm-campo"><span>${rot}</span><input data-st="${chave}" inputmode="decimal" placeholder="${ph}" value="${e(st[chave] ?? '')}"/>${dica ? `<small>${dica}</small>` : ''}</label>`;
  }
  function preco(rot, chave, dica) {
    return `<label class="cm-campo"><span>${rot}</span><input data-cfg="${chave}" inputmode="decimal" value="${e(String(cfg[chave] ?? '').replace('.', ','))}"/>${dica ? `<small>${dica}</small>` : ''}</label>`;
  }

  function render() {
    const c = contas();
    folha.innerHTML = `
      <div class="cm-topo">
        <div><h2>🚚 Calculadora de mudança</h2><p>Marque os móveis. O VUNBY soma o volume e monta os itens.</p></div>
        <button type="button" class="cm-x" data-fechar aria-label="Fechar">✕</button>
      </div>
      <div class="cm-resumo" id="cm-resumo">${resumoHtml()}</div>
      <div class="cm-corpo">
        ${MUD_MOVEIS.map(([cat, moveis]) => `<h3 class="cm-cat">${cat}</h3>${moveis.map(([nome, vol]) => contador(cat + '|' + nome, nome, vol, qtd[cat + '|' + nome])).join('')}`).join('')}
        <h3 class="cm-cat">Meus móveis</h3>
        ${outros.length ? outros.map((o, k) => contador('o|' + k, o.nome, o.m3, o.qtd, `<button type="button" class="cm-apagar" data-apagar-movel="${k}">Apagar da lista</button>`)).join('') : '<p class="cm-dica" style="margin-top:0">Móveis que você adicionar ficam salvos aqui.</p>'}
        <details class="cm-outro"><summary>+ Adicionar móvel (medidas)</summary>
          <label class="cm-campo"><span>Nome</span><input id="cm-o-nome" maxlength="40" placeholder="Ex: Piano"/></label>
          <div class="cm-3"><label class="cm-campo"><span>Largura (m)</span><input id="cm-o-l" inputmode="decimal" placeholder="1,50"/></label>
          <label class="cm-campo"><span>Altura (m)</span><input id="cm-o-a" inputmode="decimal" placeholder="1,20"/></label>
          <label class="cm-campo"><span>Profund. (m)</span><input id="cm-o-p" inputmode="decimal" placeholder="0,60"/></label></div>
          <label class="cm-check"><input type="checkbox" id="cm-o-d"/> Precisa desmontar e montar</label>
          <button type="button" class="btn-outline btn-sm" data-add-outro>Adicionar</button>
          <p class="error" id="cm-o-msg"></p>
        </details>

        <h3 class="cm-cat">Meus serviços extras</h3>
        ${servicos.length ? servicos.map((x, k) => `<div class="cm-movel${x.qtd ? ' cm-on' : ''}">
          <div class="cm-movel-nome">${e(x.nome)}<span>${R(Number(x.preco) || 0)} por ${e(x.unidade)}</span>
            <button type="button" class="cm-apagar" data-apagar-serv="${k}">Apagar da lista</button></div>
          <div class="cm-cont"><button type="button" data-menos="s|${k}" aria-label="Menos ${e(x.nome)}">−</button><span aria-live="polite">${x.qtd}</span><button type="button" data-mais="s|${k}" aria-label="Mais ${e(x.nome)}">+</button></div></div>`).join('')
          : '<p class="cm-dica" style="margin-top:0">Crie os serviços que você cobra à parte (ex.: içamento, embalar quadros, guarda-móveis). Eles ficam salvos com o seu preço.</p>'}
        <details class="cm-outro"><summary>+ Criar serviço extra</summary>
          <label class="cm-campo"><span>Nome do serviço</span><input id="cm-s-nome" maxlength="60" placeholder="Ex: Içamento pela janela"/></label>
          <div class="cm-2"><label class="cm-campo"><span>Cobrado por</span><select id="cm-s-un">${C.UNIDADES.map(u => `<option${u === 'un' ? ' selected' : ''}>${u}</option>`).join('')}</select></label>
          <label class="cm-campo"><span>Seu preço (R$)</span><input id="cm-s-preco" inputmode="decimal" placeholder="0,00"/></label></div>
          <button type="button" class="btn-outline btn-sm" style="margin-top:10px" data-add-serv>Criar e salvar</button>
          <p class="error" id="cm-s-msg"></p>
        </details>

        <h3 class="cm-cat">Trajeto e serviço</h3>
        ${campo('Distância (km)', 'km', 'Ex: 12', 'Da origem até o destino')}
        <div class="cm-2">${campo('Andares de escada na saída', 'andaresOrigem', '0', 'Sem elevador')}${campo('Andares de escada na chegada', 'andaresDestino', '0', 'Sem elevador')}</div>
        <div class="cm-2">${campo('Peças para desmontar', 'desmontar', String(c.desm))}${campo('Peças para montar', 'montar', String(c.desm))}</div>
        <p class="cm-dica">Já contamos ${c.desm} ${c.desm === 1 ? 'peça' : 'peças'} que costumam ser desmontadas (camas, guarda-roupas, mesas). Mude se precisar.</p>
        <div class="cm-2">${campo('Ajudantes', 'ajudantes', '2')}${campo('Caixas de embalagem', 'caixas', '0', 'Entra como recomendado')}</div>
        ${campo('Valor declarado para seguro (R$)', 'valorDeclarado', 'Opcional', 'O seguro entra como opcional para o cliente')}

        <details class="cm-precos"${cfgSalva ? '' : ' open'}><summary>💲 Seus preços${cfgSalva ? '' : ' — confira antes de gerar'}</summary>
          <p class="cm-dica">Ficam salvos para as próximas mudanças. Valores iniciais são só exemplo: ajuste aos seus.</p>
          <div class="cm-veics">${cfg.veiculos.map((v, k) => `<div class="cm-veic">
            <input data-veic="${k}" data-vc="nome" maxlength="40" value="${e(v.nome)}" aria-label="Nome do veículo"/>
            <label class="cm-campo"><span>Cabe (m³)</span><input data-veic="${k}" data-vc="m3" inputmode="decimal" value="${e(String(v.m3).replace('.', ','))}"/></label>
            <label class="cm-campo"><span>Preço (R$)</span><input data-veic="${k}" data-vc="preco" inputmode="decimal" value="${e(String(v.preco).replace('.', ','))}"/></label>
            <button type="button" class="cm-rem" data-rem-veic="${k}" aria-label="Remover veículo">✕</button></div>`).join('')}
            ${cfg.veiculos.length < 8 ? '<button type="button" class="btn-outline btn-sm" data-add-veic>+ Veículo</button>' : ''}</div>
          <div class="cm-2">${preco('R$ por km', 'precoKm')}${preco('Escada: R$ por andar, por peça', 'precoAndar')}</div>
          <div class="cm-2">${preco('Desmontagem (R$ por peça)', 'precoDesmontagem')}${preco('Montagem (R$ por peça)', 'precoMontagem')}</div>
          <div class="cm-2">${preco('Ajudante (R$ por diária)', 'precoAjudante')}${preco('Caixa de embalagem (R$)', 'precoCaixa')}</div>
          <div class="cm-2">${preco('Seguro (% do valor declarado)', 'seguroPct')}${preco('Folga no caminhão (%)', 'folgaPct', 'A carga nunca encaixa perfeita')}</div>
        </details>
      </div>
      <div class="cm-rodape">
        <p class="error" id="cm-msg"></p>
        <button type="button" class="btn-primary btn-gold" data-gerar>Gerar itens no orçamento</button>
      </div>`;
  }

  function atualizarResumo() { const r = folha.querySelector('#cm-resumo'); if (r) r.innerHTML = resumoHtml(); }

  // Salva preços, veículos, móveis e serviços do prestador (sem travar se falhar)
  function salvarConfig() {
    const num = k => Number(C.numeroBR(String(cfg[k]))) || 0;
    const novo = {};
    for (const k of ['precoKm', 'precoAndar', 'precoDesmontagem', 'precoMontagem', 'precoAjudante', 'precoCaixa', 'seguroPct', 'folgaPct']) novo[k] = num(k);
    novo.veiculos = cfg.veiculos.map(v => ({ nome: v.nome, m3: Number(C.numeroBR(String(v.m3))) || 0, preco: Number(C.numeroBR(String(v.preco))) || 0 }));
    novo.moveisExtras = outros.map(o => ({ nome: o.nome, m3: o.m3, desmonta: !!o.desmonta }));
    novo.servicos = servicos.map(x => ({ nome: x.nome, unidade: x.unidade, preco: Number(x.preco) || 0 }));
    cfgSalva = novo;
    return api('/api/auth/calc-config', { method: 'PUT', body: { mudanca: novo } }).catch(() => { });
  }

  function gerar() {
    const c = contas(), msg = folha.querySelector('#cm-msg');
    if (!c.pecas && !servicos.some(x => x.qtd)) { msg.textContent = 'Marque pelo menos um móvel ou serviço.'; return; }
    if (c.pecas && !c.veic) { msg.textContent = 'Cadastre ao menos um veículo em "Seus preços".'; return; }
    const num = k => Number(C.numeroBR(String(cfg[k]))) || 0;
    const itens = [];
    const vol = C.qtdBR(Math.round(c.m3 * 10) / 10);
    if (c.pecas) itens.push({ descricao: `Transporte — ${c.veic.nome} (${vol} m³ de móveis)`, qtd: c.viagens, unidade: c.viagens > 1 ? 'un' : 'vb', preco: c.veic.preco });
    const km = n(st.km);
    if (km && num('precoKm')) itens.push({ descricao: 'Distância percorrida', qtd: km, unidade: 'km', preco: num('precoKm') });
    const andares = n(st.andaresOrigem) + n(st.andaresDestino);
    if (andares && c.pecas && num('precoAndar')) itens.push({ descricao: `Escada sem elevador — ${C.qtdBR(andares)} ${andares === 1 ? 'andar' : 'andares'} × ${c.pecas} peças`, qtd: andares * c.pecas, unidade: 'andar', preco: num('precoAndar') });
    const desm = st.desmontar === null || st.desmontar === '' ? c.desm : n(st.desmontar);
    const mont = st.montar === null || st.montar === '' ? c.desm : n(st.montar);
    if (desm && num('precoDesmontagem')) itens.push({ descricao: 'Desmontagem de móveis', qtd: desm, unidade: 'un', preco: num('precoDesmontagem') });
    if (mont && num('precoMontagem')) itens.push({ descricao: 'Montagem de móveis', qtd: mont, unidade: 'un', preco: num('precoMontagem') });
    const aj = c.pecas ? n(st.ajudantes) : 0;
    if (aj && num('precoAjudante')) itens.push({ descricao: 'Ajudante', qtd: aj, unidade: 'diária', preco: num('precoAjudante') });
    const cx = n(st.caixas);
    if (cx && num('precoCaixa')) itens.push({ descricao: 'Caixas de embalagem', qtd: cx, unidade: 'un', preco: num('precoCaixa'), tipo: 'recomendado' });
    const vd = n(st.valorDeclarado);
    if (vd && num('seguroPct')) itens.push({ descricao: `Seguro da carga (${C.qtdBR(num('seguroPct'))}% de ${R(vd)})`, qtd: 1, unidade: 'vb', preco: Math.round(vd * num('seguroPct')) / 100, tipo: 'opcional' });
    for (const x of servicos) if (x.qtd) itens.push({ descricao: x.nome, qtd: x.qtd, unidade: x.unidade, preco: Number(x.preco) || 0 });
    const texto = `Móveis (${vol} m³): ` + c.lista.map(([q, nome]) => q > 1 ? `${nome} (${q})` : nome).join(', ') + '.';
    salvarConfig();
    aoGerarItens(itens);
    if (aoGerarTexto && c.pecas) aoGerarTexto(texto);
    fechar();
  }

  folha.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-fechar')) return fechar();
    if (b.hasAttribute('data-gerar')) return gerar();
    const mais = b.dataset.mais, menos = b.dataset.menos;
    if (mais || menos) {
      const ch = mais || menos, d = mais ? 1 : -1;
      const alvo = ch.startsWith('o|') ? outros[+ch.slice(2)] : ch.startsWith('s|') ? servicos[+ch.slice(2)] : null;
      if (alvo) alvo.qtd = Math.max(0, alvo.qtd + d);
      else qtd[ch] = Math.max(0, (qtd[ch] || 0) + d);
      const linha = b.closest('.cm-movel'), v = alvo ? alvo.qtd : qtd[ch];
      linha.querySelector('.cm-cont span').textContent = v; linha.classList.toggle('cm-on', v > 0);
      atualizarResumo();
      const c = contas(); // atualiza a sugestão de desmontagem sem redesenhar a tela
      folha.querySelectorAll('[data-st="desmontar"],[data-st="montar"]').forEach(i => { i.placeholder = String(c.desm); });
      return;
    }
    if (b.hasAttribute('data-add-outro')) {
      const nome = folha.querySelector('#cm-o-nome').value.trim(), m = folha.querySelector('#cm-o-msg');
      const l = n(folha.querySelector('#cm-o-l').value), a = n(folha.querySelector('#cm-o-a').value), p = n(folha.querySelector('#cm-o-p').value);
      if (!nome) { m.textContent = 'Dê um nome ao móvel.'; return; }
      if (!l || !a || !p || l > 20 || a > 20 || p > 20) { m.textContent = 'Informe as 3 medidas em metros (ex.: 1,50).'; return; }
      outros.push({ nome, m3: Math.round(l * a * p * 100) / 100, qtd: 1, desmonta: folha.querySelector('#cm-o-d').checked });
      salvarConfig(); render(); return;
    }
    if (b.hasAttribute('data-add-serv')) {
      const nome = folha.querySelector('#cm-s-nome').value.trim(), m = folha.querySelector('#cm-s-msg');
      const pr = C.numeroBR(folha.querySelector('#cm-s-preco').value);
      if (!nome) { m.textContent = 'Dê um nome ao serviço.'; return; }
      if (!(pr >= 0)) { m.textContent = 'Informe o seu preço (ex.: 150,00).'; return; }
      if (servicos.length >= 30) { m.textContent = 'Máximo de 30 serviços.'; return; }
      servicos.push({ nome, unidade: folha.querySelector('#cm-s-un').value, preco: pr, qtd: 1 });
      salvarConfig(); render(); return;
    }
    if (b.dataset.apagarMovel !== undefined) { outros.splice(+b.dataset.apagarMovel, 1); salvarConfig(); render(); return; }
    if (b.dataset.apagarServ !== undefined) { servicos.splice(+b.dataset.apagarServ, 1); salvarConfig(); render(); return; }
    if (b.hasAttribute('data-add-veic')) { cfg.veiculos.push({ nome: 'Novo veículo', m3: '', preco: '' }); render(); return; }
    if (b.dataset.remVeic !== undefined) { cfg.veiculos.splice(+b.dataset.remVeic, 1); render(); }
  });
  folha.addEventListener('input', ev => {
    const t = ev.target;
    if (t.dataset.st) st[t.dataset.st] = t.value;
    else if (t.dataset.cfg) cfg[t.dataset.cfg] = t.value;
    else if (t.dataset.veic !== undefined) cfg.veiculos[+t.dataset.veic][t.dataset.vc] = t.dataset.vc === 'nome' ? t.value : (C.numeroBR(t.value) || 0);
    else return;
    atualizarResumo();
  });
  fundo.addEventListener('click', ev => { if (ev.target === fundo) fechar(); });
  document.addEventListener('keydown', function esc(ev) { if (ev.key === 'Escape') { fechar(); document.removeEventListener('keydown', esc); } });
  render();
}
