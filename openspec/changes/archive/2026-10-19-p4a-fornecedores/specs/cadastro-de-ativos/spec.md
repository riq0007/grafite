## ADDED Requirements

### Requirement: Fornecedor dos ativos de antes

A atualização para esta versão SHALL trocar o fornecedor em texto de cada ativo pela referência a um fornecedor (spec fornecedores):
- os textos iguais sem diferenciar acento, maiúsculas e espaços repetidos SHALL virar um fornecedor só, com o nome do texto mais usado, e, no empate, do mais antigo;
- cada fornecedor criado SHALL ficar ativo, sem CNPJ, e a criação SHALL ser registrada na auditoria pelo sistema, com "Criado a partir do fornecedor dos ativos";
- a origem, o momento, o autor e a trava de cada valor SHALL continuar os mesmos;
- o texto em branco SHALL virar a falta do valor.

O filtro "contém" do fornecedor, guardado numa visão ou nas mudanças da conta (spec visoes-de-tabela), SHALL virar "é qualquer de" com os fornecedores criados cujo nome contém o texto, sem diferenciar acento e maiúsculas, e SHALL sair quando nenhum contém. Os filtros "está vazio" e "está preenchido" SHALL continuar.

Rodar a troca de novo SHALL NOT criar outro fornecedor nem mudar os ativos já trocados.

#### Scenario: Grafias do mesmo fornecedor
- **WHEN** antes da atualização, 5 ativos têm o fornecedor "HP Brasil", 2 têm "hp brasil" e 1 tem "HP  Brasil"
- **THEN** depois dela, existe um fornecedor "HP Brasil", e os 8 ativos apontam para ele, com a trava de antes

#### Scenario: Visão com o filtro do fornecedor
- **WHEN** a visão "Locadas" filtrava o fornecedor que contém "locadora", e a atualização cria "Locadora Norte" e "Locadora Sul"
- **THEN** a visão passa a filtrar o fornecedor que é qualquer de "Locadora Norte" e "Locadora Sul"

#### Scenario: Fornecedor travado
- **WHEN** um ativo tinha o fornecedor "Locadora Norte" travado, gravado à mão por Ana
- **THEN** depois da atualização, o ativo aponta para o fornecedor "Locadora Norte", e o valor continua travado, com Ana como autora

## MODIFIED Requirements

### Requirement: Campos comuns a todo ativo

Todo ativo SHALL ter os campos comuns, com uma chave fixa no código e a mesma em toda organização, conferidos pelo motor de campos (spec campos-personalizados):

| Grupo | Campo | Tipo de campo |
|---|---|---|
| Identificação | Nome | texto |
| Identificação | Patrimônio | texto |
| Identificação | Número de série | texto |
| Identificação | Hostname | texto |
| Uso | Situação de uso | lista: Em uso, Em estoque ou Em manutenção |
| Uso | Local | local |
| Uso | Responsável | pessoa |
| Administrativo | Fornecedor | fornecedor |
| Administrativo | Nota fiscal | texto |
| Administrativo | Data de compra | data |
| Administrativo | Valor de compra | moeda |
| Administrativo | Garantia até | data |
| Administrativo | Propriedade | lista: Próprio, Alugado ou Comodato |
| Administrativo | Contrato | texto |
| Administrativo | Custo mensal | moeda |
| Administrativo | Centro de custo | texto |
| Administrativo | Vida útil (meses) | número inteiro, de 0 a 600 |

O patrimônio SHALL ser único na organização, sem diferenciar acento e maiúsculas, entre os ativos ativos e os inativos. Os outros campos comuns SHALL ser opcionais, fora a situação de uso, que SHALL começar em "Em uso".

#### Scenario: Patrimônio repetido
- **WHEN** já existe o ativo de patrimônio "PAT-00412" e alguém cadastra outro com "pat-00412"
- **THEN** o cadastro é recusado com "Já existe um ativo com este patrimônio.", no campo Patrimônio

#### Scenario: Ativo novo sem situação de uso
- **WHEN** alguém cadastra um ativo sem escolher a situação de uso
- **THEN** o ativo fica "Em uso"

### Requirement: Referências do ativo

O local, o responsável, o fornecedor e os campos de pessoa, de local, de ativo e de fornecedor SHALL guardar o identificador do registro. Ao escolher, o registro SHALL estar ativo:
- "O local escolhido está inativo. Escolha um local ativo.";
- "A pessoa escolhida está inativa. Escolha uma pessoa ativa.";
- "O ativo escolhido está inativo.";
- "O fornecedor escolhido está inativo. Escolha um fornecedor ativo.".

