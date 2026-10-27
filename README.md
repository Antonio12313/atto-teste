# atto-teste

Com o Docker e o Docker Compose instalados e o Docker em execução, rode na raiz.
O `.env` local já está configurado. Em um novo clone, prepare-o uma vez:

```sh
cp .env.example .env
```

Ajuste os valores no `.env` e inicie:

```sh
docker compose up -d --build
```

O comando constrói as imagens de produção e inicia três containers:

| Serviço | Endereço |
| --- | --- |
| Web (Next.js) | http://localhost:3000 |
| API (Fastify) | http://localhost:3030 |
| PostgreSQL 17 | localhost:5432 |

O banco é criado automaticamente com o nome, usuário e senha definidos no
`.env`. Seus dados ficam no volume `postgres_data`
e persistem ao parar ou recriar os containers. A API aguarda o banco ficar
disponível e a web aguarda a API.

O Compose lê automaticamente o `.env` da raiz. Ele configura as portas,
interfaces, nomes dos serviços e credenciais do banco. O `.env` fica fora do Git;
apenas `.env.example`, com valores de exemplo, deve ser versionado. Os endereços
acima correspondem às portas do exemplo. Os nomes `api` e `db` devem corresponder
aos serviços do Compose; mantenha as interfaces em `0.0.0.0` nos containers.

As credenciais `POSTGRES_*` inicializam apenas um volume vazio. Alterar essas
variáveis não muda a senha ou o usuário de um banco já existente; nesse caso,
altere também as credenciais no PostgreSQL, preservando os dados.

Dentro da rede Docker, o banco é acessível em `db:5432`, e a API em
`http://api:3030`. A API recebe as variáveis `PGHOST`, `PGPORT`, `PGUSER`,
`PGPASSWORD` e `PGDATABASE`. A web recebe `API_URL=http://api:3030` para uso
no servidor; esse hostname não é acessível diretamente pelo navegador.

A API atual possui apenas a rota `/`: ainda não há driver, consultas ou migrações
de banco implementados. O Compose prepara o PostgreSQL e as configurações para
essa integração futura.

```sh
docker compose ps            # Ver o estado dos serviços
docker compose logs -f       # Acompanhar logs
docker compose down          # Parar os serviços, preservando o banco
```

Após alterações no código, execute novamente `docker compose up -d --build`.
O build inicial requer internet para baixar imagens, dependências e as fontes
Google utilizadas pelo Next.js. `docker compose down -v` também apaga os dados
do banco.
