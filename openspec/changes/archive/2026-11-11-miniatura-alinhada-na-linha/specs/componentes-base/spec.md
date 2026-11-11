## MODIFIED Requirements

### Requirement: Tabela base

A tabela base SHALL ter:
- cabeçalho fixo durante a rolagem;
- linhas demarcadas e, se o usuário não as desligou, alternadas;
- miniatura opcional no início da linha, centralizada na altura da linha e alinhada ao texto das outras células, que sai de todas as tabelas quando o usuário desliga as miniaturas;
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

#### Scenario: Miniatura no meio da linha
- **WHEN** a tabela mostra a miniatura no início das linhas, seja a tabela base ou a que desenha só as linhas perto da área visível
- **THEN** o centro da miniatura fica no centro da linha, com até 1 px de diferença, na mesma altura do texto das outras células

#### Scenario: Carregar mais
- **WHEN** a tabela mostra 50 de 120 pessoas e o usuário escolhe "Carregar mais"
- **THEN** as próximas 50 entram ao fim da tabela, e "Carregar mais" continua até a última

#### Scenario: Espaço com seleção
- **WHEN** há duas linhas selecionadas numa tabela com prévia, e o usuário pressiona espaço
- **THEN** a prévia abre, e a seleção continua a mesma
