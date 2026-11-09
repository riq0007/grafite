## 1. Domínio e banco

- [x] 1.1 Escrever primeiro os testes e depois, no domínio (design, decisões 3 e 5):
  - a ordem da restauração e a chave dos itens;
  - `compararCategoria` e `compararTabelas`;
  - a leitura do CSV do controle;
  - o resultado das operações;
  - `controlid.restaurar`, as ações da auditoria e o evento.

  Verificar: os testes do domínio passam com os cenários "Controle com uma pessoa a menos", "Diferença só na senha" e "Quem faz o backup sem restaurar".
- [x] 1.2 Escrever primeiro o teste de integração e depois a migration 0042 (decisão 1). Verificar: os testes do banco passam, com o teste-guarda do RLS.

## 2. API

- [x] 2.1 Escrever primeiro o teste de integração e depois os pedidos das operações, com o código do app, o ZIP e o resultado do coletor, a falha, a expiração e o comparador (decisões 2, 5 e 6), com o contrato gerado de novo. Verificar: os testes de integração passam com os cenários "Operação na fila", "Operação repetida", "Sem o código do app", "Restauração no mesmo controle" e "Backup do PMG contra o CSV do controle".

## 3. Coletor

- [x] 3.1 Escrever primeiro os testes e depois a comparação e a restauração no coletor (decisão 4), contra o simulador do Control iD. Verificar: os testes do coletor passam com os cenários "Controle trocado", "Restauração no mesmo controle" e "Controle com uma pessoa a menos".

## 4. Web

- [x] 4.1 Escrever primeiro os testes e depois as ações, as operações na ficha e a tela "Comparar backups" (decisão 7). Verificar: os testes da web passam com os cenários "Operação na fila", "Quem faz o backup sem restaurar" e "Backup do PMG contra o CSV do controle".

## 5. Fechamento

- [x] 5.1 Atualizar a spec mestre (o P5b sem o indicador), o mapa e o contrato de módulo, e conferir `pnpm lint`, `pnpm typecheck`, os testes que a change toca e `openspec validate p5b-comparacao-e-restauracao --strict`. O CI fica de lado até o fim de outubro.
  - Feito em 28/10: a P5b na spec mestre, sem o indicador; a capacidade e a change no mapa; o menu no contrato de módulo; o `pnpm lint` e o `pnpm typecheck` verdes; os testes do domínio (1.190), da API (339 unitários e 15 de integração dos backups e das operações), do banco (9), do coletor (109) e da web que a change toca; a change valida sem erros.
