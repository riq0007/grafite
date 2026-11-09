## MODIFIED Requirements

### Requirement: Eventos da administração registrados

SHALL ser registrados, com o "antes → depois" do que mudou:
- **locais:** o cadastro, a renomeação e a mudança de tipo, o movimento, a inativação e a reativação de um local;
- **pessoas:**
  - o cadastro, a edição, a inativação, a reativação e a anonimização de uma pessoa;
  - a troca e a remoção da foto, pela administração ou pela própria pessoa, sem a imagem;
- **contas, pela administração:**
  - a criação da conta e a mudança do usuário ou da exigência dos dois passos;
  - a redefinição, a remoção dos dois passos e o desbloqueio da entrada;
  - a inativação, a reativação e o encerramento das sessões;
- **perfis e grupos:**
  - o cadastro, a edição, a inativação e a reativação de um perfil ou de um grupo;
  - a inclusão e a retirada de um membro;
- **atribuições:** a atribuição de um perfil e o encerramento dela, com o escopo;
- **organização:** a mudança dos padrões da organização, com os ajustes que mudaram, e o ligar e o desligar de cada módulo opcional;
- **tarefas:** o "Tentar de novo" numa tarefa com falha, com a tarefa e o erro;
- **backup:** o backup pedido pela tela e a mudança do horário do backup ou do dia do teste de restauração;
- **catálogo de ativos:**
  - o cadastro, a edição, a inativação e a reativação de um tipo de ativo, com as capacidades e os campos do tipo;
  - o cadastro, a edição, a inativação e a reativação de um campo, com a configuração;
  - o cadastro, a edição, a inativação e a reativação de um modelo;
  - a troca e a remoção da imagem de um modelo, sem a imagem;
- **ativos:** o cadastro, a edição, a inativação e a reativação de um ativo, com os campos que mudaram, pelo rótulo e pelo valor mostrado, e as travas ligadas e desligadas.

As preferências que cada conta muda para si SHALL NOT ser registradas.

#### Scenario: Permissão tirada de um perfil
- **WHEN** quem administra os acessos tira `locais.editar` do perfil "Técnico"
- **THEN** a auditoria registra a edição do perfil, com a lista de permissões antes e depois

#### Scenario: Atribuição registrada
- **WHEN** o "Técnico" é atribuído a Bruno em "Jundiaí"
- **THEN** a auditoria registra a atribuição, com o perfil, a conta e o escopo "Jundiaí"

#### Scenario: Foto trocada
- **WHEN** quem edita pessoas troca a foto de João
- **THEN** a auditoria registra a troca da foto de João, com quem trocou, sem a imagem

#### Scenario: Padrões salvos
- **WHEN** quem edita a organização muda o tema padrão do Grafite para o Névoa e salva
- **THEN** a auditoria registra a mudança dos padrões, com o tema antes e depois

#### Scenario: Preferência pessoal
- **WHEN** o usuário põe o dock à esquerda nos Ajustes
- **THEN** nenhum registro de auditoria é gravado

#### Scenario: Horário do backup mudado
- **WHEN** quem administra o backup muda o horário de 02:00 para 03:30
- **THEN** a auditoria da organização que opera o servidor registra a mudança, com o horário antes e depois

#### Scenario: Local de um ativo mudado
- **WHEN** quem edita ativos muda o local da impressora PAT-00412 de "Almoxarifado" para "Expedição" e trava o Local
- **THEN** a auditoria registra a edição do ativo, com o Local antes e depois e a trava ligada

#### Scenario: Campo tirado de um tipo
- **WHEN** quem administra o catálogo tira o campo "Tensão" do tipo "Nobreak"
- **THEN** a auditoria registra a edição do tipo, com a lista de campos antes e depois
