## Purpose

Importar ativos de um tipo por uma planilha XLSX ou CSV, com a prévia linha a linha antes de gravar e a aplicação na fila de tarefas, respeitando a trava, o só manual, o escopo e os campos restritos de quem importa.

## ADDED Requirements

### Requirement: Planilha da importação

Quem tem `ativos.editar`, em qualquer escopo, SHALL poder importar ativos de um tipo ativo por uma planilha. A planilha SHALL ser:
- XLSX, da qual vale a primeira aba, ou CSV, em UTF-8 ou em Windows-1252, com as colunas separadas por ponto e vírgula, vírgula ou tabulação;
- de até 10 MB, com até 5.000 linhas de dados e até 200 colunas;
- com os títulos das colunas na primeira linha, e uma linha de dados em cada linha seguinte; as linhas inteiramente vazias SHALL ser puladas.

O tipo da planilha SHALL ser conferido pelo conteúdo, e não pelo nome. A API SHALL recusar no formato único de erro:
- outro formato: 415, com "Formato não aceito. Envie a planilha em XLSX ou CSV.";
- mais de 10 MB: 413, com "A planilha passa de 10 MB.";
- sem linhas de dados: 400, com "A planilha não tem linhas para importar.";
- mais de 5.000 linhas: 400, com "A planilha passa de 5.000 linhas. Divida-a em partes menores.";
- mais de 200 colunas: 400, com "A planilha passa de 200 colunas.";
- o XLSX que passa de 100 MB descompactado: 400, com "A planilha é grande demais para importar. Divida-a em partes menores.";
- o tipo inativo: 409, com "O tipo Nobreak está inativo.".

#### Scenario: Inventário em XLSX
- **WHEN** quem edita ativos envia "computadores.xlsx", com uma linha de títulos e 120 linhas de computadores, escolhendo o tipo "Computador"
- **THEN** a importação é criada com as 120 linhas e as colunas da primeira aba

#### Scenario: CSV do Excel brasileiro
- **WHEN** quem edita ativos envia um CSV em Windows-1252, separado por ponto e vírgula, com "Patrimônio;Localização"
- **THEN** a importação lê as duas colunas com os acentos certos

#### Scenario: Arquivo que não é planilha
- **WHEN** alguém envia um PDF como planilha
- **THEN** a API recusa com "Formato não aceito. Envie a planilha em XLSX ou CSV.", e nada é gravado

### Requirement: Colunas da planilha

Cada coluna da planilha SHALL ir para um campo do tipo ou para "Ignorar". Os campos oferecidos SHALL ser os campos comuns, os da organização que o tipo usa e os das capacidades ligadas, e o modelo, pelo fabricante e pelo nome. Os campos de arquivo e de imagem SHALL NOT ser oferecidos, e os campos restritos SHALL ser oferecidos só a quem tem `ativos.restritos` em algum ramo.

A importação SHALL sugerir o campo de cada coluna pelo título igual ao rótulo do campo, sem diferenciar acento, maiúsculas e espaços nas pontas, e pelos nomes conhecidos dos campos comuns, como "Série" e "Serial" para o número de série. A coluna sem sugestão SHALL ficar em "Ignorar". Quem importa SHALL poder mudar o campo de cada coluna antes da prévia.

Um campo SHALL ir para uma coluna só, com a recusa "O campo Local está em duas colunas.", e pelo menos uma coluna SHALL ir para um campo, com a recusa "Escolha o campo de pelo menos uma coluna.".

#### Scenario: Colunas pelo rótulo
- **WHEN** a planilha tem as colunas "PATRIMONIO", "Série", "IP" e "Observação", e o tipo usa o campo IP
- **THEN** as três primeiras vão para Patrimônio, Número de série e IP, e "Observação" fica em "Ignorar"

#### Scenario: Coluna ajustada
- **WHEN** quem importa muda a coluna "Setor" de "Ignorar" para Local
- **THEN** a prévia passa a ler o local de cada linha pela coluna "Setor"

### Requirement: Casamento com os ativos

Cada linha SHALL ser casada com um ativo da organização, nesta ordem:
1. pelo patrimônio;
2. sem casamento pelo patrimônio, pela série;
3. sem casamento pela série, pelo hostname.

A comparação SHALL ignorar acento, maiúsculas e os espaços nas pontas, e SHALL considerar só as colunas que a linha preenche. A linha sem casamento SHALL virar um ativo novo do tipo da importação.

