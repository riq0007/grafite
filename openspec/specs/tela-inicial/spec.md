# tela-inicial Specification

## Purpose

Abrir o Grafite no que precisa de ação: as ocorrências abertas dos módulos, das mais graves para as mais leves, com a imagem do ativo e o caminho para resolver cada uma.

## Requirements

### Requirement: Ocorrências dos módulos

Um módulo SHALL poder registrar uma fonte de ocorrências abertas. Cada ocorrência SHALL trazer:
- a severidade: Crítico, Atenção ou Informação;
- o texto da ocorrência, como "Toner preto em 8%";
- o ativo, ou o registro de que ela fala, como o coletor ou o consumível: o nome, o tipo e, se houver, as imagens;
- o momento em que abriu;
- o endereço do registro.

A tela inicial SHALL juntar as ocorrências de todas as fontes, sem mudança na casca. Quando uma fonte avisar que as suas ocorrências mudaram, a tela SHALL atualizar a lista sem recarregar a página.

#### Scenario: Fonte de um módulo
- **WHEN** um módulo registra uma fonte com duas ocorrências abertas
- **THEN** as duas aparecem na tela inicial, sem mudança no código da casca

#### Scenario: Ocorrência resolvida
- **WHEN** a fonte avisa que uma ocorrência foi resolvida
- **THEN** a ocorrência sai da lista, sem recarregar a página

#### Scenario: Ocorrência de um consumível
- **WHEN** a fonte do Operação traz o CF258A abaixo do mínimo no Almoxarifado
- **THEN** a ocorrência aparece com o CF258A no lugar do ativo, com a imagem genérica, e o clique abre o estoque do CF258A no Almoxarifado

### Requirement: O que resolver agora

A tela inicial SHALL ser "O que resolver agora", com o número de ocorrências abertas no título, como "4 abertas". As ocorrências SHALL aparecer na tabela base, com:
- a miniatura do ativo;
- o nome do ativo;
- a ocorrência;
- há quanto tempo está aberta, como "agora", "32 min", "1 h" ou "2 d", atualizado a cada minuto;
- a severidade em texto.

Clicar na linha ou pressionar Enter nela SHALL abrir o registro. A tela SHALL NOT mostrar indicadores sem uma decisão ligada a eles.

#### Scenario: Abrir o registro
- **WHEN** o usuário pressiona Enter na linha "Toner preto em 8%"
- **THEN** a casca navega até o registro da impressora

#### Scenario: Há quanto tempo
- **WHEN** uma ocorrência abriu há 90 minutos
- **THEN** a coluna mostra "1 h", e passa a "2 h" quando ela completa duas horas, sem recarregar a página

### Requirement: Ordem ajustável

A ordem de fábrica SHALL ser pela severidade (Crítico, Atenção e Informação) e, dentro da mesma severidade, a mais antiga primeiro. O usuário SHALL poder ordenar pelas colunas Severidade, Há, Ativo e Ocorrência, em ordem crescente ou decrescente. Ordenar pela Severidade SHALL usar a mesma regra da ordem de fábrica. A escolha SHALL ficar gravada até o usuário mudá-la.

#### Scenario: Ordem de fábrica
- **WHEN** há uma ocorrência de Atenção de 7 h, uma de Atenção de 1 h e uma Crítica de 32 min
- **THEN** a tela mostra a Crítica, depois a de Atenção de 7 h e por último a de 1 h

#### Scenario: Ordem escolhida
- **WHEN** o usuário ordena pelo nome do ativo, sai da tela e volta
- **THEN** a lista continua ordenada pelo nome do ativo

### Requirement: Estados da tela inicial

Enquanto as fontes respondem, a tela SHALL mostrar o esqueleto de carregamento no lugar das linhas.
- **Uma fonte falha:** a tela SHALL mostrar "Não foi possível carregar as ocorrências de <módulo>." e "Tentar de novo", e as ocorrências das outras fontes SHALL continuar à vista.
- **Nenhum módulo registra uma fonte:** a tela SHALL mostrar "Nenhum módulo registra ocorrências ainda".
- **Há fontes e nada aberto:** a tela SHALL mostrar "Nenhuma ocorrência aberta.".

A tela SHALL NOT mostrar ocorrências de exemplo fora do catálogo de componentes.

#### Scenario: Fonte com falha
- **WHEN** a fonte do módulo Rede falha, e a de Ativos responde com duas ocorrências
- **THEN** a tela mostra as duas ocorrências de Ativos e "Não foi possível carregar as ocorrências de Rede.", com "Tentar de novo"

#### Scenario: Nenhuma fonte
- **WHEN** nenhum módulo registra uma fonte de ocorrências
- **THEN** a tela mostra "Nenhum módulo registra ocorrências ainda", sem ocorrências inventadas