Um ativo SHALL NOT referenciar a si mesmo. A ficha SHALL mostrar cada referência pelo nome atual: o caminho do local, o nome da pessoa, o nome do ativo e o nome do fornecedor, com "(inativo)" no fornecedor inativo. Um ativo que a conta não pode ver SHALL aparecer como "Ativo fora do seu acesso".

#### Scenario: Responsável anonimizado
- **WHEN** o responsável por um computador é anonimizado
- **THEN** a ficha do computador mostra o responsável como "Pessoa anonimizada" com o código, e o computador continua com a referência

#### Scenario: Fornecedor renomeado
- **WHEN** quem edita os fornecedores renomeia "HP Brasil" para "HP Inc. Brasil"
- **THEN** a ficha e a tabela dos ativos dele mostram "HP Inc. Brasil", sem nenhuma mudança nos ativos

### Requirement: Ordenação e filtros dos ativos

Cada coluna da tabela dos ativos SHALL ordenar e filtrar conforme o que mostra:

| Coluna | Ordena por | Filtros |
|---|---|---|
| Ativo | o nome mostrado, em ordem alfabética | contém |
| Tipo e Modelo | o nome do tipo; o fabricante e o modelo | é qualquer de |
| Situação | em uso, em estoque, em manutenção e inativo | o filtro de situação da lista |
| Cadastrado em e Atualizado em | o momento | de e até |
| texto, texto longo, licença, URL e MAC | o texto, em ordem alfabética | contém |
| IP | o endereço, pelos números, e não pelo texto | contém |
| número inteiro, decimal e moeda | o número | de e até |
| data | a data | de e até |
| lista | a ordem das opções no campo | é qualquer de |
| lista múltipla | não ordena | é qualquer de, com pelo menos uma das opções |
| pessoa | o nome atual | é qualquer de |
| fornecedor | o nome atual | é qualquer de, entre os fornecedores ativos e os inativos |
| local | o caminho | em, com tudo o que estiver dentro |
| ativo | não ordena | só "Está vazio" e "Está preenchido" |
| arquivo e imagem | não ordena | só "Está vazio" e "Está preenchido" |
| Disponibilidade | Offline, Sem dado, Online e Não verificado, e na mesma situação, a leitura mais antiga primeiro | é qualquer de, entre Online, Offline, Sem dado e Não verificado |
| Suprimentos | o menor nível medido | de e até, em percentual |
| Total de páginas | o último total lido | de e até |
| Control iD | Sem resposta, Login recusado, Resposta inesperada, Sem dado, Respondendo e Não verificado, e na mesma situação, a sondagem mais antiga primeiro | é qualquer de, entre as situações |

"Está vazio" e "Está preenchido" SHALL valer em toda coluna que pode ficar sem valor. A ordem alfabética SHALL ser a do português, com as letras acentuadas junto das sem acento.

A ordenação e os filtros SHALL valer sobre todos os ativos que a conta pode ver, no servidor. Num campo restrito, o filtro SHALL considerar só os ativos em que a conta tem `ativos.restritos`, e a ordenação SHALL tratar como vazio o valor que ela não vê.

#### Scenario: Ordenar pelo IP
- **WHEN** a tabela é ordenada pelo IP, crescente, com os IPs 10.0.0.10 e 10.0.0.9
- **THEN** o 10.0.0.9 vem antes do 10.0.0.10

#### Scenario: Lista pela ordem das opções
- **WHEN** o campo "Criticidade" tem as opções Alta, Média e Baixa, nessa ordem, e a tabela é ordenada por ele, crescente
- **THEN** os ativos de criticidade Alta vêm primeiro, depois os de Média e os de Baixa, e os sem criticidade por último

#### Scenario: Filtro pelo restrito
- **WHEN** Bruno, com `ativos.restritos` só em "Jundiaí", filtra "Valor de compra" de R$ 1.000,00 até R$ 5.000,00
- **THEN** a tabela mostra só os ativos de Jundiaí com o valor nesse intervalo, e nenhum de Campinas

#### Scenario: Ativos sem a nota fiscal
- **WHEN** alguém filtra a coluna "PDF da nota fiscal", um campo de arquivo, por "Está vazio"
- **THEN** a tabela mostra só os ativos sem a nota fiscal enviada

#### Scenario: Só os offline
- **WHEN** alguém filtra a coluna "Disponibilidade" por "Offline" e "Sem dado"
- **THEN** a tabela mostra só os ativos com essas situações, e o filtro fica no endereço, como os outros

#### Scenario: O que caiu primeiro
- **WHEN** a tabela é ordenada pela disponibilidade, crescente
- **THEN** os ativos offline vêm primeiro, e entre eles, o de leitura mais antiga

