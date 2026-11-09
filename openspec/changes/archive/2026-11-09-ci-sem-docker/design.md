## Context

O `iniciarBancoDeTeste` (`packages/db/test/banco-de-teste.ts`) sobe um contêiner `postgres:18` por chamada. O script `01-papeis.sh` cria o `grafite_owner`, o `grafite_app` e, opcionalmente, o `grafite_backup`, e depois vêm as migrations. Ele devolve as quatro URLs, o `enderecoDoHost`, o `executarNoConteiner` e o `parar`.

Os testes da operação usam o `executarNoConteiner` pelo `ferramentasNoConteiner` para rodar o `pg_dump`, o `pg_restore` e o `psql` da mesma versão do banco. Esses testes montam uma pasta do host em `/compartilhada`. As migrations citam os papéis pelo nome, e o papel do PostgreSQL vale para o cluster inteiro.

A instalação no Windows já roda o PostgreSQL nativo pelo `ferramentasLocais` (`packages/operacao/src/postgres.ts`), com o `initdb` e o `pg_ctl`.

## Goals / Non-Goals

**Goals:**
- A integração e a pilha rodam numa máquina com o PostgreSQL 18 instalado e sem Docker, com o mesmo isolamento de hoje: um banco descartável por chamada.
- Sem a variável, tudo segue pelo Testcontainers, como hoje.

**Non-Goals:**
- Tirar o Docker do desenvolvimento (`pnpm dev`) ou da regressão visual.

## Decisions

### 1. Um cluster próprio por banco de teste

Com `GRAFITE_TESTE_PG_BIN`, cada `iniciarBancoDeTeste` faz o seguinte:
- cria uma pasta temporária e roda o `initdb`, com o superusuário `postgres`, a senha aleatória por arquivo e a autenticação `scram-sha-256`;
- sobe o cluster com o `pg_ctl`, numa porta livre, ouvindo só no `127.0.0.1`;
- cria o banco `grafite`, aplica os papéis e as migrations;
- no `parar`, para o cluster com `pg_ctl stop -m fast` e apaga a pasta.

Alternativa descartada: um banco por teste num PostgreSQL já instalado e no ar. Os papéis valem para o cluster todo, e as migrations os citam pelo nome: dois arquivos de teste ao mesmo tempo disputariam o mesmo `grafite_app`.

### 2. As ferramentas na pasta da instalação

No modo local, o `executarNoConteiner` roda o comando pela pasta `bin`. Ele troca o `/compartilhada` pela pasta compartilhada e o `127.0.0.1:5432` pelo endereço do cluster. Assim, os testes da operação seguem com o `ferramentasNoConteiner`, sem saber onde o banco está.

### 3. Os papéis pelo SQL do banco de teste

O cluster local cria os papéis pelo `sqlDosPapeis`, com as senhas do teste, conectado ao banco `grafite` como o `postgres`. Um teste unitário confere que esse SQL é o do `01-papeis.sh`, que o contêiner e o `pnpm dev` seguem aplicando. O contêiner não muda.

Alternativa descartada: levar o SQL do `.sh` para um `.sql` aplicado pelos dois. O `compose.yaml` monta a pasta `init` inteira no `docker-entrypoint-initdb.d`, que rodaria o `.sql` sozinho, sem as senhas.

### 4. O gitleaks e os rótulos

- **O gitleaks:** o job da busca de segredos usa o `gitleaks` do caminho quando ele existe, com os mesmos argumentos; sem ele, usa a imagem.
- **A regressão visual:** pede `[self-hosted, preparado, docker]`, e o rótulo `docker` fica só no executor com o Docker Desktop.
- **A integração e a pilha:** o passo de conferência passa a aceitar o `GRAFITE_TESTE_PG_BIN` com um `postgres --version` 18, ou o Docker no ar, e diz qual dos dois vai usar.

## Risks / Trade-offs

- [O PostgreSQL instalado pode ser de outra versão] → a conferência do job e o `iniciarBancoDeTeste` recusam a pasta que não for do 18, com a versão na mensagem.
- [Um cluster por chamada é mais lento que o contêiner já baixado] → o `initdb` leva poucos segundos e roda uma vez por arquivo de teste, como o contêiner.
- [Um teste interrompido deixa o cluster no ar] → a pasta fica no temporário do sistema, com o prefixo `grafite-teste-`, e o processo morre com o executor do CI.
