# tabelas-configuraveis Specification

## Purpose
Dar a uma tabela de registros o que a seção 7.4 da spec mestre pede: colunas que o usuário escolhe, ordena e redimensiona, a ordenação e os filtros pelas colunas, a seleção com Shift e Ctrl, o menu de contexto, o resumo da linha ao parar o mouse, copiar as linhas e a rolagem de milhares de linhas sem travar.

## Requirements

### Requirement: Colunas escolhidas e ordenadas

Uma tabela configurável SHALL oferecer o painel "Colunas", com:
- as colunas disponíveis da tabela, nos grupos dela, com uma busca pelo rótulo sem diferenciar acento e maiúsculas, e uma marca em cada uma para mostrá-la ou escondê-la;
- as colunas à vista, na ordem da tabela, com "Mover para cima" e "Mover para baixo" em cada uma, que também se reordenam pelo arraste.

A coluna principal, que nomeia a linha, SHALL ficar sempre à vista e em primeiro lugar, sem como escondê-la nem movê-la. A miniatura SHALL seguir os Ajustes › Tabelas e SHALL NOT ser uma coluna do painel. Uma coluna mostrada pelo painel SHALL entrar no fim da tabela.

#### Scenario: Mostrar uma coluna
- **WHEN** o usuário marca a coluna "IP" no painel "Colunas"
- **THEN** a coluna "IP" aparece no fim da tabela, com o IP de cada linha

#### Scenario: Reordenar pelo teclado
- **WHEN** o foco está em "Hostname", a terceira coluna à vista do painel, e o usuário escolhe "Mover para cima"
- **THEN** "Hostname" passa a ser a segunda coluna à vista, e a tabela muda na mesma hora

#### Scenario: Coluna principal
- **WHEN** o usuário abre o painel "Colunas" da tabela dos ativos
- **THEN** a coluna "Ativo" aparece marcada e em primeiro lugar, sem a marca para escondê-la e sem os botões de mover

### Requirement: Largura das colunas

Cada coluna SHALL poder mudar de largura pelo arraste da borda direita do cabeçalho e pelo teclado. Pelo teclado, "Redimensionar coluna", no menu da coluna, SHALL pôr o foco na borda, as setas para a esquerda e para a direita SHALL estreitar e alargar a coluna, e Enter ou Esc SHALL terminar. A largura SHALL ficar entre 64 e 800 px. Quando as colunas passam da largura da janela, a tabela SHALL rolar de lado, com a coluna principal e o cabeçalho à vista.

#### Scenario: Arrastar a borda
- **WHEN** o usuário arrasta a borda da coluna "Local" 80 px para a direita
- **THEN** a coluna "Local" fica 80 px mais larga, e as outras mantêm a largura

#### Scenario: Pelo teclado
- **WHEN** o usuário escolhe "Redimensionar coluna" no menu da coluna "Patrimônio" e pressiona a seta para a direita três vezes e Enter
- **THEN** a coluna fica mais larga, e o foco volta ao cabeçalho dela

#### Scenario: Largura mínima
- **WHEN** o usuário arrasta a borda de uma coluna até quase sumir
- **THEN** a coluna para em 64 px

### Requirement: Menu da coluna

O cabeçalho de cada coluna SHALL ter um menu, aberto pelo botão do cabeçalho, com:
- "Ordenar crescente" e "Ordenar decrescente", quando a coluna se ordena;
- "Filtrar…", quando a coluna se filtra;
- "Ocultar coluna", fora da coluna principal;
- "Redimensionar coluna".

O clique no rótulo de uma coluna que se ordena SHALL ordenar pela coluna, crescente na primeira vez e invertendo a direção a cada clique.

#### Scenario: Ocultar pelo cabeçalho
- **WHEN** o usuário escolhe "Ocultar coluna" no menu da coluna "Responsável"
- **THEN** a coluna sai da tabela e continua no painel "Colunas", desmarcada

#### Scenario: Ordenar pelo rótulo
- **WHEN** a tabela não está ordenada por "Patrimônio", e o usuário clica no rótulo dele duas vezes
- **THEN** a tabela fica ordenada pelo patrimônio, crescente depois do primeiro clique e decrescente depois do segundo

### Requirement: Ordenação pelas colunas

A tabela SHALL ser ordenada por uma coluna de cada vez, crescente ou decrescente, indicada no cabeçalho por ícone e anunciada ao leitor de tela. Os registros sem valor na coluna SHALL ficar no fim, nas duas direções. Entre os registros com o mesmo valor, SHALL valer a ordem de cadastro, os mais novos primeiro. Numa lista paginada, a ordenação SHALL ser feita no servidor, sobre todos os registros, e não só sobre os carregados.

#### Scenario: Vazios no fim
- **WHEN** a tabela é ordenada pelo hostname, decrescente, e há ativos sem hostname
- **THEN** os ativos sem hostname aparecem depois de todos os que têm

#### Scenario: Ordem de toda a lista
- **WHEN** a tabela mostra 100 de 2.000 ativos e o usuário a ordena pelo patrimônio
- **THEN** a primeira linha é o menor patrimônio dos 2.000, e não dos 100 carregados

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

### Requirement: Rolagem de muitas linhas

