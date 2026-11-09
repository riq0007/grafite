## Why

O usuário pediu, no redesenho de 29/10, mais criatividade para mostrar a quantidade de toner, os Face ID e os backups. Hoje esses números aparecem como texto solto ou numa barra genérica:
- o nível do toner é um percentual com uma barra na cor do destaque, igual para todas as cores do cartucho;
- a contagem de rostos de cada controle só existe dentro do conteúdo do backup;
- os backups de um controle são uma lista, e um dia sem backup não aparece em lugar nenhum.

O ANTISLOP v3 (seção 31) definiu os instrumentos: a régua com as marcas e o cursor do limite, o cartucho com a tinta, a faixa de dias com um símbolo por situação e a tendência com o período. A fundamentos-v3 já trouxe as cores deles: as séries, as tintas, as situações completas e o numeral.

Esta change é a segunda etapa do subprojeto D1 · Linguagem visual v3 da spec mestre. Ela cria esses instrumentos como componentes do `packages/ui`, com as histórias do catálogo e os testes. Ficam fora dela:
- o uso dos instrumentos nas telas dos módulos (os suprimentos, o Control iD e os backups), com a API que dá a série e o resumo dos dias, que vem na change seguinte, a suprimentos-rostos-e-backups;
- o redesenho dos componentes que já existem.

## What Changes

Cinco componentes novos, na seção Visualização de dados do catálogo. Todos dizem o valor em texto e têm o nome acessível.

- **Medidor:** a régua de um valor de 0 ao máximo.
  - A trilha afundada tem as marcas de 25 em 25%, e o preenchimento usa a tinta ou a série.
  - O número vem em numeral, com a unidade.
  - O cursor ▲ marca um limite com o texto dele, como "Alerta abaixo de 10%".
  - Sem valor, o medidor mostra o motivo em texto, sem barra nem zero.
- **Cartucho:** o nível de um suprimento, na vertical, com a tinta.
  - A letra da tinta (C, M, Y ou K) fica no topo, e o percentual em numeral e o nome, embaixo.
  - O medido enche de baixo para cima.
  - "Há suprimento" aparece hachurado, sem percentual, e "Sem dado" e "Inconsistente" aparecem em texto.
  - A estimativa de quando acaba fica embaixo, sempre escrita como estimativa.
- **Faixa de dias:** um quadrado por dia, com uma forma por situação, além da cor:
  - **cheio:** concluído;
  - **meio cheio:** parcial;
  - **com o X:** falha;
  - **só o contorno:** sem nada.

  Ao lado vai o resumo em texto, como "26 de 30 dias com backup · 2 falhas".
- **Tendência:** a linha curta de uma série, com o último valor e o período em texto. A projeção vai tracejada.
- **Contagem:** um número em numeral, com a unidade, o rótulo, a variação desde a leitura anterior e, quando há, a capacidade, como "412 de 3.000".

## Capabilities

### New Capabilities

- `visualizacao-de-dados`: os instrumentos de visualização do Grafite, que são o medidor, o cartucho, a faixa de dias, a tendência e a contagem. Cada um tem o valor em texto, o nome acessível e uma forma que não depende só da cor.

### Modified Capabilities

Nenhuma.

## Impact

- **`packages/ui/src/componentes/dados`:** os cinco componentes, as funções puras deles (a posição na régua, o resumo dos dias e o caminho da tendência), os testes e as histórias.
- **`packages/ui/src/index.ts`:** a exportação dos componentes.
- **A regressão visual:** as histórias novas ganham capturas.
- A API, o banco, as telas dos módulos e o contrato não mudam.
