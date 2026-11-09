## 1. Correção

- [x] 1.1 Escrever primeiro a história de interação do catálogo (`packages/ui/src/casca/Dock.stories.tsx`) que abre o menu de Ajustes pelo teclado, escolhe um item e reabre o menu pela seta enquanto o anterior ainda sai da tela, esperando o foco no primeiro item; depois, fazer o menu aberto pelo teclado receber o foco também quando o painel anterior é reaproveitado, sem mudar o ponteiro e o toque. Verificar: `pnpm --filter @grafite/ui test:stories` passa, com a história nova reprovada antes da correção e as outras do dock.

## 2. Fechamento

- [x] 2.1 O mapa (`docs/mapa.md`) lista a change em andamento. Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:stories`, `pnpm test:e2e` e `pnpm test:visual` verdes; `openspec validate foco-do-menu-do-dock --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
