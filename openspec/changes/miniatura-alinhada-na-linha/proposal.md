## Why

Na tabela dos ativos, a miniatura de cada linha fica 7 px acima do centro da linha e, na última linha visível, aparece cortada embaixo. O usuário relatou em 11/11/2026 que "a imagem pequena do ativo não fica alinhada com a linha correspondente", o que atrapalha ligar a imagem ao registro da linha.

Esta change segue o subprojeto D1 · Linguagem visual v3 da spec mestre, nas tabelas, como a `celulas-numa-linha`. Ficam fora dela:
- as visões por tipo de ativo, que são outra change;
- o tamanho da miniatura, que continua seguindo a densidade;
- a ficha e os ligados, onde a miniatura é item de um contêiner flexível ou de grade e já fica centralizada.

## What Changes

- **A miniatura no meio da linha:** na tabela base e na que desenha só as linhas visíveis, a miniatura do início da linha fica centralizada na altura da linha, alinhada ao texto das outras células.
- **O conserto no componente:** a miniatura de ativo passa a se alinhar pelo meio quando fica em linha com o texto. O conserto vale em todas as tabelas que a mostram, sem mexer tela por tela.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `componentes-base`: a Tabela base passa a dizer que a miniatura do início da linha fica centralizada na altura da linha, alinhada ao texto.

## Impact

- `packages/ui/src/componentes/miniatura/MiniaturaDeAtivo.module.css`: o alinhamento da miniatura.
- `packages/ui/src/componentes/tabela`: a história da tabela que desenha só as linhas visíveis, com miniaturas, passa a conferir o alinhamento.
- As referências da regressão visual das tabelas com miniatura. A mudança é sutil, então a referência é apagada antes do `--atualizar`.
