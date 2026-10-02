# VUNBY — MVP v1.1 (implementação)

Implementação da Especificação VUNBY MVP v1.1 (congelada). Segue a ordem de
desenvolvimento definida no documento (Seção 19).

## Aviso importante sobre este ambiente de desenvolvimento

O ambiente onde este código foi escrito **não tinha acesso de rede**, então
não foi possível instalar Express, um driver de banco de dados (Postgres/
SQLite) ou bcrypt via npm. Para o MVP rodar e ser testado de ponta a ponta
mesmo assim, ele foi implementado usando **apenas módulos nativos do
Node.js** (`http`, `crypto`, `fs`) — zero dependências externas.

Isso não é a arquitetura recomendada para produção — é a forma de entregar
algo **funcional e testado agora**. A camada de dados foi isolada de
propósito em um único arquivo (`lib/db.js`) para que a migração para um
banco de verdade não exija tocar em nenhuma rota ou regra de negócio:

- **Banco de dados:** hoje é um arquivo `data/db.json`. Trocar por
  Postgres/SQLite significa reescrever só `lib/db.js` (mesma interface:
  `db()`, `nextId()`, `save()`).
- **Framework HTTP:** hoje é um roteador mínimo em `lib/http.js`. Migrar
  para Express é direto — as assinaturas de rota (`router.get/post`) já
  imitam o Express de propósito.
- **Hash de senha:** usa `crypto.scrypt` nativo (equivalente em segurança
  ao bcrypt). Pode trocar por bcrypt sem mudar a lógica de auth.
- **Sessão:** cookie assinado por HMAC (`lib/auth.js`), sem dependências.

## Como rodar

```bash
node server.js
# abre em http://localhost:3000
```

Não precisa de `npm install` — não há dependências.

Variáveis de ambiente opcionais (veja `lib/config.js` e `lib/auth.js`):
- `PORT` — porta do servidor (padrão 3000).
- `BASE_URL` — domínio público, usado para montar o link que vai dentro
  da mensagem do WhatsApp (padrão `http://localhost:3000`; **mude isso em
  produção**, senão o link enviado ao cliente não vai funcionar).
- `SESSION_SECRET` — segredo de assinatura da sessão (troque em produção).
- `NODE_ENV` — em desenvolvimento, deixe sem definir (ou `development`).

### Desenvolvimento vs. Produção (Ponto 5 — não misturar)

| | Desenvolvimento (padrão) | Produção (obrigatório) |
|---|---|---|
| Protocolo | HTTP, `localhost` | **HTTPS obrigatório** (o cookie de sessão não protege credenciais em trânsito sem TLS) |
| `SESSION_SECRET` | Usa um valor padrão de dev automaticamente | **Obrigatório** definir via variável de ambiente, longo e aleatório — o servidor **recusa subir** (`throw`) se `NODE_ENV=production` e o segredo ainda for o padrão de dev |
| Cookie de sessão | Sem flag `Secure` (funciona em `http://localhost`) | Flag `Secure` ativada automaticamente quando `NODE_ENV=production` — exige HTTPS para o cookie ser aceito |
| Banco de dados | Arquivo `data/db.json` | Trocar por Postgres/SQLite antes de ir ao ar (ver seção de migração acima) — arquivo JSON não é seguro para acesso concorrente real |

Para rodar como produção localmente (só para testar a checagem de
segurança, não use isso como deploy real):
```bash
NODE_ENV=production SESSION_SECRET=um-valor-bem-longo-e-aleatorio node server.js
```

## Entrada: landing pública + rotas /entrar e /cadastro

A rota raiz (`/`) deixou de servir direto a tela de login e passou a servir
uma landing page pública (`public/landing.html`), explicando o produto
antes do visitante chegar na autenticação:

```
/          → landing.html (pública, sem exigir sessão)
/entrar    → index.html (mesmo arquivo de sempre, mostrando o painel de login)
/cadastro  → index.html (mesmo arquivo, mostrando o painel de cadastro)
/index.html → continua funcionando diretamente, sem mudança (nada foi removido)
```

`/entrar` e `/cadastro` **não duplicam lógica** — ambos servem o mesmo
`index.html` que já existia (login+cadastro já estavam juntos nesse
arquivo, alternando por `toggle()`); só adicionei um `if` de 3 linhas que
olha `window.location.pathname` para decidir qual painel mostrar primeiro.
O roteamento em si é feito em `lib/http.js` (servidor de arquivos estático,
sem framework de rotas).

