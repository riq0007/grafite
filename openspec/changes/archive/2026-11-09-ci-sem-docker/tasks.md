> Arquivada em 09/11/2026 como substituída pela `ci-nos-executores-do-github` (design, decisão 10), que passou o CI aos executores hospedados pelo GitHub e tirou os executores próprios do repositório. Continua o banco de teste num PostgreSQL 18 instalado (1.1), para quem roda a integração sem Docker. Saíram com ela o gitleaks do caminho e a conferência do banco no CI (2.1) e a seção do executor numa VM no runbook (3.1).

## 1. O banco de teste sem Docker

- [x] 1.1 O cluster local no `iniciarBancoDeTeste` com `GRAFITE_TESTE_PG_BIN` (design, decisões 1 a 3), começando pelos testes unitários da tradução dos comandos para a pasta da instalação, da versão do PostgreSQL e do SQL dos papéis igual ao do `01-papeis.sh`. Verificar: `pnpm --filter @grafite/db test` e o `typecheck` passam, e, sem a variável, o banco de teste segue pelo contêiner, sem mudança. Com ela, a integração inteira roda no executor sem Docker, na 3.2.

## 2. O CI

- [x] 2.1 O gitleaks do caminho, com a imagem quando ele falta, e a conferência do banco na integração e na pilha (decisão 4). Verificar: o `pnpm lint` passa, e o run do PR mostra no passo qual dos dois foi usado.
- [ ] 2.2 A regressão visual com o rótulo `docker`, dado ao PC-DEV pela API antes do merge (decisão 4). Verificar: no run do PR, a regressão visual roda no PC-DEV.
  **Não se aplica:** não há mais executor próprio para levar o rótulo, e a regressão visual roda no contêiner do Playwright, no `ubuntu-24.04` do GitHub.

## 3. Fechamento

- [x] 3.1 O runbook com o executor numa VM sem Docker (PostgreSQL 18, gitleaks, `GRAFITE_TESTE_PG_BIN` no `.env` do executor e os rótulos), o CLAUDE.md com a variável no `pnpm test:integration` e o mapa com a change em andamento. Verificar: o teste-guarda do mapa passa.
- [ ] 3.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck` e `openspec validate ci-sem-docker --strict` sem erros, a integração inteira sem o Docker no ar, e o CI do PR verde. Verificar: os comandos passam, e o PR fica com todos os jobs verdes.
  **Não se aplica:** o PR desta change não foi aberto, e a integração inteira sem o Docker não chegou a rodar num executor. As verificações do CI passaram ao PR da `ci-nos-executores-do-github`.
