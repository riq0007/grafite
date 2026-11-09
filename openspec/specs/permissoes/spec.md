# permissoes Specification

## Purpose

Definir no sistema o catálogo de permissões e resolver o acesso efetivo de cada conta, com o escopo por ramo da árvore de locais, a recusa por padrão na API, o acesso conhecido pela tela e a quem pedir acesso.

## Requirements

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
| `fornecedores.ver` | Ver os fornecedores | organização | — |
| `fornecedores.editar` | Cadastrar e editar os fornecedores, inativar e reativar | organização | `fornecedores.ver` |
| `organizacao.editar` | Definir os padrões, as visões compartilhadas e os módulos da organização | organização | — |
| `auditoria.ver` | Consultar a auditoria | organização | — |
| `tarefas.administrar` | Ver as tarefas com falha e tentar de novo | organização | — |
| `backup.administrar` | Ver os backups, fazer um backup na hora e mudar o horário (só na organização que opera o servidor) | organização | — |
| `catalogo.administrar` | Cadastrar e editar os tipos de ativo e os campos, inativar e reativar | organização | — |
| `modelos.editar` | Cadastrar e editar os modelos de equipamento e a imagem deles, inativar e reativar | organização | — |
| `ativos.ver` | Ver os ativos | local (pelo local do ativo) | — |
| `ativos.editar` | Cadastrar e editar os ativos, travar os campos, inativar e reativar | local | `ativos.ver` |
| `ativos.restritos` | Ver os campos restritos dos ativos e, com a edição, editá-los | local | `ativos.ver` |
| `coletores.administrar` | Cadastrar e editar os coletores e as faixas de rede deles, trocar o token, inativar e reativar | organização | — |
| `cofre.usar` | Abrir o cofre e revelar e copiar os segredos liberados à conta | organização | — |
| `cofre.administrar` | Cadastrar e editar os segredos, trocar o valor, dar e tirar o acesso, inativar e reativar | organização | `cofre.usar` |
| `alertas.ver` | Ver os alertas | local (pelo local do ativo) | — |
| `alertas.tratar` | Reconhecer e adiar os alertas e silenciar os alertas de um ativo | local | `alertas.ver` |
| `alertas.administrar` | Cadastrar e editar as regras de alerta, inativar e reativar, e mudar as metas dos indicadores | organização | `alertas.ver` |
| `consumiveis.ver` | Ver os consumíveis | organização | — |
| `consumiveis.editar` | Cadastrar e editar os consumíveis, com os fornecedores e os modelos compatíveis, inativar e reativar | organização | `consumiveis.ver` |
| `estoque.ver` | Ver o estoque e as movimentações | local (pelo local do estoque) | — |
| `estoque.movimentar` | Lançar as entradas, as saídas, as transferências e os ajustes do estoque e definir o mínimo | local | `estoque.ver` |
| `solicitacoes.ver` | Ver as solicitações | local (pelos locais da solicitação) | — |
| `solicitacoes.atender` | Registrar e alterar as solicitações, pedir ao fornecedor, entregar, concluir, cancelar e mudar a situação | local | `solicitacoes.ver` |
| `ordens.ver` | Ver as ordens de serviço | local (pelo local da OS) | — |
| `ordens.atender` | Abrir e corrigir as ordens de serviço, mudar a situação, informar o fornecedor, lançar as peças, resolver, reabrir e encerrar | local | `ordens.ver` |
| `operacao.administrar` | Mudar as metas dos indicadores da operação e receber o aviso de fora da meta | organização | `ordens.ver`, `estoque.ver` |

Um perfil SHALL receber só permissões do catálogo.

#### Scenario: Permissão desconhecida
- **WHEN** se tenta gravar um perfil com a permissão `ativos.excluir`, que não está no catálogo
- **THEN** a gravação é recusada com "Permissão desconhecida: ativos.excluir."

#### Scenario: Permissão incluída
- **WHEN** um perfil tem só `pessoas.editar`
- **THEN** quem o recebe também vê as pessoas, porque `pessoas.editar` inclui `pessoas.ver`

