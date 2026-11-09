## ADDED Requirements

### Requirement: Ativos da pessoa na ficha

A aba Dados da ficha da pessoa SHALL mostrar "Ativos sob responsabilidade", com quantos ativos ativos ela tem, no escopo de quem vê, e "Ver na tabela", que abre a tabela dos ativos com a origem da pessoa (spec cadastro-de-ativos). A linha SHALL aparecer só com o módulo Ativos ligado e para quem vê ativos em algum ramo, e SHALL sumir sem recarregar quando o módulo for desligado.

#### Scenario: Ativos de Ana
- **WHEN** quem vê pessoas e ativos abre a ficha de Ana Souza, responsável por 3 ativos
- **THEN** a aba Dados mostra "Ativos sob responsabilidade: 3" e "Ver na tabela"

#### Scenario: Ativos desligado
- **WHEN** o módulo Ativos é desligado com a ficha de Ana aberta
- **THEN** a linha dos ativos sob responsabilidade some da ficha
