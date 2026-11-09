## MODIFIED Requirements

### Requirement: Trocar de registro pelas setas

Com a prévia aberta, as setas para cima e para a esquerda SHALL mostrar o registro anterior, e as setas para baixo e para a direita, o seguinte, na ordem da tabela. No primeiro e no último registro, a seta que sairia da lista SHALL NOT fazer nada. Enter SHALL acionar a ação de abrir, quando ela existe.

Aberta com mais de uma linha selecionada, a prévia SHALL passar só pelos registros selecionados, na ordem da tabela, e a posição SHALL contar a seleção, como "2 de 3".

Numa lista paginada, a posição SHALL contar o total da lista, e não só os registros carregados. A seta que passa do último registro carregado SHALL trazer a página seguinte, com o esqueleto de carregamento enquanto ela chega, e mostrar o registro seguinte.

#### Scenario: Registro seguinte
- **WHEN** a prévia mostra "3 de 120" e o usuário pressiona seta para baixo
- **THEN** a prévia mostra "4 de 120", com o registro da quarta linha

#### Scenario: Fim da lista
- **WHEN** a prévia mostra "120 de 120" e o usuário pressiona seta para baixo
- **THEN** a prévia continua no registro 120

#### Scenario: Só os selecionados
- **WHEN** a segunda, a quinta e a nona linhas estão selecionadas e o usuário abre a prévia na quinta
- **THEN** a prévia mostra "2 de 3", e a seta para baixo leva à nona linha

#### Scenario: Página seguinte
- **WHEN** a lista tem 300 ativos, 100 carregados, e a prévia mostra "100 de 300"
- **THEN** a seta para baixo traz a página seguinte e mostra "101 de 300", com o ativo da linha 101
