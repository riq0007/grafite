## MODIFIED Requirements

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
| `organizacao.editar` | Definir os padrões da organização | organização | — |
| `auditoria.ver` | Consultar a auditoria | organização | — |
| `tarefas.administrar` | Ver as tarefas com falha e tentar de novo | organização | — |

Um perfil SHALL receber só permissões do catálogo.

#### Scenario: Permissão desconhecida
- **WHEN** se tenta gravar um perfil com a permissão `ativos.excluir`, que não está no catálogo
- **THEN** a gravação é recusada com "Permissão desconhecida: ativos.excluir."

#### Scenario: Permissão incluída
- **WHEN** um perfil tem só `pessoas.editar`
- **THEN** quem o recebe também vê as pessoas, porque `pessoas.editar` inclui `pessoas.ver`

#### Scenario: Permissão nova no Administrador
- **WHEN** a organização já tinha o perfil Administrador antes de `organizacao.editar` e `tarefas.administrar` entrarem no catálogo
- **THEN** quem tem o Administrador passa a ter as duas, sem nenhuma mudança no perfil

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
