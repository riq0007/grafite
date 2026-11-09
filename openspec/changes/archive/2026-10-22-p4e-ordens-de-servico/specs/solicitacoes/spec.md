## ADDED Requirements

### Requirement: Conserto com a ordem de serviço

O conserto pendente SHALL poder gerar a ordem de serviço dele (spec ordens-de-servico, "OS pela solicitação de conserto"). Com a OS, a solicitação SHALL seguir a situação dela:
- SHALL passar a Em atendimento quando a OS nasce;
- SHALL ficar Concluída quando a OS é resolvida, com o que foi feito, quem resolveu e quando;
- SHALL ficar Cancelada quando a OS é encerrada sem resolver, com o motivo.

Enquanto a OS está em aberto, a solicitação SHALL NOT ser alterada, mudar de situação, ser concluída nem cancelada por ela mesma, também no lote. A recusa SHALL ser "A solicitação <número> segue a OS <número>.", e, no lote, "A <número> não: segue a OS <número>.". A ficha SHALL mostrar a OS da solicitação, com o número e a situação, e a lista SHALL mostrar o número dela ao lado da situação, como "Em atendimento · OS 12".

#### Scenario: Conserto que segue a OS
- **WHEN** Carla tenta concluir a solicitação 43, que tem a OS 12 Em atendimento
- **THEN** a conclusão é recusada com "A solicitação 43 segue a OS 12.", e a solicitação continua Em atendimento

#### Scenario: Conserto com a OS no lote
- **WHEN** um lote para Cancelada inclui a solicitação 43, que tem a OS 12
- **THEN** as outras mudam, a 43 fica como estava, e o retorno diz "A 43 não: segue a OS 12."

#### Scenario: Conserto sem a OS
- **WHEN** Carla conclui a solicitação 45, um Conserto Em atendimento sem OS, com "Cabo trocado"
- **THEN** a solicitação fica Concluída, como antes da OS existir
