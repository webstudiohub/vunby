/* VUNBY — modelos prontos da "Minha tabela de preços", por profissão.
   Preços são EXEMPLOS de referência (pesquisa de mercado 13/10/2026, variam por região): o prestador ajusta.
   Volumes de móveis: médias de calculadoras públicas de empresas de mudança. Roda no navegador e no servidor. */
(function (raiz) {
  'use strict';
  // [grupo, nome, unidade, preço R$, extras]  extras: m3 (móvel), cap (veículo m³), d (desmonta), pd/pm (R$ desmontar/montar)
  const MOVEIS = [
    ['Sofá 2 lugares', 1.0], ['Sofá 3 lugares', 1.5], ['Sofá 4 lugares / com chaise', 2.0], ['Poltrona', 0.5],
    ['Rack / estante baixa', 0.3], ['Estante alta', 0.6], ['Mesa de centro', 0.3], ['TV até 50"', 0.15], ['TV 55" a 65"', 0.27],
    ['Mesa de jantar', 0.8, 50, 50], ['Cadeira', 0.2], ['Buffet / aparador', 1.0],
    ['Cama de casal', 1.8, 80, 80], ['Cama de solteiro', 1.2, 60, 60], ['Colchão de casal', 0.8], ['Colchão de solteiro', 0.5],
    ['Beliche', 2.1, 100, 100], ['Berço', 0.6, 60, 60], ['Guarda-roupa 2 portas', 1.7, 120, 120], ['Guarda-roupa 3 ou 4 portas', 2.2, 180, 180],
    ['Guarda-roupa 5 ou 6 portas', 3.0, 250, 250], ['Cômoda', 1.2], ['Criado-mudo', 0.2], ['Escrivaninha', 0.6, 60, 60],
    ['Geladeira', 0.9], ['Geladeira duplex / inverse', 1.3], ['Freezer', 0.8], ['Fogão', 0.3], ['Micro-ondas', 0.3],
    ['Armário de cozinha (módulo)', 1.0, 80, 80], ['Mesa pequena', 0.5], ['Máquina de lavar', 0.5], ['Ar-condicionado', 0.5],
    ['Bicicleta', 0.3], ['Caixa de papelão', 0.2],
  ].map(([n, m3, pd, pm]) => ['Móveis', n, 'un', 0, { m3, d: !!pd, pd: pd || 0, pm: pm || 0 }]);

  const KITS = {
    mudanca: { nome: 'Mudança e frete', itens: [
      ['Transporte', 'Frete com utilitário (até 10 m³)', 'vb', 250, { cap: 10 }],
      ['Transporte', 'Frete com caminhão 3/4 (até 20 m³)', 'vb', 600, { cap: 20 }],
      ['Transporte', 'Frete com caminhão toco (até 35 m³)', 'vb', 900, { cap: 35 }],
      ['Transporte', 'Quilômetro rodado', 'km', 4],
      ['Serviços', 'Ajudante', 'diária', 150],
      ['Serviços', 'Escada sem elevador (por andar)', 'andar', 30],
      ['Serviços', 'Caixa de embalagem', 'un', 10],
      ['Serviços', 'Embalagem de móvel (plástico bolha)', 'un', 15],
      ['Serviços', 'Içamento', 'un', 350],
      ...MOVEIS,
    ] },
    montador: { nome: 'Montagem de móveis', itens: [
      ['Montagem', 'Montagem de guarda-roupa 2 portas', 'un', 120], ['Montagem', 'Montagem de guarda-roupa 3 ou 4 portas', 'un', 180],
      ['Montagem', 'Montagem de guarda-roupa 5 ou 6 portas', 'un', 250], ['Montagem', 'Montagem de cama', 'un', 80],
      ['Montagem', 'Montagem de cômoda', 'un', 80], ['Montagem', 'Montagem de rack / painel de TV', 'un', 120],
      ['Montagem', 'Montagem de cozinha (por módulo)', 'un', 80], ['Montagem', 'Montagem de escrivaninha', 'un', 70],
      ['Desmontagem', 'Desmontagem de guarda-roupa', 'un', 100], ['Desmontagem', 'Desmontagem de cama', 'un', 50],
      ['Instalação', 'Instalação de prateleira', 'un', 40], ['Instalação', 'Instalação de painel na parede', 'un', 120],
      ['Outros', 'Visita técnica', 'vb', 50],
    ] },
    eletricista: { nome: 'Eletricista', itens: [
      ['Pontos', 'Tomada simples', 'ponto', 60], ['Pontos', 'Tomada 20A / 220V', 'ponto', 80], ['Pontos', 'Interruptor simples', 'ponto', 65],
      ['Pontos', 'Ponto de luz', 'ponto', 80],
      ['Instalação', 'Instalação de luminária / lustre', 'un', 90], ['Instalação', 'Instalação de chuveiro elétrico', 'un', 120],
      ['Instalação', 'Troca de disjuntor', 'un', 80], ['Instalação', 'Montagem de quadro de distribuição', 'un', 450],
      ['Instalação', 'Passagem de fiação', 'm', 12],
      ['Outros', 'Visita técnica', 'vb', 80], ['Outros', 'Diária de eletricista', 'diária', 450],
    ] },
    ar: { nome: 'Ar-condicionado', itens: [
      ['Instalação', 'Instalação split 9.000 BTUs', 'un', 550], ['Instalação', 'Instalação split 12.000 BTUs', 'un', 650],
      ['Instalação', 'Instalação split 18.000 BTUs', 'un', 900], ['Instalação', 'Instalação split 24.000 BTUs', 'un', 1100],
      ['Instalação', 'Metro adicional de tubulação', 'm', 120], ['Instalação', 'Suporte (mão francesa)', 'un', 80],
      ['Manutenção', 'Limpeza / higienização', 'un', 200], ['Manutenção', 'Recarga de gás', 'un', 300],
      ['Manutenção', 'Desinstalação', 'un', 250], ['Outros', 'Visita técnica', 'vb', 80],
    ] },
    pintor: { nome: 'Pintor', itens: [
      ['Pintura', 'Pintura de parede (2 demãos)', 'm²', 18], ['Pintura', 'Pintura de teto', 'm²', 20],
      ['Pintura', 'Massa corrida', 'm²', 25], ['Pintura', 'Textura / grafiato', 'm²', 50],
      ['Pintura', 'Pintura de porta', 'un', 120], ['Pintura', 'Pintura de janela / grade', 'un', 100],
      ['Outros', 'Diária de pintor', 'diária', 300],
    ] },
    pedreiro: { nome: 'Pedreiro e reforma', itens: [
      ['Piso e revestimento', 'Assentamento de piso', 'm²', 45], ['Piso e revestimento', 'Revestimento de parede', 'm²', 50],
      ['Piso e revestimento', 'Rodapé', 'm', 15], ['Piso e revestimento', 'Contrapiso', 'm²', 30],
      ['Alvenaria', 'Levantar parede (bloco)', 'm²', 60], ['Alvenaria', 'Reboco', 'm²', 35], ['Alvenaria', 'Demolição', 'm²', 30],
      ['Outros', 'Diária de pedreiro', 'diária', 300], ['Outros', 'Diária de ajudante', 'diária', 150],
    ] },
    encanador: { nome: 'Encanador', itens: [
      ['Serviços', 'Troca de torneira', 'un', 80], ['Serviços', 'Troca de sifão', 'un', 70],
      ['Serviços', 'Desentupimento de pia', 'un', 150], ['Serviços', 'Desentupimento de vaso', 'un', 180],
      ['Serviços', 'Instalação de vaso sanitário', 'un', 200], ['Serviços', 'Conserto de vazamento', 'un', 150],
      ['Serviços', 'Instalação de aquecedor', 'un', 350], ['Serviços', 'Ponto hidráulico', 'ponto', 120],
      ['Outros', 'Visita técnica', 'vb', 80],
    ] },
    limpeza: { nome: 'Limpeza', itens: [
      ['Limpeza', 'Faxina residencial', 'diária', 200], ['Limpeza', 'Limpeza pós-obra', 'm²', 8],
      ['Limpeza', 'Limpeza de vidros', 'm²', 10], ['Estofados', 'Limpeza de sofá', 'un', 150],
      ['Estofados', 'Limpeza de colchão', 'un', 120], ['Outros', 'Passar roupa', 'h', 30],
    ] },
    jardinagem: { nome: 'Jardinagem', itens: [
      ['Serviços', 'Corte de grama', 'm²', 2], ['Serviços', 'Limpeza de terreno', 'm²', 3],
      ['Serviços', 'Poda de árvore', 'un', 150], ['Serviços', 'Plantio de muda', 'un', 25],
      ['Outros', 'Diária de jardineiro', 'diária', 200],
    ] },
    confeitaria: { nome: 'Confeitaria', itens: [
      ['Bolos', 'Bolo recheado', 'kg', 75], ['Bolos', 'Bolo decorado', 'kg', 110], ['Bolos', 'Topo de bolo', 'un', 30],
      ['Doces e salgados', 'Docinhos', 'cento', 120], ['Doces e salgados', 'Salgados', 'cento', 90],
      ['Doces e salgados', 'Cupcake', 'un', 8], ['Outros', 'Taxa de entrega', 'vb', 20],
    ] },
    reparos: { nome: 'Marido de aluguel / reparos', itens: [
      ['Instalação', 'Instalar suporte de TV', 'un', 120], ['Instalação', 'Instalar cortina / persiana', 'un', 80],
      ['Instalação', 'Instalar prateleira', 'un', 40], ['Reparos', 'Troca de resistência de chuveiro', 'un', 60],
      ['Reparos', 'Pequenos reparos', 'h', 70], ['Outros', 'Visita técnica', 'vb', 50],
    ] },
  };

  // Profissão escrita no cadastro → modelo sugerido
  function kitDaProfissao(p) {
    p = String(p || '').toLowerCase();
    if (/mudan|frete|carreto/.test(p)) return 'mudanca';
    if (/montag|montador|móve|move/.test(p)) return 'montador';
    if (/eletric/.test(p)) return 'eletricista';
    if (/ar-cond|ar cond|refrig|climat/.test(p)) return 'ar';
    if (/pint/.test(p)) return 'pintor';
    if (/pedreir|constru|reform|obra/.test(p)) return 'pedreiro';
    if (/encan|hidr|bombeir/.test(p)) return 'encanador';
    if (/limpez|faxin|diarist/.test(p)) return 'limpeza';
    if (/jardin/.test(p)) return 'jardinagem';
    if (/confeit|bolo|doce|salgad/.test(p)) return 'confeitaria';
    if (/marido|reparo|manuten/.test(p)) return 'reparos';
    return null;
  }

  const api = { KITS, kitDaProfissao };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.VKits = api;
})(typeof window !== 'undefined' ? window : this);
