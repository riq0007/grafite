# syntax=docker/dockerfile:1
# Imagens do Grafite. Os alvos:
#   docker build --target aplicacao -t grafite-aplicacao .   (API + web compilada)
#   docker build --target coletor   -t grafite-coletor .     (coletor local)
#   docker build --target proxy     -t grafite-proxy .       (Caddy com o DNS da Cloudflare)
#   docker build --target operacao  -t grafite-operacao .    (comando de operação do Linux)
# A API e o coletor rodam o TypeScript direto no Node 24 (sem etapa de compilação).

# As versões do Caddy e do módulo do DNS da Cloudflare, as mesmas do caddy.exe do pacote do
# Windows: o versao.yml passa as dele, e estas valem para a construção local.
ARG CADDY=2.11.7
ARG CADDY_DNS_CLOUDFLARE=v0.2.4

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    LEFTHOOK=0
RUN corepack enable
WORKDIR /repo

# Baixa as dependências só a partir do lockfile: a camada muda só quando ele muda.
FROM base AS dependencias
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm fetch

FROM dependencias AS web
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "@grafite/web..." \
 && pnpm --filter @grafite/web build

# A página do painel da operação, que o comando de operação serve (change painel-da-operacao).
FROM dependencias AS painel
COPY . .
RUN pnpm install --offline --frozen-lockfile --filter "@grafite/painel..." \
 && pnpm --filter @grafite/painel build

# A API com as dependências de produção dela e dos pacotes do workspace que ela importa, a partir
# do lockfile travado, numa etapa que conhece só esses manifestos: o node_modules sai enxuto (o
# `pnpm fetch` traria o lockfile inteiro). Os pacotes do workspace ficam no layout do repositório,
# ligados por links fora do node_modules: são TypeScript, e o Node recusa remover os tipos de um
# arquivo dentro do node_modules.
FROM base AS api-isolada
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/domain/package.json ./packages/domain/
COPY packages/operacao/package.json ./packages/operacao/
RUN pnpm install --frozen-lockfile --prod --filter "@grafite/api..."
COPY apps/api ./apps/api
COPY packages/db ./packages/db
COPY packages/domain ./packages/domain
COPY packages/operacao ./packages/operacao

# O coletor, com o domínio, que ele usa para conferir as faixas e ler os lotes.
FROM base AS coletor-isolado
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/collector/package.json ./apps/collector/
COPY packages/domain/package.json ./packages/domain/
RUN pnpm install --frozen-lockfile --prod --filter "@grafite/collector..."
COPY apps/collector ./apps/collector
COPY packages/domain ./packages/domain

# O comando de operação, com o banco, o domínio e a operação, que ele importa.
FROM base AS operacao-isolada
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY apps/operacao/package.json ./apps/operacao/
COPY packages/db/package.json ./packages/db/
COPY packages/domain/package.json ./packages/domain/
COPY packages/operacao/package.json ./packages/operacao/
RUN pnpm install --frozen-lockfile --prod --filter "@grafite/comando-de-operacao..."
COPY apps/operacao ./apps/operacao
COPY packages/db ./packages/db
COPY packages/domain ./packages/domain
COPY packages/operacao ./packages/operacao

# O Node com as ferramentas do PostgreSQL 18 (pg_dump, pg_restore e psql) do repositório do PGDG,
# em /usr/lib/postgresql/18/bin, que o backup e a restauração usam (change
# servidor-linux-com-docker, design, decisão 7). O GRAFITE_PG_BIN fica na configuração da produção,
# com o resto do backup: a variável é do grupo do backup, que vale inteiro ou nada.
FROM node:24-slim AS node-com-postgres
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
 && . /etc/os-release \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-18 \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# API servindo a web compilada; /api/... e /health chegam às rotas da API. A imagem é a mesma
# Debian das dependências: o sharp instalado nelas é o binário para a glibc. Os arquivos ficam no
# volume /dados/arquivos, fora da imagem, e sobrevivem a um contêiner novo. O backup diário usa as
# ferramentas do PostgreSQL 18 da própria imagem.
FROM node-com-postgres AS aplicacao
ENV NODE_ENV=production \
    GRAFITE_AMBIENTE=producao \
    GRAFITE_API_HOST=0.0.0.0 \
    GRAFITE_API_PORTA=3000 \
    GRAFITE_WEB_PASTA=/app/web \
    GRAFITE_ARQUIVOS_PASTA=/dados/arquivos
WORKDIR /app
COPY --from=api-isolada /repo ./
COPY --from=web /repo/apps/web/dist ./web
RUN mkdir -p /dados/arquivos && chown node:node /dados/arquivos
VOLUME /dados/arquivos
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/api/src/servidor.ts"]

# O coletor pinga pelo comando do sistema: o ping do iputils usa o socket ICMP sem privilégio, que
# o Docker libera nos contêineres, e o BusyBox pediria o socket cru de quem roda como root. A fila
# em disco fica no volume /dados/coletor e sobrevive a um contêiner novo.
FROM node:24-alpine AS coletor
RUN apk add --no-cache iputils
ENV NODE_ENV=production \
    GRAFITE_COLETOR_HOST=0.0.0.0 \
    GRAFITE_COLETOR_PORTA=3100 \
    GRAFITE_COLETOR_PASTA=/dados/coletor
WORKDIR /app
COPY --from=coletor-isolado /repo/node_modules ./node_modules
COPY --from=coletor-isolado /repo/apps/collector ./apps/collector
COPY --from=coletor-isolado /repo/packages/domain ./packages/domain
RUN mkdir -p /dados/coletor && chown node:node /dados/coletor
VOLUME /dados/coletor
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3100/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/collector/src/servidor.ts"]

# O proxy do servidor Linux (change servidor-linux-com-docker, design, decisão 7): o Caddy montado
# pelo xcaddy da imagem oficial, com o módulo do DNS da Cloudflare, para o certificado público pelo
# desafio de DNS. A configuração e os dados vêm das pastas montadas pela instalação.
FROM caddy:${CADDY}-builder AS proxy-compilado
ARG CADDY_DNS_CLOUDFLARE
RUN xcaddy build --with "github.com/caddy-dns/cloudflare@${CADDY_DNS_CLOUDFLARE}"

FROM caddy:${CADDY} AS proxy
COPY --from=proxy-compilado /usr/bin/caddy /usr/bin/caddy

# O PostgreSQL 18 de cada ambiente no servidor Linux (change servidor-linux-com-docker, design,
# decisões 5 e 6), com a etiqueta do Grafite: ele vai no pacote da versão, e o servidor não busca
# nenhuma imagem.
FROM postgres:18 AS banco

# O comando de operação do servidor Linux (change servidor-linux-com-docker, design, decisão 2): o
# mesmo do Windows, com o cliente do Docker e o plugin compose do repositório oficial do Docker,
# que falam com o Docker do servidor pelo socket montado pelo lançador, e as ferramentas do
# PostgreSQL 18, para o backup, a restauração e os papéis dos bancos. Roda como root, como o
# grafite.ps1 roda como administrador: o lançador só o chama com o root do servidor.
FROM node-com-postgres AS operacao
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
 && . /etc/os-release \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=operacao-isolada /repo ./
# A página do painel, em /app/painel, a pasta do pacote no contêiner.
COPY --from=painel /repo/apps/painel/dist ./painel
# A entrada do Linux, com as peças dos contêineres; o lançador passa a pasta e o fuso. O caminho é
# absoluto: o lançador roda o comando na pasta de quem o chamou, para os caminhos dos argumentos.
ENTRYPOINT ["node", "/app/apps/operacao/src/linux/grafite.ts"]
