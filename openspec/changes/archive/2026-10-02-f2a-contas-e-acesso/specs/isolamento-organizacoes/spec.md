## ADDED Requirements

### Requirement: Organização pelo endereço de acesso

Cada organização SHALL registrar os endereços pelos quais é acessada, e cada endereço SHALL pertencer a uma organização só. A API SHALL descobrir a organização de cada requisição pelo endereço pedido, sem diferenciar maiúsculas e sem a porta. Todo acesso a dados de negócio da requisição SHALL rodar no contexto dessa organização.

A descoberta SHALL ser a única consulta que atravessa organizações. Ela SHALL devolver só a organização de um endereço exato, sem listar endereços nem organizações.

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

#### Scenario: Saúde em qualquer endereço
- **WHEN** a consulta de saúde chega por um endereço desconhecido
- **THEN** ela responde normalmente
