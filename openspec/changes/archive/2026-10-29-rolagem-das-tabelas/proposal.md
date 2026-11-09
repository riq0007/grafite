## Why

A revisão de todos os módulos no `pnpm dev`, depois da `cabecalhos-e-fichas`, achou tabelas mais largas que a janela cortadas na borda direita, sem nenhum sinal de que há mais colunas. Nas Regras de alerta, a coluna Situação aparece pela metade; nos Backups do Control iD, a última ação some no meio da palavra. A linha da tabela não quebra, de propósito, e a área rola para o lado, mas quem olha lê o corte como defeito.

Esta change segue o subprojeto D1 · Linguagem visual v3 da spec mestre, na tabela base. Ficam fora dela:
- a largura e os textos das colunas de cada tela;
- a tabela virtualizada, em que a própria grade rola, por dentro da área.

## What Changes

- **A borda que rola esmaece:** quando a tabela é mais larga que a área dela, a borda do lado em que há mais colunas esmaece, como a faixa esmaecida da janela faz em cima e embaixo. No começo, só a direita esmaece; no fim, só a esquerda; no meio, as duas.
- **As barras de rolagem ficam inteiras:** a barra de baixo e a do lado não esmaecem.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `componentes-base`: a tabela base esmaece a borda do lado em que há mais colunas.

## Impact

- `packages/ui/src/componentes/tabela`: a `Tabela`, o CSS dela e a história da tabela larga.
- Todas as tabelas do app que rolam para o lado, sem mudar nada nas telas.