A tabela SHALL desenhar só as linhas perto da área visível, e uma tabela com 10.000 linhas SHALL rolar sem travar. O cabeçalho SHALL continuar fixo na rolagem. Numa lista paginada, a tabela SHALL trazer a página seguinte sozinha quando a rolagem ou o foco do teclado chegam à última linha carregada, com a linha "Carregando mais…" enquanto ela chega, sem pedir a mesma página duas vezes.

#### Scenario: Dez mil linhas
- **WHEN** a tabela tem 10.000 linhas carregadas e o usuário rola do começo ao fim
- **THEN** a rolagem segue o mouse sem travar, e só as linhas perto da área visível estão desenhadas

#### Scenario: Fim da rolagem
- **WHEN** a tabela mostra os primeiros 100 de 300 ativos e o usuário rola até a última linha
- **THEN** aparece "Carregando mais…", e os 100 seguintes entram ao fim da tabela

#### Scenario: Fim pelo teclado
- **WHEN** o foco está na última linha carregada e o usuário pressiona a seta para baixo
- **THEN** a página seguinte é pedida, e o foco passa à primeira linha nova quando ela chega

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

### Requirement: Menu de contexto da tabela

O menu de contexto SHALL abrir pelo clique direito numa linha, pela tecla de menu ou por Shift+F10 na linha em foco e pelo toque longo numa tela de toque. Aberto sobre uma linha que está na seleção, o menu SHALL agir sobre a seleção inteira. Aberto sobre uma linha fora dela, a seleção SHALL passar a ser só essa linha. Os itens SHALL ser os que a tela oferece para os registros. Esc SHALL fechar o menu e devolver o foco à linha.

#### Scenario: Linha fora da seleção
- **WHEN** há duas linhas selecionadas e o usuário dá clique direito numa terceira
- **THEN** a seleção passa a ser só a terceira linha, e o menu age sobre ela

#### Scenario: Linha da seleção
- **WHEN** há três linhas selecionadas e o usuário dá clique direito numa delas
- **THEN** o menu age sobre as três, e "Copiar linhas" copia as três

#### Scenario: Pelo teclado
- **WHEN** o foco está numa linha e o usuário pressiona Shift+F10
- **THEN** o menu de contexto abre junto da linha, com o foco no primeiro item

### Requirement: Copiar linhas

Ctrl+C, ou Cmd+C, na tabela, e "Copiar linhas", no menu de contexto, SHALL copiar as linhas selecionadas ou, sem seleção, a linha em foco, como texto:
- a primeira linha com os rótulos das colunas à vista, na ordem da tabela;
- depois, uma linha por registro, com os valores como a tabela os mostra, separados por tabulação.

Tabulações e quebras de linha dentro de um valor SHALL virar espaços. Um valor que a conta não pode ver SHALL ficar vazio. A tela SHALL confirmar com "1 linha copiada." ou "<n> linhas copiadas.". Com um trecho de texto selecionado na página, Ctrl+C SHALL copiar o trecho, como em qualquer página, e não as linhas.

#### Scenario: Colar numa planilha
- **WHEN** o usuário seleciona três ativos, copia e cola numa planilha
- **THEN** a planilha recebe uma linha de títulos e as três linhas, cada valor na sua coluna

#### Scenario: Sem seleção
- **WHEN** nenhuma linha está selecionada, o foco está numa linha e o usuário pressiona Ctrl+C
- **THEN** a linha em foco é copiada, com a linha dos títulos, e a tela diz "1 linha copiada."

#### Scenario: Trecho de texto selecionado
- **WHEN** o usuário seleciona com o mouse o hostname dentro de uma célula e pressiona Ctrl+C
- **THEN** só o hostname é copiado, e a tela não diz que copiou linhas

### Requirement: Resumo da linha

Quando o mouse para 1,5 s sobre uma linha, a tabela SHALL mostrar junto dela o resumo das colunas à vista que estão fora da área visível, cortadas ou além da rolagem, com o rótulo e o valor de cada uma, e "—" no valor vazio. Sem coluna fora da área visível, o resumo SHALL NOT aparecer.

O resumo SHALL:
- fechar quando o mouse vai para outra linha ou sai da tabela, quando a tabela rola e com uma tecla;
- não receber o foco nem mudar a linha em foco;
- não aparecer pelo toque nem quando o usuário o desligou nos Ajustes › Tabelas;
- aparecer sem animação de escala com o movimento reduzido.

#### Scenario: Colunas fora da tela
- **WHEN** a tabela tem doze colunas, as quatro últimas além da rolagem, e o mouse para 1,5 s sobre uma linha
- **THEN** aparece o resumo com as quatro colunas e os valores daquela linha

#### Scenario: Todas à vista
- **WHEN** todas as colunas da tabela cabem na janela e o mouse para sobre uma linha
- **THEN** nenhum resumo aparece

#### Scenario: Mouse em movimento
- **WHEN** o mouse passa sobre várias linhas sem parar 1,5 s em nenhuma
- **THEN** nenhum resumo aparece

#### Scenario: Toque
- **WHEN** o usuário toca e segura numa linha num tablet
- **THEN** o resumo não aparece, e o menu de contexto abre

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
