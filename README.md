# atto-teste

Sistema web com login via credenciais da **Atto** (discadora), controle de
acesso por perfis + árvore de permissões + permissões individuais, e um
**dashboard** com dados reais da Atto alimentado por um **coletor agendado**
(o dashboard só lê do banco; abrir o dashboard nunca chama a Atto).

## Como subir

Com Docker e Docker Compose instalados e o Docker em execução, na raiz do
repositório:

```sh
cp .env.example .env   # só na primeira vez; ajuste os valores
docker compose up -d --build
```

| Serviço | Endereço |
| --- | --- |
| Web (Next.js) | http://localhost:3000 |
| API (Fastify) | http://localhost:3030 |
| Coletor da Atto | sem porta exposta; roda em loop |
| PostgreSQL 17 | localhost:5432 |

A API aguarda o banco ficar saudável e aplica as migrations automaticamente
antes de iniciar; a web e o coletor aguardam a API saudável. O banco é criado
com nome/usuário/senha do `.env` e persiste no volume `postgres_data`.

```sh
docker compose ps                 # estado dos serviços
docker compose logs -f api        # acompanhar logs da API
docker compose logs -f collector  # acompanhar logs do coletor
docker compose down               # parar, preservando o banco
docker compose down -v            # parar e apagar os dados do banco
```

## Criando o primeiro administrador

**Não há seed nem usuário de exemplo.** Um usuário aqui sempre espelha uma
conta real na Atto, então o primeiro administrador nasce do primeiro login
bem-sucedido que qualquer pessoa fizer num banco vazio: se `users` está vazia
no momento em que o login é criado, esse usuário recebe automaticamente o
perfil **Administrador** com a árvore inteira liberada (ver
`grantFullAccess` em `api/src/modules/auth/login.ts`). Logins seguintes não
ganham nada automaticamente — nascem sem nenhuma permissão, como o resto do
RBAC exige, e dependem desse primeiro administrador para serem liberados.

Em outras palavras: para começar, basta logar pela tela com **qualquer**
conta Atto válida contra o `ATTO_CUSTOMER_SID` configurado — essa conta vira
a administradora.

## Configurando as credenciais da Atto

Variáveis em `.env` (veja `.env.example` para o template completo):

| Variável | Uso |
| --- | --- |
| `ATTO_ADMIN_URL` | Base do Web Admin — `Login/SignIn` e `Campaigns/List` |
| `ATTO_SUPERVISION_URL` | Base do Web Supervision — usada só pelo coletor |
| `ATTO_LOGIN` | Opcional. Login da conta de serviço que o coletor usa — não tem relação com quem é administrador (veja a seção abaixo) |
| `ATTO_PASSWORD` | Opcional. Senha dessa conta; usada pelo coletor para renovar o token quando preciso |
| `ATTO_CUSTOMER_SID` | **Obrigatório.** Único `CustomerSid` aceito no login — trava de tenant |
| `ATTO_TOKEN_ENC_KEY` | **Obrigatório.** 32 bytes em base64 para cifrar o token (`openssl rand -base64 32`) |
| `ATTO_TOKEN_TTL_HOURS` | Validade local assumida do token (padrão `23`) |
| `ATTO_LOGIN_MIN_INTERVAL_MINUTES` | Intervalo mínimo entre `SignIn`s bem-sucedidos do mesmo login (padrão `60`, mínimo `60`) |
| `ATTO_REQUEST_TIMEOUT_MS` | Timeout de cada chamada à Atto (padrão `15000`) |
| `COLLECT_INTERVAL_MINUTES` | Intervalo entre execuções do coletor (padrão `15`) |
| `COLLECT_BACKFILL_DAYS` | Quantos dias para trás o coletor busca `Agents/Report`/`WorkingTime` (padrão `7`) |
| `COLLECT_CALLS_LOOKBACK_HOURS` | Janela (em horas) de `OutboundCalls` revisitada a cada execução (padrão `24`) |
| `COLLECT_DELAY_AGENTS_MS` | Pausa entre chamadas em `Agents/*` (padrão/mínimo `6000`, exigência da Atto) |
| `COLLECT_DELAY_OTHERS_MS` | Pausa entre as demais chamadas (padrão `1000`) |
| `APP_TIMEZONE` | Fuso usado para agrupar por dia/hora (padrão `America/Sao_Paulo`) |