A série ou o hostname de mais de um ativo SHALL recusar a linha, com "Há mais de um ativo com a série BRJ123: use o patrimônio." ou "Há mais de um ativo com o hostname IMP-01: use o patrimônio.".

A linha casada SHALL ser recusada quando o ativo:
- é de outro tipo: "O ativo PAT-00610 é do tipo Switch.";
- está inativo: "O ativo PAT-00610 está inativo: reative-o antes de importar.";
- já foi casado com uma linha anterior: "A linha 4 já muda este ativo.".

#### Scenario: Casamento pela série
- **WHEN** uma linha traz a série "BRJ123" e um patrimônio que nenhum ativo tem, e um computador tem a série "brj123"
- **THEN** a linha muda esse computador, e o patrimônio dele passa a ser o da planilha

#### Scenario: Ativo novo
- **WHEN** uma linha traz um patrimônio, uma série e um hostname que nenhum ativo tem
- **THEN** a linha cadastra um ativo novo do tipo da importação

#### Scenario: Duas linhas do mesmo ativo
- **WHEN** as linhas 4 e 9 trazem o patrimônio PAT-00412
- **THEN** a linha 4 muda o ativo, e a linha 9 é recusada com "A linha 4 já muda este ativo."

### Requirement: Valores da planilha

Cada célula SHALL ser lida pelas regras do tipo do campo (spec campos-personalizados), as mesmas da tela. As referências SHALL ser lidas pelo texto:
- **local:** pelo caminho, com "›" ou ">" entre os níveis, como "Jundiaí › Expedição", ou pelo nome, quando só um local ativo tem esse nome;
- **pessoa:** pela matrícula, pelo e-mail ou pelo nome, entre as pessoas ativas;
- **ativo**, num campo do tipo ativo: pelo patrimônio;
- **modelo:** pelo fabricante e pelo nome, como "HP LaserJet M404", ou só pelo nome, quando só um modelo ativo do tipo tem esse nome, entre os modelos ativos do tipo.

A célula vazia SHALL NOT mudar o valor guardado. A recusa SHALL dizer o que fazer:
- "Local não encontrado: Expedição." e "Há mais de um local Expedição: use o caminho, como Jundiaí › Expedição.";
- "Pessoa não encontrada: João." e "Há mais de uma pessoa com o nome João Silva: use a matrícula ou o e-mail.";
- "Ativo não encontrado: PAT-09999.";
- "Modelo não encontrado: HP LaserJet M405." e "Há mais de um modelo L3250: use o fabricante e o nome, como Epson L3250.";
- as recusas dos tipos de campo, como "Use um IP, como 192.168.0.10.".

#### Scenario: Local pelo caminho
- **WHEN** a coluna do local traz "Jundiaí > Expedição"
- **THEN** o valor é o local Expedição, dentro de Jundiaí

#### Scenario: Nome de local repetido
- **WHEN** a organização tem os locais "Jundiaí › Expedição" e "Campinas › Expedição", e a célula traz "Expedição"
- **THEN** a célula é recusada com "Há mais de um local Expedição: use o caminho, como Jundiaí › Expedição."

#### Scenario: Célula vazia
- **WHEN** a coluna do hostname está vazia na linha de um ativo que tem o hostname "IMP-01"
- **THEN** o hostname continua "IMP-01"

### Requirement: Prévia linha a linha

Antes de gravar, a importação SHALL mostrar a prévia de cada linha, pelo número dela na planilha, com:
- a ação: "Novo", "Alterar", "Sem mudança" ou "Com erro";
- o ativo casado, pelo nome e pelo patrimônio;
- cada campo que muda, pelo rótulo e pelo valor mostrado, antes → depois, com "—" no vazio;
- cada campo que a planilha mudaria e que não muda, com o motivo: "Travado" ou "Só manual";
- cada erro, com o campo e a mensagem.

A prévia SHALL mostrar os totais das ações e SHALL filtrar as linhas por ação. Ela SHALL valer o escopo e os restritos da conta (spec cadastro-de-ativos), linha a linha:
- a linha de um ativo, ou com um local, fora do `ativos.editar` da conta: "Você não edita ativos em Campinas.", e, no ativo sem local, sem `ativos.editar` na organização inteira: "Você não edita ativos sem local.";
- o campo restrito sem `ativos.restritos` no local do ativo: "Você não edita os campos restritos neste local.".

