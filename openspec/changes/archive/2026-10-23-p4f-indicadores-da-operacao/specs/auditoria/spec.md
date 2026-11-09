## MODIFIED Requirements

### Requirement: Meta de indicador registrada

A mudança da meta de um indicador, dos alertas (spec indicadores) ou da operação (spec indicadores-da-operacao), SHALL ser registrada na auditoria da organização, com quem mudou, o indicador e o "antes → depois", como "2 dias → 1 dia". A avaliação diária dos indicadores e a notificação do indicador fora da meta SHALL NOT ser registradas na auditoria.

#### Scenario: Meta do toner mudada
- **WHEN** Ana muda a meta do tempo de atendimento do toner de 2 dias para 1 dia
- **THEN** a auditoria registra a mudança da meta, com Ana, o indicador e "2 dias → 1 dia"

#### Scenario: Meta das OS repetidas mudada
- **WHEN** Ana muda a meta das OS repetidas de 2 OS para 3 OS
- **THEN** a auditoria registra a mudança da meta, com Ana, o indicador e "2 OS → 3 OS"

#### Scenario: Avaliação diária
- **WHEN** a avaliação das 07:00 encontra o toner fora da meta e notifica quem administra os alertas
- **THEN** nenhum registro entra na auditoria
