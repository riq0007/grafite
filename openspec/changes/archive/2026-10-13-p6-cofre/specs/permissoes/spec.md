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

Um perfil SHALL receber só permissões do catálogo.

#### Scenario: Permissão desconhecida
- **WHEN** se tenta gravar um perfil com a permissão `ativos.excluir`, que não está no catálogo
- **THEN** a gravação é recusada com "Permissão desconhecida: ativos.excluir."

#### Scenario: Permissão incluída
- **WHEN** um perfil tem só `pessoas.editar`
- **THEN** quem o recebe também vê as pessoas, porque `pessoas.editar` inclui `pessoas.ver`

#### Scenario: Permissão nova no Administrador
- **WHEN** a organização já tinha o perfil Administrador antes de `organizacao.editar`, `tarefas.administrar`, `backup.administrar`, `catalogo.administrar`, `modelos.editar`, `ativos.ver`, `ativos.editar`, `ativos.restritos`, `coletores.administrar`, `cofre.usar` e `cofre.administrar` entrarem no catálogo
- **THEN** quem tem o Administrador passa a ter as onze, sem nenhuma mudança no perfil

#### Scenario: Visões compartilhadas
- **WHEN** uma conta tem `organizacao.editar` e `ativos.ver`
- **THEN** ela pode compartilhar uma visão dos ativos com a organização e escolhê-la como a padrão

#### Scenario: Administração do cofre sem a liberação
- **WHEN** uma conta tem `cofre.administrar`
- **THEN** ela usa o cofre, porque `cofre.administrar` inclui `cofre.usar`, mas revela só os segredos liberados a ela (spec cofre-de-segredos)
