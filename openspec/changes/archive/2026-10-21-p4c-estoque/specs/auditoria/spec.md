## ADDED Requirements

### Requirement: Eventos do estoque registrados

SHALL ser registrados, na auditoria da organização:
- cada movimentação lançada no estoque, com o tipo, o consumível, a quantidade, os locais e o detalhe do tipo: o fornecedor e a nota, o ativo e o contador de páginas, ou o motivo;
- cada mudança do mínimo de um consumível num local, com o "antes → depois".

#### Scenario: Saída registrada
- **WHEN** Ana lança a saída de 1 CF258A do Almoxarifado para a PAT-00412
- **THEN** a auditoria registra a saída, com o CF258A, a quantidade 1, o Almoxarifado, a PAT-00412, quem lançou e quando

#### Scenario: Mínimo mudado
- **WHEN** Ana muda o mínimo do CF258A no Almoxarifado de 5 para 8
- **THEN** a auditoria registra a mudança, com 5 antes e 8 depois