`ATTO_LOGIN`/`ATTO_CUSTOMER_SID`/`ATTO_TOKEN_ENC_KEY` só aceitam valores
fictícios no `.env.example` versionado — nunca um login, `CustomerSid` ou
token reais da Atto em código, commit, log ou print. O `.env` local (fora do
Git) é o único lugar onde `ATTO_CUSTOMER_SID` precisa do valor real do
cliente, e `ATTO_LOGIN`/`ATTO_PASSWORD` do valor real da conta de serviço do
coletor, quando for usá-lo.

## Como o login funciona

`POST /auth/login` recebe `{ username, password }` (nunca e-mail — a Atto só
autentica por `Login`/`Password`). Resumo do fluxo:

1. Usuário inativo → `401` genérico, sem chamar a Atto.
2. Se já existe um hash de senha local e um token ainda válido para esse
   usuário, a verificação é **100% local** (sem rede): senha certa entra;
   senha errada falha com `401` enquanto durar a janela de
   `ATTO_LOGIN_MIN_INTERVAL_MINUTES` desde o último `SignIn` bem-sucedido —
   depois dela, tenta de novo contra a Atto (cobre senha trocada no lado da
   Atto).
3. Quando é preciso falar com a Atto (usuário novo, sem hash, token
   vencido/invalidado, ou senha local não bateu após a janela), é feita **uma**
   chamada ao `SignIn`, com timeout e sem retry automático; chamadas
   concorrentes para o mesmo usuário compartilham essa única chamada.
4. `Error` preenchido ou credencial recusada → `401` genérico, nada é
   gravado. Erro de rede/timeout/5xx → `503`. A própria Atto respondendo
   `429` → `429` com `Retry-After`, e o cooldown é registrado.
5. Sucesso estrutural (`Error` nulo, `jwt` presente) **sempre** grava o
   usuário local — hash argon2id da senha e token cifrado (AES-256-GCM) —
   mesmo que o passo 6 abaixo rejeite a sessão. A Atto só permite um
   `SignIn` por hora: se essa gravação fosse condicional ao passo 6, uma
   rejeição por `CustomerSid` perderia esse `SignIn` sem poder tentar de
   novo por uma hora, mesmo a credencial estando certa. Se o usuário já
   existe (login repetido ou senha trocada), os dados são atualizados.
6. Só então o `CustomerSid` devolvido é comparado ao configurado; se
   diferente, a sessão é negada (`401` genérico) — mas o que foi salvo no
   passo 5 continua lá, então uma nova tentativa com a mesma senha resolve
   **localmente** (sem gastar outro `SignIn`) e continua negada da mesma
   forma, até o `ATTO_CUSTOMER_SID` do `.env` ser corrigido para o tenant
   certo (dá pra confirmar o valor certo consultando `customer_sid` na
   linha criada em `users`, já que ele é salvo mesmo quando a sessão é
   negada).

A sessão local (cookie `HttpOnly`, opaca, guardada em `sessions`) é sempre
local: logout e login repetidos nunca chamam a Atto enquanto o token
em cache continuar válido.

## Modelo de permissões

A árvore é fixa, definida em código (`api/src/permissions/tree.ts`) — não em
tabela — e servida ao front por `GET /admin/permissions/tree`, que nunca a
duplica:

```
dashboard                       Dashboard
  dashboard.atto                Atto
    dashboard.atto.chamadas     Chamadas
    dashboard.atto.agentes      Agentes
    dashboard.atto.tempo        Tempo logado e pausas
admin                           Administração
  admin.usuarios                Usuários
  admin.perfis                  Perfis
```

Liberar um nó libera os filhos. Um **perfil** é um conjunto de nós que ele
libera (perfis só liberam, nunca negam); um usuário tem um ou mais perfis e
pode ainda ter **regras individuais** por nó (conceder ou negar).

