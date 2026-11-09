# cadastro-de-ativos Specification

## Purpose
Guardar os ativos da organização: os dados comuns a todo ativo e os campos do tipo, cada valor com a origem, o momento, o autor e a trava, com o acesso pelo local do ativo, a tabela, o cadastro e a ficha, com a imagem própria do ativo, os arquivos dos campos e o histórico.

## Requirements

### Requirement: Ativo

A organização SHALL cadastrar os próprios ativos. Cada ativo SHALL ter:
- o tipo de ativo, entre os ativos no cadastro, que SHALL NOT mudar depois;
- o modelo, opcional, que SHALL ser do mesmo tipo e estar ativo quando escolhido;
- os campos comuns a todo ativo, os campos da organização que o tipo usa e os campos das capacidades que o tipo liga;
- a situação do cadastro, ativo ou inativo.

O ativo SHALL NOT ser excluído, só inativado. O ativo inativo:
- SHALL sair da lista, que só o mostra pelo filtro de situação;
- SHALL guardar todos os valores e o histórico;
- SHALL voltar como estava quando reativado.

#### Scenario: Modelo de outro tipo
- **WHEN** alguém cadastra uma impressora com o modelo "Dell OptiPlex 7010", que é de computador
- **THEN** o cadastro é recusado com "O modelo escolhido não é do tipo do ativo."

#### Scenario: Ativo inativado
- **WHEN** quem edita ativos inativa a impressora PAT-00412
- **THEN** ela sai da lista dos ativos, e o filtro "Inativos" a mostra com os valores que tinha

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

### Requirement: Campos do tipo no ativo

O ativo SHALL usar os campos da organização que o tipo dele usa, na ordem do tipo, e os campos das capacidades ligadas ao tipo.

Cada valor SHALL ser conferido pelo motor de campos, com a recusa no próprio campo. Um campo obrigatório no tipo:
- SHALL ser preenchido no cadastro;
- SHALL NOT ser esvaziado numa edição.

A edição SHALL conferir só os campos que mudaram: um valor guardado que deixou de valer, como uma opção inativada, SHALL continuar até alguém mudá-lo.

Um campo inativo, ou que saiu do tipo, SHALL sair do formulário e SHALL NOT ser gravado, e os valores dele SHALL continuar guardados. Um valor para um campo que o tipo não usa SHALL ser recusado.

#### Scenario: Obrigatório no cadastro
- **WHEN** o "IP" é obrigatório no tipo "Impressora" e alguém cadastra uma impressora sem o IP
- **THEN** o cadastro é recusado com "Preencha este campo.", no campo IP

#### Scenario: Valor recusado
- **WHEN** alguém digita "10.0.0.300" no IP de uma impressora
- **THEN** a gravação é recusada com a mensagem do motor de campos, no campo IP

#### Scenario: Campo inativado depois de preenchido
- **WHEN** o campo "Tensão" de um nobreak preenchido com "220" é inativado
- **THEN** o campo sai da ficha do nobreak, e o "220" volta quando o campo for reativado

### Requirement: Nome do ativo

As telas SHALL mostrar o ativo pelo nome, quando ele tem um. Sem nome, pelo fabricante e pelo modelo e, sem modelo, pelo nome do tipo. O patrimônio SHALL aparecer junto, para distinguir os ativos do mesmo modelo.

#### Scenario: Ativo sem nome
- **WHEN** a impressora PAT-00412 não tem nome e é do modelo "HP LaserJet M404"
- **THEN** a lista a mostra como "HP LaserJet M404", com o patrimônio PAT-00412 ao lado

### Requirement: Origem, momento, autor e trava

Cada valor do ativo SHALL guardar, junto dele:
- a origem: manual, planilha, coleta ou API;
- o momento da última gravação;
- o autor: a conta que gravou ou, na coleta, o coletor que leu o valor;
- a trava.

O modelo do ativo SHALL ter o mesmo estado que um campo.

Quem edita ativos SHALL poder travar e destravar cada campo, com o valor ou sem ele. Um campo travado SHALL mudar só pela edição manual. A edição manual SHALL respeitar a trava de quem a ligou: ela muda o valor e mantém a trava. A política de escrita do campo só manual (spec catalogo-de-ativos) SHALL valer como uma trava que não se desliga.

A ficha SHALL mostrar, em cada campo gravado, a origem, o autor e o momento, no fuso escolhido. O valor gravado pela importação (spec importacao-de-ativos) SHALL ter a origem "planilha" e, como autor, a conta que importou. O valor gravado pela coleta (specs impressoras-por-snmp e saude-do-control-id) SHALL ter a origem "coleta" e, como autor, o nome do coletor; a mudança SHALL entrar na auditoria com o coletor como quem fez.

#### Scenario: Valor digitado
- **WHEN** Ana muda o hostname da impressora para "IMP-ALMOX-01" e salva
- **THEN** a ficha mostra, no Hostname, "Manual · Ana Souza", com o momento da gravação

#### Scenario: Campo travado
- **WHEN** quem edita ativos trava o Local de um computador
- **THEN** o Local passa a mostrar a trava, e uma gravação que não seja manual não pode mudá-lo

#### Scenario: Valor importado
- **WHEN** Ana importa uma planilha que muda o hostname da impressora PAT-00412
- **THEN** a ficha mostra, no Hostname, "Planilha · Ana Souza", com o momento da gravação

#### Scenario: Valor coletado
- **WHEN** o "Coletor de Jundiaí" lê o número de série da impressora PAT-00412
- **THEN** a ficha mostra, no Número de série, "Coleta · Coletor de Jundiaí", com o momento da gravação

### Requirement: Acesso pelo local do ativo

O acesso a um ativo SHALL seguir o local dele (spec permissoes):
- **ver:** `ativos.ver` no ramo do local do ativo;
- **cadastrar, editar, travar, inativar e reativar:** `ativos.editar` no ramo do local do ativo;
- **mudar o local:** `ativos.editar` no local de antes e no de depois.

Um ativo sem local SHALL ser alcançado só por quem tem a permissão na organização inteira. A lista SHALL mostrar só os ativos que a conta pode ver, e cada ativo SHALL dizer o que a conta pode fazer com ele.

#### Scenario: Técnico de uma unidade
- **WHEN** Bruno tem `ativos.editar` em "Jundiaí" e abre a lista dos ativos
- **THEN** a lista mostra só os ativos dos locais de Jundiaí, e o cadastro só aceita um local dentro de Jundiaí

#### Scenario: Mudança para fora do escopo
- **WHEN** Bruno tenta mudar o local de um ativo de "Jundiaí" para "Campinas", onde ele não edita ativos
- **THEN** a API recusa com 403, e a recusa vai para a auditoria

### Requirement: Campos restritos do ativo

O valor de um campo restrito (spec catalogo-de-ativos) SHALL aparecer só para quem tem `ativos.restritos` no local do ativo. Para os outros, o campo SHALL NOT aparecer na ficha, na lista nem na busca, e a API SHALL NOT devolver o valor nem o estado dele.

