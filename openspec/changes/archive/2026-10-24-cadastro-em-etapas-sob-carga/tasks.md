## 1. O limite

- [x] 1.1 O teste "cadastra com o modelo, os valores e a trava, de etapa em etapa" sem o limite próprio de 15 s nem o comentário dos 5 s, e o comentário do `testTimeout` no `vitest.config.ts` da web dizendo que o limite no `it` vale no lugar dele (design, decisão 1). Verificar: o `AtivoNovo.test.tsx` passa (`pnpm --filter @grafite/web exec vitest run src/modulos/ativos/cadastro/AtivoNovo.test.tsx`), e, preso a um núcleo disputado por 9 processos de CPU, o teste passa, onde o limite de 15 s dava "Test timed out in 15000ms".

## 2. Fechamento

- [x] 2.1 O mapa (`docs/mapa.md`) traz a change em andamento. Verificar: o teste-guarda do mapa passa (`pnpm exec vitest run scripts/mapa.test.ts`).
- [x] 2.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck` e `openspec validate cadastro-em-etapas-sob-carga --strict` sem erros, e o CI do PR verde. Verificar: os comandos passam, e o PR fica com todos os jobs verdes.
