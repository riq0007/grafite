## Purpose

Decidir o que cada conta pode fazer, e onde, a partir dos perfis que ela recebe, negando tudo o que não foi concedido, na API e na tela, e registrando cada recusa.

## ADDED Requirements

### Requirement: Catálogo de permissões

As permissões SHALL ser definidas pelo sistema, e não pela organização. Cada uma SHALL ter:
- uma chave, como `pessoas.editar`;
- uma descrição em pt-BR;
- a indicação de que aceita escopo de local ou vale só para a organização inteira;
- as permissões que ela inclui.

Cada módulo SHALL acrescentar as próprias permissões ao catálogo. Neste momento, o catálogo SHALL ter:

| Chave | Descrição | Escopo | Inclui |
|---|---|---|---|
| `pessoas.ver` | Ver pessoas e contas | local (pelo local de trabalho) | — |
| `pessoas.editar` | Cadastrar e editar pessoas, inativar e reativar | local | `pessoas.ver` |
| `pessoas.anonimizar` | Anonimizar pessoas inativas | organização | `pessoas.ver` |
| `contas.administrar` | Criar contas, redefinir a senha e os dois passos, desbloquear, inativar, reativar e encerrar sessões | organização | `pessoas.ver` |
| `acessos.ver` | Ver perfis, grupos e o acesso de cada conta | organização | `pessoas.ver` |
| `acessos.administrar` | Criar e editar perfis e grupos e atribuir perfis | organização | `acessos.ver` |
| `locais.editar` | Cadastrar, renomear, mover, inativar e reativar locais | local | — |
| `auditoria.ver` | Consultar a auditoria | organização | — |

Um perfil SHALL receber só permissões do catálogo.

#### Scenario: Permissão desconhecida
- **WHEN** se tenta gravar um perfil com a permissão `ativos.excluir`, que não está no catálogo
- **THEN** a gravação é recusada com "Permissão desconhecida: ativos.excluir."

#### Scenario: Permissão incluída
- **WHEN** um perfil tem só `pessoas.editar`
- **THEN** quem o recebe também vê as pessoas, porque `pessoas.editar` inclui `pessoas.ver`

### Requirement: Acesso efetivo de uma conta

O acesso efetivo de uma conta SHALL ser a soma das permissões dos perfis ativos atribuídos a ela, direto ou por um grupo ativo de que ela participa, com as atribuições em vigor. Uma conta inativa, ou de uma pessoa inativa, SHALL NOT ter acesso nenhum. Uma mudança em perfis, grupos ou atribuições SHALL valer a partir da requisição seguinte da conta.

#### Scenario: Perfil pelo grupo
- **WHEN** o grupo "Suporte" tem o perfil "Técnico" e Bruno passa a participar do grupo
- **THEN** a requisição seguinte de Bruno já tem as permissões do "Técnico"

#### Scenario: Participação encerrada
- **WHEN** Bruno sai do grupo "Suporte" e não tem o "Técnico" de outra forma
- **THEN** a requisição seguinte dele já não tem as permissões do "Técnico"

#### Scenario: Perfil inativado
- **WHEN** o perfil "Técnico" é inativado
- **THEN** nenhuma conta continua com as permissões dele, e as atribuições dele continuam registradas

### Requirement: Escopo por ramo da árvore de locais

Cada atribuição SHALL valer para a organização inteira ou para o ramo de um local: o próprio local e tudo o que está dentro dele.
- **Permissão que aceita escopo de local:** num ramo, ela SHALL valer só para os registros cujo local fica nesse ramo. Um registro sem local SHALL ser alcançado só por uma atribuição para a organização inteira.
- **Permissão que vale só para a organização inteira:** ela SHALL NOT valer numa atribuição com escopo de local.

#### Scenario: Pessoas de um ramo
- **WHEN** Bruno vê pessoas só no ramo "Jundiaí"
- **THEN** a lista mostra as pessoas com o local de trabalho em "Jundiaí" ou dentro dele, e não mostra as de outras unidades nem as sem local de trabalho

#### Scenario: Permissão só da organização num ramo
- **WHEN** um perfil com `auditoria.ver` é atribuído a Bruno só no ramo "Jundiaí"
- **THEN** Bruno continua sem acesso à auditoria

### Requirement: Negado por padrão na API

Toda rota da API SHALL declarar a permissão que exige. As exceções SHALL ser só as rotas da própria sessão e da própria conta e a leitura da árvore de locais, que exigem só a sessão. Uma rota que lê ou altera um registro com local SHALL conferir também o escopo desse registro.

Sem a permissão, a API SHALL responder 403 sem executar nada, com "Você não tem permissão para <descrição da permissão>." e os nomes de até 3 pessoas que administram os acessos da organização. Um teste automatizado SHALL reprovar uma rota nova que não declare a permissão.

#### Scenario: Chamada direta sem permissão
- **WHEN** uma conta sem `pessoas.editar` chama direto a API para cadastrar uma pessoa
- **THEN** a API responde 403 com "Você não tem permissão para cadastrar e editar pessoas, inativar e reativar.", e nenhuma pessoa é criada

#### Scenario: Registro fora do escopo
- **WHEN** quem edita pessoas só em "Jundiaí" tenta editar uma pessoa de outra unidade
- **THEN** a API responde 403, e a pessoa não muda

#### Scenario: Rota sem permissão declarada
- **WHEN** uma rota nova entra na API sem declarar a permissão nem estar entre as exceções
- **THEN** o teste automatizado das rotas falha

### Requirement: Acesso conhecido pela tela

O estado da sessão SHALL trazer o acesso efetivo da conta, com o escopo de cada permissão, para a tela esconder o que a conta não pode. Cada registro devolvido pela API SHALL dizer quais ações a conta pode fazer com ele.

Quando a API recusa por falta de permissão, a tela SHALL consultar o acesso de novo e passar a esconder o que deixou de valer.

#### Scenario: Perfil retirado com a tela aberta
- **WHEN** o perfil de Bruno é retirado enquanto ele está na lista de pessoas e ele tenta cadastrar uma pessoa
- **THEN** a tela mostra a recusa, com a quem pedir acesso, e o item Pessoas some do menu de Administração

### Requirement: A quem pedir acesso

Quando a conta não pode ver uma tela ou fazer uma ação, a tela SHALL dizer a quem pedir acesso, com os nomes de até 3 pessoas ativas que administram os acessos da organização inteira.

#### Scenario: Tela sem permissão
- **WHEN** uma conta sem `auditoria.ver` abre o endereço da auditoria
- **THEN** a tela diz "Você não tem acesso à Auditoria." e "Peça acesso a Ana Souza ou Carlos Lima."