Um ativo novo SHALL ter os campos obrigatórios do tipo, com "Preencha este campo." no que faltar. A linha sem nenhum valor nas colunas escolhidas SHALL ser recusada, com "A linha não tem valor nas colunas escolhidas.".

#### Scenario: Local mudado e campo travado
- **WHEN** a planilha muda o local e o hostname da PAT-00412, e o hostname dela está travado
- **THEN** a prévia mostra a linha como "Alterar", com o Local de "Almoxarifado" para "Expedição", e o Hostname como "Travado"

#### Scenario: Erro no campo
- **WHEN** uma linha traz o IP "10.0.0"
- **THEN** a prévia mostra a linha como "Com erro", com o IP e "Use um IP, como 192.168.0.10."

#### Scenario: Só as linhas com erro
- **WHEN** quem importa filtra a prévia por "Com erro"
- **THEN** a prévia mostra só as linhas com erro, e os totais continuam os da planilha inteira

### Requirement: Aplicação na fila

"Importar" SHALL pedir confirmação, com quantos ativos ficam novos, quantos mudam e quantas linhas com erro ficam de fora, e SHALL pôr a importação na fila de tarefas (spec fila-de-tarefas). A tarefa SHALL:
- ler de novo a planilha e conferir cada linha no momento da gravação, como a prévia: uma trava ligada depois da prévia SHALL valer;
- gravar cada linha sem erro, com a origem "planilha", o momento e a conta que importou como autor, e a auditoria de cada ativo;
- não gravar nada da linha com erro;
- gravar cada linha uma vez só, mesmo quando a tarefa é interrompida e roda de novo, continuando da linha seguinte à última gravada.

Uma importação SHALL ser aplicada uma vez só. Enquanto roda, ela SHALL mostrar as linhas processadas, e, no fim, os totais (novos, alterados, sem mudança e com erro) e cada linha com erro, com as mensagens.

A tarefa que falha em todas as tentativas SHALL deixar a importação "Com falha" e SHALL entrar nas tarefas com falha como "Importação de ativos". "Tentar de novo" SHALL continuar da linha seguinte à última gravada.

#### Scenario: Importação aplicada
- **WHEN** quem importa confirma uma planilha com 100 linhas novas, 20 alteradas e 3 com erro
- **THEN** a fila cadastra os 100 ativos e muda os 20, e o resultado mostra os totais e as 3 linhas com erro

#### Scenario: Trava ligada depois da prévia
- **WHEN** alguém trava o Local da PAT-00412 depois da prévia e antes de a tarefa rodar
- **THEN** a tarefa não muda o Local da PAT-00412, e muda os outros campos da linha

#### Scenario: API reiniciada no meio
- **WHEN** a API é reiniciada depois de a tarefa gravar 60 das 120 linhas
- **THEN** a tarefa roda de novo a partir da linha 61, e nenhum ativo é cadastrado duas vezes

### Requirement: Importações da conta

Cada conta SHALL ver a lista das próprias importações, da mais nova para a mais antiga, com o nome do arquivo, o tipo, quando, a situação, em texto ("Rascunho", "Na fila", "Importando", "Concluída", "Com falha" ou "Descartada"), e os totais. A importação de outra conta SHALL NOT aparecer nem ser aberta, com 404 "Importação não encontrada.".

O rascunho, a importação ainda não aplicada, SHALL poder ser descartado. A manutenção diária SHALL descartar o rascunho com mais de 7 dias.

O conteúdo da planilha SHALL ficar guardado só até a importação terminar: depois da conclusão ou do descarte, ele SHALL ser apagado, e a importação SHALL guardar o nome do arquivo, o tipo, as colunas e os totais.

A tela aberta da importação SHALL acompanhar a tarefa sozinha, sem recarregar.

#### Scenario: Acompanhamento ao vivo
- **WHEN** Ana confirma uma importação e continua na tela dela
- **THEN** a tela mostra as linhas processadas avançando e, no fim, o resultado, sem recarregar

#### Scenario: Importação de outra conta
- **WHEN** Bruno abre o endereço de uma importação de Ana
- **THEN** a API responde 404, com "Importação não encontrada."

#### Scenario: Rascunho esquecido
- **WHEN** um rascunho fica 8 dias sem ser aplicado
- **THEN** a manutenção diária o descarta, e o conteúdo da planilha é apagado
