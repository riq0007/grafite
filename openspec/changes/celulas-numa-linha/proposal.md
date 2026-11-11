## Why

O usuário relatou, em 09/11/2026, que a "visualização das tabelas fica em duas linhas quando não cabe". A célula da tabela não quebra o texto, mas as células compostas quebram: a Disponibilidade, o Control iD, os Suprimentos e o Total de páginas dos ativos põem a situação, a idade da leitura e o "Desatualizado" num contêiner que quebra a linha quando a coluna é estreita. Esse contêiner é o mesmo da ficha, onde quebrar é o certo. Na tabela, a linha cresce para duas ou três linhas, e na tabela que desenha só as linhas visíveis, de altura fixa, o conteúdo aparece cortado ao meio. A situação dos alertas e a validade dos segredos usam o mesmo desenho.

Esta change segue o subprojeto D1 · Linguagem visual v3 da spec mestre, nas tabelas. Ficam fora dela:
- a barra de cima da tabela, com a busca, os filtros e as ações, que quebra em mais linhas de propósito quando falta largura;
- as larguras que cada conta já guardou nas visões dela;
- as visões por tipo de ativo, que são outra change.

## What Changes

- **A linha tem sempre uma linha:** o conteúdo de uma célula não quebra para baixo, na tabela base e na que desenha só as linhas visíveis. O que não cabe termina cortado.
- **O corte na ordem certa:** na célula com a situação e um texto, o rótulo de situação fica inteiro, e o texto ao lado é o que encolhe, com reticências.
- **O valor inteiro no resumo da linha:** a coluna cujo conteúdo não coube na célula entra no resumo da linha, com as que estão fora da tela.
- **As larguras de fábrica:** as colunas da coleta nascem com, pelo menos, a largura que comporta a situação e a idade da leitura em dia, também quando a tabela divide a sobra entre as colunas.
- **O resumo com o valor inteiro:** no resumo da linha, o valor que passa da largura continua na linha de baixo, em vez de terminar em reticências.
- **A ficha não muda:** fora das tabelas, as mesmas partes continuam quebrando a linha.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `componentes-base`: a célula numa linha só, com a ordem do corte, e a coluna que não fica mais estreita que o conteúdo pede na divisão da sobra.
- `tabelas-configuraveis`: o resumo da linha com o conteúdo que não coube na célula.

## Impact

- `packages/ui/src/componentes/tabela`: a regra da célula, o componente do valor composto, o resumo da linha, a largura que o conteúdo da coluna pede na divisão da sobra e as histórias.
- `apps/web/src/modulos/ativos` (disponibilidade, Control iD, suprimentos e páginas), `apps/web/src/modulos/alertas` e `apps/web/src/modulos/cofre`: as células compostas.
- `packages/domain/src/ativos/colunas.ts` e `packages/domain/src/visoes/visoes.ts`: as larguras de fábrica das colunas da coleta e a largura que o conteúdo pede.
- As referências da regressão visual das tabelas com essas células, e o mapa.
