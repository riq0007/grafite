# isolamento-organizacoes Specification

## Purpose

Fazer da organização a raiz de todos os dados de negócio e garantir, pelo próprio banco de dados, que uma organização nunca veja nem altere os dados de outra.

## Requirements

### Requirement: Organização como raiz dos dados

Todo registro de negócio SHALL pertencer a exatamente uma organização. Criar uma nova organização SHALL exigir apenas o cadastro de dados, sem mudar código nem estrutura do banco.

#### Scenario: Segunda organização
- **WHEN** uma segunda organização é cadastrada
- **THEN** ela passa a existir e a operar sem nenhuma migration nem alteração de código

### Requirement: Isolamento garantido pelo banco

Uma consulta executada no contexto de uma organização SHALL retornar apenas os dados dessa organização, mesmo que a consulta não tenha nenhum filtro por organização. Uma escrita no contexto de uma organização SHALL ser recusada se tentar criar ou alterar dados de outra.

#### Scenario: Consulta sem filtro
- **WHEN** uma consulta sem filtro por organização é executada no contexto da organização A
- **THEN** só os registros da organização A são retornados

#### Scenario: Escrita cruzada
- **WHEN** no contexto da organização A se tenta gravar um registro pertencente à organização B
- **THEN** o banco recusa a gravação

### Requirement: Falha fechada sem contexto

Uma consulta a dados de negócio executada sem uma organização definida no contexto SHALL NOT retornar nenhum registro.

#### Scenario: Contexto ausente
- **WHEN** uma consulta a dados de negócio roda sem organização definida
- **THEN** o resultado é vazio

### Requirement: Papéis de banco separados

A aplicação SHALL se conectar ao banco com um papel que não pode desativar nem contornar o isolamento. As migrations SHALL usar um papel separado. Um teste automatizado SHALL provar que o papel da aplicação não consegue contornar o isolamento.

O backup SHALL ler o banco com um papel próprio, só de leitura, que passa por cima do isolamento só para ler o banco inteiro. Só o processo que copia o banco SHALL usar esse papel: as consultas da aplicação continuam no papel dela. Um teste automatizado SHALL provar que o papel do backup não consegue gravar.

#### Scenario: Tentativa de contornar o isolamento
- **WHEN** o papel da aplicação tenta desativar a política de isolamento ou ler outra organização por um caminho alternativo
- **THEN** a operação é recusada pelo banco

#### Scenario: Papel do backup tentando gravar
- **WHEN** o papel do backup tenta incluir, alterar ou apagar uma linha de qualquer tabela
- **THEN** a operação é recusada pelo banco

### Requirement: Identificadores não sequenciais e ordenáveis no tempo

Os identificadores dos registros de negócio SHALL ser não sequenciais e ordenáveis pelo momento de criação. Conhecer um identificador SHALL NOT permitir deduzir os outros.

#### Scenario: Identificador exposto
- **WHEN** o identificador de um registro aparece numa URL ou num QR code
- **THEN** não é possível obter outros identificadores somando ou subtraindo valores dele

### Requirement: Organização pelo endereço de acesso

Cada organização SHALL registrar os endereços pelos quais é acessada, e cada endereço SHALL pertencer a uma organização só. A API SHALL descobrir a organização de cada requisição pelo endereço pedido, sem diferenciar maiúsculas e sem a porta. Todo acesso a dados de negócio da requisição SHALL rodar no contexto dessa organização.

Só duas consultas SHALL atravessar organizações:
- **a descoberta:** devolve só a organização de um endereço exato, sem listar endereços nem organizações;
- **a lista das organizações para as tarefas de cada uma, como a manutenção diária:** devolve só os identificadores, sem nomes, endereços nem outros dados.

Uma requisição por um endereço desconhecido SHALL ser recusada, com "Este endereço não está ligado a nenhuma organização.". A consulta de saúde é a exceção.

#### Scenario: Endereço de uma organização
- **WHEN** uma requisição chega pelo endereço registrado pela organização A
- **THEN** ela roda no contexto da organização A e só alcança os dados de A

#### Scenario: Endereço desconhecido
- **WHEN** uma requisição de entrada chega por um endereço que nenhuma organização registrou
- **THEN** a API recusa com "Este endereço não está ligado a nenhuma organização.", e nada é consultado em nome de alguma organização

#### Scenario: Listar os endereços sem contexto
- **WHEN** o papel da aplicação consulta a tabela de endereços sem organização no contexto
- **THEN** o resultado é vazio

#### Scenario: Lista das organizações para as tarefas
- **WHEN** o papel da aplicação pede a lista das organizações para as tarefas
- **THEN** recebe só os identificadores das organizações, sem os nomes nem os endereços

#### Scenario: Saúde em qualquer endereço
- **WHEN** a consulta de saúde chega por um endereço desconhecido
- **THEN** ela responde normalmente

### Requirement: Infraestrutura fora das organizações

A fila de tarefas e o aviso de eventos do banco atendem todas as organizações e SHALL levar só o tipo e identificadores, nunca dados de negócio. Para eles, valem as regras abaixo:
- o trabalho de uma tarefa de uma organização SHALL rodar no contexto dessa organização;
- a API SHALL entregar cada evento só às conexões da organização dele;
- os eventos guardados para a retomada SHALL ficar numa tabela de negócio, com o isolamento por organização como as outras.

Os registros da operação do servidor, como os backups, os testes de restauração e os horários deles, SHALL ficar fora das organizações, sem dados de negócio. Só a organização que opera o servidor SHALL vê-los, pela tela de backup.

As tarefas do servidor, como o backup, SHALL rodar sem o contexto de uma organização. Elas SHALL NOT ler os dados das organizações, a não ser pelo processo que copia o banco, e as falhas delas SHALL ficar com a organização que opera o servidor.

#### Scenario: Tarefa de uma organização
- **WHEN** a manutenção diária da organização A roda
- **THEN** ela só lê e apaga dados de A, mesmo que nenhuma consulta dela filtre por organização

#### Scenario: Aviso de um evento
- **WHEN** a edição de uma pessoa da organização A gera o aviso do banco
- **THEN** o aviso leva só o tipo, a organização e os identificadores, sem o nome da pessoa

#### Scenario: Registros da operação noutra organização
- **WHEN** uma conta de uma organização cliente pede a lista dos backups pela API
- **THEN** a API recusa, e nenhum registro da operação é entregue