**Nota sobre a imagem do hero:** a landing usa uma simulação ilustrada em
CSS (um "mockup" de conversa de WhatsApp) no lugar da foto profissional
pedida — não há acesso à internet neste ambiente para buscar uma imagem de
banco de imagens real. O bloco está claramente demarcado no HTML
(`public/landing.html`, comentário "Espaço reservado para foto real") para
troca futura por uma foto de verdade.

Teste dedicado: `node landing-test.js` cobre os 10 pontos pedidos (landing
sem sessão, CTAs levando às rotas certas, login/cadastro/dashboard
continuando a funcionar, bloqueio de área privada sem sessão, 401 da API
sem sessão, responsividade mobile, e `/index.html` direto continuando
acessível).

## PWA (Progressive Web App)

Decisão de arquitetura: uma única aplicação web responsiva, instalável como
PWA — não há apps nativos separados de Android/iOS.

- **`public/manifest.json`** — nome, cores da marca (`#003D6B`/`#F5C000`),
  `display: standalone`, ícones em 192/512px (normais e `maskable`).
- **`public/icons/`** — gerados a partir do símbolo V+B congelado via
  `scripts/generate-icons.py` (Pillow). Rodar de novo só se o símbolo
  oficial mudar: `python3 scripts/generate-icons.py`.
- **`public/sw.js`** — Service Worker. Cacheia **somente o casco estático**
  das telas do prestador (HTML/CSS/JS/ícones). **Nunca** intercepta nem
  cacheia `/api/*` — dado de negócio (status, valor em aberto, Radar)
  sempre vem da rede, nunca de cache, porque cachear isso violaria a
  Seção 9/14 da spec (dado tem que estar sempre atualizado).
  - Navegação (HTML): network-first, cache só como fallback offline.
  - CSS/JS/ícones: cache-first, atualiza o cache em segundo plano.
- **Instalação:** o manifest + Service Worker só existem nas páginas do
  **prestador** (`index.html`, `dashboard.html`, `novo-orcamento.html`,
  `radar.html`, `historico.html`, `pacotes.html`,
  `orcamento-detalhe.html`). A página pública do cliente
  (`orcamento.html`) não inclui `app.js`, não referencia o manifest e não
  registra o Service Worker — o cliente nunca precisa instalar nada para
  ver, aceitar ou recusar um orçamento.
- **Responsividade:** `viewport` em todas as páginas, barra de navegação
  com rolagem horizontal em telas estreitas, grids que empilham em coluna
  única, e tabelas dentro de um contêiner com rolagem própria
  (`.table-scroll`) para nunca estourar a largura da tela em mobile.

Teste dedicado: `node pwa-test.js` (com o servidor rodando) confirma que
o manifest e o Service Worker só existem nas páginas certas, que não há
erros de JS, e que não há overflow horizontal em 375px de largura.

## Infraestrutura de conta (Pontos 1 a 5 da rodada de produção)

### 1. Controle de trial por telefone
- Cadastro agora exige telefone (normalizado, só dígitos, para comparação).
- Telefone precisa ser **verificado por código de 6 dígitos** antes do
  trial ser concedido (`account.trialConcedido`: `null` até verificar,
  depois `true`/`false`).
- `db.verifiedTrialPhones` é uma lista **independente da conta** — nunca é
  apagada quando uma conta é excluída. É isso que impede o mesmo telefone
  de receber outro trial depois de excluir e recriar a conta (testado em
  `infra-test.js`, Teste 1).
- Cadastro com telefone já usado **não é bloqueado** — a conta é criada
  normalmente (o objetivo é impedir reuso do trial, não impedir a pessoa de
  ter conta), só não recebe o benefício, e a mensagem de confirmação nunca
  menciona a conta anterior.
- **Duração do trial não foi implementada nem inventada** — a v1.1 não a
  define. O que existe é só a concessão booleana (`trialConcedido`); quando
  o negócio decidir a duração/regras de expiração, isso entra depois.

### ⚠️ Decisão pendente — envio real do código por SMS/WhatsApp
Não há, neste ambiente (sem acesso de rede), integração com nenhum provedor
real de SMS/WhatsApp. Em desenvolvimento, o código de verificação volta na
própria resposta da API (`codigoDev`, nunca presente quando
`NODE_ENV=production`) e é logado no console do servidor. **Antes de ir a
produção, é preciso decidir e integrar um provedor real** (Twilio, Zenvia,
WhatsApp Business API etc.) em `routes/auth.js` → `gerarCodigoVerificacao`
— sem isso, ninguém consegue verificar o telefone de verdade.

