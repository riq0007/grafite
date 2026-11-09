## MODIFIED Requirements

### Requirement: Filtros pelas colunas

A tabela SHALL oferecer o botão "Filtros", que abre o painel de filtros, e "Filtrar…" no menu de cada coluna, que abre o mesmo painel preso ao cabeçalho da coluna, já nela. O painel SHALL ter duas colunas:
- à esquerda, as colunas que se filtram, agrupadas como no painel "Colunas", com um campo que filtra a lista sem diferenciar acento e maiúsculas, e "Filtrada" em texto nas colunas que já têm filtro;
- à direita, o editor do filtro da coluna escolhida.

Cada coluna SHALL ter no máximo um filtro, que se edita escolhendo a coluna de novo. Conforme a coluna, o filtro SHALL ser:
- **texto:** "Contém" um texto, sem diferenciar acento e maiúsculas;
- **número, moeda e data:** "De" e "Até", com um dos dois ou os dois, incluindo os limites;
- **escolha:** "É qualquer de" uma ou mais opções, cada uma com quantos registros ela traz, contados com os outros filtros e a busca ativos; as opções com zero ficam no fim, com "(0)" em texto, e acima de 20 opções o editor mostra as 20 primeiras e "Mostrar mais";
- **local:** "Em" um local, com tudo o que estiver dentro dele;
- **qualquer coluna:** "Está vazio" e "Está preenchido".

O botão de aplicar SHALL dizer quantos registros a tabela vai mostrar, como "Mostrar 134 ativos", quando a contagem já chegou. Na lista múltipla, em que um registro pode trazer mais de uma das opções marcadas, a soma das contagens não diz quantos a tabela vai mostrar, e o botão SHALL continuar "Aplicar filtro". Os filtros SHALL valer juntos: a tabela mostra os registros que atendem a todos. Cada filtro ativo SHALL aparecer na linha dos filtros ativos, com o rótulo da coluna, o operador e o valor em texto, como "Garantia até · de 01/01/2026 até 31/12/2026", e o botão de limpá-lo. Um valor de filtro fora do permitido SHALL ser recusado no próprio editor, com a mensagem, sem aplicar o filtro.

#### Scenario: Filtro de texto
- **WHEN** o usuário filtra a coluna "Hostname" por "Contém" "almox"
- **THEN** a tabela mostra só os ativos com "almox" no hostname, e a linha dos filtros mostra "Hostname · contém · almox"

#### Scenario: Intervalo de datas
- **WHEN** o usuário filtra "Garantia até" só com "Até" 31/12/2026
- **THEN** a tabela mostra os ativos com a garantia até 31/12/2026, inclusive, e deixa de fora os sem garantia

#### Scenario: Dois filtros
- **WHEN** a tabela está filtrada por "Tipo: Impressora" e o usuário acrescenta "Local: em Jundiaí"
- **THEN** a tabela mostra só as impressoras de Jundiaí e dos locais dentro dele

#### Scenario: Data inexistente
- **WHEN** o usuário digita 31/02/2026 em "De" no filtro de uma data
- **THEN** o editor recusa a data com a mensagem no campo, e o filtro não é aplicado

#### Scenario: Contagem por opção
- **WHEN** a tabela está filtrada por "Local: em Jundiaí", e o usuário abre o filtro de Tipo
- **THEN** cada tipo mostra quantos ativos de Jundiaí ele tem, e os tipos sem nenhum ficam no fim com "(0)"

#### Scenario: Filtrar pela coluna
- **WHEN** o usuário escolhe "Filtrar…" no menu da coluna "Modelo"
- **THEN** o painel de filtros abre preso ao cabeçalho de "Modelo", com o editor do Modelo à direita

### Requirement: Seleção de linhas