#### Scenario: Nada aberto
- **WHEN** as fontes respondem sem nenhuma ocorrência
- **THEN** a tela mostra "Nenhuma ocorrência aberta."

### Requirement: Início em blocos

O Início SHALL ser feito de blocos. "O que resolver agora" SHALL ser o primeiro bloco de fábrica e SHALL continuar com o título da janela, com o número de abertas. Os blocos dos módulos SHALL ter o título num carimbo de seção. Um módulo SHALL poder registrar blocos do Início, com as permissões de quem os vê, sem mudança na casca. O bloco de um módulo desligado, ou que a conta não pode ver, SHALL NOT aparecer.

No topo, o Início SHALL mostrar o campo "Buscar ativos, pessoas, locais e ações", que abre a busca global.

#### Scenario: Bloco de um módulo
- **WHEN** um módulo registra um bloco do Início, e a conta tem a permissão dele
- **THEN** o bloco aparece no Início, depois de "O que resolver agora", sem mudança no código da casca

#### Scenario: Busca no topo
- **WHEN** o usuário clica em "Buscar ativos, pessoas, locais e ações"
- **THEN** a busca global abre, como pelo Ctrl K

### Requirement: Suprimentos que acabam primeiro

O Ativos SHALL registrar o bloco "Suprimentos que acabam primeiro", para quem vê os ativos. O bloco SHALL mostrar até 6 impressoras, do menor nível para o maior. Cada uma SHALL trazer:
- o cartucho do suprimento de menor nível, na tinta dele;
- o nome da impressora e a descrição do suprimento;
- o nível, como "8%";
- a estimativa de quando acaba, como "Acaba em cerca de 9 dias", quando as leituras permitem.

Clicar numa impressora SHALL abrir a ficha dela. Sem impressora com o nível lido, o bloco SHALL mostrar "Nenhuma impressora com o nível lido.".

O bloco SHALL ter estas opções (requisito "Opções dos blocos"):
- **Tipos de suprimento:** Toner, Cilindro, Fusor e Outros, pelo tipo que a leitura dá a cada suprimento (spec impressoras-por-snmp, "Nível dos suprimentos"); de fábrica, os quatro. Pelo menos um SHALL ficar escolhido;
- **Locais:** os locais cujas impressoras entram, com os de dentro; de fábrica, todos os que a conta vê;
- **Impressoras:** quantas o bloco mostra, de 3 a 12; de fábrica, 6;
- **Nível até:** só os suprimentos até o nível escolhido, de 5% a 100%, de 5 em 5; de fábrica, 100%, que não corta nada.

Com os tipos escolhidos, o suprimento de menor nível de cada impressora SHALL ser o menor entre os tipos escolhidos, e a impressora sem suprimento desses tipos com o nível lido SHALL ficar de fora. Quando alguma opção difere da de fábrica, o bloco SHALL dizer o recorte em texto, abaixo do título, como "Toner · até 30% · Jundiaí". Sem nenhuma impressora no recorte, o bloco SHALL dizer "Nenhuma impressora neste recorte.".

#### Scenario: Toner quase no fim
- **WHEN** a Impressora do RH tem o toner preto em 8%, e a do Financeiro, o ciano em 40%
- **THEN** o bloco mostra a do RH primeiro, com o cartucho preto, "8%" e a estimativa, e depois a do Financeiro

#### Scenario: Só o toner
- **WHEN** a Impressora do RH tem o fusor em 3% e o toner preto em 60%, e a conta escolhe só Toner nos tipos
- **THEN** o bloco mostra a Impressora do RH com o toner preto em "60%", e o fusor não aparece

#### Scenario: Só o fusor
- **WHEN** a conta escolhe só Fusor, e só a Impressora do RH informa o nível do fusor
- **THEN** o bloco mostra só a Impressora do RH, com o fusor em "3%"

#### Scenario: Até 30%
- **WHEN** a conta escolhe Toner e o nível até 30%, e nenhuma impressora tem toner em 30% ou menos
- **THEN** o bloco diz "Nenhuma impressora neste recorte.", com "Toner · até 30%" abaixo do título

#### Scenario: Recorte em texto
- **WHEN** a conta escolhe só Toner, até 30%, no local Jundiaí
- **THEN** o bloco mostra "Toner · até 30% · Jundiaí" abaixo do título

### Requirement: Backups do Control iD no Início

A Gestão de ativos SHALL registrar o bloco "Backups do Control iD", para quem vê os backups do Control iD. O bloco SHALL mostrar cada controle com:
- o nome;
- os rostos do último backup, como "120 rostos";
- a faixa dos últimos 14 dias, com uma forma por situação.

Os controles há mais dias sem backup SHALL vir primeiro. Clicar num controle SHALL abrir a ficha dele.

