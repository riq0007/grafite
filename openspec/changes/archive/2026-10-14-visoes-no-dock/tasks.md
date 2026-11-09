## 1. Domínio e API

- [x] 1.1 Escrever primeiro os testes e depois as visões fixadas nas preferências e nos padrões (design, decisão 1), com o limite de 20 e a recusa, e o contrato gerado de novo. Verificar: os testes do domínio e de integração passam, e a fixação para todos entra na auditoria.

## 2. Web

- [x] 2.1 Escrever primeiro os testes e depois os itens de menu dinâmicos no registro de módulos e no dock (decisão 2). Verificar: os testes da web passam, e um item dinâmico some com a visão removida e com o módulo desligado.
- [x] 2.2 Escrever primeiro os testes e depois o menu do Ativos com as visões fixadas e o submenu "Por tipo", e o menu da visão com fixar e desafixar (decisões 2 e 3). Verificar: os testes da web passam com os cenários das specs.

## 3. Ponta a ponta

- [x] 3.1 A ponta a ponta simulada fixa uma visão e a abre pelo dock, e abre as impressoras por "Por tipo". Os menus abertos ficam fora das capturas da regressão visual, que não muda; o ícone no item de menu entra pela história de interação do catálogo. Verificar: `pnpm test:e2e` e `pnpm test:visual` passam.

## 4. Fechamento

- [x] 4.1 O contrato de módulo, com os itens de menu dinâmicos, e o mapa. Verificar: `pnpm test` passa, com o teste-guarda do mapa.
- [x] 4.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e` e `pnpm test:visual` verdes, `contrato:verificar` em dia, e `openspec validate visoes-no-dock --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