### 2. Rate limiting
`lib/rateLimit.js` — janela deslizante em memória por IP + ação
(login, cadastro, envio/confirmação de código, recuperação de senha,
exclusão de conta). Simples de propósito: sem fingerprint de dispositivo,
sem reputação de IP, sem análise comportamental. Zera se o processo
reiniciar (aceitável para o estágio do MVP). Resposta `429` com
`Retry-After`.

### 3. Recuperação de senha
`POST /api/auth/recuperar-senha` (sempre responde 200 com a mesma
mensagem, exista ou não a conta — não confirma por essa via se um e-mail
está cadastrado) + `POST /api/auth/redefinir-senha` (token de uso único,
expira em 30 min). Mesma limitação pendente do SMS: o link de recuperação
não é **enviado** por e-mail de verdade neste ambiente — em dev ele volta
em `tokenDev` e é logado no console. **Precisa de um provedor real de
e-mail antes de produção.**

### 4. Exclusão de conta
`POST /api/auth/excluir-conta` (exige senha atual). Remove a linha da
conta e encerra a sessão. **Decisão registrada, não inventada em
excesso:** clientes/orçamentos da conta excluída **não são apagados em
cascata** — ficam órfãos (inacessíveis, já que nenhuma sessão volta a
apontar para eles), mas não removidos fisicamente. Definir política de
retenção (manter para fins contábeis vs. apagar por direito ao
esquecimento/LGPD) é decisão de produto/jurídica que a v1.1 não fechou.
O que **nunca** é tocado, propositalmente, é `verifiedTrialPhones`.

### 5. Termos de Uso e Política de Privacidade
Estrutura pronta: checkbox obrigatório no cadastro (`aceitouTermos`,
registrado com timestamp em `account.aceitouTermosEm`) e duas páginas
(`termos.html`, `privacidade.html`) linkadas do cadastro. **O conteúdo
dessas páginas é um placeholder explícito, com aviso visível de que não é
texto jurídico válido** — conteúdo jurídico real precisa vir de um
profissional antes do lançamento.

`node infra-test.js` (com o servidor rodando) cobre: telefone só recebe
trial uma vez mesmo após excluir a conta, mensagem não revela a conta
anterior, exclusão derruba o login, recuperação de senha de ponta a ponta
(token de uso único, resposta idêntica para e-mail existente/inexistente),
rate limiting de login, isolamento entre contas, e as validações
obrigatórias de cadastro (termos e telefone).

### Ajustes seguintes: e-mail duplicado e tokens/códigos com hash

- **E-mail já cadastrado:** mensagem explícita "Este e-mail já está
  cadastrado." (era uma mensagem genérica antes). Decisão de UX consciente
  — mantém o pequeno risco de enumeração de e-mail que já existia, sem
  mudar esse comportamento específico.
- **Códigos de telefone e tokens de recuperação de senha nunca são
  armazenados em texto claro.** `lib/auth.js` ganhou `hashToken()` (HMAC-
  SHA256 derivado do `SESSION_SECRET`, não SHA-256 puro — importante porque
  o código de telefone tem só 6 dígitos, e um hash sem segredo seria
  trivial de forçar por força bruta se o banco vazasse) e `hashesMatch()`
  (comparação em tempo constante). `phoneVerifications.codigoHash` e
  `passwordResets.tokenHash` substituem os campos antigos em texto claro.
  O valor utilizável só existe em memória, durante a chamada que o gera
  (para exibir em dev/log) — nunca é persistido.
- Comportamento para o usuário **não mudou**: expiração, uso único e
  rate limiting continuam exatamente como antes; só o que está gravado no
  arquivo `data/db.json` mudou.
- Uso único ficou mais rígido: ao redefinir a senha, **todos** os links de
  recuperação pendentes daquela conta são invalidados de uma vez (antes só
  o token usado era invalidado — um link antigo, pedido antes, ainda
  poderia redefinir a senha de novo depois).
- `lib/db.js` migra automaticamente bancos salvos antes desta mudança:
  qualquer registro antigo com `codigo`/`token` em texto claro é descartado
  ao carregar (esses valores só vivem 15–30 minutos, então isso não afeta
  ninguém em uso normal).

