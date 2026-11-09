## Why

O usuário quer executores do CI em VMs Windows sem Docker. Hoje três jobs dependem dele:
- a integração, que sobe o PostgreSQL 18 pelo Testcontainers;
- a ponta a ponta da pilha, que sobe o banco do mesmo jeito;
- a busca de segredos, que roda o gitleaks numa imagem.

A regressão visual também usa o Docker, mas só fica estável no contêiner do Playwright.

Instalar o Docker numa VM pede a virtualização aninhada, e, no PC-DEV, o Docker Desktop é a peça que mais derruba o CI: ele fecha quando a máquina reinicia ou quando o Hyper-V é desligado para o VirtualBox.

A change pertence ao esqueleto técnico do F0 e à seção 12.2 da spec mestre, e nenhum requisito muda: o CI continua testando a integração com o banco real.

Escolhas do usuário em 30/10:
- a regressão visual fica no executor com Docker;
- os testes com banco aceitam os dois jeitos: o PostgreSQL instalado, quando a máquina o declara, e o Testcontainers, sem a declaração.

Ficam fora desta change:
- a regressão visual sem contêiner, que pediria regravar todas as referências;
- criar as VMs e registrar os executores, que é da operação e fica no runbook.

## What Changes

- **O banco de teste sem Docker:** com `GRAFITE_TESTE_PG_BIN` apontando para a pasta `bin` de um PostgreSQL 18, o `iniciarBancoDeTeste` cria um cluster próprio numa pasta temporária, com o `initdb`, e o sobe numa porta livre, com o `pg_ctl`. Os papéis e as migrations são os mesmos do contêiner. As ferramentas do banco (`pg_dump`, `pg_restore`, `psql`) rodam dessa pasta. Sem a variável, nada muda.
- **Os papéis:** o cluster local cria os mesmos papéis do `01-papeis.sh`, e um teste confere que o SQL é o mesmo.
- **O gitleaks sem Docker:** o job da busca de segredos usa o `gitleaks` instalado, quando há um, e a imagem, quando não há.
- **Os rótulos:** a regressão visual passa a pedir o rótulo `docker`, que só o executor com Docker tem; os outros jobs seguem no `preparado`. O passo "Docker no ar" da integração e da pilha passa a aceitar o PostgreSQL declarado no lugar do Docker.
- **Runbook:** o passo a passo de um executor numa VM sem Docker.
- **Mapa:** o `docs/mapa.md` traz a change em andamento.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

Nenhuma: as verificações a cada PR (spec plataforma-base, "Qualidade verificada antes do commit e em cada PR") continuam as mesmas, e a change declara `skip_specs: true`.

## Impact

- **Testes:** `packages/db/test/banco-de-teste.ts`, o `cluster-local.ts` novo ao lado dele, com o teste unitário, e o `vitest.config.ts` do banco.
- **CI:** `.github/workflows/ci.yml`.
- **Documentação:** o runbook, o CLAUDE.md (a variável no `pnpm test:integration`) e o mapa.