Editar ou travar um campo restrito SHALL exigir `ativos.restritos` e `ativos.editar` no local do ativo.

#### Scenario: Valor de compra restrito
- **WHEN** o "Valor de compra" é restrito e Bruno, sem `ativos.restritos`, abre a ficha do ativo
- **THEN** a ficha não mostra o "Valor de compra", e a resposta da API não traz o valor

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

### Requirement: Inativação e reativação do ativo

Quem edita ativos no local do ativo SHALL poder inativá-lo, depois de confirmar, e reativá-lo. A inativação SHALL dizer que o ativo sai da lista e que os dados ficam guardados.

#### Scenario: Reativação
- **WHEN** quem edita ativos reativa a impressora PAT-00412
- **THEN** ela volta à lista, com os valores e a situação de uso que tinha

### Requirement: Lista dos ativos

A lista dos ativos SHALL ser uma tabela configurável (spec tabelas-configuraveis), com as visões da tabela (spec visoes-de-tabela). Na visão de fábrica, "Todos os ativos", ela SHALL mostrar, para cada ativo:
- a miniatura da imagem do ativo, ou a da imagem do modelo, ou o ícone do tipo;
- o nome do ativo, com o tipo, na coluna principal;
- o patrimônio;
- o caminho do local;
- a situação, em texto: a situação de uso, ou "Inativo".

A lista SHALL:
- buscar pelo nome, pelo patrimônio, pela série, pelo hostname e pelo fabricante e o nome do modelo, sem diferenciar acento e maiúsculas;
- oferecer à vista o filtro de situação: os ativos (o padrão), cada situação de uso, os inativos ou todos;
- oferecer os filtros pelas colunas, como o tipo e o local, com tudo o que estiver dentro dele;
- guardar a busca, os filtros, a ordenação e as colunas no endereço, e mostrar os filtros ativos;
- mostrar quantos ativos atendem aos filtros e trazer mais ao fim da rolagem;
- oferecer "Novo ativo" a quem pode cadastrar.

Uma lista vazia SHALL dizer "Nenhum ativo encontrado.", com "Limpar filtros" quando há filtro e "Novo ativo" quando não há.

#### Scenario: Busca pelo modelo
- **WHEN** alguém digita "laserjet" na busca da lista
- **THEN** a lista mostra as impressoras do modelo "HP LaserJet M404", e a busca fica no endereço

#### Scenario: Filtro pelo local
- **WHEN** alguém filtra a lista por "Local: em Jundiaí"
- **THEN** a lista mostra os ativos de Jundiaí e dos locais dentro dele

#### Scenario: Coluna de um campo da organização
- **WHEN** alguém mostra a coluna "IP" na lista
- **THEN** cada impressora mostra o IP dela, e os ativos de tipos sem o campo IP ficam com a coluna vazia

#### Scenario: Miniatura do próprio ativo
- **WHEN** a impressora PAT-00412 tem uma imagem própria, e as outras impressoras do modelo dela não têm
- **THEN** a linha da PAT-00412 mostra a imagem própria, e as outras mostram a imagem do modelo

### Requirement: Cadastro e ficha do ativo

O cadastro SHALL começar pelo tipo, entre os tipos ativos, e mostrar em seguida os campos dele, nas etapas do cadastro (requisito "Cadastro do ativo em etapas"). Sem nenhum tipo ativo, o cadastro SHALL dizer "Nenhum tipo de ativo ainda." e oferecer a quem cuida do catálogo "Cadastrar novo tipo", que abre o Novo tipo numa aba da janela (spec estrutura-da-casca); o tipo criado SHALL vir escolhido no cadastro do ativo. Os campos de arquivo e de imagem SHALL aparecer no cadastro com "Envie depois de cadastrar o ativo.", sem o envio.

O cabeçalho da ficha SHALL mostrar a imagem do ativo, ou a do modelo, ou o ícone do tipo, o nome do ativo, a situação e o patrimônio, e oferecer "Imprimir etiqueta", que abre a tela das etiquetas com o ativo (spec etiquetas-de-ativos). A ficha SHALL ter as abas Dados, Ligados (spec ligacoes-de-ativos) e Histórico, e a aba aberta SHALL ficar no endereço.

A aba Dados SHALL mostrar os grupos em cartões (requisito "Aba Dados em cartões"), nesta ordem:
1. Visão geral, com os blocos que os outros módulos mostram na ficha do ativo, como o dos alertas (spec modulo-alertas), e os segredos (requisito "Segredos na ficha do ativo");
2. Identificação, com o tipo, só para leitura, e o modelo;
3. Uso;
4. os grupos dos campos da organização, na ordem do tipo, e os campos sem grupo em "Outros";
5. um cartão por capacidade ligada;
6. Administrativo.

No ativo de um tipo com a disponibilidade na rede, o cartão dela SHALL mostrar a situação (spec disponibilidade-de-rede), desde quando ela vale, a idade da última leitura, a latência e o coletor que a fez, ou "Não verificado" com o motivo. No ativo de um tipo com os suprimentos e contadores, o cartão dela SHALL mostrar o painel Suprimentos (spec impressoras-por-snmp). No ativo de um tipo com a saúde do Control iD, o cartão dela SHALL mostrar a situação, desde quando ela vale, a idade da última sondagem, o último contato, a versão do firmware, o produto, de onde vem o login e o coletor, ou "Não verificado" com o motivo (spec saude-do-control-id).

Cada campo SHALL mostrar o estado dele e a trava. As recusas da API SHALL aparecer no próprio campo, e o formulário SHALL continuar preenchido. Quem não pode editar o ativo SHALL ver a ficha só para leitura.

Os retornos SHALL ser "Ativo cadastrado.", "Ativo salvo.", "Ativo inativado." e "Ativo reativado.".

#### Scenario: Primeiro ativo
- **WHEN** quem edita ativos escolhe o tipo "Impressora" no cadastro
- **THEN** o cadastro mostra o modelo, os campos comuns, os campos do tipo e os da capacidade ligada, nas etapas do cadastro

#### Scenario: Sem nenhum tipo
- **WHEN** quem edita ativos e administra o catálogo abre o cadastro sem nenhum tipo ativo e escolhe "Cadastrar novo tipo"
- **THEN** o Novo tipo abre numa aba, e, ao salvar o tipo "Notebook", o cadastro do ativo volta com "Notebook" escolhido e os campos dele

#### Scenario: Ficha só para leitura
- **WHEN** uma conta só com `ativos.ver` abre a ficha de um ativo
- **THEN** ela vê os valores e o estado de cada campo, sem as ações de salvar, travar e inativar

#### Scenario: Aba no endereço
- **WHEN** alguém abre a aba Histórico da ficha da PAT-00412 e recarrega a página
- **THEN** a ficha volta na aba Histórico

