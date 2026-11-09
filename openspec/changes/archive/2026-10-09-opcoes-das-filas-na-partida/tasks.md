## 1. Fila

- [x] 1.1 Escrever os testes de integração e depois, na partida da fila (`apps/api/src/fila/fila.ts`), aplicar as opções do catálogo e conferir a política, conforme o design (decisões 1 e 2). Os casos:
  - uma fila sem opções fica igual aos padrões da constante, que são os do `create_queue` da versão fixada;
  - a fila que já existe com outras novas tentativas e outras esperas passa a ter as do catálogo;
  - a fila que já existe com um destino das falhas que o catálogo não dá fica sem ele;
  - a fila com outra política faz a partida avisar, com a fila, a política dela e a esperada, e a fila funciona.

  Verificar: `pnpm test:integration` passa no `apps/api`.
- [x] 1.2 Tirar do teste da falha esgotada (`apps/api/src/operacao/tarefas.int.test.ts`) o contorno que apagava a fila do backup. No lugar dele, o teste deixa a fila do backup como outro arquivo ou uma versão anterior a deixaria: com as novas tentativas padrão e sem o destino das falhas. Verificar: o teste falha sem a tarefa 1.1 e passa com ela, e `pnpm test:integration` passa no `apps/api`.

## 2. Fechamento

- [x] 2.1 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm test:integration` verdes, `openspec validate opcoes-das-filas-na-partida --strict` sem erros. Verificar: os comandos passam e o CI fica verde no PR.
