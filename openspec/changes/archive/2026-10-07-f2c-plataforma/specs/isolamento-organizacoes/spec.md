## ADDED Requirements

### Requirement: Infraestrutura fora das organizações

A fila de tarefas e o aviso de eventos do banco atendem todas as organizações e SHALL levar só o tipo e identificadores, nunca dados de negócio. Para eles, valem as regras abaixo:
- o trabalho de uma tarefa de uma organização SHALL rodar no contexto dessa organização;
- a API SHALL entregar cada evento só às conexões da organização dele;
- os eventos guardados para a retomada SHALL ficar numa tabela de negócio, com o isolamento por organização como as outras.

#### Scenario: Tarefa de uma organização
- **WHEN** a manutenção diária da organização A roda
- **THEN** ela só lê e apaga dados de A, mesmo que nenhuma consulta dela filtre por organização

#### Scenario: Aviso de um evento
- **WHEN** a edição de uma pessoa da organização A gera o aviso do banco
- **THEN** o aviso leva só o tipo, a organização e os identificadores, sem o nome da pessoa

## MODIFIED Requirements

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