#### Scenario: Etiqueta pela ficha
- **WHEN** quem vê ativos escolhe "Imprimir etiqueta" na ficha da PAT-00412
- **THEN** a tela das etiquetas abre com a etiqueta da PAT-00412

#### Scenario: Arquivo no cadastro
- **WHEN** o tipo "Notebook" usa o campo de arquivo "PDF da nota fiscal" e alguém cadastra um notebook
- **THEN** o cadastro mostra o "PDF da nota fiscal" com "Envie depois de cadastrar o ativo.", e a ficha do notebook cadastrado oferece o envio

#### Scenario: Disponibilidade na ficha
- **WHEN** alguém abre a ficha da impressora PAT-00412, offline desde as 10:32 e lida há 1 minuto pelo "Coletor de Jundiaí", e escolhe o cartão "Disponibilidade na rede"
- **THEN** o cartão mostra "Offline", desde 10:32, "há 1 min" e o "Coletor de Jundiaí"

#### Scenario: Suprimentos na ficha
- **WHEN** alguém abre a ficha da impressora PAT-00412, de um tipo com os suprimentos e contadores, e escolhe o cartão "Suprimentos e contadores"
- **THEN** o cartão mostra o painel Suprimentos

#### Scenario: Control iD na ficha
- **WHEN** alguém abre a ficha do controle de acesso PAT-00777, que responde desde 08:00, e escolhe o cartão "Saúde do Control iD"
- **THEN** o cartão mostra "Respondendo", desde 08:00, o último contato e a versão do firmware

### Requirement: Colunas da tabela dos ativos

A tabela dos ativos SHALL oferecer as colunas:
- **do ativo:** Ativo, a coluna principal, Tipo, Modelo, Situação, e "Cadastrado em" e "Atualizado em";
- **os campos comuns:** Patrimônio, Número de série, Hostname, Local, Responsável e os administrativos;
- **os campos da organização** ativos que algum tipo ativo usa, nos grupos deles;
- **os campos das capacidades** ligadas a algum tipo ativo, um grupo por capacidade;
- **a coleta:**
  - Disponibilidade, no grupo "Disponibilidade na rede", quando algum tipo ativo liga a capacidade (spec disponibilidade-de-rede);
  - Suprimentos e Total de páginas, no grupo "Suprimentos e contadores", quando algum tipo ativo liga a capacidade (spec impressoras-por-snmp);
  - Control iD, no grupo "Saúde do Control iD", quando algum tipo ativo liga a capacidade (spec saude-do-control-id).

Cada coluna SHALL mostrar o valor como a ficha o mostra:
- a pessoa, o local e o ativo pelo nome atual, e um ativo que a conta não pode ver como "Ativo fora do seu acesso";
- os identificadores (patrimônio, série, hostname, IP e MAC) e os números na fonte monoespaçada, com os números alinhados à direita e com algarismos tabulares;
- as datas em dd/mm/aaaa, e "Cadastrado em" e "Atualizado em" com a hora, no fuso escolhido;
- o arquivo pelo nome, e a imagem pela miniatura, no tamanho da miniatura da linha;
- a disponibilidade pela situação, com o ícone e o texto, e a idade da última leitura, com "Desatualizado" quando for o caso (spec leituras-e-estado). Num ativo de um tipo sem a capacidade, ou inativo, a coluna fica vazia;
- Suprimentos pelo menor nível medido entre os suprimentos da impressora, em percentual, com o suprimento ao lado, e Total de páginas pelo último total lido, cada um com a idade da leitura e "Desatualizado" quando for o caso. Sem nível medido nem total, ou num ativo de um tipo sem a capacidade, ou inativo, a coluna fica vazia;
- Control iD pela situação, com o ícone e o texto, e a idade da última sondagem, como a disponibilidade.

A coluna de um campo restrito SHALL ser oferecida só a quem tem `ativos.restritos` em algum ramo. Ela SHALL mostrar o valor só nos ativos em que a conta tem `ativos.restritos`, e "Fora do seu acesso" nos outros.

#### Scenario: Campo da capacidade
- **WHEN** o tipo "Computador" liga o inventário de hardware, e o usuário abre o painel "Colunas"
- **THEN** o painel mostra o grupo "Inventário de hardware", com o processador, a memória e os outros campos da capacidade

#### Scenario: Restrito em parte
- **WHEN** Bruno tem `ativos.restritos` só em "Jundiaí" e mostra a coluna "Valor de compra"
- **THEN** os ativos de Jundiaí mostram o valor de compra, e os de Campinas mostram "Fora do seu acesso"

#### Scenario: Sem os restritos
- **WHEN** uma conta sem `ativos.restritos` abre o painel "Colunas"
- **THEN** o painel não oferece as colunas dos campos restritos

#### Scenario: Coluna de arquivo
- **WHEN** alguém mostra a coluna "PDF da nota fiscal", um campo de arquivo
- **THEN** cada ativo com a nota mostra o nome do arquivo, e os outros ficam com a coluna vazia

#### Scenario: Coluna da disponibilidade
- **WHEN** o tipo "Impressora" liga a disponibilidade na rede, e o usuário mostra a coluna "Disponibilidade"
- **THEN** cada impressora mostra "Online", "Offline", "Sem dado" ou "Não verificado", com o ícone e a idade da última leitura, e os computadores ficam com a coluna vazia

#### Scenario: Coluna do Control iD
- **WHEN** o tipo "Controle de acesso" liga a saúde do Control iD, e o usuário mostra a coluna "Control iD"
- **THEN** cada controle mostra "Respondendo", "Login recusado", "Sem resposta", "Resposta inesperada", "Sem dado" ou "Não verificado", com o ícone e a idade da sondagem, e os outros ativos ficam com a coluna vazia

#### Scenario: Coluna dos suprimentos
- **WHEN** a PAT-00412 tem o toner a 8% e o cilindro a 60%, e o usuário mostra a coluna "Suprimentos"
- **THEN** a linha da PAT-00412 mostra "8%" com o toner ao lado e a idade da leitura

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

### Requirement: Prévia do ativo

A barra de espaço numa linha da tabela dos ativos SHALL abrir a prévia (spec quick-look) do ativo, com:
- o nome do ativo como título e, abaixo, o tipo e, se houver, o modelo;
- a imagem do ativo, ou a do modelo, ou o ícone do tipo;
- os campos principais: Tipo, Modelo, Patrimônio, Número de série, Hostname, Situação, Local e Responsável;
- depois deles, as outras colunas à vista da tabela, na ordem dela;
- a ação "Abrir", que abre a ficha, também pelo Enter.

Os campos restritos SHALL seguir a coluna: o valor só onde a conta tem `ativos.restritos`.

#### Scenario: Prévia com as colunas da visão
- **WHEN** a tabela mostra as colunas "IP" e "Contrato", e o usuário pressiona espaço na linha da impressora PAT-00412, que não tem imagem própria
- **THEN** a prévia mostra a imagem do modelo, os campos principais e, depois deles, o IP e o contrato

