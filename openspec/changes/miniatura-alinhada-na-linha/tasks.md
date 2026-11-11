## 1. O alinhamento

- [ ] 1.1 Escrever primeiro a história "Com miniaturas" da tabela virtualizada e a conferência do alinhamento na "Com miniaturas" da tabela base, as duas medindo o centro da miniatura contra o centro das primeiras linhas, e ver a da virtualizada falhar com o desvio de 7 px; depois, o `vertical-align: middle` na miniatura (design, decisões 1 e 2). Verificar: as duas histórias passam no `pnpm test:stories`, com até 1 px de diferença.

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
