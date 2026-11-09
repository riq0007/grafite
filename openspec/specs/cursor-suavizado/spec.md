# cursor-suavizado Specification

## Purpose

Dar ao mouse um cursor próprio, suave e preciso, que mostra o que vai ser acionado, sem nunca atrapalhar a digitação, o toque, a acessibilidade nem a precisão do clique.

## Requirements

### Requirement: Ponto e anel

Com o cursor suavizado, o cursor do sistema SHALL dar lugar a um ponto e a um anel:
- **Ponto:** segue o mouse a cada quadro, sem suavização.
- **Anel:** acompanha o ponto com o fator do Apêndice B da spec mestre, `k = 0,65 − 0,55 × suavização/100` por quadro de 60 Hz. Com a suavização de fábrica, de 95%, k fica em cerca de 0,13.

A suavização SHALL ser a mesma em telas com outras taxas de quadro: o fator vale para um quadro de 60 Hz e é convertido para a duração real de cada quadro.

#### Scenario: Ponto sem atraso
- **WHEN** o mouse se move
- **THEN** o ponto aparece na posição do mouse já no quadro seguinte, e o anel chega a ela depois

#### Scenario: Mesma suavização em 120 Hz
- **WHEN** o anel parte de 100 px do ponto parado, com quadros de 16,7 ms (60 Hz) ou de 8,3 ms (120 Hz)
- **THEN** depois de 100 ms a distância que falta é a mesma nos dois casos

### Requirement: Abraço dos elementos interativos

Com "Abraçar botões" ligado, o anel SHALL abraçar o elemento interativo compacto sob o ponteiro, com até 320 px de largura e 128 px de altura: botão, link, aba, segmento, item do dock ou outro elemento que a interface marque para ser abraçado. No abraço:
- o anel toma o contorno do elemento, com 4 px de folga de cada lado;
- o raio do anel é o do elemento mais 4 px;
- o ponto some.

SHALL NOT ser abraçados:
- elementos desabilitados;
- itens de menu e de listas de opções, que já se destacam ao passar o ponteiro;
- áreas maiores, como linhas de tabela.

Quando o ponteiro sai do elemento, ou o elemento some, o anel SHALL voltar à forma redonda.

#### Scenario: Abraço num botão
- **WHEN** o ponteiro para sobre um botão de 80 × 28 px com raio de 7 px
- **THEN** o anel assume 88 × 36 px, com raio de 11 px, em volta do botão, e o ponto some

#### Scenario: Linha de tabela
- **WHEN** o ponteiro passa sobre uma linha de tabela
- **THEN** o anel continua redondo, e o ponto continua visível

#### Scenario: Item de menu
- **WHEN** o ponteiro passa sobre um item de um menu aberto
- **THEN** o anel continua redondo, e o item mostra o próprio destaque

#### Scenario: Abraço desligado
- **WHEN** "Abraçar botões" está desligado e o ponteiro para sobre um botão
- **THEN** o anel continua redondo, acompanhando o ponto

### Requirement: Quando o cursor do sistema volta

O ponto e o anel SHALL sumir, e o cursor do sistema SHALL voltar:
- sobre campos editáveis, com o cursor de texto;
- sobre elementos que pedem outro cursor do sistema, como uma alça de redimensionar;
- depois de um toque ou de uma caneta, até o mouse se mover de novo;
- com movimento reduzido, pedido pelo sistema operacional ou pelos Ajustes;
- nas posturas tablet e celular;
- quando o ponteiro sai da janela;
- quando o usuário escolhe "Do sistema".

#### Scenario: Campo de texto
- **WHEN** o ponteiro entra num campo de texto
- **THEN** o ponto e o anel somem, e aparece o cursor de texto do sistema

#### Scenario: Movimento reduzido
- **WHEN** o sistema operacional pede movimento reduzido
- **THEN** a casca usa o cursor do sistema, mesmo com o cursor suavizado escolhido

#### Scenario: Toque num notebook
- **WHEN** o usuário toca na tela de um notebook com tela de toque
- **THEN** o ponto e o anel somem, e voltam quando o mouse se move

#### Scenario: Do sistema
- **WHEN** o usuário escolhe "Do sistema" nos Ajustes
- **THEN** o cursor do sistema volta na hora, em toda a casca

### Requirement: O cursor nunca atrapalha

O cursor suavizado SHALL:
- deixar o clique, o arraste e o hover chegarem ao elemento sob o ponteiro, como se não existisse;
- ficar fora da árvore de acessibilidade;
- aparecer acima de todas as camadas: menus, avisos, busca, gaveta e prévia;
- mover-se só por transformação, sem fazer a página recalcular o layout nem redesenhar os componentes a cada movimento;
- parar de pedir quadros de animação quando o mouse está parado e o anel já alcançou o ponto.

#### Scenario: Clique através do cursor
- **WHEN** o usuário clica num botão com o anel em volta dele
- **THEN** o botão é acionado uma vez, como com o cursor do sistema

#### Scenario: Sobre um menu aberto
- **WHEN** o ponteiro passa sobre um menu aberto do dock
- **THEN** o ponto e o anel aparecem acima do menu

#### Scenario: Mouse parado
- **WHEN** o mouse fica parado e o anel alcança o ponto
- **THEN** nenhum quadro de animação do cursor é pedido até o próximo movimento
