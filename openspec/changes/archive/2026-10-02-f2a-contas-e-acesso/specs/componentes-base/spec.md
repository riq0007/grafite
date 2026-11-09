## MODIFIED Requirements

### Requirement: Conjunto de componentes base

A biblioteca SHALL oferecer os seguintes componentes:

- **ações:** botão (primário, secundário, terciário e destrutivo);
- **formulário:** campo de texto, área de texto, seleção, busca com sugestões, checkbox, rádio, interruptor, controle segmentado, controle deslizante, linha de campos;
- **exibição:** rótulo de situação, miniatura de ativo, avatar, tecla de atalho, código QR;
- **camadas:** dica, popover, menu com submenu, diálogo, gaveta, aviso, prévia do registro (Quick Look);
- **estrutura:** abas, tabela base, estado vazio, esqueleto de carregamento, barra de progresso.

#### Scenario: Tela nova
- **WHEN** uma tela precisa de um desses elementos
- **THEN** ela usa o componente da biblioteca, sem criar uma variação própria

## ADDED Requirements

### Requirement: Código QR legível em qualquer tema

O código QR SHALL ter módulos escuros sobre fundo claro em todos os temas, com a margem branca de 4 módulos em volta. Ele SHALL ser desenhado como vetor, nítido em qualquer escala. O código SHALL ter um nome acessível que diz o que ele contém, e a mesma informação SHALL estar disponível em texto perto dele.

#### Scenario: QR code no tema OLED
- **WHEN** o código QR aparece no tema OLED
- **THEN** os módulos são escuros sobre fundo branco, com a margem em volta, e um app de câmera o lê

#### Scenario: QR code no leitor de tela
- **WHEN** o leitor de tela chega ao código QR do cadastro dos dois passos
- **THEN** ele anuncia "QR code para o app autenticador", e a chave em texto está logo ao lado
