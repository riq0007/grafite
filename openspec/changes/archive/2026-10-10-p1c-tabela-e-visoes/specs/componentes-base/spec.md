## MODIFIED Requirements

### Requirement: Conjunto de componentes base

A biblioteca SHALL oferecer os seguintes componentes:

- **ações:** botão (primário, secundário, terciário e destrutivo);
- **formulário:** campo de texto, área de texto, campo de data, seleção, busca com sugestões, checkbox, rádio, interruptor, controle segmentado, controle deslizante, linha de campos, escolha de imagem;
- **exibição:** rótulo de situação, miniatura de ativo, avatar, tecla de atalho, código QR, texto para copiar;
- **camadas:** dica, popover, menu com submenu, menu de contexto, diálogo, gaveta, aviso, prévia do registro (Quick Look), resumo da linha;
- **estrutura:** abas, tabela base, árvore, filtros ativos, estado vazio, esqueleto de carregamento, barra de progresso;
- **tabela configurável:** painel de colunas, escolha da visão, editor de filtro.

#### Scenario: Tela nova
- **WHEN** uma tela precisa de um desses elementos
- **THEN** ela usa o componente da biblioteca, sem criar uma variação própria

### Requirement: Tabela base

A tabela base SHALL ter:
- cabeçalho fixo durante a rolagem;
- linhas demarcadas e, se o usuário não as desligou, alternadas;
- miniatura opcional no início da linha, que sai de todas as tabelas quando o usuário desliga as miniaturas;
- indicação visual da ordenação aplicada;
- estado vazio padronizado;
- a linha em foco marcada, com as setas movendo o foco entre as linhas.

Quando a tela oferece abrir o registro, o clique na linha, fora dos controles dela e sem Ctrl nem Shift, e Enter na linha em foco SHALL abrir o registro. Quando a tela oferece a prévia, a barra de espaço na linha em foco SHALL abri-la, também com linhas selecionadas.

Quando a lista é paginada, a tabela SHALL terminar com "Carregar mais", enquanto houver mais registros. Durante a carga, o botão SHALL mostrar o carregando e não aceitar um segundo pedido. As linhas novas SHALL entrar ao fim, com o foco do teclado mantido. A tabela que desenha só as linhas perto da área visível SHALL trazer a página seguinte sozinha, no lugar do botão (spec tabelas-configuraveis).

#### Scenario: Tabela sem registros
- **WHEN** a tabela não tem linhas para exibir
- **THEN** mostra o estado vazio com uma mensagem objetiva e, quando houver, uma ação relevante

#### Scenario: Enter na linha
- **WHEN** o foco está numa linha de uma tabela que abre o registro e o usuário pressiona Enter
- **THEN** o registro daquela linha abre

#### Scenario: Controle dentro da linha
- **WHEN** o usuário clica num botão dentro de uma linha que abre o registro
- **THEN** só a ação do botão acontece, e o registro não abre

#### Scenario: Miniaturas desligadas
- **WHEN** o usuário desligou as miniaturas e abre uma tela com uma tabela que tem miniaturas
- **THEN** a tabela aparece sem a coluna da miniatura, com as demais colunas iguais

#### Scenario: Carregar mais
- **WHEN** a tabela mostra 50 de 120 pessoas e o usuário escolhe "Carregar mais"
- **THEN** as próximas 50 entram ao fim da tabela, e "Carregar mais" continua até a última

#### Scenario: Espaço com seleção
- **WHEN** há duas linhas selecionadas numa tabela com prévia, e o usuário pressiona espaço
- **THEN** a prévia abre, e a seleção continua a mesma

## ADDED Requirements

### Requirement: Menu de contexto

O menu de contexto SHALL abrir junto do ponteiro, ou do elemento em foco quando aberto pelo teclado, com o mesmo material, os mesmos itens com submenu e o mesmo teclado do menu com submenu. Ele SHALL fechar com Esc, com o clique fora dele e com a escolha de um item, e SHALL devolver o foco ao elemento de onde foi aberto.

#### Scenario: Fechar com Esc
- **WHEN** o menu de contexto está aberto sobre uma linha e o usuário pressiona Esc
- **THEN** o menu fecha, e o foco volta à linha

### Requirement: Escolha da visão e editor de filtro

A escolha da visão SHALL mostrar o nome da visão aberta e, quando ela está alterada, "Alterada" em texto, e abrir o menu das visões com os grupos e as ações (spec visoes-de-tabela). O editor de filtro SHALL mostrar a coluna, o operador e os campos do valor conforme o tipo do filtro, com "Aplicar filtro" e, num filtro que já existe, "Tirar filtro", e as recusas no próprio campo.

#### Scenario: Visão alterada à vista
- **WHEN** a tabela da visão "Impressoras" está alterada
- **THEN** a escolha da visão mostra "Impressoras" e "Alterada" em texto, e não só por um ponto ou por uma cor
