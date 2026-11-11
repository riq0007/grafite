## ADDED Requirements

### Requirement: Barra de rolagem própria

Toda área que rola SHALL mostrar a mesma barra de rolagem, no lugar da barra do sistema operacional:
- fina, sem o trilho pintado e sem as setas;
- com o polegar de cantos arredondados, numa cor do tema com pelo menos 3:1 de contraste contra as superfícies;
- com o polegar mais forte e mais largo ao parar o ponteiro nele e ao arrastá-lo.

O polegar que aparece, some ou engrossa SHALL NOT mudar o conteúdo de lugar: o espaço da barra fica reservado enquanto a área tem conteúdo além da borda.

Com a preferência "Ao rolar", a de fábrica (spec preferencias-da-interface), o polegar SHALL aparecer:
- enquanto o ponteiro está sobre a área;
- enquanto a área rola, pelo mouse, pelo teclado, pelo toque ou pelo próprio app, e por 1 s depois da última rolagem;
- enquanto a própria área tem o foco do teclado.

Fora disso, o polegar SHALL sumir. Com a preferência "Sempre visível", o polegar SHALL ficar à vista em toda área com conteúdo além da borda. O polegar SHALL aparecer e sumir sem animação.

Onde o sistema operacional já sobrepõe a barra ao conteúdo, como no celular, no tablet e no macOS com a barra automática, SHALL valer a barra do sistema, sem o espaço reservado.

As faixas esmaecidas da janela (spec estrutura-da-casca, "Janela de conteúdo") e da tabela (requisito "Borda da tabela que rola para o lado") SHALL continuar deixando a barra inteira. A área que esconde a barra de propósito, como a barra das abas, SHALL continuar sem ela.

#### Scenario: Ponteiro sobre a tabela
- **WHEN** a tabela dos ativos tem mais linhas do que cabem, com a preferência "Ao rolar", e o ponteiro entra na tabela
- **THEN** o polegar aparece, fino e na cor do tema, e nenhuma coluna muda de lugar

#### Scenario: Ponteiro fora da área
- **WHEN** o ponteiro sai da área, e ela não rola há mais de 1 s
- **THEN** o polegar some, e o espaço dele continua reservado

#### Scenario: Rolagem pelo teclado
- **WHEN** o usuário rola a janela pela seta para baixo, com o ponteiro fora dela
- **THEN** o polegar aparece enquanto a janela rola e some 1 s depois

#### Scenario: Sempre visível
- **WHEN** a preferência é "Sempre visível", e o ponteiro está fora da janela
- **THEN** o polegar da janela e o de cada área com conteúdo além da borda ficam à vista

#### Scenario: Tema claro
- **WHEN** o tema é o Papel, e o polegar está à vista
- **THEN** o polegar tem pelo menos 3:1 de contraste contra a superfície da área

#### Scenario: Barra sobreposta do sistema
- **WHEN** o app abre no celular
- **THEN** a janela rola com a barra do sistema, sem espaço reservado para a barra

#### Scenario: Área sem barra de propósito
- **WHEN** a barra das abas da janela tem mais abas do que cabem
- **THEN** ela rola sem barra, como antes
