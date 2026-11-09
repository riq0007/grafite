## 1. Os testes

- [x] 1.1 O tempo limite dos testes do coletor (design, decisão 1): `apps/collector/vitest.config.ts` com `testTimeout: 30_000` e o motivo no comentário. Verificar: `pnpm --filter @grafite/collector test` passa, também com a integração da API rodando ao lado.
- [x] 1.2 A comparação ordenada dos códigos de recuperação (decisão 3) em `dois-passos-da-conta.int.test.ts`. Verificar: o teste de integração `dois-passos-da-conta` passa.
- [x] 1.3 O tempo limite dos testes unitários da API, da web e da UI (decisão 1): o `testTimeout` de 30 s no `vitest.config.ts` da API, no da web e no projeto unitário da UI, e o limite do processo dos testes da partida da API em 60 s, como o do comando da operação. Verificar: `pnpm test` passa nos pacotes da API, da web e da UI, com a máquina carregada pelo CI.
- [x] 1.4 A espera da Testing Library em 10 s nos testes da web (decisão 2), pelo arquivo de preparo, e o teste do resumo da linha sem a espera própria de 3 s. Verificar: os testes da web passam, com as três instâncias do executor rodando ao lado.
- [x] 1.5 A história "Busca Com Sugestoes De Fora" espera a lista da última resposta antes de conferir que "Anabela Reis" não está nela (decisão 4). Verificar: as histórias de `Campos.stories.tsx` passam pelo `vitest --project catalogo`.
- [x] 1.6 A espera da sondagem do Control iD nos testes (decisão 5): 5 s para os controles que respondem e 300 ms só para o controle calado. Verificar: os testes do coletor passam, e o do controle calado continua dando "sem resposta" com os dois pedidos.
- [x] 1.7 O resumo da linha na ponta a ponta tenta de novo (decisão 6): o mouse sai e para outra vez até o resumo abrir. Verificar: `pnpm --filter @grafite/web exec playwright test e2e/ativos.spec.ts -g "resume as colunas"` passa, e o resumo ainda mostra o IP e não mostra o patrimônio.

## 2. Fechamento

- [x] 2.1 O mapa (`docs/mapa.md`) traz a change em andamento. Verificar: `pnpm test` passa, com o teste-guarda do mapa.
- [x] 2.2 Conferir as verificações: `pnpm lint` e `openspec validate testes-sob-carga --strict` sem erros, e o CI do PR verde. Verificar: os comandos passam, e o PR fica com todos os jobs verdes.
