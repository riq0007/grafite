## 1. As telas

- [x] 1.1 Escrever primeiro o teste "Três painéis no celular" e depois a grade de uma coluna na postura do celular (design, decisão 3). Verificar: o teste passa, e os testes dos Painéis continuam passando.
- [x] 1.2 Passar o bloco dos backups do Início às três faixas na largura estreita e o tipo da célula do nome a encolher primeiro (decisões 1 e 2). Verificar: na captura a 390 px do `pnpm dev`, o Início e a tabela dos ativos mostram o nome inteiro e o texto dos backups numa linha, e a 1.440 px nada muda.
- [x] 1.3 Na célula do nome, deixar o nome com a largura dele, até a da célula, e o tipo com o que sobra, no lugar do encolher proporcional (decisão 2). Verificar: na medida da célula de 60 a 240 px, nenhum nome cortado com o tipo à vista; na captura a 390 px, nenhuma linha dos ativos com duas reticências; e a 1.440 px nada muda.

## 2. Fechamento

- [x] 2.1 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:e2e`;
  - a auditoria das 76 telas a 390 px;
  - `openspec validate telas-no-celular --strict`.

  Verificar: os comandos passam, e a auditoria fica sem falhas.
