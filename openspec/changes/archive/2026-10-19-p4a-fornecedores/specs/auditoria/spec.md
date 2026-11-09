## ADDED Requirements

### Requirement: Eventos dos fornecedores registrados

SHALL ser registrados, na auditoria da organização, o cadastro, a edição, com o "antes → depois", a inativação e a reativação de um fornecedor, e a criação dos fornecedores a partir do texto dos ativos, pelo sistema, na atualização (spec cadastro-de-ativos).

#### Scenario: CNPJ informado depois
- **WHEN** Ana informa o CNPJ da "HP Brasil", criada sem ele
- **THEN** a auditoria registra a edição, com o CNPJ "vazio → 12.345.678/0001-95"
