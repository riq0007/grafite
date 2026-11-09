## MODIFIED Requirements

### Requirement: Dock pelo teclado

O dock SHALL ser uma parada única do Tab. As setas na direção do dock SHALL mover entre os itens, Home e End SHALL ir ao primeiro e ao último, e Enter SHALL abrir o módulo. A seta que aponta para longe da borda do dock (para cima com o dock embaixo, para a direita com o dock à esquerda e para a esquerda com o dock à direita) SHALL abrir o menu do módulo, com o foco no primeiro item. Esc SHALL fechar o menu e devolver o foco ao item do dock.

#### Scenario: Abrir o menu pelo teclado
- **WHEN** o foco está no item Ajustes do dock embaixo e o usuário pressiona seta para cima
- **THEN** o menu de Ajustes abre, com o foco no primeiro item

#### Scenario: Reabrir o menu enquanto o anterior sai
- **WHEN** o usuário escolhe um item do menu de Ajustes pelo teclado e, enquanto o menu ainda sai da tela, pressiona seta para cima no item Ajustes de novo
- **THEN** o menu de Ajustes abre, com o foco no primeiro item

#### Scenario: Esc no menu
- **WHEN** um menu do dock está aberto e o usuário pressiona Esc
- **THEN** o menu fecha, e o foco volta ao item do dock

#### Scenario: Setas no dock à esquerda
- **WHEN** o dock está à esquerda, o foco está no primeiro item e o usuário pressiona seta para baixo
- **THEN** o foco vai para o segundo item