`node token-test.js` cobre especificamente: e-mail duplicado (API e tela),
o banco nunca contém o valor utilizável (só hash de 64 hex), o hash
armazenado não funciona como código/token, reenvio invalida o código
anterior, código de uma conta não vale em outra, e uso único do token de
senha incluindo a invalidação de links irmãos pendentes.

## Teste automatizado de ponta a ponta

`visual-test.js` usa Playwright para simular um prestador real: cria conta,
cadastra um pacote, gera um orçamento em Modo Rápido, abre a página pública
como se fosse o cliente, aprova o orçamento, e confere Dashboard/Radar/
Histórico depois. Gera screenshots (`shot-*.png`) para conferência visual.

```bash
node server.js &        # sobe o servidor
node visual-test.js     # roda o teste e tira os screenshots
```

## Estrutura

```
lib/
  db.js         — camada de dados (trocar aqui para ir a produção)
  config.js     — períodos/constantes que a spec delega à implementação
  auth.js       — hash de senha + sessão assinada
  tokens.js     — geração do token público do orçamento
  status.js     — status, precisa_follow_up, validade (regras puras)
  serialize.js  — serialização compartilhada de orçamento
  http.js       — roteador HTTP mínimo (substitui Express)
  phone.js      — normalização de telefone (base do controle de trial)
  rateLimit.js  — rate limiting simples em memória (login/cadastro/etc.)
routes/
  auth.js       — cadastro/login/logout/sessão
  clients.js    — clientes + modelos de pacote (CRUD)
  quotes.js     — Modo Rápido, Completo, histórico
  public.js     — página pública: view tracking, aceitar/recusar
  followups.js  — registrar/listar follow-ups
  radar.js      — Radar de Vendas
  dashboard.js  — métricas do Dashboard
public/         — frontend mínimo (HTML + JS puro, sem framework)
  manifest.json — manifest do PWA
  sw.js         — Service Worker (só cacheia o casco estático, nunca /api/)
  icons/        — ícones do PWA (gerados por scripts/generate-icons.py)
scripts/
  generate-icons.py — gera os ícones do PWA a partir do símbolo V+B
data/db.json    — "banco" em arquivo (apagar para resetar os dados)
```

## Onde cada regra crítica da spec está implementada

| Regra da Especificação v1.1 | Onde |
|---|---|
| Status principal com 5 valores, sem "Follow-up"/"Em andamento" | `lib/status.js` → `computeStatus` |
| `precisa_follow_up` independente do status | `lib/status.js` → `computePrecisaFollowUp` |
| Validade bloqueia decisão sem criar status "Expirado" | `lib/status.js` → `isExpired`; aplicado em `routes/public.js` |
| Token público opaco, não sequencial, ID interno nunca exposto | `lib/tokens.js`; `routes/public.js` nunca retorna `quote.id` |
| Visualização humana ≠ crawler de preview | `routes/public.js` → `/view` (filtro de User-Agent + sinal de tempo/interação); front em `public/orcamento.html` |
| Pacote é modelo reutilizável + cópia congelada | `routes/quotes.js` → `snapshotPackage`; editar modelo (`routes/clients.js`) nunca toca cópias já feitas |
| Múltiplos follow-ups por orçamento | `routes/followups.js`; tabela `followUps` (1-N) |
| Nunca afirmar entrega/leitura do WhatsApp | `routes/followups.js` só registra `estado: 'preparado'` / `'confirmado_pelo_usuario'` |
| Valor em aberto = Enviado+Visualizado+Sem resposta, fixo | `lib/status.js` → `VALOR_EM_ABERTO_STATUSES`; usado em `routes/dashboard.js` |
| Radar só com eventos observáveis | `routes/radar.js` — frases fixas, nunca infere intenção |

## Limitações conhecidas (documentadas, não escondidas)

- **Detecção de visualização humana** é uma heurística (tempo mínimo em
  página + filtro de User-Agent conhecido), não uma garantia absoluta —
  exatamente como a Seção 9 da spec pede que seja documentado, não
  resolvido com uma "solução mágica".
- **Armazenamento em arquivo JSON** funciona bem para desenvolvimento e
  demonstração, mas não é seguro para acesso concorrente real de vários
  usuários ao mesmo tempo — é o primeiro item a trocar antes de produção
  (ver seção de migração acima).
- **Telefone do prestador** não foi incluído no cadastro de conta (a spec
  não listava esse campo em `Account`); a página pública do cliente por
  isso não mostra um "Falar com o prestador pelo WhatsApp" — só as ações
  de Aceitar/Recusar, que estavam explicitamente no escopo.