#### Scenario: Abrir pela prévia
- **WHEN** a prévia mostra a impressora PAT-00412 e o usuário pressiona Enter
- **THEN** a ficha da PAT-00412 abre

#### Scenario: Prévia com a imagem do ativo
- **WHEN** a impressora PAT-00412 tem uma imagem própria, e o usuário abre a prévia dela
- **THEN** a prévia mostra a imagem própria, e não a do modelo

### Requirement: Ações nas linhas dos ativos

O menu de contexto da tabela dos ativos SHALL oferecer:
- "Abrir", com uma linha;
- "Prévia";
- "Copiar linhas";
- "Copiar patrimônio", com uma linha que tem patrimônio, e o retorno "Patrimônio copiado.";
- "Copiar link", com uma linha, que copia o endereço da ficha, com o retorno "Link copiado.";
- "Imprimir etiqueta", com uma linha, ou "Imprimir etiquetas", com várias, que abre a tela das etiquetas com elas (spec etiquetas-de-ativos).

Com linhas selecionadas, a tabela SHALL oferecer também "Imprimir etiquetas", junto da contagem da seleção, com as selecionadas, até 200.

#### Scenario: Copiar o link
- **WHEN** o usuário dá clique direito na linha da PAT-00412 e escolhe "Copiar link"
- **THEN** o endereço da ficha da PAT-00412 fica copiado, e a tela diz "Link copiado."

#### Scenario: Várias linhas
- **WHEN** o usuário abre o menu de contexto sobre três linhas selecionadas
- **THEN** o menu oferece "Prévia", "Copiar linhas" e "Imprimir etiquetas", e não "Abrir", "Copiar patrimônio" nem "Copiar link"

#### Scenario: Etiquetas da seleção
- **WHEN** o usuário seleciona 25 linhas e escolhe "Imprimir etiquetas" junto da contagem da seleção
- **THEN** a tela das etiquetas abre com os 25 ativos, na ordem da tabela

### Requirement: Imagem do ativo

Quem edita o ativo SHALL poder enviar, trocar e remover na ficha a imagem própria dele, tratada como as imagens da spec arquivos-e-imagens. A imagem do ativo SHALL valer no lugar da imagem do modelo:
- no cabeçalho da ficha;
- na miniatura da tabela;
- na prévia;
- nas listas da aba Ligados.

Sem imagem própria, SHALL valer a imagem do modelo e, sem ela, o ícone do tipo. A imagem trocada ou removida SHALL deixar de ser entregue na hora.

Quem vê o ativo SHALL ver a imagem dele, e a entrega SHALL recusar quem não vê o ativo.

Os retornos SHALL ser "Imagem do ativo trocada." e "Imagem do ativo removida.". Remover a imagem SHALL pedir confirmação, dizendo que a ficha volta a mostrar a imagem do modelo, quando ele tem uma.

#### Scenario: Foto da própria impressora
- **WHEN** quem edita ativos envia uma foto da impressora PAT-00412
- **THEN** a ficha, a tabela e a prévia da PAT-00412 passam a mostrar a foto, e as outras impressoras do mesmo modelo continuam com a imagem do modelo

#### Scenario: Imagem removida
- **WHEN** quem edita ativos remove a imagem própria da PAT-00412, depois de confirmar
- **THEN** a ficha volta a mostrar a imagem do modelo, e o endereço da imagem removida responde 404

#### Scenario: Imagem de um ativo fora do acesso
- **WHEN** Bruno, que vê ativos só em Jundiaí, pede a imagem de um ativo de Campinas
- **THEN** a API responde 403, e a imagem não é entregue

### Requirement: Histórico do ativo

A aba Histórico da ficha SHALL mostrar o que mudou no ativo, do mais novo para o mais antigo:
- o cadastro;
- as edições, com cada campo que mudou pelo rótulo e pelo valor mostrado, antes → depois, e as travas ligadas e desligadas;
- a inativação e a reativação;
- a troca e a remoção da imagem do ativo e dos arquivos dos campos;
- as ligações livres feitas e desfeitas, com o outro ativo.

Cada registro SHALL mostrar quem fez, pelo nome atual da pessoa da conta, e quando, no fuso escolhido. O histórico SHALL trazer os registros em páginas e mais ao fim da lista.

O histórico SHALL ser visto por quem vê o ativo, sem precisar de `auditoria.ver`. A mudança de um campo restrito SHALL aparecer só a quem tem `ativos.restritos` no local do ativo; para os outros, ela SHALL sair do registro, e o registro que só mudou campos restritos SHALL sair do histórico.

A quem tem `auditoria.ver`, a aba SHALL oferecer "Ver na auditoria" (spec consulta-da-auditoria).

#### Scenario: Local mudado
- **WHEN** Ana muda o local da PAT-00412 de "Almoxarifado" para "Expedição", e Bruno abre o histórico dela
- **THEN** o primeiro registro mostra "Ana Souza", o momento e o Local de "Almoxarifado" para "Expedição"

#### Scenario: Histórico sem a auditoria
- **WHEN** uma conta só com `ativos.ver` no local do ativo abre a aba Histórico
- **THEN** ela vê o histórico do ativo, sem "Ver na auditoria"

#### Scenario: Restrito no histórico
- **WHEN** o "Valor de compra" é restrito, Ana muda o valor de compra e o hostname da PAT-00412 numa gravação, e Bruno, sem `ativos.restritos`, abre o histórico
- **THEN** o registro dessa gravação mostra só o hostname antes → depois

### Requirement: Arquivos e imagens nos campos do ativo

Os campos de arquivo e de imagem (spec campos-personalizados) SHALL ser preenchidos na aba Dados da ficha, depois do cadastro, cada um com um arquivo:
- **sem arquivo:** "Enviar arquivo" ou "Enviar imagem";
- **com arquivo:** o nome e o tamanho do arquivo, com "Baixar", ou a miniatura da imagem, que abre a imagem inteira; e, a quem pode, "Trocar" e "Remover".

Enviar e remover SHALL valer na hora, fora do "Salvar alterações" do formulário, e SHALL gravar o estado do campo como uma edição manual. Remover SHALL pedir confirmação, com o nome do arquivo.

Enviar, trocar e remover SHALL exigir `ativos.editar` no local do ativo e, num campo restrito, também `ativos.restritos`. Baixar e ver SHALL seguir quem vê o campo.

Os retornos SHALL ser "Arquivo enviado.", "Arquivo removido.", "Imagem enviada." e "Imagem removida.".

#### Scenario: Nota fiscal em PDF
- **WHEN** quem edita ativos envia "nota-fiscal-1234.pdf" no campo "PDF da nota fiscal" de um notebook
- **THEN** o campo mostra "nota-fiscal-1234.pdf", com o tamanho, "Baixar" e o estado "Manual · <quem enviou>"

