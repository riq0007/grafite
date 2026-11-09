## 1. Os componentes base

- [x] 1.1 Redesenhar o rótulo de situação como selo (design, decisão 1). Verificar: os testes do rótulo e da matriz passam, e a história do rótulo mostra o fundo sutil e a borda.
- [x] 1.2 Redesenhar os botões secundário e destrutivo e os campos como poços (decisões 2 e 3). Verificar: os testes dos botões e dos campos passam, e o `pnpm test:stories` dos dois passa sem violação de acessibilidade.
- [x] 1.3 Redesenhar o cabeçalho e a linha selecionada da tabela (decisão 4). Verificar: os testes da tabela passam, e a história da tabela com seleção mostra a marca lateral.

## 2. O carimbo e o dock

- [x] 2.1 Escrever primeiro os testes e depois o `Carimbo`, com a história, e o mesmo desenho nos títulos dos painéis da ficha do ativo (decisão 5). Verificar: o teste passa com "Título lido pelo leitor de tela", e os testes da ficha continuam verdes.
- [x] 2.2 Desenhar a placa dos itens do dock e a do módulo atual (decisão 6). Verificar: os testes do dock passam com "Módulo atual".

## 3. Fechamento

- [x] 3.1 Regravar as capturas da regressão visual, apagando antes as referências, e conferir por amostra a matriz e o dock. Verificar: o `pnpm test:visual` passa.

  Feito em 29/10: as 694 referências apagadas e regravadas, com as 701 capturas passando; 337 mudaram e 6 são novas, as do carimbo. Na amostra, a matriz mostra os selos, o secundário na linha forte, o destrutivo com a borda crítica, os campos como poços e o cabeçalho em legenda, e o dock mostra as placas e a borda do módulo atual.
- [x] 3.2 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `openspec validate componentes-v3 --strict`.

  Verificar: os comandos passam.

  Feito em 29/10: o typecheck, os testes dos dez pacotes e a validação passaram. O lint reprovou a cor literal da história do dock, corrigida em seguida, e passou.
