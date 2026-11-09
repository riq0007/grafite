## MODIFIED Requirements

### Requirement: Lista dos ativos

A lista dos ativos SHALL ser uma tabela configurável (spec tabelas-configuraveis), com as visões da tabela (spec visoes-de-tabela). Na visão de fábrica, "Todos os ativos", ela SHALL mostrar, para cada ativo:
- a miniatura da imagem do modelo ou o ícone do tipo;
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

## ADDED Requirements

### Requirement: Colunas da tabela dos ativos

A tabela dos ativos SHALL oferecer as colunas:
- **do ativo:** Ativo, a coluna principal, Tipo, Modelo, Situação, e "Cadastrado em" e "Atualizado em";
- **os campos comuns:** Patrimônio, Número de série, Hostname, Local, Responsável e os administrativos;
- **os campos da organização** ativos que algum tipo ativo usa, nos grupos deles;
- **os campos das capacidades** ligadas a algum tipo ativo, um grupo por capacidade.

Cada coluna SHALL mostrar o valor como a ficha o mostra:
- a pessoa, o local e o ativo pelo nome atual, e um ativo que a conta não pode ver como "Ativo fora do seu acesso";
- os identificadores (patrimônio, série, hostname, IP e MAC) e os números na fonte monoespaçada, com os números alinhados à direita e com algarismos tabulares;
- as datas em dd/mm/aaaa, e "Cadastrado em" e "Atualizado em" com a hora, no fuso escolhido.

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
| local | o caminho | em, com tudo o que estiver dentro |
| ativo | não ordena | só "Está vazio" e "Está preenchido" |

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

### Requirement: Prévia do ativo

A barra de espaço numa linha da tabela dos ativos SHALL abrir a prévia (spec quick-look) do ativo, com:
- o nome do ativo como título e, abaixo, o tipo e, se houver, o modelo;
- a imagem do modelo ou o ícone do tipo;
- os campos principais: Tipo, Modelo, Patrimônio, Número de série, Hostname, Situação, Local e Responsável;
- depois deles, as outras colunas à vista da tabela, na ordem dela;
- a ação "Abrir", que abre a ficha, também pelo Enter.

Os campos restritos SHALL seguir a coluna: o valor só onde a conta tem `ativos.restritos`.

#### Scenario: Prévia com as colunas da visão
- **WHEN** a tabela mostra as colunas "IP" e "Contrato", e o usuário pressiona espaço na linha da impressora PAT-00412
- **THEN** a prévia mostra a imagem do modelo, os campos principais e, depois deles, o IP e o contrato

#### Scenario: Abrir pela prévia
- **WHEN** a prévia mostra a impressora PAT-00412 e o usuário pressiona Enter
- **THEN** a ficha da PAT-00412 abre

### Requirement: Ações nas linhas dos ativos

O menu de contexto da tabela dos ativos SHALL oferecer:
- "Abrir", com uma linha;
- "Prévia";
- "Copiar linhas";
- "Copiar patrimônio", com uma linha que tem patrimônio, e o retorno "Patrimônio copiado.";
- "Copiar link", com uma linha, que copia o endereço da ficha, com o retorno "Link copiado.".

#### Scenario: Copiar o link
- **WHEN** o usuário dá clique direito na linha da PAT-00412 e escolhe "Copiar link"
- **THEN** o endereço da ficha da PAT-00412 fica copiado, e a tela diz "Link copiado."

#### Scenario: Várias linhas
- **WHEN** o usuário abre o menu de contexto sobre três linhas selecionadas
- **THEN** o menu oferece "Prévia" e "Copiar linhas", e não "Abrir", "Copiar patrimônio" nem "Copiar link"