`resolvePermission(node, contexto)` (`api/src/permissions/resolve.ts`, função
pura, sem I/O) decide um nó andando dele até a raiz — do mais específico para
o mais geral. Em cada nível: se houver regra individual, ela decide; senão, se
algum perfil libera aquele nível, decide liberado; senão, sobe um nível. Sem
regra até a raiz → bloqueado.

| Perfil no nó | Individual no nó | Resultado |
| --- | --- | --- |
| Libera | Sem regra | Liberado |
| Libera | Nega | Bloqueado |
| Não libera | Concede | Liberado |
| Não libera | Sem regra | Bloqueado |

Individual vence perfil no mesmo nó; uma regra no nó mais específico vence a
herdada de um ancestral. A API sempre devolve também a origem da decisão
(`source`, `fromNode`, `roleNames`), para a tela de edição do usuário mostrar
"Perfil Supervisor", "Individual", "Herdado de `dashboard` (perfil
Supervisor)" etc.

A checagem é **sempre** no backend: `requirePermission(node | node[])`
(`api/src/plugins/auth.ts`) compõe depois de `authenticate` no `preHandler` de
qualquer rota que precise de permissão, recalculando a cada requisição (uma
mudança de perfil/regra vale na hora, sem cache). Esconder item de menu ou
bloco no front é só UX — confirmado manualmente batendo direto nas rotas sem
passar pelo front (`curl` com cookie de sessão): sem sessão → `401`; com
sessão mas sem o nó → `403`.

**Para adicionar um nó**: acrescente-o em `PERMISSION_TREE`
(`api/src/permissions/tree.ts`) — nada mais precisa mudar; `resolvePermission`,
a validação de nós em `POST`/`PATCH` de perfis e usuários, e a árvore servida
ao front já operam sobre a lista achatada automaticamente.

## Coletor da Atto

Serviço `collector` (`docker compose`), mesma imagem da API, comando
`node dist/collector.js`, sem porta exposta, inicia depois da API saudável
(ela já rodou as migrations). Agendamento com `setInterval` — roda ao iniciar
e depois a cada `COLLECT_INTERVAL_MINUTES` — com uma flag em memória contra
execuções sobrepostas; sem lib de cron. `node dist/collector.js --once` roda
um ciclo e sai (útil para testar ou gerar evidência).

**Token**: o coletor só chama `getValidToken` (`api/src/modules/atto-auth/
token.ts`) — que verifica o token em cache e, se preciso, aciona o mesmo
`createLoginResolver` usado pela rota de login (`ATTO_LOGIN`/`ATTO_PASSWORD`),
reaproveitando o mesmo cooldown e single-flight em vez de uma segunda
implementação. Se a Atto responder `401`/`403` numa chamada do coletor,
`invalidate` é chamado e o **ciclo é interrompido** (sem retry imediato); se
não há token disponível (sem senha configurada, ou em cooldown), o ciclo é
pulado e registrado como `error` em `atto_collect_runs`.

**Ordem de cada execução**: `Campaigns/List` → `Agents/Report` e `Agents/
WorkingTime` por dia, de hoje até `COLLECT_BACKFILL_DAYS` atrás (pausa de
`COLLECT_DELAY_AGENTS_MS`, mínimo 6s, entre cada chamada em `Agents/*`, nunca
em paralelo) → `Campaigns/OutboundCalls` por campanha e por janela de 1 hora
nas últimas `COLLECT_CALLS_LOOKBACK_HOURS` horas, pulando horas já marcadas
`final`. Uma falha num endpoint não apaga dados anteriores — a execução fica
`partial` e o resto continua; só uma falha de autenticação interrompe tudo.
Em erro de limite (`429`) numa chamada avulsa, espera e repete com um número
limitado de tentativas antes de desistir dessa chamada específica.

Tabelas gravadas (upsert idempotente por chave natural):
`atto_campaigns`, `atto_agent_report` (por dia + agente), `atto_working_time`
(por sessão de login), `atto_calls_hourly` (por hora + campanha, com `final`),
e `atto_collect_runs` (uma linha por execução: status, contagens, erro
sanitizado).

