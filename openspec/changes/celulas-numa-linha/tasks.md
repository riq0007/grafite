## 1. A tabela

- [x] 1.1 Escrever primeiro a história "Tabela com colunas estreitas", com as células compostas em colunas de 64 px, na tabela base e na virtualizada, nas três densidades, e ver a história falhar com a classe que quebra; depois, a regra do `flex-wrap` na `Tabela` (design, decisões 1 e 5). Verificar: a história passa com toda linha na altura da densidade.
- [x] 1.2 Escrever primeiro a história e os testes e depois o `ValorComposto` (decisão 2). Verificar: passam "o fixo fica inteiro" e "o resto termina em reticências", sem violação de acessibilidade, e a história mede a largura que cada coluna da coleta pede.
- [x] 1.3 Escrever primeiro os testes e depois o resumo da linha com o conteúdo que não coube (decisão 3). Verificar: os testes passam com "Conteúdo cortado na célula" e "Todas à vista".
- [x] 1.4 Escrever primeiro a história e o teste ponta a ponta e depois o valor inteiro no resumo, que a conferência da 3.2 mostrou cortado (decisão 3). Verificar: passam "Valor composto inteiro" e "Muitas colunas", com o valor longo na linha de baixo, e o ponta a ponta do resumo com a coluna "Suprimentos" em 64 px.

## 2. As células

- [x] 2.1 Escrever primeiro os testes e depois o `ValorComposto` nas quatro células da coleta dos ativos, com o "Desatualizado" no fixo (decisão 2). Verificar: os testes passam com "Disponibilidade numa coluna estreita", "Suprimentos numa coluna estreita" e "Leitura desatualizada", e os da ficha continuam passando com a quebra.
- [x] 2.2 Escrever primeiro os testes e depois o `ValorComposto` na situação dos alertas e na validade do cofre. Verificar: os testes das duas tabelas passam com a célula numa linha.
- [x] 2.3 Escrever primeiro o teste e depois as larguras de fábrica das colunas da coleta (decisão 4). Verificar: o teste do domínio passa com as larguras novas, e o teste das visões mostra que a largura igual à de fábrica não marca a visão como personalizada.
- [x] 2.4 Escrever primeiro a história, o teste do domínio e o ponta a ponta e depois a largura que o conteúdo pede na divisão da sobra, que a conferência da 3.2 mostrou faltar: as colunas da coleta dividiam a sobra com 212 px cada (decisão 4). Verificar: passam "Largura que o conteúdo pede", o teste do domínio com a `larguraMinima` nas quatro colunas da coleta e o ponta a ponta com a "Disponibilidade" entre dez colunas.
- [x] 2.5 Escrever primeiro a história e depois a largura de fábrica que comporta o cabeçalho, que a conferência da 3.2 mostrou cortado em "Total de páginas" (decisão 4). Verificar: passa "Cabeçalhos na largura de fábrica", com o nome de cada coluna da coleta inteiro nas três densidades.

## 3. Fechamento

- [x] 3.1 Escrever o teste ponta a ponta que estreita a coluna "Disponibilidade" e confere a altura das linhas (decisão 5). Verificar: o `pnpm test:e2e` passa.
- [x] 3.2 Conferir no `pnpm dev` a tabela dos ativos de um tipo com a coleta, a dos alertas e a do cofre, estreitando as colunas até o mínimo, nas três densidades. Verificar: nenhuma linha passa de uma linha, e o resumo traz o valor inteiro do que foi cortado.
- [ ] 3.3 Regravar as referências da regressão visual das tabelas que mudaram e atualizar o mapa. Verificar: o `pnpm test:visual` passa, e os testes do mapa passam.
- [ ] 3.4 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:stories`;
  - `pnpm test:e2e`;
  - `openspec validate celulas-numa-linha --strict`.

  Verificar: os comandos passam.
