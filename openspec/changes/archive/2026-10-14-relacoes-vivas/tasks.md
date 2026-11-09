## 1. API

Cada tarefa entra com os esquemas e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 1.1 Escrever primeiro os testes de integração e depois as rotas de resumo da pessoa, do local, do modelo, do tipo e do ativo, com as contagens no escopo de quem vê e o recorte dito (design, decisão 1). Verificar: os testes de integração passam, inclusive a pessoa sem cartão para quem não a vê e o desempenho do local com 10 mil ativos.
- [x] 1.2 Escrever primeiro os testes de integração e depois `GET /locais/contagens` e o operador `igual` da coluna de local (decisões 3 e 6). Verificar: os testes de integração passam.

## 2. Biblioteca

- [x] 2.1 Escrever primeiro as histórias com os testes de interação e depois a `ReferenciaComCartao` e o `CartaoDoRegistro` (decisão 2): o ponteiro parado, a seta para baixo, o Esc, o toque, o movimento reduzido e a referência numa célula da tabela. Verificar: `pnpm test:stories` passa.

## 3. Web

- [x] 3.1 Escrever primeiro os testes e depois as referências com cartão nas células, na prévia, na ficha do ativo, com a linha de relações no cabeçalho, e no acesso da conta. Verificar: os testes da web passam.
- [x] 3.2 Escrever primeiro os testes e depois a origem da tabela, com a faixa, o "Incluir os locais de dentro", o "Limpar origem" e o cadastro preenchido (decisão 3). Verificar: os testes da web passam com os cenários da spec cadastro-de-ativos.
- [x] 3.3 Escrever primeiro os testes e depois as relações no registro de módulos e as contagens nas fichas da pessoa, do local, do modelo e do tipo, e as contagens e o "Vai junto" na tela dos locais (decisões 4 e 6). Verificar: os testes da web passam, e a relação some com o módulo desligado.
- [x] 3.4 Escrever primeiro os testes e depois as ações da tela e o "Ver todos os N" na busca (decisão 5). Verificar: os testes da web passam com os cenários da spec busca-global.

## 4. Ponta a ponta

- [x] 4.1 A ponta a ponta simulada (o cartão do responsável na tabela, "Ver ativos" no local com a faixa de origem e o cadastro preenchido, e "Nesta tela" na busca) e a da pilha (as contagens de um local com o escopo de uma conta recortada). As referências visuais das telas com as referências são regravadas. Verificar: `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` passam.

## 5. Fechamento

- [x] 5.1 O contrato de módulo, com as relações e as ações da tela, e o mapa. Verificar: `pnpm test` passa, com o teste-guarda do mapa.
- [x] 5.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes, `contrato:verificar` em dia, e `openspec validate relacoes-vivas --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
