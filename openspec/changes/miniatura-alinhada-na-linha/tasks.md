## 1. O alinhamento

- [x] 1.1 Escrever primeiro a história "Tabela com miniaturas", na tabela base e na que desenha só as linhas visíveis, nas três densidades, medindo o centro da miniatura contra o centro de cada linha. Ver as duas falharem: na compacta, 1,8 px na base e 5,1 px na virtualizada. Depois, o `vertical-align: middle` na miniatura (design, decisões 1 e 2). Verificar: as duas histórias passam no `pnpm test:stories`, com até 1 px de diferença.

## 2. Fechamento

- [ ] 2.1 Regravar as referências da regressão visual das histórias com miniatura que mudaram, apagando antes as que mudam pouco, e conferir as capturas novas (design, riscos). Verificar: o `pnpm test:visual` passa, e as capturas novas mostram a miniatura no meio da linha.
- [ ] 2.2 Conferir no `pnpm dev` a tabela dos ativos nas três densidades, e a ficha e os ligados de um ativo. Verificar: a miniatura fica no meio da linha, a até 1 px, e a ficha e os ligados não mudam.
- [ ] 2.3 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:stories`;
  - `openspec validate miniatura-alinhada-na-linha --strict`.

  Verificar: os comandos passam.
