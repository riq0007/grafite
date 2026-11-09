## ADDED Requirements

### Requirement: Ativos do modelo e do tipo

A ficha de um modelo e a de um tipo SHALL mostrar quantos ativos ativos os usam, no escopo de quem vê, com "Ver na tabela", que abre a tabela dos ativos com a origem do modelo ou do tipo (spec cadastro-de-ativos). Sem nenhum, a ficha SHALL dizer "Nenhum ativo deste modelo." ou "Nenhum ativo deste tipo.".

#### Scenario: Ativos de um modelo
- **WHEN** alguém abre a ficha do modelo "HP LaserJet M404", usado por 12 ativos
- **THEN** a ficha mostra "Ativos: 12" e "Ver na tabela"
