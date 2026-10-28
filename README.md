# atto-teste

Sistema web com login via credenciais da **Atto** (discadora), controle de
acesso por perfis + árvore de permissões + permissões individuais, e um
**dashboard** com dados reais da Atto alimentado por um **coletor agendado**
(o dashboard só lê do banco; abrir o dashboard nunca chama a Atto).

## Como subir

Com Docker e Docker Compose instalados e o Docker em execução, na raiz do
repositório:

```sh
cp .env.example .env   # ajuste os valores — veja "Variáveis de ambiente" abaixo
docker compose up -d --build
```

A API aguarda o banco ficar saudável e aplica as migrations automaticamente
antes de iniciar; a web e o coletor aguardam a API saudável. O banco é criado
com nome/usuário/senha do `.env` e persiste no volume `postgres_data`.

| Serviço | Endereço |
| --- | --- |
| Web (Next.js) | http://localhost:3000 |
| API (Fastify) | http://localhost:3030 |
| Coletor da Atto | sem porta exposta; roda em loop |
| PostgreSQL 17 | localhost:5432 |

### Alternativa sem conta Atto: `pnpm seed`

Se você não tem (ou não quer usar ainda) uma conta Atto real à mão, existe
um script **opcional e manual** que cria um usuário **local** (não espelha
nada na Atto — mesmo mecanismo de "conta local com senha própria" usado pelo
admin de usuários) já com acesso total. Ele nunca roda sozinho — nem no
`docker compose up`, nem no `CMD` da imagem — só quando você pedir:

```sh
docker compose exec api node dist/scripts/seed.js
# (ou, fora do Docker, em api/: pnpm seed / pnpm seed:dev)
```

Login e senha vêm de `SEED_ADMIN_LOGIN`/`SEED_ADMIN_PASSWORD` no `.env`
(padrão `admin`/`admin1234` — fictícios, só para desenvolvimento). É
idempotente: rodar de novo não duplica nem reseta a senha, só reconfirma o
acesso total caso o perfil Administrador tenha sido alterado.

## Variáveis de ambiente

`cp .env.example .env` já traz um valor funcional para cada uma — só
`ATTO_CUSTOMER_SID` (e `ATTO_LOGIN`/`ATTO_PASSWORD`, se for usar o coletor)
precisam do dado real da sua conta Atto. A aplicação valida o `.env` inteiro
no boot (`api/src/config/env.ts`, com `zod`) e recusa subir se faltar alguma
das obrigatórias abaixo ou se algum valor estiver fora do formato esperado.

### Obrigatórias

Sem valor padrão — se faltar qualquer uma, a API não inicia.

| Variável | Para que serve |
| --- | --- |
| `NODE_ENV` | `development` ou `production`; em produção exige `COOKIE_SECURE=true` |
| `API_PORT` | Porta em que a API escuta |
| `API_HOST` | Host em que a API escuta (`0.0.0.0` no Docker) |
| `POSTGRES_USER` | Usuário do Postgres (serviço `db` e `DATABASE_URL`) |
| `POSTGRES_PASSWORD` | Senha do Postgres |
| `POSTGRES_DB` | Nome do banco |
| `DATABASE_URL` | String de conexão completa com o Postgres (precisa bater com as três variáveis acima) |
| `WEB_ORIGIN` | Origem da web, sem caminho (ex.: `http://localhost:3000`) — usada para CORS/cookie |
| `SESSION_TTL_HOURS` | Validade da sessão local (cookie `HttpOnly`) |
| `COOKIE_SECURE` | `true`/`false` — exige HTTPS para o cookie de sessão |
| `LOGIN_RATE_LIMIT_MAX` | Máximo de tentativas de login na janela de `LOGIN_RATE_LIMIT_WINDOW` |
| `LOGIN_RATE_LIMIT_WINDOW` | Janela do rate limit de login (ex.: `1 minute`) |
| `API_INTERNAL_URL` | URL da API usada pela web para chamadas servidor-a-servidor (ex.: `http://api:3030` dentro do compose) |
| `WEB_PORT` | Porta em que a web escuta |
| `WEB_HOST` | Host em que a web escuta |
| `DB_PORT` | Porta do Postgres exposta no host |
| `ATTO_CUSTOMER_SID` | Único `CustomerSid` aceito no login — trava de tenant |
| `ATTO_TOKEN_ENC_KEY` | 32 bytes em base64 para cifrar o token da Atto (gere com `openssl rand -base64 32`) |

### Opcionais (têm valor padrão)

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `ATTO_ADMIN_URL` | URL pública do Web Admin da Atto | Base do Web Admin — `Login/SignIn` e `Campaigns/List` |
| `ATTO_SUPERVISION_URL` | URL pública do Web Supervision da Atto | Base do Web Supervision — usada só pelo coletor |
| `ATTO_LOGIN` | vazio | Login da conta de serviço que o coletor usa — não tem relação com quem é administrador (veja a seção abaixo) |
| `ATTO_PASSWORD` | vazio | Senha dessa conta; usada pelo coletor para renovar o token quando preciso |
| `ATTO_TOKEN_TTL_HOURS` | `23` | Validade local assumida do token |
| `ATTO_LOGIN_MIN_INTERVAL_MINUTES` | `60` | Intervalo mínimo entre `SignIn`s bem-sucedidos do mesmo login (mínimo `60`, exigência da Atto) |
| `ATTO_REQUEST_TIMEOUT_MS` | `15000` | Timeout de cada chamada à Atto |
| `COLLECT_INTERVAL_MINUTES` | `15` | Intervalo entre execuções do coletor |
| `COLLECT_BACKFILL_DAYS` | `7` | Quantos dias para trás o coletor busca `Agents/Report`/`WorkingTime` |
| `COLLECT_CALLS_LOOKBACK_HOURS` | `24` | Janela (em horas) de `OutboundCalls` revisitada a cada execução |
| `COLLECT_DELAY_AGENTS_MS` | `6000` | Pausa entre chamadas em `Agents/*` (mínimo `6000`, exigência da Atto) |
| `COLLECT_DELAY_OTHERS_MS` | `6000` | Pausa entre as demais chamadas de `Campaigns/*`/`Agents/List` |
| `COLLECT_DELAY_CALLS_MS` | `15000` | Pausa entre chamadas (e páginas) de `Campaigns/OutboundCalls` — mais alta que as demais porque esse endpoint se mostrou mais sensível a rate limit (mínimo `15000`) |
| `APP_TIMEZONE` | `America/Sao_Paulo` | Fuso usado para agrupar por dia/hora |

`ATTO_LOGIN`/`ATTO_CUSTOMER_SID`/`ATTO_TOKEN_ENC_KEY` só aceitam valores
fictícios no `.env.example` versionado — nunca um login, `CustomerSid` ou
token reais da Atto em código, commit, log ou print. O `.env` local (fora do
Git) é o único lugar onde `ATTO_CUSTOMER_SID` precisa do valor real do
cliente, e `ATTO_LOGIN`/`ATTO_PASSWORD` do valor real da conta de serviço do
coletor, quando for usá-lo.