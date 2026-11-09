## MODIFIED Requirements

### Requirement: Itens do dock

O dock SHALL mostrar um item por módulo disponível, com o ícone e o nome acessível do módulo. Cada item SHALL ter uma placa leve, com o ícone no texto do tema. Um ponto e a borda da placa SHALL marcar o módulo atual, que o leitor de tela SHALL anunciar como atual. Um separador SHALL isolar Ajustes, sempre no fim. Um item sem menu SHALL mostrar o nome do módulo numa dica, ao parar o ponteiro ou receber o foco; num item com menu, o nome SHALL aparecer no topo do menu. O dock SHALL usar o material translúcido das camadas sobrepostas, com superfície sólida na transparência reduzida.

#### Scenario: Módulo atual
- **WHEN** o usuário está em Ajustes
- **THEN** o item Ajustes mostra o ponto de módulo atual e a borda da placa, e o leitor de tela o anuncia como atual

#### Scenario: Transparência reduzida
- **WHEN** o usuário escolhe reduzir a transparência
- **THEN** o dock passa a ter superfície sólida, sem desfoque
