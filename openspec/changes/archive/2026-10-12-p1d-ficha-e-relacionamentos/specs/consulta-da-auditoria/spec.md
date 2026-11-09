## MODIFIED Requirements

### Requirement: Histórico de um registro

A ficha de uma pessoa, de um perfil, de um grupo, de um local e de um ativo SHALL levar à auditoria já filtrada por aquele registro, para quem tem `auditoria.ver`. O histórico da pessoa SHALL incluir os registros da conta dela.

#### Scenario: Histórico da pessoa
- **WHEN** quem consulta escolhe "Ver na auditoria" na ficha de João
- **THEN** a auditoria abre filtrada por João, com os registros da pessoa e da conta dele, e o filtro à vista

#### Scenario: Histórico do ativo na auditoria
- **WHEN** quem consulta escolhe "Ver na auditoria" na aba Histórico da impressora PAT-00412
- **THEN** a auditoria abre filtrada pela PAT-00412, com o filtro à vista
