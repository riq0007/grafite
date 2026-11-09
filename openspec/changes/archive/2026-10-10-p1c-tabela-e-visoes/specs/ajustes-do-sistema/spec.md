## MODIFIED Requirements

### Requirement: Seção Tabelas

A seção Tabelas SHALL ajustar, para todas as tabelas:
- as linhas alternadas, ligadas ou desligadas;
- a miniatura no início da linha, ligada ou desligada;
- o resumo da linha, ligado ou desligado, com a explicação "Ao parar o mouse 1,5 s sobre uma linha, mostra as colunas que estão fora da tela.".

A seção SHALL mostrar uma tabela de exemplo, com dados fictícios marcados como exemplo, que muda na hora com os ajustes.

#### Scenario: Sem linhas alternadas
- **WHEN** o usuário desliga as linhas alternadas
- **THEN** a tabela de exemplo passa a ter todas as linhas no mesmo fundo, ainda separadas pelas linhas divisórias

#### Scenario: Sem miniaturas
- **WHEN** o usuário desliga as miniaturas
- **THEN** a coluna da miniatura sai da tabela de exemplo, e o nome passa a ser a primeira coluna

#### Scenario: Sem o resumo da linha
- **WHEN** o usuário desliga o resumo da linha e para o mouse 1,5 s sobre uma linha dos ativos com colunas fora da tela
- **THEN** nenhum resumo aparece