#### Scenario: Arquivo trocado
- **WHEN** quem edita ativos troca a nota fiscal de um notebook por outro PDF
- **THEN** o campo mostra o arquivo novo, o endereço do antigo responde 404, e o histórico mostra o nome antigo e o novo

#### Scenario: Arquivo de um campo restrito
- **WHEN** o campo de arquivo "Contrato assinado" é restrito, e uma conta sem `ativos.restritos` pede o arquivo dele
- **THEN** a API recusa o arquivo, e a ficha dessa conta não mostra o campo

### Requirement: Segredos na ficha do ativo

A ficha do ativo SHALL mostrar os segredos do cofre ligados a ele que a conta vê (spec cofre-de-segredos), pelo nome, com o tipo e o identificador, cada um levando à ficha do segredo no Cofre. A ficha do ativo SHALL NOT mostrar nem revelar nenhum valor secreto: revelar e copiar ficam na ficha do segredo.

A seção SHALL aparecer só com o módulo Cofre ligado, só a quem tem `cofre.usar` e só com algum segredo ligado que a conta vê.

#### Scenario: Senha do switch na ficha
- **WHEN** Bruno, que alcança o segredo "Switch do CPD", abre a ficha do switch PAT-00610, ao qual o segredo está ligado
- **THEN** a ficha mostra o "Switch do CPD", com o tipo e o identificador, e o caminho até ele no Cofre, sem a senha

#### Scenario: Segredo que a conta não vê
- **WHEN** Carla, que vê o PAT-00610 e usa o cofre, mas não alcança o "Switch do CPD", abre a ficha do switch
- **THEN** a ficha não mostra o segredo nem a seção dos segredos

### Requirement: Filtros encadeados dos ativos

Com um filtro de Tipo ativo:
- o filtro de Modelo SHALL oferecer primeiro os modelos daqueles tipos, com o texto "Modelos de Impressora" ou "Modelos dos tipos filtrados", e depois os outros, numa seção à parte;
- um modelo já escolhido que não é de nenhum dos tipos filtrados SHALL continuar no filtro, marcado "de outro tipo" no rótulo do filtro ativo;
- o painel de filtros e o painel "Colunas" SHALL mostrar primeiro os grupos dos campos daqueles tipos e das capacidades deles, depois os campos comuns, e por último os campos dos outros tipos, num grupo recolhido "Outros tipos".

O encadeamento SHALL ir só do Tipo para o Modelo e para os campos, e nunca no sentido contrário.

#### Scenario: Modelos do tipo filtrado
- **WHEN** a tabela está filtrada por "Tipo: Impressora", e o usuário abre o filtro de Modelo
- **THEN** o editor mostra primeiro "Modelos de Impressora", com os modelos de impressora, e os outros modelos depois

#### Scenario: Modelo de outro tipo
- **WHEN** a tabela está filtrada por "Modelo: Dell OptiPlex 7010", e o usuário acrescenta "Tipo: Impressora"
- **THEN** o filtro do modelo continua, e o rótulo dele diz "Dell OptiPlex 7010 (de outro tipo)"

#### Scenario: Colunas do tipo primeiro
- **WHEN** a tabela está filtrada por "Tipo: Impressora", e o usuário abre o painel "Colunas"
- **THEN** o painel mostra primeiro os campos de impressora e os da capacidade dela, e os campos dos outros tipos ficam em "Outros tipos", recolhido

### Requirement: Relações do ativo à vista

O local, o responsável, o modelo e o tipo de um ativo SHALL aparecer como referências com cartão (spec componentes-base) na tabela dos ativos, na prévia e na aba Dados da ficha, quando só leitura. O cabeçalho da ficha SHALL ter uma linha com o local, o responsável, o modelo e "Ligados" com a quantidade, cada um como referência ou link para a aba.

#### Scenario: Linha de relações
- **WHEN** alguém abre a ficha da PAT-00412, em "Jundiaí › Expedição", sob a responsabilidade de Ana Souza, com cinco ativos ligados
- **THEN** o cabeçalho mostra "Jundiaí › Expedição · Ana Souza · HP LaserJet M404 · Ligados (5)", e "Ligados (5)" leva à aba Ligados

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

### Requirement: Valores do servidor na ficha aberta

Com a ficha aberta, um valor que o servidor muda num campo que a pessoa não editou, como o número de série gravado pela coleta, SHALL entrar no campo, sem recarregar a página. O campo que a pessoa editou SHALL manter o que foi digitado, e salvar SHALL enviar só os campos editados.

#### Scenario: Série gravada pela coleta
- **WHEN** a ficha da PAT-00412 está aberta, e a coleta grava o número de série "VNB3K12345"
- **THEN** o campo "Número de série" mostra "VNB3K12345", sem recarregar a página

#### Scenario: Campo editado
- **WHEN** a pessoa digitou "IMP-ALMOX-01" no Hostname, e o servidor muda o hostname para "IMP-SERVIDOR"
- **THEN** o campo continua com "IMP-ALMOX-01", e salvar envia só o hostname digitado

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

### Requirement: Cadastro do ativo em etapas

O cadastro do ativo SHALL ser feito em etapas. À esquerda, a lista das etapas (spec componentes-base, "Etapas de um formulário") SHALL seguir a ordem dos grupos da ficha:
1. Tipo, entre os tipos ativos;
2. Modelo, entre os modelos ativos do tipo;
3. Identificação, com os outros campos dela;
4. Uso;
5. uma etapa para cada grupo dos campos da organização, na ordem do tipo, e "Outros" para os campos sem grupo;
6. uma etapa para cada capacidade ligada que tem campos a preencher;
7. Administrativo.

Antes de o tipo ser escolhido, as outras etapas SHALL aparecer sem a escolha, com "Escolha o tipo antes".

O título da tela, como "Novo ativo" ou "Novo ativo em Expedição", SHALL aparecer acima das etapas só quando a janela não tem a barra de abas. Com a barra, a primeira aba já mostra esse título: ele SHALL sair da vista e continuar como o título da tela para o leitor de tela e para o foco depois da navegação. Quando a barra some, o título SHALL voltar.

Cada etapa SHALL dizer em texto como está:
- o Tipo e o Modelo, o nome escolhido; sem ele, o Tipo diz "Falta escolher", e o Modelo, que não é obrigatório, "Opcional";
- as outras, "Falta: <campo>" com o primeiro campo obrigatório vazio, e "e mais N" quando há outros; "Preenchida" com os obrigatórios preenchidos; e "Opcional" quando a etapa não tem campo obrigatório e nada foi preenchido nela.

À direita, o painel da etapa escolhida SHALL mostrar o nome dela, a imagem do modelo escolhido, ou, sem ela, o ícone do tipo, e, ao lado da imagem, os campos da etapa, com o estado e a trava de cada um (requisito "Origem, momento, autor e trava"). Na etapa Modelo, o modelo SHALL ser procurado pelo nome ou pelo fabricante, entre os modelos ativos do tipo, e o painel SHALL mostrar o fabricante do escolhido e o tipo.