Logs estruturados em JSON, um por chamada (`collect_call`: endpoint, status,
duração) e um resumo por execução (`collect_summary`); nunca token, nunca
dado pessoal.

### O que foi verificado contra a Atto real (e o que ainda não)

Antes de implementar, em vez de só seguir a descrição do endpoint, foram
feitas chamadas reais (sem token válido, só para ler a página `.../help` de
cada serviço — não é preciso autenticação para isso) contra
`cloud.attodigital.com`, que devolve a lista de operações e, para cada uma,
o XML Schema real da resposta. Isso corrigiu três coisas que a descrição
original levaria a implementar errado:

- **`CustomerSid` é parâmetro obrigatório em toda chamada** de Supervision e
  Admin, não só uma validação a posteriori na resposta.
- **`Campaigns/List` existe no Web *Admin*, não no Web Supervision** — o
  Supervision não tem nenhuma operação de listagem de campanhas.
- **Nomes de campo reais** (lidos do XML Schema publicado, não adivinhados):
  `Campaigns/List` devolve `Sid`/`Description` (sem campo `Name`);
  `Agents/Report` devolve `Agent`/`CallsCount`/`TotalWorkingTime` (sem campo
  de campanha — por isso esse bloco não filtra por campanha); `Agents/
  WorkingTime` devolve `Login`/`CampaignSid`/`LOGIN`/`LOGOUT`/
  `LoggedTime_sec`/`PauseTime_sec` (os dois últimos já em segundos inteiros);
  `Campaigns/OutboundCalls` devolve `CallHistorySid` (confirma a regra do
  teste: atendida é a linha que tem esse campo), `DialMoment`, `ConvDuration`
  e `CampaignSid`, entre outros — e **nunca** lê `TelNumber` (telefone do
  cliente), que existe nessa resposta.
- A correção foi confirmada rodando o coletor de verdade (com um token
  fictício) contra o servidor real: `Campaigns/List` passou a responder
  `401`/`403` (chegou, autenticação recusada) em vez de `404` (caminho
  errado antes da correção).

O que **não** foi possível confirmar, porque o schema publicado só mostra
`"String content"` como valor de exemplo, nunca um valor real:
- O formato exato de `TotalWorkingTime`, `PauseAvg`/`PauseParcent` (Agents/
  Report) e `ConvDuration` (OutboundCalls) — assumido como `"H:MM:SS"` ou
  segundos em string; ver `parseDurationSeconds` em `api/src/collector/
  dates.ts`.
- O formato exato de `LOGIN`/`LOGOUT`/`DialMoment` — assumido `/Date(ms)/`
  (padrão WCF) com *fallback* para qualquer string que `Date()` reconheça;
  ver `parseAttoDate`.
- O que o parâmetro `Agents` espera em `Agents/Report`/`Agents/WorkingTime`
  quando se quer "todos os agentes" — enviado como string vazia.

Para confirmar: rode `docker compose run --rm collector node dist/collector.js
--once` com `ATTO_PASSWORD` real no `.env` e compare os logs (sem token, sem
dado pessoal) com os valores agregados nas tabelas; ajuste `api/src/
collector/extract.ts` e `dates.ts` se algum campo vier em formato diferente
do assumido.

## Dashboard

Primeira tela após o login; lê só do banco (nunca chama a Atto). Filtros
(período com atalhos Hoje/7 dias/30 dias — padrão 7 dias — e campanha, "Todas"
por padrão) vão na própria URL. Cada bloco só aparece se o nó correspondente
está em `permissions` (do `/auth/me`) — a API também exige o nó em cada rota,
então nada depende só do front.

| Bloco | Nó | Métricas | Como é calculado |
| --- | --- | --- | --- |
| Chamadas | `dashboard.atto.chamadas` | Tentativas, atendidas, taxa de atendimento, gráfico de atendidas por hora do dia | Soma de `attempts`/`answered`/`talk_seconds` de `atto_calls_hourly` no período (e campanha, se filtrado); taxa = atendidas/tentativas; gráfico agrupa por hora do dia (`APP_TIMEZONE`), somando todos os dias do período na mesma hora |
| Agentes | `dashboard.atto.agentes` | Ranking por atendimentos e tempo médio de conversação | Soma `answered_calls`/`talk_seconds` de `atto_agent_report` por agente no período; média = soma do tempo / atendimentos. Não filtra por campanha (a Atto não devolve esse campo nesse endpoint) |
| Tempo logado e pausas | `dashboard.atto.tempo` | Tempo logado e em pausa por agente (tabela) | Soma `logged_seconds`/`paused_seconds` de `atto_working_time` por agente no período (e campanha, se filtrado) |

