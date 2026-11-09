## MODIFIED Requirements

### Requirement: Consumíveis compatíveis na ficha do ativo

O ativo de um tipo que liga a capacidade `consumiveis.compatibilidade` SHALL ter, na ficha, o cartão "Consumíveis compatíveis", com o painel dos consumíveis compatíveis do modelo dele (spec consumiveis): o código, o nome, o tipo, a cor e o rendimento de cada um, levando à ficha do consumível para quem tem `consumiveis.ver`. O painel SHALL dizer:
- "Escolha o modelo do ativo para ver os consumíveis compatíveis.", no ativo sem modelo;
- "Nenhum consumível compatível com o modelo.", no modelo sem nenhum.

Para quem vê o estoque, cada consumível do painel SHALL mostrar o saldo somado nos locais que a conta vê, como "3 em estoque", ou "Sem estoque" (spec estoque). Para quem movimenta o estoque em algum local, cada um SHALL oferecer "Registrar saída", que abre a saída do consumível para o ativo (spec modulo-operacao, "Lançamento das movimentações").

O cartão SHALL aparecer para quem vê o ativo, só com o módulo Operação ligado. O cadastro do ativo em etapas SHALL NOT ter a etapa da capacidade, que não tem campos.

#### Scenario: Toner da impressora
- **WHEN** alguém abre o cartão "Consumíveis compatíveis" da PAT-00412, uma "HP LaserJet M404" com o CF258A compatível
- **THEN** o painel mostra o CF258A, Toner, Preto, com 3.000 páginas

#### Scenario: Impressora sem modelo
- **WHEN** alguém abre a ficha da impressora PAT-00900, sem modelo
- **THEN** o cartão "Consumíveis compatíveis" diz "Sem modelo", e o painel diz "Escolha o modelo do ativo para ver os consumíveis compatíveis."

#### Scenario: Operação desligado
- **WHEN** o módulo Operação está desligado na organização
- **THEN** a ficha da PAT-00412 não mostra o cartão "Consumíveis compatíveis"

#### Scenario: Toner em estoque
- **WHEN** quem vê o estoque de Jundiaí abre o cartão "Consumíveis compatíveis" da PAT-00412, com 7 CF258A no Almoxarifado e 2 na Expedição
- **THEN** o CF258A mostra "9 em estoque"

#### Scenario: Troca do toner pela ficha
- **WHEN** quem movimenta o estoque escolhe "Registrar saída" no CF258A do cartão da PAT-00412
- **THEN** a saída abre com o CF258A e a PAT-00412 escolhidos
