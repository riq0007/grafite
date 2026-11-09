## ADDED Requirements

### Requirement: Eventos dos alertas registrados

SHALL ser registrados, na auditoria da organização:
- o cadastro, a edição, com o "antes → depois", a inativação e a reativação de uma regra de alerta, também das regras de fábrica criadas para uma organização;
- o reconhecimento de um alerta;
- o adiamento de um alerta, com até quando;
- o silêncio dos alertas de um ativo, com até quando e o motivo, e a retomada.

A abertura, a mudança do texto, a resolução e o encerramento de um alerta pelo motor SHALL NOT ser registrados na auditoria: o próprio alerta guarda quando abriu, quando terminou e como.

#### Scenario: Limite da regra mudado
- **WHEN** quem administra os alertas muda o limite do "Toner em 10% ou menos" de 10 para 15
- **THEN** a auditoria registra a edição da regra, com o limite "10 → 15"

#### Scenario: Alerta adiado
- **WHEN** Ana adia o alerta "Offline" do switch por 30 minutos
- **THEN** a auditoria registra o adiamento, com Ana, o alerta e até quando

#### Scenario: Alerta aberto pelo motor
- **WHEN** o motor abre o alerta do toner de uma impressora
- **THEN** nenhum registro entra na auditoria, e o alerta guarda quando abriu
