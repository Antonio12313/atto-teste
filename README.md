# atto-teste

Sistema web pequeno com login via credenciais da **Atto** (discadora), sessão
local e, nas próximas etapas, permissões em árvore e um dashboard com dados
coletados da Atto. Esta etapa cobre apenas **login e logout**.

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
| PostgreSQL 17 | localhost:5432 |

A API aguarda o banco ficar saudável e aplica as migrations automaticamente
antes de iniciar (`node dist/db/migrate.js && node dist/server.js`); a web
aguarda a API. O banco é criado com nome/usuário/senha do `.env` e persiste no
volume `postgres_data`.

```sh
docker compose ps            # estado dos serviços
docker compose logs -f api   # acompanhar logs
docker compose down          # parar, preservando o banco
docker compose down -v       # parar e apagar os dados do banco
```

## Criando o primeiro administrador

**Não há seed.** Criar um usuário aqui sempre exige uma conta real na Atto —
não há como fabricar uma localmente — então o primeiro administrador nasce da
mesma forma que qualquer outro usuário: ele faz login pela tela da web (ou
`POST /auth/login`) com o **usuário e senha da conta Atto que deve ser o
primeiro administrador**. Esse primeiro login bem-sucedido cria a linha em
`users` com os dados devolvidos pela Atto (nome, `Sid`, `CustomerSid`,
`ROOT`, `Roles`) e abre a sessão normalmente.

O usuário criado nasce **ativo**, mas **sem nenhuma permissão** — a concessão
de permissões (quem é administrador de fato) é da próxima etapa (RBAC). Por
ora, `is_root`/`atto_roles` só ficam guardados para essa etapa decidir o
mapeamento.

## Configurando as credenciais da Atto

Variáveis em `.env` (veja `.env.example` para o template completo):

| Variável | Uso |
| --- | --- |
| `ATTO_ADMIN_URL` | Base do Web Admin (`POST {ATTO_ADMIN_URL}/Login/SignIn`) |
| `ATTO_SUPERVISION_URL` | Base do Web Supervision; só será usada pelo coletor (próxima etapa) |
| `ATTO_LOGIN` | Login Atto da conta que o futuro coletor agendado deve usar |
| `ATTO_PASSWORD` | Opcional hoje; senha dessa conta, para o futuro coletor |
| `ATTO_CUSTOMER_SID` | **Obrigatório.** Único `CustomerSid` aceito no login — trava de tenant |
| `ATTO_TOKEN_ENC_KEY` | **Obrigatório.** 32 bytes em base64 para cifrar o token (`openssl rand -base64 32`) |
| `ATTO_TOKEN_TTL_HOURS` | Validade local assumida do token (padrão `23`) |
| `ATTO_LOGIN_MIN_INTERVAL_MINUTES` | Intervalo mínimo entre `SignIn`s bem-sucedidos do mesmo login (padrão `60`, mínimo `60`) |
| `ATTO_REQUEST_TIMEOUT_MS` | Timeout de cada chamada ao `SignIn` (padrão `15000`) |

`ATTO_LOGIN`/`ATTO_CUSTOMER_SID`/`ATTO_TOKEN_ENC_KEY` só aceitam valores
fictícios neste repositório — nunca um login, `CustomerSid` ou token reais da
Atto em código, `.env.example`, commit, log ou print.

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
5. Sucesso: se o `CustomerSid` devolvido não é o configurado, a resposta é
   descartada inteira e o login falha com `401` genérico (só entra quem é
   deste cliente). Caso bata, o usuário local é criado/atualizado com os
   dados da Atto, o hash argon2id da senha e o token cifrado (AES-256-GCM).

A sessão local (cookie `HttpOnly`, opaca, guardada em `sessions`) é sempre
local: logout e login repetidos nunca chamam a Atto enquanto o token
em cache continuar válido.

## Testes

```sh
cd api && pnpm test     # mocka fetch e o relógio; nunca toca a rede real
cd web && pnpm test
```

A suíte da API (`api/tests/`) cobre, com `fetch` e relógio injetados: primeiro
login (cria usuário, cifra o token), logins/logouts repetidos (zero chamadas à
Atto), senha errada dentro e depois da janela de cooldown, `Error` da Atto,
`CustomerSid` divergente, usuário inativo, timeout/5xx (`503`), `429` da Atto
(cooldown), e que senha/token nunca aparecem em respostas HTTP nem em logs.
`DATABASE_URL_TEST` (banco separado, sufixo `_test`) precisa estar configurado
e acessível — ele é truncado a cada teste.

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
| `fastify-type-provider-zod` | Removido | 3 rotas não justificam a camada; `zod.safeParse()` manual é igualmente seguro e remove uma dependência |
| `compose.test.yaml` | Removido | Não referenciado por script, README ou CI |
| Checagem de `Origin` e `Content-Type` em mutações | Mantida | Poucas linhas, já testada, cobre CSRF básico que `SameSite=Lax` só mitiga parcialmente |
| Criptografia do token da Atto (AES-256-GCM via `node:crypto`) | Mantida, sem lib de terceiros | É o mesmo motor (OpenSSL) que qualquer lib JS de cripto usa por baixo; a única opção que reduziria o código de fato (`@47ng/cloak`) traz 8 dependências transitivas, o que contradiz esta limpeza |
| `getValidToken`/`invalidate` em `atto-auth` (helpers para o futuro coletor) | Removidos | Nada chama esse código ainda; é mais simples recriá-lo quando o coletor existir do que mantê-lo sem uso agora |
| Validação de env no boot (zod) | Mantida | Evita subir com configuração inválida |
| Seed de administrador | **Não implementado** | Criar um usuário aqui sempre exige uma conta Atto real, que não há como fabricar neste repositório; o primeiro login bem-sucedido (de quem quer que seja o primeiro administrador) já cria o usuário, tornando um seed redundante |
| Esquema da migration inicial | Regenerado do zero a cada mudança de schema nesta etapa (sem migrations incrementais) | Não há dado real em nenhum ambiente ainda; registrar isso aqui para não repetir a prática quando passar a haver dados reais |

## Premissas a confirmar com a Atto

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
  evite reutilizar a mesma conta Atto em dois ambientes simultaneamente.
