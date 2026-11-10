## MODIFIED Requirements

### Requirement: Seção Dock

A seção Dock SHALL ajustar a posição (embaixo, à esquerda ou à direita), o tamanho dos itens (de 28 a 64 px, com o valor à vista), a ampliação ao passar o mouse e o ocultar automático. Na postura tablet, a seção SHALL informar que o dock fica embaixo naquele aparelho.

A seção SHALL ajustar também os módulos do dock (spec dock, "Ordem dos módulos e módulos fora do dock"):
- a lista "No dock", com os módulos na ordem que vale, cada um com o ícone, o nome, "Subir", "Descer" e "Tirar do dock"; o Subir do primeiro e o Descer do último SHALL ficar desabilitados;
- a lista "No Mais", com os módulos tirados, cada um com "Pôr no dock", que o devolve ao fim da lista "No dock"; sem nenhum, ela SHALL dizer "Nenhum módulo fora do dock.";
- o nome do módulo no nome acessível de cada botão, como "Subir Operação";
- a explicação "Ajustes fica sempre no fim do dock.", com os Ajustes fora das duas listas.

Cada mudança SHALL valer na hora, no dock à vista. As listas SHALL trazer só os módulos que quem ajusta vê. Nos padrões da organização, as listas SHALL definir a ordem de quem não arrumou o próprio dock.

#### Scenario: Tamanho do dock
- **WHEN** o usuário leva o tamanho a 36 px
- **THEN** o dock muda na hora, e o controle mostra "36 px"

#### Scenario: Seção Dock no tablet
- **WHEN** o usuário abre a seção Dock num tablet
- **THEN** a seção informa que o dock fica embaixo neste aparelho, e a posição escolhida continua valendo no computador

#### Scenario: Subir um módulo
- **WHEN** o usuário escolhe "Subir Operação", com a Operação logo depois dos Ativos
- **THEN** a Operação passa para antes dos Ativos na lista e no dock, na hora, e o foco continua no "Subir Operação"

#### Scenario: Tirar do dock
- **WHEN** o usuário escolhe "Tirar do dock" nas Salas
- **THEN** as Salas passam à lista "No Mais", somem do dock e aparecem no menu Mais

#### Scenario: Pôr de volta no dock
- **WHEN** o usuário escolhe "Pôr no dock" nas Salas
- **THEN** as Salas voltam ao fim da lista "No dock" e ao dock, antes dos Ajustes

#### Scenario: Restaurar a ordem
- **WHEN** o usuário, com a Operação em primeiro e as Salas fora do dock, restaura os padrões da seção Dock, numa organização sem padrões
- **THEN** o dock volta à ordem de fábrica, com as Salas nele

#### Scenario: Ordem pela busca
- **WHEN** o usuário digita "ordem do dock" na busca e escolhe "Módulos do dock"
- **THEN** a seção Dock abre, com o foco na lista "No dock"
