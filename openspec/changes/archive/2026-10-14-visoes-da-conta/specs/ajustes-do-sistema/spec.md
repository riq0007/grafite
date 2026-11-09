## MODIFIED Requirements

### Requirement: Seção Tabelas

A seção Tabelas SHALL ajustar, para todas as tabelas:
- as linhas alternadas, ligadas ou desligadas;
- a miniatura no início da linha, ligada ou desligada;
- o resumo da linha, ligado ou desligado, com a explicação "Ao parar o mouse 1,5 s sobre uma linha, mostra as colunas que estão fora da tela.".

A seção SHALL mostrar uma tabela de exemplo, com dados fictícios marcados como exemplo, que muda na hora com os ajustes.

Quando a conta tem mudanças guardadas sobre alguma visão (spec visoes-de-tabela, "Tabela alterada"), a seção SHALL dizer em quantas visões e oferecer "Restaurar as minhas mudanças nas tabelas", que as apaga todas depois de uma confirmação, com o retorno "Mudanças nas tabelas restauradas.".

#### Scenario: Sem linhas alternadas
- **WHEN** o usuário desliga as linhas alternadas
- **THEN** a tabela de exemplo passa a ter todas as linhas no mesmo fundo, ainda separadas pelas linhas divisórias

#### Scenario: Sem miniaturas
- **WHEN** o usuário desliga as miniaturas
- **THEN** a coluna da miniatura sai da tabela de exemplo, e o nome passa a ser a primeira coluna

#### Scenario: Sem o resumo da linha
- **WHEN** o usuário desliga o resumo da linha e para o mouse 1,5 s sobre uma linha dos ativos com colunas fora da tela
- **THEN** nenhum resumo aparece

#### Scenario: Restaurar as mudanças das tabelas
- **WHEN** o usuário tem mudanças sobre "Todos os ativos" e sobre uma visão da organização, e escolhe "Restaurar as minhas mudanças nas tabelas"
- **THEN** depois da confirmação, as duas visões voltam a abrir como estão salvas, sem a marca de personalizada
