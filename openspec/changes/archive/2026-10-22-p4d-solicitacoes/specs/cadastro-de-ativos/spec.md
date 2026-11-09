## ADDED Requirements

### Requirement: Solicitações na ficha do ativo

Com o módulo Operação ligado, a ficha do ativo SHALL mostrar a seção "Solicitações" a quem vê as solicitações (spec solicitacoes): as pendentes do ativo e as 5 mais novas entre as concluídas e as canceladas, cada uma com o número, o tipo, a situação e quando foi registrada, levando à ficha dela. Para quem atende, a seção SHALL oferecer "Nova solicitação", que abre o Toner já com o ativo, quando o tipo dele usa consumíveis, ou o Conserto já com o ativo. Sem nenhuma, a seção SHALL dizer "Nenhuma solicitação deste ativo.".

#### Scenario: Toner pela ficha da impressora
- **WHEN** Carla escolhe "Nova solicitação" na ficha da PAT-00412
- **THEN** o Toner abre com a PAT-00412 e o total de páginas dela

#### Scenario: Conserto pela ficha do notebook
- **WHEN** Carla escolhe "Nova solicitação" na ficha do NB-0031
- **THEN** o Conserto abre com o NB-0031

#### Scenario: Ativo sem solicitações
- **WHEN** quem vê as solicitações abre a ficha de um ativo sem nenhuma
- **THEN** a seção diz "Nenhuma solicitação deste ativo."
