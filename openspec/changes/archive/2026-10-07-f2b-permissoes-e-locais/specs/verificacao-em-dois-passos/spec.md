## RENAMED Requirements

- FROM: `### Requirement: Exigência por conta`
- TO: `### Requirement: Exigência por conta ou por perfil`

## MODIFIED Requirements

### Requirement: Exigência por conta ou por perfil

A verificação em dois passos SHALL ser exigida de uma conta quando:
- a própria conta a exige;
- ou quando a conta tem, direto ou por um grupo, uma atribuição em vigor de um perfil ativo que exige.

A conta criada com a organização SHALL exigir, e o perfil Administrador também. A exceção é a organização de desenvolvimento, criada pelo comando de desenvolvimento.

A conta que exige a verificação:
- **sem tê-la ainda,** SHALL cadastrá-la antes de qualquer outra ação. Isso vale na próxima entrada e também numa sessão já aberta, na requisição seguinte à mudança que passou a exigir;
- SHALL NOT poder desativá-la.

#### Scenario: Conta que exige, sem a verificação
- **WHEN** o usuário de uma conta que exige os dois passos entra pela primeira vez
- **THEN** a tela pede o cadastro dos dois passos antes de abrir a casca

#### Scenario: Perfil que exige, com a sessão aberta
- **WHEN** Bruno, sem os dois passos, está com a sessão aberta e recebe o perfil Administrador
- **THEN** a requisição seguinte de Bruno é recusada até ele cadastrar os dois passos

#### Scenario: Desativar quando exigida
- **WHEN** o usuário de uma conta que exige os dois passos abre a verificação na conta
- **THEN** a tela diz quem exige, como "Exigida pelo perfil Administrador", e não oferece desativar, e a API recusa a desativação

## ADDED Requirements

### Requirement: Remoção pela administração

Quem administra contas SHALL poder remover a verificação em dois passos da conta de outra pessoa, como quando ela perde o celular. A remoção SHALL apagar a chave e os códigos de recuperação e encerrar todas as sessões da conta. Se a conta continua exigindo, a próxima entrada SHALL pedir o cadastro de novo.

#### Scenario: Celular perdido
- **WHEN** quem administra contas remove os dois passos de Bruno, cujo perfil exige a verificação
- **THEN** as sessões de Bruno terminam, e a próxima entrada dele pede a senha e o cadastro de um app novo
