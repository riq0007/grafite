## MODIFIED Requirements

### Requirement: Módulos opcionais

Os módulos opcionais SHALL ser definidos pelo sistema, cada um com o nome e uma descrição em pt-BR. Neste momento, os módulos opcionais SHALL ser:
- o Ativos, descrito como "O catálogo, o cadastro e a lista dos ativos.";
- o Cofre, descrito como "Os segredos da organização, com o acesso por segredo.".

O Início, a Administração e os Ajustes SHALL NOT ser opcionais. Um módulo opcional SHALL começar ligado, numa organização nova e numa que já existia antes dele.

#### Scenario: Organização que já existia
- **WHEN** a versão com os módulos opcionais é instalada numa organização que já usava o catálogo
- **THEN** o módulo Ativos continua ligado, sem nenhuma ação de quem administra

#### Scenario: Cofre numa organização que já existia
- **WHEN** a versão com o Cofre é instalada numa organização que já existia
- **THEN** o módulo Cofre começa ligado, e quem tem `cofre.usar` o vê no dock
