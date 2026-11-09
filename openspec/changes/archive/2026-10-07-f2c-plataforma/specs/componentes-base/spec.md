## ADDED Requirements

### Requirement: Avatar com foto

O avatar SHALL ter três tamanhos:
- o da barra e dos menus;
- o das linhas das tabelas, que segue a densidade como a miniatura;
- o do título das fichas.

Com uma foto, o avatar SHALL mostrá-la recortada no círculo, sem distorcer. Ele SHALL pedir a miniatura com resolução suficiente para o tamanho e a densidade de pixels da tela, sem baixar uma maior que o necessário.

Sem foto, ou quando a foto não carrega, o avatar SHALL mostrar as iniciais do nome. O nome SHALL continuar sendo o nome acessível do avatar, com ou sem foto.

#### Scenario: Foto numa tela de alta densidade
- **WHEN** o avatar do título da ficha aparece numa tela com o dobro de densidade de pixels
- **THEN** ele mostra a miniatura com o dobro da resolução do tamanho dele, e não a maior de todas

#### Scenario: Foto que não carrega
- **WHEN** a foto de "Ana Souza" não carrega
- **THEN** o avatar mostra "AS", e o nome acessível continua "Ana Souza"

### Requirement: Escolha de imagem

A escolha de imagem SHALL mostrar a imagem atual, ou um estado vazio quando não há imagem, e oferecer:
- "Escolher imagem", que abre a escolha de arquivos já filtrada pelos formatos aceitos e, no celular, oferece também a câmera;
- no computador, também arrastar um arquivo para a área da imagem;
- "Remover imagem", com confirmação, quando há imagem.

Durante o envio, a escolha SHALL mostrar "Enviando…" e a barra de progresso, e não aceitar outra escolha. Uma recusa SHALL aparecer junto da escolha, com a mensagem da API, e a imagem anterior SHALL continuar. Tudo SHALL funcionar pelo teclado.

#### Scenario: Enviar uma imagem
- **WHEN** o usuário escolhe uma imagem PNG
- **THEN** a escolha mostra "Enviando…" com o progresso, e depois a imagem nova

#### Scenario: Formato recusado
- **WHEN** o usuário arrasta um GIF para a área da imagem
- **THEN** a escolha mostra "Formato não aceito. Envie uma imagem PNG, JPG, WebP, AVIF ou SVG.", e a imagem anterior continua

#### Scenario: Remover pelo teclado
- **WHEN** o usuário chega a "Remover imagem" com Tab, pressiona Enter e confirma
- **THEN** a imagem é removida, e o foco vai para "Escolher imagem"

## MODIFIED Requirements

### Requirement: Conjunto de componentes base

A biblioteca SHALL oferecer os seguintes componentes:

- **ações:** botão (primário, secundário, terciário e destrutivo);
- **formulário:** campo de texto, área de texto, campo de data, seleção, busca com sugestões, checkbox, rádio, interruptor, controle segmentado, controle deslizante, linha de campos, escolha de imagem;
- **exibição:** rótulo de situação, miniatura de ativo, avatar, tecla de atalho, código QR, texto para copiar;
- **camadas:** dica, popover, menu com submenu, diálogo, gaveta, aviso, prévia do registro (Quick Look);
- **estrutura:** abas, tabela base, árvore, filtros ativos, estado vazio, esqueleto de carregamento, barra de progresso.

#### Scenario: Tela nova
- **WHEN** uma tela precisa de um desses elementos
- **THEN** ela usa o componente da biblioteca, sem criar uma variação própria