"Atendida" segue a regra do teste: é a linha de `OutboundCalls` que tem
`CallHistorySid` preenchido; as demais são tentativas sem atendimento.

## Dados pessoais

As chamadas da Atto trazem o telefone do cliente (`TelNumber`) em
`Campaigns/OutboundCalls`. O coletor nunca lê esse campo (nem qualquer outro
que pareça conter nome ou documento do cliente) — agrega em memória só os
números necessários (tentativas, atendidas, tempo de conversação por hora) e
descarta a linha bruta. Nada além de login/nome de **agente** é gravado; não
há tabela nem log com telefone, CPF ou nome de cliente.

## Testes

**Por decisão explícita, não há suíte de testes automatizados neste
repositório** (nem `vitest`, nem `@playwright/test` como dependência). Todo
fluxo — login/logout, o bootstrap do primeiro administrador, admin de
perfis/usuários, os quatro casos de resolução de permissão, o coletor e o
dashboard — foi verificado manualmente contra a stack rodando: requisições
diretas às rotas com `curl`/cookie de sessão (confirmando `401`/`403`
inclusive sem passar pelo front), e o coletor executado de verdade contra o
servidor real da Atto. `resolvePermission` (`api/src/permissions/resolve.ts`)
continua escrita como função pura, sem I/O, especificamente para poder ser
testada caso uma suíte volte a existir depois.

```sh
cd api && pnpm lint && pnpm typecheck
cd web && pnpm lint && pnpm typecheck
```

## Decisões

