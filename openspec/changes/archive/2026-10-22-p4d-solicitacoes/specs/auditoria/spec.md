## ADDED Requirements

### Requirement: Eventos das solicitações registrados

SHALL ser registrados, na auditoria da organização, o registro, a alteração, o pedido ao fornecedor, a entrega, a mudança da situação, a conclusão e o cancelamento de uma solicitação, com o número, o tipo, quem pediu e o "antes → depois" do que mudou. A entrega do estoque SHALL ter também o registro da saída (spec estoque), e cada solicitação de um lote SHALL ter o próprio registro.

#### Scenario: Toner registrado
- **WHEN** Carla registra a solicitação 42, um Toner pedido por Joana Prado para a PAT-00412
- **THEN** a auditoria registra a 42, com o tipo, Joana Prado, a PAT-00412 e o item, quem registrou e quando

#### Scenario: Solicitação pelo número na auditoria
- **WHEN** alguém consulta a auditoria da mudança de situação da solicitação 45, um Conserto pedido por Joana Prado
- **THEN** o alvo do registro diz "Solicitação: 45 · Conserto · Joana Prado", como a solicitação está agora

#### Scenario: Lote na auditoria
- **WHEN** Carla muda três solicitações para Em atendimento num lote
- **THEN** a auditoria tem um registro para cada uma, com a situação antes e depois
