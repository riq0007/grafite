## ADDED Requirements

### Requirement: Eventos da administração registrados

SHALL ser registrados, com o "antes → depois" do que mudou:
- **locais:** o cadastro, a renomeação e a mudança de tipo, o movimento, a inativação e a reativação de um local;
- **pessoas:** o cadastro, a edição, a inativação, a reativação e a anonimização de uma pessoa;
- **contas, pela administração:**
  - a criação da conta e a mudança do usuário ou da exigência dos dois passos;
  - a redefinição, a remoção dos dois passos e o desbloqueio da entrada;
  - a inativação, a reativação e o encerramento das sessões;
- **perfis e grupos:**
  - o cadastro, a edição, a inativação e a reativação de um perfil ou de um grupo;
  - a inclusão e a retirada de um membro;
- **atribuições:** a atribuição de um perfil e o encerramento dela, com o escopo.

#### Scenario: Permissão tirada de um perfil
- **WHEN** quem administra os acessos tira `locais.editar` do perfil "Técnico"
- **THEN** a auditoria registra a edição do perfil, com a lista de permissões antes e depois

#### Scenario: Atribuição registrada
- **WHEN** o "Técnico" é atribuído a Bruno em "Jundiaí"
- **THEN** a auditoria registra a atribuição, com o perfil, a conta e o escopo "Jundiaí"

### Requirement: Recusas de permissão registradas

Toda recusa por falta de permissão SHALL ser registrada, com a conta, a permissão que faltou, o método e o caminho da requisição, o IP e o código de rastreio, sem o corpo da requisição. O registro SHALL ser gravado mesmo que nada mais seja gravado na requisição.

#### Scenario: Chamada sem permissão
- **WHEN** Bruno chama a API para cadastrar um perfil sem `acessos.administrar`
- **THEN** a auditoria registra a recusa, com Bruno, `acessos.administrar` e o caminho da requisição

### Requirement: Dados pessoais depois da anonimização

A anonimização de uma pessoa SHALL NOT alterar nem apagar os registros de auditoria que já existem. Eles continuam guardados pelo prazo da retenção mínima, como prova das ações, e só quem consulta a auditoria os vê.

O registro da própria anonimização SHALL dizer quais campos foram apagados, sem os valores deles. Quem fez cada ação SHALL ser mostrado pelo nome atual da pessoa da conta, então os registros das ações da pessoa anonimizada passam a mostrar o nome anonimizado.

#### Scenario: Registro da anonimização
- **WHEN** João é anonimizado
- **THEN** a auditoria registra a anonimização, com os campos apagados e sem o nome, o e-mail, a matrícula ou o telefone de João

#### Scenario: Ações antigas da pessoa anonimizada
- **WHEN** quem consulta a auditoria vê uma entrada de João feita antes da anonimização
- **THEN** o registro continua lá, e quem fez aparece como "Pessoa anonimizada 7F3K"
