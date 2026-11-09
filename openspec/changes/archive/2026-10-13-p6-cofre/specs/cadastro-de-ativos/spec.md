## ADDED Requirements

### Requirement: Segredos na ficha do ativo

A ficha do ativo SHALL mostrar os segredos do cofre ligados a ele que a conta vê (spec cofre-de-segredos), pelo nome, com o tipo e o identificador, cada um levando à ficha do segredo no Cofre. A ficha do ativo SHALL NOT mostrar nem revelar nenhum valor secreto: revelar e copiar ficam na ficha do segredo.

A seção SHALL aparecer só com o módulo Cofre ligado, só a quem tem `cofre.usar` e só com algum segredo ligado que a conta vê.

#### Scenario: Senha do switch na ficha
- **WHEN** Bruno, que alcança o segredo "Switch do CPD", abre a ficha do switch PAT-00610, ao qual o segredo está ligado
- **THEN** a ficha mostra o "Switch do CPD", com o tipo e o identificador, e o caminho até ele no Cofre, sem a senha

#### Scenario: Segredo que a conta não vê
- **WHEN** Carla, que vê o PAT-00610 e usa o cofre, mas não alcança o "Switch do CPD", abre a ficha do switch
- **THEN** a ficha não mostra o segredo nem a seção dos segredos