#### Scenario: Controle sem backup
- **WHEN** o Controle da portaria está há 5 dias sem backup, e o do almoxarifado teve backup hoje
- **THEN** o bloco mostra o da portaria primeiro, com os dias sem backup na faixa

### Requirement: Personalizar o Início

O Início SHALL ter "Personalizar o Início", que abre um modo em que cada bloco ganha Subir, Descer e Ocultar. "O que resolver agora" SHALL ficar sempre à vista: ele sobe e desce, sem Ocultar. Os blocos ocultos SHALL ficar numa lista, cada um com Mostrar. "Concluir" SHALL fechar o modo. A ordem e os ocultos SHALL ficar gravados na conta, e o bloco novo de um módulo SHALL entrar no fim, à vista.

No mesmo modo, cada bloco de módulo SHALL ganhar também:
- "Largura", com "Inteira" e "Metade" (requisito "Largura dos blocos");
- "Opções…", quando o bloco tem opções (requisito "Opções dos blocos").

#### Scenario: Subir um bloco
- **WHEN** o usuário personaliza o Início e sobe "Suprimentos que acabam primeiro" acima de "O que resolver agora"
- **THEN** o Início passa a abrir com os suprimentos primeiro, também depois de sair e voltar

#### Scenario: Ocultar e mostrar
- **WHEN** o usuário oculta "Backups do Control iD"
- **THEN** o bloco sai do Início e aparece na lista dos ocultos, com Mostrar, que o devolve ao fim

#### Scenario: O que resolver agora sempre à vista
- **WHEN** o usuário personaliza o Início
- **THEN** "O que resolver agora" tem Subir e Descer, sem Ocultar

#### Scenario: Bloco sem opções
- **WHEN** o usuário personaliza o Início, e "Backups do Control iD" não declara opções
- **THEN** esse bloco tem Subir, Descer, Ocultar e Largura, sem "Opções…"

### Requirement: Opções dos blocos

Um módulo SHALL poder declarar as opções do bloco dele, sem mudança na casca. Cada opção SHALL ter o rótulo, o valor de fábrica e uma destas formas:
- uma escolha de um ou mais valores de uma lista fixa;
- um número, com o mínimo, o máximo e a unidade;
- uma escolha de locais, na árvore de locais.

No modo Personalizar, "Opções…" SHALL abrir uma gaveta com as opções do bloco, e cada mudança SHALL valer na hora no bloco e ficar gravada na conta, sem botão de salvar. A gaveta SHALL ter "Restaurar as opções", que volta todas às de fábrica. As opções SHALL valer em qualquer aparelho em que a conta entrar.

Um valor guardado que a opção não aceita mais, como um número fora do intervalo, SHALL dar lugar ao valor de fábrica daquela opção, e as outras SHALL continuar valendo. Numa escolha de vários, o valor que saiu da lista e o local que foi inativado SHALL sair da escolha, e os outros SHALL continuar; quando não sobra nenhum, ou sobram menos que o mínimo, SHALL valer o de fábrica.

#### Scenario: Opção gravada
- **WHEN** o usuário escolhe só Toner nas opções dos suprimentos, no computador, e abre o Início no notebook
- **THEN** o bloco do notebook mostra só o toner

#### Scenario: Restaurar as opções
- **WHEN** o usuário, com só Toner e até 30%, escolhe "Restaurar as opções"
- **THEN** o bloco volta aos quatro tipos, sem corte de nível, e o recorte some de baixo do título

#### Scenario: Local inativado nas opções
- **WHEN** as opções guardadas trazem só um local, que foi inativado
- **THEN** a opção dos locais volta a todos os locais, e o tipo escolhido continua valendo

#### Scenario: Um dos locais inativado
- **WHEN** as opções guardadas trazem Jundiaí e Campinas, e Campinas foi inativado
- **THEN** o bloco continua só com Jundiaí

### Requirement: Largura dos blocos

Cada bloco de módulo SHALL ter a largura "Inteira", a de fábrica, ou "Metade". Na janela larga, dois blocos de metade seguidos SHALL ficar lado a lado, e o bloco de metade sem um par SHALL ocupar a metade esquerda. Na janela estreita, no tablet e no celular, todo bloco SHALL ocupar a largura inteira. "O que resolver agora" SHALL ser sempre inteiro. A ordem da leitura e do teclado SHALL ser a ordem dos blocos, da esquerda para a direita e de cima para baixo.

#### Scenario: Dois blocos lado a lado
- **WHEN** o usuário põe "Suprimentos que acabam primeiro" e "Backups do Control iD" na largura Metade, um depois do outro, numa janela de 1.920 px
- **THEN** os dois ficam lado a lado, cada um com a metade da largura

#### Scenario: Metade no celular
- **WHEN** os mesmos dois blocos de metade abrem no celular
- **THEN** cada um ocupa a largura inteira, um embaixo do outro
