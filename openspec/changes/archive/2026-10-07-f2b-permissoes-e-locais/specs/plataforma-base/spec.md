## ADDED Requirements

### Requirement: Listas paginadas por cursor

Toda lista da API que pode crescer sem limite SHALL ser paginada no servidor por cursor, com uma ordem estável. A resposta SHALL trazer os itens da página e o cursor da próxima, nulo na última. Nenhuma lista SHALL ter um teto fixo que deixe registros fora de alcance. O tamanho da página SHALL ser de no máximo 100 itens, com 50 como padrão.

#### Scenario: Última página
- **WHEN** a web pede a página seguinte de uma lista com 120 pessoas, depois das primeiras 100
- **THEN** a resposta traz as 20 restantes e o cursor da próxima nulo

#### Scenario: Página grande demais
- **WHEN** um pedido pede 500 itens por página
- **THEN** a API responde 400, com "Use até 100 itens por página." no campo do tamanho