Os campos do painel SHALL ficar lado a lado enquanto couberem, cada um com pelo menos 240 px de largura, e um embaixo do outro quando não cabem dois. O texto longo, a lista múltipla, o arquivo e a imagem SHALL ocupar a linha inteira. A ordem do Tab e do leitor de tela SHALL seguir a ordem dos campos, linha por linha.

"Voltar" SHALL abrir a etapa anterior, e "Continuar para <nome da próxima etapa>", a seguinte, sem recusar campos vazios; o Enter num campo SHALL continuar, como o botão. A pessoa SHALL poder abrir qualquer etapa pela lista. Ao trocar de etapa, o foco SHALL ir para o nome dela no painel.

Na última etapa, o botão SHALL ser "Cadastrar". Com um campo obrigatório vazio, ou um campo recusado pela API, o cadastro SHALL abrir a primeira etapa com o problema, com a recusa no campo e o foco no primeiro campo recusado, e o resto do que foi preenchido SHALL continuar.

Trocar o tipo com outra etapa já preenchida SHALL pedir confirmação ("Trocar o tipo?"), porque o que foi preenchido nas outras etapas sai.

#### Scenario: Etapas de uma impressora
- **WHEN** quem edita ativos escolhe o tipo "Impressora", que tem os campos do grupo "Rede"
- **THEN** a lista mostra Tipo, Modelo, Identificação, Uso, Rede e Administrativo, nessa ordem

#### Scenario: O que falta em cada etapa
- **WHEN** a impressora exige o IP, no grupo Rede, e ele está vazio, e nada foi preenchido em Administrativo
- **THEN** a etapa Rede diz "Falta: IP", e a etapa Administrativo diz "Opcional"

#### Scenario: Continuar
- **WHEN** a pessoa está na etapa Modelo e escolhe "Continuar para Identificação"
- **THEN** o painel mostra a etapa Identificação, e o foco vai para o nome dela

#### Scenario: Cadastrar com um campo vazio
- **WHEN** a pessoa escolhe "Cadastrar" na etapa Administrativo com o IP vazio
- **THEN** o painel abre a etapa Rede, com a recusa no IP e o foco nele, e o que foi preenchido nas outras etapas continua

#### Scenario: Procurar o modelo
- **WHEN** a pessoa digita "laserjet" na etapa Modelo de uma impressora
- **THEN** a lista traz os modelos ativos de impressora com "LaserJet" no nome, e, escolhido um, o painel mostra o fabricante dele

#### Scenario: Imagem do modelo no painel
- **WHEN** a pessoa escolhe o modelo "HP LaserJet M404", que tem imagem
- **THEN** o painel de cada etapa mostra a imagem do modelo ao lado dos campos; sem modelo, ele mostra o ícone do tipo

#### Scenario: Trocar o tipo
- **WHEN** a pessoa já preencheu o patrimônio e escolhe outro tipo
- **THEN** o cadastro pergunta "Trocar o tipo?", e só troca, limpando as outras etapas, se ela confirmar

#### Scenario: Título sem a barra de abas
- **WHEN** a pessoa abre o Novo ativo, sem nenhuma outra aba aberta na janela
- **THEN** o título "Novo ativo" aparece acima das etapas

#### Scenario: Título com a barra de abas
- **WHEN** a pessoa escolhe "Cadastrar novo modelo" na etapa Modelo
- **THEN** a barra mostra as abas "Novo ativo" e "Novo modelo", o título sai de cima das etapas, e o leitor de tela continua achando o título "Novo ativo"; fechada a aba "Novo modelo", o título volta acima das etapas

#### Scenario: Campos lado a lado
- **WHEN** a pessoa abre a etapa Administrativo numa janela de 1366 px, com o dock embaixo
- **THEN** os campos ficam lado a lado, em mais de uma coluna, na ordem da etapa, linha por linha

#### Scenario: Campos no celular
- **WHEN** a pessoa abre a etapa Administrativo numa janela de 390 px
- **THEN** os campos ficam um embaixo do outro

#### Scenario: Texto longo na linha inteira
- **WHEN** o tipo tem, no grupo "Detalhes", o campo "Observações", de texto longo, e mais dois campos de texto, e a pessoa abre a etapa Detalhes numa janela de 1366 px
- **THEN** as Observações ocupam a linha inteira, e os outros dois campos ficam lado a lado

### Requirement: Rascunho do cadastro do ativo

O cadastro do ativo SHALL guardar o que foi preenchido num rascunho da conta, no servidor, até 2 s depois da última mudança: o tipo, o modelo, os valores, as travas, a etapa aberta e a origem de onde o cadastro foi aberto. O rascunho SHALL começar quando o tipo é escolhido. Cada conta SHALL ter no máximo um rascunho do cadastro em cada organização. O cadastro SHALL mostrar em texto como está o rascunho: "Guardando o rascunho…", "Rascunho guardado agora", "Rascunho guardado às 14:32" e, quando o servidor não o guarda, "O rascunho não foi guardado.", com "Tentar de novo".

Abrir o Novo ativo com um rascunho guardado SHALL retomar o cadastro de onde ele parou: depois de sair da tela, depois de recarregar a página, depois de sair e entrar de novo e em outro aparelho da mesma conta. Ao retomar, os valores dos campos que o tipo não usa mais, e os dos campos que a conta não pode mais editar, como os restritos sem `ativos.restritos`, SHALL ficar de fora; com o tipo ou o modelo inativado, o cadastro SHALL voltar sem ele, e, sem o tipo, sem os valores. Sem o rascunho lido, por uma falha da API, o cadastro SHALL NOT começar vazio, para não sobrescrever o guardado: ele SHALL mostrar a falha com "Tentar de novo", como sem o catálogo.

"Descartar o rascunho" SHALL pedir confirmação, apagar o rascunho e recomeçar o cadastro vazio. Cadastrar o ativo SHALL apagar o rascunho, na mesma gravação do ativo. Abrir o Novo ativo por uma origem (requisito "Tabela a partir de uma origem") com um rascunho guardado de outra origem, ou de nenhuma, SHALL perguntar "Continuar o cadastro começado?", com "Continuar o começado" e "Começar um novo"; começar um novo SHALL descartar o rascunho, e recarregar a página com a mesma origem SHALL retomar o rascunho dela sem perguntar.

O rascunho SHALL ser só da conta que o guardou: outra conta, mesmo da mesma organização, SHALL NOT lê-lo nem mudá-lo. Ler, guardar e apagar o rascunho SHALL exigir `ativos.editar` em algum escopo. O servidor SHALL recusar o rascunho com mais de 256 KB. O rascunho SHALL NOT entrar na auditoria nem gerar eventos: ele não é um registro do ativo. A anonimização de uma pessoa SHALL apagar o rascunho da conta dela, como apaga as visões da conta.

