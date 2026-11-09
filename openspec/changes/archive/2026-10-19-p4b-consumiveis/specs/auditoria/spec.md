## ADDED Requirements

### Requirement: Eventos dos consumíveis registrados

SHALL ser registrados, na auditoria da organização, o cadastro, a edição, com o "antes → depois", a inativação e a reativação de um consumível. Na edição, os fornecedores e os modelos SHALL aparecer pelo nome, antes e depois.

#### Scenario: Modelo incluído
- **WHEN** Ana inclui a "HP LaserJet M428" no "CF258A", que já servia na "HP LaserJet M404"
- **THEN** a auditoria registra a edição do CF258A, com os modelos "HP LaserJet M404" antes e "HP LaserJet M404" e "HP LaserJet M428" depois