#### Scenario: Controles sem resposta
- **WHEN** alguém filtra a coluna "Control iD" por "Sem resposta" e "Login recusado"
- **THEN** a tabela mostra só os controles com essas situações

#### Scenario: Impressoras com pouco suprimento
- **WHEN** alguém filtra a coluna "Suprimentos" de 0% até 20% e ordena por ela, crescente
- **THEN** a tabela mostra só as impressoras com algum suprimento medido até 20%, a de menor nível primeiro

### Requirement: Tabela a partir de uma origem

"Ver na tabela" e "Ver ativos", nas fichas e nos cartões, SHALL abrir a tabela dos ativos com o filtro da origem e uma faixa de origem acima dos filtros:
- **local:** "Ativos de Jundiaí › Expedição (vindo do local)", com "Incluir os locais de dentro";
- **pessoa:** "Ativos sob responsabilidade de Ana Souza";
- **modelo e tipo:** "Ativos do modelo HP LaserJet M404" e "Ativos do tipo Impressora";
- **fornecedor:** "Ativos do fornecedor HP Brasil".

A faixa SHALL ter "Limpar origem", que tira a origem e o filtro dela. A origem SHALL ficar no endereço, fora da visão e das mudanças da conta, e o link com ela SHALL reproduzir a tabela. "Novo ativo" na tabela com uma origem SHALL abrir o cadastro com o campo da origem preenchido e o cabeçalho "Novo ativo em Expedição", ou o equivalente da origem, e o valor preenchido SHALL poder ser trocado.

Uma origem que a conta não vê, ou de um registro que não existe mais, SHALL dar "A origem desta tabela não está disponível." e a tabela sem a origem.

#### Scenario: Ativos de um local
- **WHEN** alguém escolhe "Ver ativos" no local "Jundiaí › Expedição"
- **THEN** a tabela abre com a faixa "Ativos de Jundiaí › Expedição (vindo do local)" e só os ativos daquele local

#### Scenario: Cadastro a partir da origem
- **WHEN** a tabela está com a origem do local "Expedição", e o usuário escolhe "Novo ativo"
- **THEN** o cadastro abre com o local "Jundiaí › Expedição" preenchido e o cabeçalho "Novo ativo em Expedição"

#### Scenario: Limpar a origem
- **WHEN** o usuário escolhe "Limpar origem"
- **THEN** a faixa some, o filtro do local sai, e a tabela volta à visão

### Requirement: Cadastro pedido por um campo do ativo

No cadastro e na ficha do ativo, quando o campo pode ser editado, cada campo que aponta outro cadastro SHALL mostrar embaixo o link de cadastro (spec componentes-base), que abre o cadastro numa aba da janela (spec estrutura-da-casca):

| Campo | Link | Exige |
|---|---|---|
| Tipo | Cadastrar novo tipo | `catalogo.administrar` |
| Modelo | Cadastrar novo modelo | `modelos.editar` |
| Local e os campos de local do tipo | Cadastrar novo local | `locais.editar` |
| Responsável e os campos de pessoa do tipo | Cadastrar nova pessoa | `pessoas.editar` |
| Fornecedor e os campos de fornecedor do tipo | Cadastrar novo fornecedor | `fornecedores.editar` |

O link SHALL aparecer só para a conta com a permissão, e só com o módulo do cadastro ligado. O Novo modelo pedido pelo campo Modelo SHALL abrir com o tipo do ativo, só para leitura, porque o modelo do ativo é do tipo dele. Ao salvar, o campo que pediu SHALL vir com o registro criado; nos campos de escolha, o registro criado SHALL aparecer entre as opções.

#### Scenario: Responsável criado pelo campo
- **WHEN** quem tem `ativos.editar` e `pessoas.editar` escolhe "Cadastrar nova pessoa" embaixo do Responsável e salva "Ana Souza"
- **THEN** o cadastro do ativo volta com "Ana Souza" no Responsável

#### Scenario: Modelo do tipo do ativo
- **WHEN** alguém cadastra uma impressora e escolhe "Cadastrar novo modelo"
- **THEN** a aba "Novo modelo" abre com o tipo "Impressora", que não muda

#### Scenario: Sem permissão para criar
- **WHEN** uma conta com `ativos.editar` e sem `locais.editar` cadastra um ativo
- **THEN** o campo Local não mostra "Cadastrar novo local", e o resto do cadastro funciona como antes

#### Scenario: Fornecedor criado pelo campo
- **WHEN** quem tem `ativos.editar` e `fornecedores.editar` escolhe "Cadastrar novo fornecedor" embaixo do Fornecedor, na etapa Administrativo do cadastro, e salva "Locadora Norte"
- **THEN** o cadastro do ativo volta com "Locadora Norte" no Fornecedor, e a etapa continua com o que já estava preenchido
