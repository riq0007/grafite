## 1. As esperas

- [x] 1.1 A estabilidade da história esperada por até 30 s antes da captura, na função `abrir()` (design, decisão 1), com o motivo no comentário. Verificar: o `pnpm lint` e o `pnpm typecheck` passam; a regressão visual roda no CI do PR (tarefa 2.2), e não nesta máquina, para não disputar a máquina com a fila do CI.
- [x] 1.2 As esperas do catálogo em 10 s, pelo `configure` do `storybook/test` no `.storybook/vitest.setup.ts`, e o `testTimeout` de 30 s no projeto "catalogo" (decisão 2), com o motivo nos comentários. Verificar: as histórias de `Abas.stories.tsx` passam pelo `vitest --project catalogo`.

## 2. Fechamento

- [x] 2.1 O mapa (`docs/mapa.md`) traz a change em andamento. Verificar: o teste-guarda do mapa passa.
- [x] 2.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck` e `openspec validate captura-e-catalogo-sob-carga --strict` sem erros, e o CI do PR verde, com a regressão visual passando sem regravar nenhuma referência. Verificar: os comandos passam, e o PR fica com todos os jobs verdes.