#### Scenario: Permissão nova no Administrador
- **WHEN** a organização já tinha o perfil Administrador antes de `organizacao.editar`, `tarefas.administrar`, `backup.administrar`, `catalogo.administrar`, `modelos.editar`, `ativos.ver`, `ativos.editar`, `ativos.restritos`, `coletores.administrar`, `cofre.usar`, `cofre.administrar`, `alertas.ver`, `alertas.tratar`, `alertas.administrar`, `fornecedores.ver`, `fornecedores.editar`, `consumiveis.ver`, `consumiveis.editar`, `estoque.ver`, `estoque.movimentar`, `solicitacoes.ver`, `solicitacoes.atender`, `ordens.ver`, `ordens.atender` e `operacao.administrar` entrarem no catálogo
- **THEN** quem tem o Administrador passa a ter as vinte e cinco, sem nenhuma mudança no perfil

#### Scenario: Visões compartilhadas
- **WHEN** uma conta tem `organizacao.editar` e `ativos.ver`
- **THEN** ela pode compartilhar uma visão dos ativos com a organização e escolhê-la como a padrão

#### Scenario: Administração do cofre sem a liberação
- **WHEN** uma conta tem `cofre.administrar`
- **THEN** ela usa o cofre, porque `cofre.administrar` inclui `cofre.usar`, mas revela só os segredos liberados a ela (spec cofre-de-segredos)

#### Scenario: Tratar os alertas de um local
- **WHEN** uma conta tem `alertas.tratar` só em Campinas
- **THEN** ela vê e trata os alertas dos ativos de Campinas, porque `alertas.tratar` inclui `alertas.ver`, e não vê os de outros locais

#### Scenario: Metas dos indicadores
- **WHEN** uma conta tem `alertas.administrar`
- **THEN** ela muda as metas dos indicadores da organização (spec indicadores), além das regras de alerta

#### Scenario: Movimentar o estoque de um local
- **WHEN** uma conta tem `estoque.movimentar` só em Jundiaí
- **THEN** ela vê e movimenta o estoque dos locais de Jundiaí, porque `estoque.movimentar` inclui `estoque.ver`, e não vê o de outros locais

#### Scenario: Atender as solicitações de um local
- **WHEN** uma conta tem `solicitacoes.atender` só em Jundiaí
- **THEN** ela vê e atende as solicitações de Jundiaí, porque `solicitacoes.atender` inclui `solicitacoes.ver`, e não vê as de outros locais

#### Scenario: Atender as OS de um local
- **WHEN** uma conta tem `ordens.atender` só em Jundiaí
- **THEN** ela vê e atende as OS dos ativos de Jundiaí, porque `ordens.atender` inclui `ordens.ver`, e não vê as de outros locais

#### Scenario: Administrar a operação
- **WHEN** uma conta tem só `operacao.administrar`
- **THEN** ela vê as OS e o estoque da organização inteira, porque `operacao.administrar` inclui `ordens.ver` e `estoque.ver`, e muda as metas dos indicadores da operação (spec indicadores-da-operacao), sem atender as OS nem movimentar o estoque

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

A tela SHALL consultar o acesso de novo e passar a esconder o que deixou de valer:
- quando chega o aviso de que os acessos da organização mudaram, em até 5 s, sem esperar uma ação;
- quando a API recusa por falta de permissão.

#### Scenario: Perfil retirado com a tela aberta
- **WHEN** o perfil de Bruno é retirado enquanto ele está na lista de pessoas
- **THEN** em até 5 s, sem uma ação de Bruno, o item Pessoas some do menu de Administração e a tela da lista diz "Você não tem acesso a Pessoas."

#### Scenario: Recusa antes do aviso
- **WHEN** o perfil de Bruno é retirado e, antes de o aviso chegar, ele tenta cadastrar uma pessoa
- **THEN** a tela mostra a recusa, com a quem pedir acesso, e o item Pessoas some do menu de Administração

### Requirement: A quem pedir acesso

Quando a conta não pode ver uma tela ou fazer uma ação, a tela SHALL dizer a quem pedir acesso, com os nomes de até 3 pessoas ativas que administram os acessos da organização inteira.

#### Scenario: Tela sem permissão
- **WHEN** uma conta sem `auditoria.ver` abre o endereço da auditoria
- **THEN** a tela diz "Você não tem acesso à Auditoria." e "Peça acesso a Ana Souza ou Carlos Lima."
