## MODIFIED Requirements

### Requirement: Papéis de banco separados

A aplicação SHALL se conectar ao banco com um papel que não pode desativar nem contornar o isolamento. As migrations SHALL usar um papel separado. Um teste automatizado SHALL provar que o papel da aplicação não consegue contornar o isolamento.

O backup SHALL ler o banco com um papel próprio, só de leitura, que passa por cima do isolamento só para ler o banco inteiro. Só o processo que copia o banco SHALL usar esse papel: as consultas da aplicação continuam no papel dela. Um teste automatizado SHALL provar que o papel do backup não consegue gravar.

#### Scenario: Tentativa de contornar o isolamento
- **WHEN** o papel da aplicação tenta desativar a política de isolamento ou ler outra organização por um caminho alternativo
- **THEN** a operação é recusada pelo banco

#### Scenario: Papel do backup tentando gravar
- **WHEN** o papel do backup tenta incluir, alterar ou apagar uma linha de qualquer tabela
- **THEN** a operação é recusada pelo banco

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
