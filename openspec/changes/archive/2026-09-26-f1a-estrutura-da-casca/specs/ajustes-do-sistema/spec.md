## Purpose

Reunir num app Ajustes as preferências de interface do usuário, organizadas em seções, com efeito imediato em toda a casca e a volta aos padrões de fábrica.

## ADDED Requirements

### Requirement: App Ajustes com seções

Ajustes SHALL ser um módulo com a lista de seções e o conteúdo da seção escolhida, e cada seção SHALL ter endereço próprio. As seções SHALL incluir Aparência, Dock e Acessibilidade. No celular, a lista e a seção SHALL aparecer uma de cada vez, com Voltar para a lista.

#### Scenario: Seção pelo endereço
- **WHEN** o usuário abre o endereço da seção Dock
- **THEN** Ajustes abre com a seção Dock escolhida na lista

#### Scenario: Seção pelo menu do dock
- **WHEN** o usuário escolhe "Dock" no menu de Ajustes do dock
- **THEN** a seção Dock abre

#### Scenario: Ajustes no celular
- **WHEN** o usuário abre Ajustes no celular
- **THEN** aparece só a lista de seções, e escolher uma mostra a seção, com Voltar para a lista

### Requirement: Seção Aparência

A seção Aparência SHALL ajustar:
- o tema, com os escuros (Grafite, Meia-noite e OLED) separados dos claros (Névoa, Papel e Alto contraste);
- a cor de destaque (azul, verde, laranja e grafite);
- os cantos, com o raio base de 0 a 24 px;
- a densidade (compacta, normal e confortável).

#### Scenario: Trocar o destaque
- **WHEN** o usuário escolhe o destaque verde
- **THEN** a interface inteira passa ao verde na hora, inclusive a própria tela de Ajustes

### Requirement: Seção Dock

A seção Dock SHALL ajustar a posição (embaixo, à esquerda ou à direita), o tamanho dos itens (de 28 a 64 px, com o valor à vista), a ampliação ao passar o mouse e o ocultar automático. Na postura tablet, a seção SHALL informar que o dock fica embaixo naquele aparelho.

#### Scenario: Tamanho do dock
- **WHEN** o usuário leva o tamanho a 36 px
- **THEN** o dock muda na hora, e o controle mostra "36 px"

#### Scenario: Seção Dock no tablet
- **WHEN** o usuário abre a seção Dock num tablet
- **THEN** a seção informa que o dock fica embaixo neste aparelho, e a posição escolhida continua valendo no computador

### Requirement: Seção Acessibilidade

A seção Acessibilidade SHALL ajustar o movimento e a transparência, cada um com as opções "Seguir o sistema" e "Reduzir", e mostrar o que o sistema operacional pede no momento.

#### Scenario: Reduzir a transparência
- **WHEN** o usuário escolhe reduzir a transparência
- **THEN** o dock e os menus ficam com superfície sólida na hora

#### Scenario: Sistema com movimento reduzido
- **WHEN** o sistema operacional pede movimento reduzido e a opção é "Seguir o sistema"
- **THEN** a seção informa que o sistema pede movimento reduzido, e a casca já o respeita

### Requirement: Efeito imediato, sem salvar

Toda mudança em Ajustes SHALL valer na hora em toda a casca e ficar gravada, sem botão de salvar.

#### Scenario: Mudança gravada
- **WHEN** o usuário põe o dock à esquerda e reabre a aplicação
- **THEN** o dock continua à esquerda, sem ter havido botão de salvar

### Requirement: Restaurar os padrões da seção

Cada seção SHALL oferecer "Restaurar padrões", que volta os campos daquela seção aos padrões de fábrica, sem mexer nas outras seções.

#### Scenario: Restaurar a seção Dock
- **WHEN** o usuário restaura os padrões da seção Dock
- **THEN** o dock volta para embaixo, com itens de 48 px, ampliação ligada e sem ocultar, e o tema escolhido continua o mesmo
