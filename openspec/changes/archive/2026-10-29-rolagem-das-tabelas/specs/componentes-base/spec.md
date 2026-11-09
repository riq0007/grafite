## ADDED Requirements

### Requirement: Borda da tabela que rola para o lado

Quando a tabela base é mais larga que a área dela, a borda do lado em que há mais colunas SHALL esmaecer, como a faixa esmaecida da janela (spec estrutura-da-casca, "Janela de conteúdo"):
- no começo da rolagem, só a borda direita;
- no fim, só a esquerda;
- no meio, as duas.

A tabela que cabe na área SHALL ficar sem esmaecer. As barras de rolagem SHALL ficar inteiras, sem esmaecer.

#### Scenario: Mais colunas à direita
- **WHEN** a tabela das regras de alerta é mais larga que a janela e está no começo da rolagem
- **THEN** a borda direita esmaece, e a esquerda não

#### Scenario: Rolada até o fim
- **WHEN** a pessoa rola a mesma tabela até a última coluna
- **THEN** a borda esquerda esmaece, e a direita não

#### Scenario: Tabela que cabe
- **WHEN** a tabela das pessoas cabe inteira na janela
- **THEN** nenhuma borda esmaece
