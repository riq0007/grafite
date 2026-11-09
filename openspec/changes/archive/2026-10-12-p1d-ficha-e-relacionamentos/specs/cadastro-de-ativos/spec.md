## MODIFIED Requirements

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

O cadastro SHALL começar pelo tipo, entre os tipos ativos, e mostrar em seguida os campos dele. Sem nenhum tipo ativo, o cadastro SHALL dizer "Nenhum tipo de ativo ainda." e oferecer o catálogo a quem cuida dele. Os campos de arquivo e de imagem SHALL aparecer no cadastro com "Envie depois de cadastrar o ativo.", sem o envio.

O cabeçalho da ficha SHALL mostrar a imagem do ativo, ou a do modelo, ou o ícone do tipo, o nome do ativo, a situação e o patrimônio. A ficha SHALL ter as abas Dados, Ligados (spec ligacoes-de-ativos) e Histórico, e a aba aberta SHALL ficar no endereço.

A aba Dados SHALL mostrar os campos nestes grupos, nesta ordem:
1. Identificação, com o tipo, só para leitura, e o modelo;
2. Uso;
3. os grupos dos campos da organização, na ordem do tipo, e os campos sem grupo em "Outros";
4. um grupo por capacidade ligada;
5. Administrativo.

Cada campo SHALL mostrar o estado dele e a trava. As recusas da API SHALL aparecer no próprio campo, e o formulário SHALL continuar preenchido. Quem não pode editar o ativo SHALL ver a ficha só para leitura.

Os retornos SHALL ser "Ativo cadastrado.", "Ativo salvo.", "Ativo inativado." e "Ativo reativado.".

#### Scenario: Primeiro ativo
- **WHEN** quem edita ativos escolhe o tipo "Impressora" no cadastro
- **THEN** o formulário mostra o modelo, os campos comuns, os campos do tipo e os da capacidade ligada, nos grupos da ficha

#### Scenario: Ficha só para leitura
- **WHEN** uma conta só com `ativos.ver` abre a ficha de um ativo
- **THEN** ela vê os valores e o estado de cada campo, sem as ações de salvar, travar e inativar

#### Scenario: Aba no endereço
- **WHEN** alguém abre a aba Histórico da ficha da PAT-00412 e recarrega a página
- **THEN** a ficha volta na aba Histórico

#### Scenario: Arquivo no cadastro
- **WHEN** o tipo "Notebook" usa o campo de arquivo "PDF da nota fiscal" e alguém cadastra um notebook
- **THEN** o cadastro mostra o "PDF da nota fiscal" com "Envie depois de cadastrar o ativo.", e a ficha do notebook cadastrado oferece o envio

### Requirement: Colunas da tabela dos ativos

A tabela dos ativos SHALL oferecer as colunas:
- **do ativo:** Ativo, a coluna principal, Tipo, Modelo, Situação, e "Cadastrado em" e "Atualizado em";
- **os campos comuns:** Patrimônio, Número de série, Hostname, Local, Responsável e os administrativos;
- **os campos da organização** ativos que algum tipo ativo usa, nos grupos deles;
- **os campos das capacidades** ligadas a algum tipo ativo, um grupo por capacidade.

Cada coluna SHALL mostrar o valor como a ficha o mostra:
- a pessoa, o local e o ativo pelo nome atual, e um ativo que a conta não pode ver como "Ativo fora do seu acesso";
- os identificadores (patrimônio, série, hostname, IP e MAC) e os números na fonte monoespaçada, com os números alinhados à direita e com algarismos tabulares;
- as datas em dd/mm/aaaa, e "Cadastrado em" e "Atualizado em" com a hora, no fuso escolhido;
- o arquivo pelo nome, e a imagem pela miniatura, no tamanho da miniatura da linha.

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
| arquivo e imagem | não ordena | só "Está vazio" e "Está preenchido" |

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

## ADDED Requirements

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
