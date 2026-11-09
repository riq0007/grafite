## MODIFIED Requirements

### Requirement: Conjunto de componentes base

A biblioteca SHALL oferecer os seguintes componentes:

- **ações:** botão (primário, secundário, terciário e destrutivo);
- **formulário:** campo de texto, área de texto, campo de data, seleção, busca com sugestões, checkbox, rádio, interruptor, controle segmentado, controle deslizante, linha de campos;
- **exibição:** rótulo de situação, miniatura de ativo, avatar, tecla de atalho, código QR, texto para copiar;
- **camadas:** dica, popover, menu com submenu, diálogo, gaveta, aviso, prévia do registro (Quick Look);
- **estrutura:** abas, tabela base, árvore, filtros ativos, estado vazio, esqueleto de carregamento, barra de progresso.

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

Quando a tela oferece abrir o registro, o clique na linha, fora dos controles dela, e Enter na linha em foco SHALL abrir o registro. Quando a tela oferece a prévia, a barra de espaço na linha em foco SHALL abri-la.

Quando a lista é paginada, a tabela SHALL terminar com "Carregar mais", enquanto houver mais registros. Durante a carga, o botão SHALL mostrar o carregando e não aceitar um segundo pedido. As linhas novas SHALL entrar ao fim, com o foco do teclado mantido.

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

## ADDED Requirements

### Requirement: Árvore navegável pelo teclado

A árvore SHALL mostrar itens aninhados, cada um com ícone, rótulo e, se houver, um detalhe e um rótulo de situação. Ela SHALL:
- expandir e recolher pelo clique no indicador e pelas setas para a direita e para a esquerda;
- mover o foco pelas setas para cima e para baixo;
- escolher um item com Enter ou com o clique;
- anunciar ao leitor de tela o nível, a posição e se o item está expandido.

#### Scenario: Expandir pelo teclado
- **WHEN** o foco está em "Jundiaí", recolhido, e o usuário pressiona a seta para a direita
- **THEN** "Jundiaí" se expande e mostra os locais de dentro, e o foco continua nele

### Requirement: Campo de data em pt-BR

O campo de data SHALL mostrar e aceitar a data no formato dd/mm/aaaa, com cada parte editável pelo teclado. Ele SHALL ter rótulo, descrição e erro como os outros campos, e SHALL recusar uma data inexistente.

#### Scenario: Digitar uma data
- **WHEN** o usuário digita 01102026 no campo de data
- **THEN** o campo mostra 01/10/2026, e o valor é 1º de outubro de 2026

### Requirement: Filtros ativos à vista

Os filtros ativos de uma lista SHALL aparecer como uma linha de rótulos, cada um com o nome do filtro, o valor e um botão para limpá-lo. Com algum filtro ativo, a linha SHALL ter "Limpar filtros". Cada botão de limpar SHALL ter um nome acessível que diz qual filtro ele limpa.

#### Scenario: Limpar um filtro
- **WHEN** a lista está filtrada por "Situação: Inativas" e "Local: Jundiaí" e o usuário limpa o local
- **THEN** só "Situação: Inativas" continua, e a lista se atualiza

### Requirement: Texto para copiar

O texto para copiar SHALL mostrar um valor em fonte monoespaçada, com o botão "Copiar". Depois de copiar, o botão SHALL dizer "Copiado", por texto e não só por ícone.

#### Scenario: Copiar uma senha temporária
- **WHEN** o usuário escolhe "Copiar" ao lado da senha temporária
- **THEN** a senha vai para a área de transferência, e o botão diz "Copiado"