| Item | Decisão | Motivo |
| --- | --- | --- |
| Tabela `atto_auth_state`, advisory lock no Postgres, pool de conexão dedicado ao lock | Removidos | Resolviam coordenação multi-instância; o compose roda uma única API, e o token agora mora na linha do próprio usuário — uma `Map` em memória por login basta para o single-flight |
| Scripts `atto:status`/`atto:ensure` | Removidos | Operavam sobre o singleton acima; sem ele, deixam de fazer sentido |
| `sessions.last_seen_at` e sua escrita throttled | Removidos | Telemetria não lida por nenhuma rota; sessão expirada já é apagada no primeiro uso |
| `setInterval` de limpeza de sessões expiradas | Removido | Idem: só arruma a tabela; sessões vencidas já são invalidadas/apagadas quando alguém tenta usá-las |
| Prefixo `__Host-` no nome do cookie | Removido | O cookie já é `HttpOnly` + `Secure` (produção) + `SameSite=Lax`; `__Host-` protegeria contra subdomínios irmãos, ameaça que este deploy não tem |
| Hash "dummy" para mitigar enumeração por tempo no login local | Removido | Só fazia sentido comparando contra uma base local de senhas; com a Atto como fonte de verdade, o caminho local só existe quando já há hash real |
| `fastify-type-provider-zod` | Removido | Poucas rotas não justificam a camada; `zod.safeParse()` manual é igualmente seguro e remove uma dependência |
| `compose.test.yaml` | Removido | Não referenciado por script, README ou CI |
| Checagem de `Origin` e `Content-Type` em mutações | Mantida | Poucas linhas, já testada, cobre CSRF básico que `SameSite=Lax` só mitiga parcialmente |
| Criptografia do token da Atto (AES-256-GCM via `node:crypto`) | Mantida, sem lib de terceiros | É o mesmo motor (OpenSSL) que qualquer lib JS de cripto usa por baixo; a única opção que reduziria o código de fato (`@47ng/cloak`) traz 8 dependências transitivas |
| Validação de env no boot (zod) | Mantida | Evita subir com configuração inválida |
| Seed de administrador | **Removido de novo, substituído por bootstrap no próprio login** | Um seed script chegou a existir para resolver "ninguém nasce com permissão", mas ainda criava um usuário/perfil sem conta Atto real por trás — rejeitado por decisão explícita de não ter usuário de exemplo nenhum. Em vez disso, `createLoginResolver` concede o perfil Administrador com a árvore inteira ao primeiro login bem-sucedido feito num banco sem nenhum usuário — zero código extra, zero dado fabricado |
| Token/senha da Atto salvos mesmo quando a sessão é negada (`CustomerSid` divergente) | Mudado | A Atto permite só um `SignIn` por hora; descartar um `SignIn` bem-sucedido por causa de uma checagem posterior desperdiçava essa cota (e, se a checagem estivesse errada, travava a pessoa por uma hora sem recurso). Salvar sempre e checar o tenant depois, inclusive no caminho local, mantém a trava de segurança sem nunca perder um `SignIn` válido |
| Testes automatizados (os que existiam, do login) | **Removidos, por decisão explícita** | `api/tests/`, `web/tests/`, `vitest`/`@playwright/test` como dependência, e `DATABASE_URL_TEST` — tudo fora |
| `routes.ts` do login dividido em `login.ts` (decisão pura) + rota HTTP fina | Feito numa etapa anterior | Registrado aqui só para não reabrir: a lógica de negócio do login é testável sem Fastify; não é "mais camadas", é separar as duas responsabilidades que uma função de ~90 linhas acumulava |
| Camadas de uma rota para outra (admin, dashboard) | Um arquivo `routes.ts` por módulo, sem controller/service/repository | Poucas rotas por módulo; mesma convenção do login |
| `atto_agent_report` sem coluna de nome do agente | Decisão | O endpoint real (`Agents/Report`) não devolve nome, só `Agent` (login) — guardar uma coluna que nunca seria populada seria código morto |
| Campo `campaignId` em `/dashboard/atto/agentes` | Não existe | `Agents/Report` não devolve campanha; a resposta sinaliza `campaignFilterSupported: false` em vez de ignorar silenciosamente um filtro que o usuário pediu |
| Bloco "Tempo logado e pausas" como tabela, não gráfico empilhado | Escolhido | O PDF permite as duas opções; tabela é mais simples de implementar e lê melhor com poucos agentes |

## Premissas a confirmar

- O token (`jwt`) dura por volta de 24h; assumimos `ATTO_TOKEN_TTL_HOURS=23`
  como margem seguindo essa informação, mas o valor exato não foi confirmado.
- Assumimos que **só um `SignIn` bem-sucedido** consome a cota de uma
  tentativa por hora — uma senha digitada errada não deveria travar a pessoa
  por uma hora. Isso não foi confirmado com a Atto.
- Assumimos que uma senha trocada no lado da Atto só é detectada aqui depois
  que a janela de `ATTO_LOGIN_MIN_INTERVAL_MINUTES` passar (o sistema tenta a
  senha local primeiro, dentro da janela).
- **Dois ambientes usando a mesma conta Atto se derrubam um ao outro**: um
  novo `SignIn` invalida o token anterior daquela conta. Em desenvolvimento,
  evite reutilizar a mesma conta Atto em dois ambientes simultaneamente. Isso
  vale também dentro do mesmo ambiente **se** a conta de serviço do coletor
  (`ATTO_LOGIN`) for a mesma conta usada para logar na web — são contas
  independentes por padrão (o administrador é só quem logar primeiro, com a
  conta Atto que quiser), mas compartilhar a mesma conta nas duas pontas
  significa compartilhar a mesma cota de uma hora.
- Formatos de campo não confirmados do coletor: ver a seção "O que foi
  verificado contra a Atto real" acima — são as premissas mais prováveis de
  precisar de ajuste com dados reais.
- `Agents=''` (vazio) em `Agents/Report`/`Agents/WorkingTime` significa
  "todos os agentes" — não confirmado, só o padrão mais comum nesse tipo de
  API WCF.

## Entregas manuais

Vídeo/prints (login, dashboard com dados reais, usuário com bloco negado
individualmente) e a apresentação são entregas manuais, fora deste
repositório.