A seleção SHALL ser feita com o Ctrl e o Shift, sem tirar do clique a abertura do registro:
- o clique simples na linha SHALL abrir o registro, como na tabela base;
- Ctrl+clique, ou Cmd+clique no Mac, SHALL pôr ou tirar a linha da seleção;
- Shift+clique SHALL selecionar da última linha escolhida até a clicada;
- Shift com as setas SHALL estender a seleção a partir da linha em foco;
- Ctrl+A, ou Cmd+A, SHALL selecionar todas as linhas carregadas;
- Esc SHALL limpar a seleção.

As linhas selecionadas SHALL ser marcadas na tela e anunciadas ao leitor de tela como selecionadas. Com alguma seleção, a faixa dos filtros ativos SHALL dar lugar à barra das ações em lote, com quantas linhas estão selecionadas, como "3 selecionados", as ações que valem para a seleção, como "Imprimir etiquetas", "Copiar linhas" e "Prévia", e "Limpar seleção". A busca, um filtro, a ordenação ou a visão que mudam SHALL limpar a seleção.

#### Scenario: Ctrl+clique
- **WHEN** o usuário dá Ctrl+clique em três linhas
- **THEN** as três ficam selecionadas, nenhum registro abre, e a barra das ações em lote diz "3 selecionados"

#### Scenario: Shift+clique
- **WHEN** o usuário dá Ctrl+clique na segunda linha e depois Shift+clique na sexta
- **THEN** ficam selecionadas da segunda à sexta linha

#### Scenario: Clique simples
- **WHEN** há duas linhas selecionadas e o usuário clica, sem Ctrl nem Shift, numa terceira
- **THEN** o registro da terceira linha abre

#### Scenario: Filtro limpa a seleção
- **WHEN** há quatro linhas selecionadas e o usuário muda um filtro
- **THEN** a seleção fica vazia, e a barra das ações em lote dá lugar de volta aos filtros ativos

#### Scenario: Ações da seleção à vista
- **WHEN** o usuário seleciona duas linhas
- **THEN** a barra mostra "2 selecionados", "Imprimir etiquetas", "Copiar linhas", "Prévia" e "Limpar seleção", sem precisar abrir um menu

## ADDED Requirements

### Requirement: Barra da tabela

A barra da tabela SHALL ter duas faixas:
1. a escolha da visão, a busca, os controles da tabela, como a situação, "Filtros" e "Colunas", e, à direita, quantos registros a tabela tem com a busca e os filtros, como "1.204 ativos";
2. os filtros ativos, ou a barra das ações em lote quando há seleção.

A segunda faixa SHALL sumir quando não há filtro ativo nem seleção. Numa janela estreita, a primeira faixa SHALL quebrar em duas linhas sem esconder nenhum controle.

#### Scenario: Contagem à vista
- **WHEN** a tabela tem 1.204 ativos com o filtro "Tipo: Impressora"
- **THEN** a primeira faixa diz "1.204 ativos", e a segunda mostra o filtro do Tipo

### Requirement: Carregamento da tabela

Na primeira carga, a tabela SHALL mostrar o esqueleto das linhas, com as colunas à vista e a altura da densidade, em vez de um texto. Ao trocar a busca, um filtro, a ordenação ou a visão, a tabela SHALL manter as linhas de antes, marcadas como carregando para o leitor de tela, com uma linha de progresso sobre elas e "Atualizando" em texto na contagem da barra, até as novas chegarem. As linhas de antes SHALL manter o contraste do texto. O movimento reduzido SHALL tirar qualquer animação do esqueleto e da linha de progresso.

#### Scenario: Primeira carga
- **WHEN** o usuário abre a tabela dos ativos, e a primeira página ainda não chegou
- **THEN** a tabela mostra o esqueleto das linhas com as colunas da visão, sem "Carregando…" solto

#### Scenario: Trocar o filtro
- **WHEN** o usuário aplica um filtro, e a página nova ainda não chegou
- **THEN** as linhas de antes continuam, marcadas como carregando, com a linha de progresso e "Atualizando" na contagem, até as novas entrarem
