## MODIFIED Requirements

### Requirement: Conjunto de componentes base

A biblioteca SHALL oferecer os seguintes componentes:

- **ações:** botão (primário, secundário, terciário e destrutivo);
- **formulário:** campo de texto, área de texto, seleção, busca com sugestões, checkbox, rádio, interruptor, controle segmentado, controle deslizante, linha de campos;
- **exibição:** rótulo de situação, miniatura de ativo, avatar, tecla de atalho;
- **camadas:** dica, popover, menu com submenu, diálogo, gaveta, aviso, prévia do registro (Quick Look);
- **estrutura:** abas, tabela base, estado vazio, esqueleto de carregamento, barra de progresso.

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

## ADDED Requirements

### Requirement: No máximo três avisos na tela

A região de avisos SHALL mostrar no máximo três avisos ao mesmo tempo, o mais novo em cima. Quando chega um aviso e já há três na tela, o temporário mais antigo SHALL sair da tela para dar lugar a ele.

Um aviso crítico SHALL NOT sair da tela por causa de outro aviso. Se os três avisos na tela forem críticos, o que chega SHALL esperar a sua vez e aparecer quando um deles sair. Só então SHALL começar a contar o seu tempo.

#### Scenario: Quarto aviso
- **WHEN** há três avisos temporários na tela e chega um quarto
- **THEN** o quarto aparece em cima, e o mais antigo sai da tela

#### Scenario: Crítico entre temporários
- **WHEN** há na tela um aviso crítico e dois temporários, e chegam mais dois avisos
- **THEN** o crítico continua na tela, e os dois temporários mais antigos saem

#### Scenario: Três críticos na tela
- **WHEN** há três avisos críticos na tela e chega um aviso de Atenção
- **THEN** o aviso de Atenção espera, aparece quando um crítico sai e só então começa a contar o seu tempo