#### Scenario: Recarregar a página
- **WHEN** a pessoa escolhe o tipo, o modelo e o patrimônio, vê "Rascunho guardado agora" e recarrega a página
- **THEN** o cadastro volta com o tipo, o modelo e o patrimônio, na etapa em que ela estava

#### Scenario: Outro aparelho
- **WHEN** Ana começa o cadastro de um ativo no computador e abre o Novo ativo no celular
- **THEN** o celular retoma o cadastro que Ana começou

#### Scenario: Rascunho de outra conta
- **WHEN** Ana tem um rascunho guardado, e Bruno, da mesma organização, abre o Novo ativo
- **THEN** o cadastro de Bruno começa vazio, sem o rascunho de Ana

#### Scenario: Pessoa anonimizada
- **WHEN** Bruno tinha um rascunho guardado, e a pessoa dele, inativa, é anonimizada
- **THEN** o rascunho de Bruno não existe mais

#### Scenario: Descartar o rascunho
- **WHEN** a pessoa escolhe "Descartar o rascunho" e confirma
- **THEN** o cadastro recomeça vazio, e recarregar a página não traz o rascunho de volta

#### Scenario: Cadastrar apaga o rascunho
- **WHEN** a pessoa cadastra o ativo e depois abre o Novo ativo de novo
- **THEN** o cadastro começa vazio

#### Scenario: Origem com um rascunho guardado
- **WHEN** a pessoa tem um rascunho guardado e escolhe "Novo ativo" na ficha do local "Expedição"
- **THEN** o cadastro pergunta "Continuar o cadastro começado?", e "Começar um novo" abre o cadastro com o local "Expedição" e descarta o rascunho

#### Scenario: Recarregar com a mesma origem
- **WHEN** a pessoa começou um novo cadastro pela ficha do local "Expedição", escolheu o tipo e recarrega a página
- **THEN** o cadastro volta com o local "Expedição" e o tipo, sem perguntar

#### Scenario: Rascunho não guardado
- **WHEN** o servidor não responde enquanto a pessoa preenche
- **THEN** o cadastro mostra "O rascunho não foi guardado." com "Tentar de novo", e o que foi preenchido continua na tela

#### Scenario: Rascunho não lido
- **WHEN** a API falha ao ler o rascunho ao abrir o Novo ativo
- **THEN** o cadastro mostra a falha com "Tentar de novo", e não começa vazio

### Requirement: Aba Dados em cartões

À esquerda da aba Dados, a lista dos cartões (spec componentes-base, "Etapas de um formulário", sem a numeração) SHALL mostrar, em cada cartão, o nome do grupo e o resumo dele em texto:
- **Visão geral:** os resumos dos blocos dos módulos, como "1 alerta aberto", separados por " · "; sem nenhum, "Nada pede atenção";
- **capacidade com painel:** a situação do painel, nos textos das colunas da tabela: "Offline" na disponibilidade, o suprimento mais baixo, como "18% · Black Toner Cartridge", nos suprimentos, e "Respondendo" no Control iD; sem leitura, "Não verificado". Nos consumíveis compatíveis, os códigos dos dois primeiros, como "CF258A · CF258X", com "e mais N" quando há outros; "Nenhum compatível", sem nenhum, e "Sem modelo", no ativo sem modelo;
- **outros cartões:** os valores dos dois primeiros campos preenchidos, separados por " · ", como "Em uso · Jundiaí › Expedição", ou "Nada preenchido". O valor restrito que a conta não vê SHALL NOT entrar no resumo.

Com um campo obrigatório vazio, como num ativo importado, o cartão SHALL dizer "Falta: <campo>", com "e mais N" quando há outros, no lugar do resumo.

O primeiro cartão SHALL ser, entre os que a ficha mostra:
- o que o tipo escolheu (spec catalogo-de-ativos, "Primeiro cartão da ficha");
- sem a escolha, ou com o escolhido fora da ficha, o da capacidade principal do tipo, nesta ordem: Suprimentos e contadores, Saúde do Control iD, Inventário de hardware e Disponibilidade na rede;
- sem nenhum deles, a Visão geral.

O primeiro cartão SHALL ficar no alto da lista, e a Visão geral logo depois dele, quando não é ela. Os outros SHALL seguir na ordem da ficha. A ficha SHALL abrir no primeiro cartão. O cartão aberto SHALL ficar no endereço, como a aba, menos o primeiro, e recarregar a página SHALL voltar nele.

À direita, o painel do cartão aberto SHALL mostrar:
- o nome do grupo;
- a imagem do ativo, ou a do modelo, ou o ícone do tipo, com "Trocar imagem" para quem edita o ativo (requisito "Imagem do ativo");
- ao lado da imagem, o conteúdo do cartão: os blocos e os segredos na Visão geral, o painel na capacidade e os campos, cada um com o estado e a trava.

Os campos do cartão SHALL ficar lado a lado com a mesma regra do cadastro (requisito "Cadastro do ativo em etapas"): enquanto couberem, cada um com pelo menos 240 px de largura, e com o texto longo, a lista múltipla, o arquivo e a imagem na linha inteira.

O salvar SHALL seguir estas regras:
- "Salvar alterações" grava o que mudou em qualquer cartão, numa gravação só;
- embaixo da lista, a ficha diz "Nenhuma alteração", "1 alteração não salva" ou "N alterações não salvas";
- uma recusa da API abre o cartão do primeiro campo recusado, com a recusa nele e o foco nele;
- trocar de cartão SHALL NOT descartar o que foi digitado.

Quem só vê o ativo SHALL ver os cartões e os painéis só para leitura, sem "Salvar alterações" e sem a contagem.

#### Scenario: Cartões de uma impressora
- **WHEN** alguém abre a ficha da impressora PAT-00412, de um tipo com o grupo "Rede" e os suprimentos e contadores, sem escolha do primeiro cartão
- **THEN** a lista mostra Suprimentos e contadores, Visão geral, Identificação, Uso, Rede e Administrativo, nessa ordem, com os suprimentos abertos

#### Scenario: Primeiro cartão escolhido no tipo
- **WHEN** o tipo "Impressora" escolhe a Visão geral como primeiro cartão, e alguém abre a PAT-00412
- **THEN** a lista mostra Visão geral, Identificação, Uso, Rede, Suprimentos e contadores e Administrativo, com a Visão geral aberta

#### Scenario: Tipo sem capacidade com cartão
- **WHEN** alguém abre a ficha de um monitor, de um tipo sem capacidade
- **THEN** a ficha abre na Visão geral, como antes

#### Scenario: Resumo dos cartões
- **WHEN** a PAT-00412 está em uso na Expedição, com o Black Toner Cartridge em 18% e um alerta aberto
- **THEN** o Uso diz "Em uso · Jundiaí › Expedição", os suprimentos dizem "18% · Black Toner Cartridge", e a Visão geral diz "1 alerta aberto"

