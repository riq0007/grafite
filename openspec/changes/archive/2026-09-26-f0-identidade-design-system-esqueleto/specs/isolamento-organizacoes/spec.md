## Purpose

Fazer da organização a raiz de todos os dados de negócio e garantir, pelo próprio banco de dados, que uma organização nunca veja nem altere os dados de outra.

## ADDED Requirements

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

#### Scenario: Tentativa de contornar o isolamento
- **WHEN** o papel da aplicação tenta desativar a política de isolamento ou ler outra organização por um caminho alternativo
- **THEN** a operação é recusada pelo banco

### Requirement: Identificadores não sequenciais e ordenáveis no tempo

Os identificadores dos registros de negócio SHALL ser não sequenciais e ordenáveis pelo momento de criação. Conhecer um identificador SHALL NOT permitir deduzir os outros.

#### Scenario: Identificador exposto
- **WHEN** o identificador de um registro aparece numa URL ou num QR code
- **THEN** não é possível obter outros identificadores somando ou subtraindo valores dele
