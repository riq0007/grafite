## 1. A regressão visual

- [x] 1.1 A espera da história em 30 s na função `abrir()` (design, decisão 1) e o teste em 60 s na configuração do Playwright da regressão visual (decisão 2), cada um com o motivo no comentário. Verificar: o `pnpm lint` e o `pnpm typecheck` passam; a regressão visual roda no CI do PR (tarefa 2.2), e não nesta máquina, para não disputar a máquina com a fila do CI.

## 2. Fechamento

- [x] 2.1 O mapa (`docs/mapa.md`) traz a change em andamento. Verificar: o teste-guarda do mapa passa.
- [x] 2.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck` e `openspec validate visual-sob-carga --strict` sem erros, e o CI do PR verde, com a regressão visual passando sem regravar nenhuma referência. Verificar: os comandos passam, e o PR fica com todos os jobs verdes.
