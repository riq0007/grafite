## 1. As esperas

- [x] 1.1 A integração e a regressão visual com 30 min no `ci.yml` (design, decisão 1), com o motivo no comentário. Verificar: o `pnpm lint` passa, e os dois jobs mostram o limite novo no CI do PR.
- [x] 1.2 O teste de desempenho da importação com o limite de 480 s e o tempo de 540 s (decisão 2), com o motivo no comentário. Verificar: o teste passa no CI do PR, e o tempo medido aparece no log.
- [x] 1.3 O preparo do `svg.test.ts` com 120 s e o `afterAll` que só fecha o servidor aberto (decisão 3). Verificar: `pnpm --filter @grafite/api test svg` passa.
- [x] 1.4 A comparação das capturas da regressão visual com 30 s (decisão 4), no `playwright.config.ts` dela, com o motivo no comentário. Verificar: o `pnpm lint` passa, e a regressão visual passa no CI do PR.
- [x] 1.5 A espera da primeira foto na ponta a ponta da pilha com 120 s (decisão 5), com o motivo no comentário. Verificar: o `pnpm lint` passa, e a ponta a ponta da pilha passa no CI do PR.
- [x] 1.6 O teste das fotos que entrega o SVG sanitizado com 120 s (decisão 3), com o motivo no comentário. Verificar: o `fotos.int.test.ts` passa com o banco real.
- [x] 1.7 A história "Menu Reaberto Pelo Teclado" do Dock com a saída do menu em 5 s (decisão 6). Verificar: as histórias do Dock passam pelo `vitest --project catalogo`.

## 2. Fechamento

- [x] 2.1 As referências do CLAUDE.md com o P2 e o P3 arquivados, e o mapa (`docs/mapa.md`) com a change em andamento. Verificar: os caminhos das referências existem, e o teste-guarda do mapa passa.
- [x] 2.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck` e `openspec validate integracao-sob-carga --strict` sem erros, e o CI do PR verde, com a integração e a regressão visual dentro do limite. Verificar: os comandos passam, e o PR fica com todos os jobs verdes.
