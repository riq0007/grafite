## MODIFIED Requirements

### Requirement: Conjunto de componentes base

A biblioteca SHALL oferecer os seguintes componentes:

- **ações:** botão (primário, secundário, terciário e destrutivo);
- **formulário:** campo de texto, área de texto, seleção, busca com sugestões, checkbox, rádio, interruptor, controle segmentado, controle deslizante, linha de campos;
- **exibição:** rótulo de situação, miniatura de ativo, avatar, tecla de atalho;
- **camadas:** dica, popover, menu com submenu, diálogo, gaveta, aviso;
- **estrutura:** abas, tabela base, estado vazio, esqueleto de carregamento, barra de progresso.

#### Scenario: Tela nova
- **WHEN** uma tela precisa de um desses elementos
- **THEN** ela usa o componente da biblioteca, sem criar uma variação própria

## ADDED Requirements

### Requirement: Controle deslizante

O controle deslizante SHALL mostrar o rótulo e o valor atual com a unidade, como "48 px" ou "95%". O valor SHALL mudar por arraste, clique na trilha, toque e teclado. As setas SHALL mudar o valor em um passo, e Home e End SHALL levá-lo ao mínimo e ao máximo. O valor SHALL ficar sempre dentro do intervalo, e o leitor de tela SHALL anunciar o valor com a unidade.

#### Scenario: Seta para a direita
- **WHEN** o foco está num controle em 48 px, com passo de 1 px, e o usuário pressiona seta para a direita
- **THEN** o valor passa a 49 px, e o texto mostra "49 px"

#### Scenario: Limite do intervalo
- **WHEN** o controle está no máximo e o usuário pressiona seta para a direita
- **THEN** o valor continua no máximo

### Requirement: Linha de campos

A linha de campos SHALL pôr os campos lado a lado, em colunas da mesma largura, quando o lugar onde ela está tem pelo menos 480 px de largura, e um abaixo do outro quando tem menos. O arranjo SHALL depender da largura que a linha recebe (janela, painel ou coluna), e não da largura da janela do navegador.

#### Scenario: Linha num formulário largo
- **WHEN** uma linha com dois campos fica num formulário de 960 px
- **THEN** os dois campos ficam lado a lado, com a mesma largura

#### Scenario: Linha numa gaveta
- **WHEN** a mesma linha fica numa gaveta, numa tela de 1920 px
- **THEN** os campos ficam um abaixo do outro
