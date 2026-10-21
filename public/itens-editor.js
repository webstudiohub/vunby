/* VUNBY — editor de itens do orçamento (prestador). Usa calc.js para o total ao vivo.
   uso: const ed = ItensEditor(elemento, estadoInicial, aoMudar);  ed.dados() → corpo para a API */
'use strict';

const TIPO_ROTULO = { incluido: 'Incluído', recomendado: 'Recomendado', opcional: 'Opcional' };
const TIPO_DICA = {
  incluido: 'Sempre entra no total. O cliente não pode tirar.',
  recomendado: 'Já vem marcado, mas o cliente pode tirar.',
  opcional: 'Vem desmarcado. O cliente escolhe se quer adicionar.',
};

function ItensEditor(el, inicial, aoMudar, opcoes) {
  const ferramentas = (opcoes && opcoes.ferramentas) || []; // ex.: [{ rotulo:'Montar pela minha tabela', icone:'lista', acao: fn }]
  const C = window.VCalc;
  const st = {
    itens: (inicial && inicial.itens || []).map(i => ({
      descricao: i.descricao || '', unidade: i.unidade || 'un', tipo: i.tipo || 'incluido',
      qtd: i.qtd !== undefined ? String(i.qtd).replace('.', ',') : '1',
      preco: i.preco !== undefined ? String(i.preco) : i.preco_cents !== undefined ? (Number(i.preco_cents) / 100).toFixed(2).replace('.', ',') : '',
    })),
    desconto: inicial && inicial.desconto || '', taxa: inicial && inicial.taxa || '',
    taxaNome: inicial && inicial.taxaNome || '', sinalPct: inicial && inicial.sinalPct || '',
  };
  const e = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const temExtras = () => !!(st.desconto || st.taxa || st.sinalPct);

  function paraCalculo() {
    return {
      itens: st.itens.map((i, k) => ({ id: String(k), tipo: i.tipo, qtd: C.numeroBR(i.qtd) || 0, preco_cents: C.centavos(i.preco) || 0 })),
      desconto_cents: C.centavos(st.desconto) || 0, taxa_cents: C.centavos(st.taxa) || 0, sinal_pct: C.numeroBR(st.sinalPct) || 0,
    };
  }

  function resumoHtml() {
    const q = paraCalculo();
    const r = C.calcular(q, null);
    const temOpc = st.itens.some(i => i.tipo !== 'incluido');
    const tudo = temOpc ? C.calcular(q, new Set(q.itens.map(i => i.id))).total : r.total;
    const minimo = temOpc ? C.calcular(q, new Set()).total : r.total;
    const linha = (rot, val, cls = '') => `<div class="ie-res-linha ${cls}"><span>${rot}</span><strong>${val}</strong></div>`;
    return linha('Itens', C.reais(r.itens))
      + (r.desconto ? linha('Desconto', '− ' + C.reais(r.desconto)) : '')
      + (r.taxa ? linha(e(st.taxaNome || 'Taxa / deslocamento'), C.reais(r.taxa)) : '')
      + linha('Total', C.reais(r.total), 'ie-res-total')
      + (r.sinal ? linha(`Sinal (${C.qtdBR(C.numeroBR(st.sinalPct))}%)`, C.reais(r.sinal)) : '')
      + (st.itens.filter(i => i.tipo !== 'incluido').length > 3 ? `<p class="ie-res-aviso">${window.ic ? window.ic('alerta', 18) : ''} Muitas opções confundem o cliente e atrasam a decisão. O ideal é até 3 itens opcionais ou recomendados.</p>` : '')
      + (temOpc ? `<p class="ie-res-nota">O cliente escolhe os opcionais: o total pode ir de <strong>${C.reais(minimo)}</strong> a <strong>${C.reais(tudo)}</strong>.</p>` : '');
  }

  function itemHtml(i, k) {
    const n = st.itens.length;
    const tot = C.reais(Math.round((C.numeroBR(i.qtd) || 0) * (C.centavos(i.preco) || 0)));
    return `<div class="ie-item ie-${i.tipo}" data-k="${k}">
      <div class="ie-topo">
        <span class="ie-num ie-ico" title="Item ${k + 1}" aria-hidden="true">${C.iconeItem(i.descricao)}</span>
        <textarea class="ie-desc" data-f="descricao" maxlength="200" rows="2" placeholder="Ex: Desmontagem de guarda-roupa" aria-label="Descrição do item ${k + 1}">${e(i.descricao)}</textarea>
      </div>
      <div class="ie-nums">
        <label class="ie-campo"><span>Qtd</span><input data-f="qtd" inputmode="decimal" value="${e(i.qtd)}" aria-label="Quantidade"/></label>
        <label class="ie-campo"><span>Unidade</span><select data-f="unidade" aria-label="Unidade">${C.UNIDADES.map(u => `<option value="${u}"${u === i.unidade ? ' selected' : ''}>${C.nomeUnidade(u)}</option>`).join('')}</select></label>
        <label class="ie-campo ie-preco"><span>Valor (R$)</span><input data-f="preco" inputmode="decimal" placeholder="0,00" value="${e(i.preco)}" aria-label="Valor unitário"/></label>
      </div>
      <div class="ie-linha-total">= <strong data-tot="${k}">${tot}</strong></div>
      <div class="ie-tipos" role="radiogroup" aria-label="Tipo do item">
        ${['incluido', 'recomendado', 'opcional'].map(t => `<button type="button" class="ie-tipo${t === i.tipo ? ' ativo' : ''}" data-tipo="${t}" role="radio" aria-checked="${t === i.tipo}">${t === i.tipo ? '✓ ' : ''}${TIPO_ROTULO[t]}</button>`).join('')}
      </div>
      <p class="ie-dica">${TIPO_DICA[i.tipo]}</p>
      <div class="ie-acoes">
        <button type="button" data-acao="mais" aria-expanded="false">Mais opções</button>
        <button type="button" data-acao="remover" class="ie-remover" aria-label="Remover item ${k + 1}">Remover</button>
      </div>
      <div class="ie-mais" hidden>
        <button type="button" data-acao="subir" ${k === 0 ? 'disabled' : ''}>↑ Subir</button>
        <button type="button" data-acao="descer" ${k === n - 1 ? 'disabled' : ''}>↓ Descer</button>
        <button type="button" data-acao="duplicar">Duplicar</button>
      </div>
    </div>`;
  }

  function render(focarUltimo) {
    el.innerHTML = `
      <div class="ie-lista">${st.itens.length ? st.itens.map(itemHtml).join('') : '<p class="muted ie-vazio">Nenhum item ainda. Adicione o primeiro abaixo.</p>'}</div>
      ${ferramentas.map((f, k) => `<button type="button" class="btn-primary btn-gold ie-add ie-ferramenta" data-ferr="${k}">${f.icone && window.ic ? window.ic(f.icone) + ' ' : ''}${e(f.rotulo)}</button>`).join('')}
      <button type="button" class="btn-outline ie-add" data-acao="adicionar">+ Adicionar item avulso</button>
      <details class="ie-extras"${temExtras() ? ' open' : ''}>
        <summary>Desconto, taxa e sinal</summary>
        <label>Desconto (R$)</label>
        <input data-x="desconto" inputmode="decimal" placeholder="0,00" value="${e(st.desconto)}"/>
        <label>Taxa extra (ex.: deslocamento)</label>
        <div class="ie-taxa">
          <input data-x="taxaNome" maxlength="60" placeholder="Nome (ex.: Deslocamento)" value="${e(st.taxaNome)}"/>
          <input data-x="taxa" inputmode="decimal" placeholder="R$ 0,00" value="${e(st.taxa)}"/>
        </div>
        <label>Sinal / entrada (%)</label>
        <input data-x="sinalPct" inputmode="decimal" placeholder="Ex: 30" value="${e(st.sinalPct)}"/>
      </details>
      <div class="ie-resumo" aria-live="polite">${resumoHtml()}</div>`;
    if (focarUltimo) { const d = el.querySelectorAll('.ie-desc'); if (d.length) d[d.length - 1].focus(); }
  }

  function atualizarNumeros() {
    st.itens.forEach((i, k) => {
      const t = el.querySelector(`[data-tot="${k}"]`);
      if (t) t.textContent = C.reais(Math.round((C.numeroBR(i.qtd) || 0) * (C.centavos(i.preco) || 0)));
    });
    el.querySelector('.ie-resumo').innerHTML = resumoHtml();
    aoMudar && aoMudar();
  }

  el.addEventListener('input', ev => {
    const t = ev.target, item = t.closest('.ie-item');
    if (item && t.dataset.f) {
      st.itens[+item.dataset.k][t.dataset.f] = t.value;
      if (t.dataset.f === 'descricao') { const ico = item.querySelector('.ie-ico'); if (ico) ico.textContent = C.iconeItem(t.value); }
    }
    else if (t.dataset.x) st[t.dataset.x] = t.value;
    else return;
    atualizarNumeros();
  });
  el.addEventListener('change', ev => { if (ev.target.dataset.f === 'unidade') atualizarNumeros(); });
  el.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.ferr !== undefined) { ferramentas[+b.dataset.ferr].acao(); return; }
    const item = b.closest('.ie-item'), k = item ? +item.dataset.k : -1;
    if (b.dataset.tipo) { st.itens[k].tipo = b.dataset.tipo; render(); aoMudar && aoMudar(); return; }
    const a = b.dataset.acao; if (!a) return;
    if (a === 'mais') { const m = item.querySelector('.ie-mais'); m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden)); b.textContent = m.hidden ? 'Mais opções' : 'Fechar opções'; return; }
    if (a === 'adicionar') { st.itens.push({ descricao: '', qtd: '1', unidade: 'un', preco: '', tipo: 'incluido' }); render(true); }
    else if (a === 'remover') { st.itens.splice(k, 1); render(); }
    else if (a === 'duplicar') { st.itens.splice(k + 1, 0, { ...st.itens[k] }); render(); }
    else if (a === 'subir' && k > 0) { [st.itens[k - 1], st.itens[k]] = [st.itens[k], st.itens[k - 1]]; render(); }
    else if (a === 'descer' && k < st.itens.length - 1) { [st.itens[k + 1], st.itens[k]] = [st.itens[k], st.itens[k + 1]]; render(); }
    aoMudar && aoMudar();
  });

  render();
  return {
    // Corpo para a API
    dados: () => ({
      itens: st.itens.map(i => ({ descricao: i.descricao, qtd: i.qtd, unidade: i.unidade, preco: i.preco, tipo: i.tipo })),
      desconto: st.desconto, taxa: st.taxa, taxaNome: st.taxaNome, sinalPct: st.sinalPct,
    }),
    // Estado bruto (para rascunho)
    estado: () => JSON.parse(JSON.stringify(st)),
    quantos: () => st.itens.length,
    // Acrescenta itens prontos (ex.: vindos da tabela de preços); preço em reais (número)
    adicionarItens: lista => {
      for (const i of lista) st.itens.push({ descricao: i.descricao, qtd: C.qtdBR(i.qtd), unidade: i.unidade || 'un', tipo: i.tipo || 'incluido', preco: Number(i.preco || 0).toFixed(2).replace('.', ',') });
      render(); aoMudar && aoMudar();
    },
    total: () => C.calcular(paraCalculo(), null).total,
    // Erro de preenchimento (para avisar antes de enviar), ou ''
    validar: () => {
      for (const [k, i] of st.itens.entries()) {
        const nome = `Item ${k + 1}`;
        if (!i.descricao.trim()) return `${nome}: escreva a descrição.`;
        const q = C.numeroBR(i.qtd); if (!(q > 0)) return `${nome}: quantidade inválida.`;
        const p = C.numeroBR(i.preco); if (!(p >= 0)) return `${nome}: valor inválido.`;
      }
      return '';
    },
  };
}
