## MODIFIED Requirements

### Requirement: Posição e tamanho

O dock SHALL ficar embaixo, à esquerda ou à direita, conforme a preferência, com itens do tamanho escolhido, de 28 a 64 px. A janela de conteúdo SHALL se ajustar ao dock, sem ficar sob ele. O conteúdo da janela que não cabe SHALL rolar dentro dela, sem passar sob o dock (spec estrutura-da-casca, "Janela de conteúdo"). Com o ocultar automático, a janela SHALL ocupar o lugar do dock escondido, e o dock SHALL passar por cima dela quando reaparece.

#### Scenario: Dock à direita
- **WHEN** o usuário escolhe o dock à direita
- **THEN** o dock passa para a borda direita, e a janela se ajusta sem ficar sob ele

#### Scenario: Conteúdo longo com o dock embaixo
- **WHEN** o dock está embaixo, sem o ocultar automático, e a tela aberta é mais alta que a janela
- **THEN** a janela termina antes do dock, e o conteúdo rola dentro dela, sem nada passar sob o dock
