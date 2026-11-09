## Purpose

Organizar as permissões em perfis, reunir contas em grupos e dar perfis a contas e grupos com um escopo, sem que a organização perca quem administra os acessos.

## ADDED Requirements

### Requirement: Perfis

Quem administra os acessos SHALL poder cadastrar e editar perfis. Cada perfil SHALL ter:
- um nome, único na organização, comparado sem maiúsculas, acentos nem os espaços das pontas;
- uma descrição opcional;
- as permissões do catálogo;
- "Exige verificação em dois passos", ligado ou desligado.

Um perfil SHALL poder ser inativado e reativado. O perfil inativo SHALL NOT conceder permissão nem exigir os dois passos, e as atribuições dele SHALL continuar registradas. Quem só vê os acessos SHALL ver os perfis, sem alterá-los.

#### Scenario: Cadastrar um perfil
- **WHEN** quem administra os acessos cadastra o perfil "Técnico", com `pessoas.ver` e `locais.editar`
- **THEN** o perfil passa a existir, ativo e sem atribuições

#### Scenario: Nome repetido
- **WHEN** se tenta cadastrar o perfil "tecnico" numa organização que já tem "Técnico"
- **THEN** o cadastro é recusado com "Já existe um perfil com este nome."

#### Scenario: Ver sem administrar
- **WHEN** uma conta só com `acessos.ver` abre um perfil
- **THEN** ela vê as permissões e quem tem o perfil, e a tela não oferece alteração

### Requirement: Perfil Administrador

Toda organização SHALL ter o perfil Administrador desde que é criada. Ele SHALL:
- conceder todas as permissões do catálogo, inclusive as que os módulos acrescentarem depois;
- exigir a verificação em dois passos, menos na organização de desenvolvimento;
- ser protegido: SHALL NOT ser renomeado, ter as permissões ou a exigência alteradas, nem ser inativado.

Ele SHALL poder ser atribuído e ter as atribuições encerradas, respeitando o último administrador.

#### Scenario: Alterar o Administrador
- **WHEN** se tenta tirar uma permissão do Administrador
- **THEN** a alteração é recusada com "O perfil Administrador é protegido e não muda."

#### Scenario: Permissão nova de um módulo
- **WHEN** um módulo novo acrescenta permissões ao catálogo
- **THEN** quem tem o Administrador já as tem, sem nenhuma alteração no perfil

### Requirement: Grupos

Quem administra os acessos SHALL poder cadastrar e editar grupos, com um nome único na organização e uma descrição opcional, e incluir e retirar contas. Retirar uma conta SHALL encerrar a participação dela, sem apagar o registro.

Um grupo SHALL poder ser inativado e reativado. O grupo inativo SHALL NOT passar os perfis dele aos membros.

#### Scenario: Incluir no grupo
- **WHEN** a conta de Bruno é incluída no grupo "Suporte"
- **THEN** Bruno aparece entre os membros, e os perfis do grupo passam a valer para ele

#### Scenario: Conta já no grupo
- **WHEN** se tenta incluir de novo uma conta que já participa do grupo
- **THEN** a inclusão é recusada com "Esta conta já participa do grupo."

### Requirement: Atribuições de perfil

Quem administra os acessos SHALL poder atribuir um perfil ativo a uma conta ou a um grupo, com o escopo da organização inteira ou de um local ativo. A mesma atribuição SHALL NOT existir duas vezes em vigor. Encerrar uma atribuição SHALL gravar o fim, sem apagar o registro.

Quando o perfil tem permissões que valem só para a organização inteira e o escopo é um local, a resposta SHALL listar as permissões que não valerão naquele escopo.

As atribuições SHALL aparecer:
- no perfil, com quem o tem;
- no grupo, com os perfis dele;
- no acesso da conta, separando as diretas das que vêm de um grupo.

#### Scenario: Atribuir com escopo
- **WHEN** o perfil "Técnico" é atribuído a Bruno no local "Jundiaí"
- **THEN** o acesso de Bruno mostra "Técnico — Jundiaí", atribuído direto a ele

#### Scenario: Atribuição repetida
- **WHEN** se tenta atribuir de novo o "Técnico" a Bruno em "Jundiaí"
- **THEN** a atribuição é recusada com "Esta atribuição já existe."

#### Scenario: Permissões que não valem no local
- **WHEN** um perfil com `auditoria.ver` e `locais.editar` é atribuído no local "Jundiaí"
- **THEN** a atribuição é gravada, e a resposta avisa que "Consultar a auditoria" não vale em "Jundiaí"

### Requirement: Último administrador

A organização SHALL manter sempre pelo menos uma conta ativa, de pessoa ativa, com `acessos.administrar` para a organização inteira. Toda mudança que a deixaria sem nenhuma SHALL ser recusada com "A organização ficaria sem ninguém para administrar os acessos.", sem mudar nada:
- inativar a conta ou a pessoa;
- encerrar a atribuição;
- retirar a conta do grupo;
- inativar o perfil ou o grupo;
- tirar a permissão do perfil;
- anonimizar a pessoa.

Duas mudanças ao mesmo tempo SHALL NOT conseguir, juntas, deixar a organização sem administrador.

#### Scenario: Encerrar a última atribuição
- **WHEN** Ana é a única administradora e alguém tenta encerrar a atribuição do Administrador dela
- **THEN** a mudança é recusada, e Ana continua administradora

#### Scenario: Duas retiradas ao mesmo tempo
- **WHEN** Ana e Carlos são os únicos administradores e cada um tenta, ao mesmo tempo, encerrar a atribuição do outro
- **THEN** só uma das mudanças é gravada, e a organização continua com um administrador
