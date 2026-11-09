## ADDED Requirements

### Requirement: Eventos das ordens de serviço registrados

SHALL ser registrados, na auditoria da organização, a abertura, a correção do problema e do fornecedor, a mudança da situação, com o fornecedor, a peça lançada, a resolução, a reabertura e o encerramento de uma ordem de serviço, com o número, o ativo e o "antes → depois" do que mudou. A peça do estoque SHALL ter também o registro da saída (spec estoque), a OS aberta pela solicitação SHALL ter também o registro da mudança da solicitação, e cada OS de um lote SHALL ter o próprio registro. O alvo SHALL ser a OS, com o nome como ela está agora, como "12 · NB-0031 · Não liga".

#### Scenario: OS aberta
- **WHEN** Carla abre a OS 12 no NB-0031, com o problema "Não liga"
- **THEN** a auditoria registra a 12, com o NB-0031 e o problema, quem abriu e quando

#### Scenario: OS pela solicitação na auditoria
- **WHEN** Carla abre a OS da solicitação 43
- **THEN** a auditoria tem o registro da abertura da OS e o da solicitação 43, que passou a Em atendimento, com a OS
