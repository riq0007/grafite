## MODIFIED Requirements

### Requirement: Controle deslizante

O controle deslizante SHALL mostrar o rótulo e o valor atual com a unidade, como "48 px", "95%" ou "265°". O valor SHALL mudar por arraste, clique na trilha, toque e teclado. As setas SHALL mudar o valor em um passo, e Home e End SHALL levá-lo ao mínimo e ao máximo. O valor SHALL ficar sempre dentro do intervalo, e o leitor de tela SHALL anunciar o valor com a unidade.

Quem usa o controle SHALL poder dar o texto do valor, como "HB · 45", e o texto que o leitor de tela anuncia, e SHALL poder pintar a trilha, como com as matizes.

#### Scenario: Seta para a direita
- **WHEN** o foco está num controle em 48 px, com passo de 1 px, e o usuário pressiona seta para a direita
- **THEN** o valor passa a 49 px, e o texto mostra "49 px"

#### Scenario: Limite do intervalo
- **WHEN** o controle está no máximo e o usuário pressiona seta para a direita
- **THEN** o valor continua no máximo

#### Scenario: Texto do valor dado por quem usa
- **WHEN** um controle de 0 a 100 dá o texto "HB · 45" ao valor 45, e "HB, 45 de 100" ao leitor de tela
- **THEN** o controle mostra "HB · 45", e o leitor de tela anuncia "HB, 45 de 100"
