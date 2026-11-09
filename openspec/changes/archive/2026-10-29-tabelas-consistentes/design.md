## Context

A tabela base (`packages/ui/src/componentes/tabela/Tabela.tsx`) tem o `alinhamento` na `Coluna` e, à parte, o `alinhamento` e o `mono` na `Celula`. Cada tela escreve os dois, e o que uma esquece aparece desalinhado. As 33 telas com tabela usam a `Tabela`; só os "Últimos dias" dos backups do Control iD usam uma tabela HTML.

O React Aria (1.21) dá à célula o índice da coluna (`columnIndex`, nas propriedades de desenho do `Cell`) e expõe o estado da tabela (`TableStateContext`), em que `collection.columns[índice].props` são as propriedades que a `Coluna` passou ao `Column`.

## Goals / Non-Goals

**Goals:**
- O mesmo desenho em todas as tabelas, decidido uma vez, na coluna.
- As linhas na altura da densidade, também com os botões de ação.
- O mesmo selo, a mesma escrita do tempo e a mesma contagem em todas as listas.

**Non-Goals:**
- Trocar as ações da linha por um menu: cada tela mantém os botões dela.
- O painel da operação (`apps/painel`).
- Mudar as colunas, a ordem ou os dados das telas.

## Decisions

### 1. A espécie na coluna, e a célula segue

A `Coluna` ganha `especie?: 'texto' | 'numero' | 'codigo' | 'data' | 'situacao' | 'acoes'`, que vai ao `Column` como `data-especie`. A espécie número põe o cabeçalho à direita, no lugar do `alinhamento="fim"`, que continua aceito.

A `Celula` passa o `columnIndex` a um componente de dentro dela, o `ConteudoDaCelula`, que lê a espécie da coluna pelo `TableStateContext` e põe o conteúdo num elemento com a classe da espécie. A leitura fica dentro da célula porque o React Aria monta a célula na coleção, onde o estado da tabela ainda não existe. O `alinhamento` e o `mono` da célula continuam e valem sobre a espécie.

**Alternativa descartada:** declarar as colunas como dados, como a tabela configurável dos ativos. Ela resolve tudo, mas obriga a reescrever as 33 telas; a espécie na coluna pede só uma propriedade em cada coluna.

### 2. O desenho de cada espécie

Pelo `data-especie` da coluna e da célula:
- **número:** `text-align: end`, a fonte mono e `font-variant-numeric: tabular-nums`;
- **código:** a fonte mono;
- **data:** `white-space: nowrap` e algarismos tabulares;
- **ações:** a célula põe os filhos num contêiner flexível, alinhado ao fim, com o espaço de 1 passo e sem quebra. O cabeçalho da espécie ações fica à direita.

A `ColunaDeAcoes` é a coluna "Ações" pronta: a espécie ações, sem ordenar e com o rótulo à vista.

### 3. A situação, o tempo e a contagem

- **A situação:** os Alertas, o Software e o cadastro dos Painéis passam ao `RotuloDeSituacao`, com a situação de cada um.
- **O tempo:** o `@grafite/ui` ganha `haQuantoTempo(desde, agora)`, que devolve "Agora" ou "Há " e a `idadeRelativa`. Os coletores, os agentes, as ordens e as solicitações passam a usá-lo.
- **A contagem:** o `@grafite/ui` ganha `ContagemDaLista({ quantos, singular, plural })`, um parágrafo em `role="status"`, no texto do dado e no texto secundário. As listas que já contam passam a usá-lo, e as que não contavam ganham a contagem.

### 4. Os últimos dias na tabela base

A tabela "Últimos N dias" dos backups do Control iD passa à `Tabela`, com a faixa de dias na célula, os rostos e os usuários como número e o último backup como data.

## Risks / Trade-offs

**A célula lê o estado interno do React Aria.** O `TableStateContext` e o `columnIndex` são públicos no React Aria, mas uma versão nova pode mudar as propriedades do nó da coluna. A história "Espécies das colunas" confere o alinhamento e quebra se isso mudar.

**As capturas da regressão visual mudam nas tabelas.** São regravadas no fim, apagando antes as do catálogo das tabelas.

## Migration Plan

Nada a migrar.

## Open Questions

Nenhuma.