#### Scenario: Resumo dos consumíveis compatíveis
- **WHEN** a PAT-00412 é de um modelo com os toners CF258A e CF258X e o cilindro CF232A compatíveis
- **THEN** o cartão "Consumíveis compatíveis" diz "CF258A · CF258X e mais 1"

#### Scenario: Obrigatório vazio
- **WHEN** a impressora importada PAT-00900 está sem o IP, que o tipo exige
- **THEN** o cartão Rede diz "Falta: IP"

#### Scenario: Salvar o que mudou em dois cartões
- **WHEN** quem edita o ativo muda o hostname em Identificação e o local em Uso
- **THEN** a lista diz "2 alterações não salvas", e "Salvar alterações" grava os dois numa gravação só, com "Ativo salvo."

#### Scenario: Recusa abre o cartão do campo
- **WHEN** a API recusa o patrimônio repetido ao salvar, com o cartão Uso aberto
- **THEN** o cartão Identificação abre, com a recusa no Patrimônio e o foco nele

#### Scenario: Cartão no endereço
- **WHEN** alguém abre o cartão Rede da ficha da PAT-00412 e recarrega a página
- **THEN** a ficha volta com o cartão Rede aberto

#### Scenario: Visão geral no endereço
- **WHEN** alguém abre a Visão geral da PAT-00412, que abre nos suprimentos, e recarrega a página
- **THEN** a ficha volta com a Visão geral aberta

#### Scenario: Imagem no painel
- **WHEN** quem edita o ativo abre o cartão Uso da PAT-00412, sem imagem própria e com a imagem do modelo
- **THEN** o painel mostra a imagem do modelo ao lado dos campos, com "Trocar imagem"

#### Scenario: Campos do cartão lado a lado
- **WHEN** quem edita o ativo abre o cartão Administrativo da PAT-00412 numa janela de 1366 px, com o dock embaixo
- **THEN** os campos ficam lado a lado, em mais de uma coluna, como na etapa Administrativo do cadastro

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

### Requirement: Consumíveis compatíveis na ficha do ativo

O ativo de um tipo que liga a capacidade `consumiveis.compatibilidade` SHALL ter, na ficha, o cartão "Consumíveis compatíveis", com o painel dos consumíveis compatíveis do modelo dele (spec consumiveis): o código, o nome, o tipo, a cor e o rendimento de cada um, levando à ficha do consumível para quem tem `consumiveis.ver`. O painel SHALL dizer:
- "Escolha o modelo do ativo para ver os consumíveis compatíveis.", no ativo sem modelo;
- "Nenhum consumível compatível com o modelo.", no modelo sem nenhum.

Para quem vê o estoque, cada consumível do painel SHALL mostrar o saldo somado nos locais que a conta vê, como "3 em estoque", ou "Sem estoque" (spec estoque). Para quem movimenta o estoque em algum local, cada um SHALL oferecer "Registrar saída", que abre a saída do consumível para o ativo (spec modulo-operacao, "Lançamento das movimentações").

O cartão SHALL aparecer para quem vê o ativo, só com o módulo Operação ligado. O cadastro do ativo em etapas SHALL NOT ter a etapa da capacidade, que não tem campos.

#### Scenario: Toner da impressora
- **WHEN** alguém abre o cartão "Consumíveis compatíveis" da PAT-00412, uma "HP LaserJet M404" com o CF258A compatível
- **THEN** o painel mostra o CF258A, Toner, Preto, com 3.000 páginas

#### Scenario: Impressora sem modelo
- **WHEN** alguém abre a ficha da impressora PAT-00900, sem modelo
- **THEN** o cartão "Consumíveis compatíveis" diz "Sem modelo", e o painel diz "Escolha o modelo do ativo para ver os consumíveis compatíveis."

#### Scenario: Operação desligado
- **WHEN** o módulo Operação está desligado na organização
- **THEN** a ficha da PAT-00412 não mostra o cartão "Consumíveis compatíveis"

#### Scenario: Toner em estoque
- **WHEN** quem vê o estoque de Jundiaí abre o cartão "Consumíveis compatíveis" da PAT-00412, com 7 CF258A no Almoxarifado e 2 na Expedição
- **THEN** o CF258A mostra "9 em estoque"

#### Scenario: Troca do toner pela ficha
- **WHEN** quem movimenta o estoque escolhe "Registrar saída" no CF258A do cartão da PAT-00412
- **THEN** a saída abre com o CF258A e a PAT-00412 escolhidos

### Requirement: Solicitações na ficha do ativo

Com o módulo Operação ligado, a ficha do ativo SHALL mostrar a seção "Solicitações" a quem vê as solicitações (spec solicitacoes): as pendentes do ativo e as 5 mais novas entre as concluídas e as canceladas, cada uma com o número, o tipo, a situação e quando foi registrada, levando à ficha dela. Para quem atende, a seção SHALL oferecer "Nova solicitação", que abre o Toner já com o ativo, quando o tipo dele usa consumíveis, ou o Conserto já com o ativo. Sem nenhuma, a seção SHALL dizer "Nenhuma solicitação deste ativo.".

#### Scenario: Toner pela ficha da impressora
- **WHEN** Carla escolhe "Nova solicitação" na ficha da PAT-00412
- **THEN** o Toner abre com a PAT-00412 e o total de páginas dela

#### Scenario: Conserto pela ficha do notebook
- **WHEN** Carla escolhe "Nova solicitação" na ficha do NB-0031
- **THEN** o Conserto abre com o NB-0031

#### Scenario: Ativo sem solicitações
- **WHEN** quem vê as solicitações abre a ficha de um ativo sem nenhuma
- **THEN** a seção diz "Nenhuma solicitação deste ativo."

### Requirement: Ordens de serviço na ficha do ativo

Com o módulo Operação ligado, a ficha do ativo SHALL mostrar a seção "Ordens de serviço" a quem vê as OS (spec ordens-de-servico): as em aberto do ativo e as 5 mais novas entre as resolvidas e as encerradas, cada uma com o número, a situação, o problema e quando foi aberta, levando à ficha dela. Para quem atende, a seção SHALL oferecer "Nova ordem de serviço", que abre o formulário já com o ativo. Sem nenhuma, a seção SHALL dizer "Nenhuma ordem de serviço deste ativo.".

#### Scenario: OS pela ficha do notebook
- **WHEN** Carla escolhe "Nova ordem de serviço" na ficha do NB-0031
- **THEN** o formulário da nova OS abre com o NB-0031

#### Scenario: Ativo sem OS
- **WHEN** quem vê as OS abre a ficha de um ativo sem nenhuma
- **THEN** a seção diz "Nenhuma ordem de serviço deste ativo."

#### Scenario: Problema que voltou
- **WHEN** a ficha do NB-0031 tem a OS 12 Encerrada, "Não liga", e a OS 20 Aberta, "Não liga de novo"
- **THEN** a seção mostra a OS 20 entre as em aberto e a OS 12 entre as encerradas, cada uma com o problema
