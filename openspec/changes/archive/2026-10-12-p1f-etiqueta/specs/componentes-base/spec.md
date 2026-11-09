## MODIFIED Requirements

### Requirement: Conjunto de componentes base

A biblioteca SHALL oferecer os seguintes componentes:

- **ações:** botão (primário, secundário, terciário e destrutivo);
- **formulário:** campo de texto, área de texto, campo de data, seleção, busca com sugestões, checkbox, rádio, interruptor, controle segmentado, controle deslizante, linha de campos, escolha de imagem;
- **exibição:** rótulo de situação, miniatura de ativo, avatar, tecla de atalho, código QR, texto para copiar, etiqueta do ativo;
- **camadas:** dica, popover, menu com submenu, menu de contexto, diálogo, gaveta, aviso, prévia do registro (Quick Look), resumo da linha;
- **estrutura:** abas, tabela base, árvore, filtros ativos, estado vazio, esqueleto de carregamento, barra de progresso;
- **tabela configurável:** painel de colunas, escolha da visão, editor de filtro.

#### Scenario: Tela nova
- **WHEN** uma tela precisa de um desses elementos
- **THEN** ela usa o componente da biblioteca, sem criar uma variação própria

## ADDED Requirements

### Requirement: Etiqueta do ativo em preto sobre branco

A etiqueta do ativo SHALL ter texto preto sobre fundo branco em todos os temas, com as cores fixas dos tokens, como o código QR, porque sai no papel. Ela SHALL ter as medidas em milímetros, em dois tamanhos: 63,5 × 38,1 mm e 50 × 30 mm, com o QR code à esquerda e o texto à direita, sem passar das bordas. O QR code SHALL ter um nome acessível que diz que ele abre a ficha do ativo, e o patrimônio e o nome SHALL estar em texto ao lado dele.

#### Scenario: Etiqueta no tema OLED
- **WHEN** a etiqueta aparece na tela com o tema OLED
- **THEN** ela tem o texto preto sobre o fundo branco, como no papel

#### Scenario: Nome longo
- **WHEN** o nome do ativo não cabe em duas linhas da etiqueta de 50 × 30 mm
- **THEN** o nome é cortado no fim da segunda linha, com reticências, e nada passa da borda
