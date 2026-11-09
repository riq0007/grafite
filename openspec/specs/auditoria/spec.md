# auditoria Specification

## Purpose

Guardar um registro único, que só cresce, de quem fez o quê, quando e com qual efeito, gravado junto com a própria mudança, para responder a qualquer pergunta sobre o acesso e as alterações.

## Requirements

### Requirement: Registro na mesma transação

Toda alteração feita pela API ou pelo comando no servidor SHALL gravar o registro de auditoria na mesma transação do dado. Se um dos dois falha, nenhum dos dois SHALL ficar gravado.

#### Scenario: Falha ao gravar o dado
- **WHEN** a gravação de uma troca de senha falha
- **THEN** nenhum registro de auditoria dessa troca fica gravado

#### Scenario: Falha ao gravar a auditoria
- **WHEN** a gravação do registro de auditoria falha
- **THEN** a alteração também é desfeita, e a API responde com erro

### Requirement: Conteúdo do registro

Cada registro SHALL ter:
- o momento e a ação;
- quem fez: a conta, o comando no servidor ou alguém sem sessão;
- o alvo, com o tipo e o identificador;
- o "antes → depois" dos campos que mudaram;
- o endereço IP e o código de rastreio da requisição.

O registro SHALL NOT conter senha, hash, token de sessão, chave nem código de verificação.

#### Scenario: Troca de senha registrada
- **WHEN** o usuário troca a própria senha
- **THEN** a auditoria registra a troca, com a conta, o IP e o código de rastreio, sem a senha antiga nem a nova

#### Scenario: Recusa de entrada registrada
- **WHEN** alguém erra a senha do usuário "joao.silva"
- **THEN** a auditoria registra a recusa feita por alguém sem sessão, com o usuário digitado, o motivo e o IP, sem a senha

### Requirement: Eventos de acesso registrados

SHALL ser registrados:
- a entrada concluída, cada recusa com o motivo, e o início de cada bloqueio;
- o código do segundo passo recusado e o uso de um código de recuperação;
- a saída e cada sessão encerrada por uma ação, com o motivo;
- a troca da senha;
- a ativação e a desativação dos dois passos e a geração de códigos de recuperação;
- pelo comando no servidor, a criação da organização, dos endereços, das pessoas e das contas, e a redefinição de um acesso.

O motivo real de uma recusa SHALL ficar registrado, mesmo quando a tela mostra a mensagem única: credenciais, bloqueio ou conta inativa.

#### Scenario: Saída registrada
- **WHEN** o usuário sai
- **THEN** a auditoria registra o fim da sessão, com o motivo "saída", a conta, o IP e o dispositivo

#### Scenario: Recusa por conta inativa
- **WHEN** uma conta inativa tenta entrar com a senha certa
- **THEN** a tela mostra "Usuário ou senha incorretos.", e a auditoria registra o motivo "conta inativa"

### Requirement: Só inclusão

O papel com que a aplicação acessa o banco SHALL poder incluir e ler registros de auditoria, e SHALL NOT poder alterá-los nem apagá-los. Um teste automatizado SHALL provar isso.

#### Scenario: Tentativa de alterar um registro
- **WHEN** o papel da aplicação tenta alterar ou apagar um registro de auditoria
- **THEN** o banco recusa a operação

### Requirement: Retenção mínima

Os registros de auditoria SHALL ser guardados por no mínimo 5 anos, contados do momento do registro. Nenhuma rotina da aplicação SHALL apagá-los antes disso.

#### Scenario: Rotinas da aplicação
- **WHEN** qualquer rotina da aplicação ou do comando no servidor roda
- **THEN** nenhum registro de auditoria com menos de 5 anos é apagado

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
- **organização:** a mudança dos padrões da organização, com os ajustes que mudaram, inclusive a visão padrão de cada tabela, e o ligar e o desligar de cada módulo opcional;
- **visões da organização:** a criação, a edição e a remoção de uma visão compartilhada, com a tabela, o nome, as colunas, a ordenação e os filtros, pelos rótulos das colunas;
- **tarefas:** o "Tentar de novo" numa tarefa com falha, com a tarefa e o erro;
- **backup:** o backup pedido pela tela e a mudança do horário do backup ou do dia do teste de restauração;
- **catálogo de ativos:**
  - o cadastro, a edição, a inativação e a reativação de um tipo de ativo, com as capacidades, a configuração delas, como o campo de IP da disponibilidade, e os campos do tipo;
  - o cadastro, a edição, a inativação e a reativação de um campo, com a configuração;
  - o cadastro, a edição, a inativação e a reativação de um modelo;
  - a troca e a remoção da imagem de um modelo, sem a imagem;
- **ativos:**
  - o cadastro, a edição, a inativação e a reativação de um ativo, com os campos que mudaram, pelo rótulo e pelo valor mostrado, e as travas ligadas e desligadas;
  - o envio, a troca e a remoção do arquivo ou da imagem de um campo, pelo nome do arquivo, sem o conteúdo, como uma edição do campo;
  - a troca e a remoção da imagem do ativo, sem a imagem;
  - a ligação livre feita e desfeita, no registro de cada um dos dois ativos, com o outro ativo;
- **importação de ativos:**
  - a importação posta na fila, com o tipo, o nome do arquivo e o número de linhas;
  - a importação concluída, com os totais de novos, alterados, sem mudança e com erro;
  - cada ativo cadastrado e alterado por ela, como o cadastro e a edição pela tela, com a conta que importou e a importação;
- **coletores:** o cadastro, pela tela ou pelo comando no servidor, a edição do nome e das faixas, a troca do token, sem o token, a inativação e a reativação de um coletor.

As preferências e as visões que cada conta muda para si SHALL NOT ser registradas. As leituras da coleta, o estado atual dos ativos e o último contato dos coletores SHALL NOT ser registrados.

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

#### Scenario: Visão compartilhada editada
- **WHEN** quem edita a organização acrescenta a coluna "IP" à visão compartilhada "Impressoras" e salva
- **THEN** a auditoria registra a edição da visão, com as colunas antes e depois

#### Scenario: Visão pessoal
- **WHEN** Bruno salva a visão "Meus notebooks" só para ele
- **THEN** nenhum registro de auditoria é gravado

#### Scenario: Ligação livre registrada
- **WHEN** quem edita ativos liga o nobreak PAT-00700 ao switch PAT-00610
- **THEN** a auditoria registra a ligação no nobreak, com o switch, e no switch, com o nobreak

#### Scenario: Ativo alterado pela importação
- **WHEN** a importação de Ana muda o local da PAT-00412
- **THEN** a auditoria registra a edição do ativo, com Ana, o Local antes e depois e a importação

#### Scenario: PDF da nota fiscal trocado
- **WHEN** quem edita ativos troca a nota fiscal de um notebook
- **THEN** a auditoria registra a edição do campo PDF da nota fiscal, com o nome do arquivo antes e depois, sem o conteúdo

#### Scenario: Faixas de um coletor mudadas
- **WHEN** quem administra os coletores acrescenta a faixa `10.0.5.0/24` ao "Coletor de Jundiaí"
- **THEN** a auditoria registra a edição do coletor, com as faixas antes e depois

#### Scenario: Token trocado
- **WHEN** quem administra os coletores troca o token do "Coletor de Jundiaí"
- **THEN** a auditoria registra a troca, com quem trocou, sem o token antigo nem o novo

#### Scenario: Leitura da coleta
- **WHEN** o coletor manda um lote com a impressora PAT-00412 offline
- **THEN** nenhum registro de auditoria é gravado

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

### Requirement: Eventos do cofre registrados

SHALL ser registrados, na auditoria da organização:
- o cadastro, a edição dos dados, com o "antes → depois", a inativação e a reativação de um segredo;
- a troca do valor de um segredo, sem o valor antigo nem o novo;
- a mudança do acesso de um segredo, com as contas, os grupos e os perfis antes e depois;
- a liberação do cofre numa sessão, com até quando ela vale;
- cada revelação e cada cópia de um segredo, com a conta, o segredo e a origem;
- a recusa de liberar o cofre, com o código errado, e a de revelar ou copiar, com o motivo, como o cofre fechado, o segredo inativo ou o segredo não liberado;
- a troca da chave mestra, pelo comando no servidor, com quantos segredos ela cifrou de novo.

Nenhum registro SHALL levar o valor de um segredo, a chave de um segredo, a chave mestra nem o código digitado.

#### Scenario: Revelação na auditoria
- **WHEN** Bruno revela a senha do "Switch do CPD"
- **THEN** a auditoria registra a revelação, com Bruno, o segredo e o IP, e o registro não tem a senha

#### Scenario: Código errado
- **WHEN** Bruno digita um código errado para liberar o cofre
- **THEN** a auditoria registra a recusa, sem o código digitado

#### Scenario: Acesso mudado
- **WHEN** quem administra o cofre tira o grupo "Suporte" do acesso do "Switch do CPD"
- **THEN** a auditoria registra a mudança do acesso, com o "Suporte" antes e sem ele depois

### Requirement: Eventos dos alertas registrados

SHALL ser registrados, na auditoria da organização:
- o cadastro, a edição, com o "antes → depois", a inativação e a reativação de uma regra de alerta, também das regras de fábrica criadas para uma organização;
- o reconhecimento de um alerta;
- o adiamento de um alerta, com até quando;
- o silêncio dos alertas de um ativo, com até quando e o motivo, e a retomada.

A abertura, a mudança do texto, a resolução e o encerramento de um alerta pelo motor SHALL NOT ser registrados na auditoria: o próprio alerta guarda quando abriu, quando terminou e como.

#### Scenario: Limite da regra mudado
- **WHEN** quem administra os alertas muda o limite do "Toner em 10% ou menos" de 10 para 15
- **THEN** a auditoria registra a edição da regra, com o limite "10 → 15"

#### Scenario: Alerta adiado
- **WHEN** Ana adia o alerta "Offline" do switch por 30 minutos
- **THEN** a auditoria registra o adiamento, com Ana, o alerta e até quando

#### Scenario: Alerta aberto pelo motor
- **WHEN** o motor abre o alerta do toner de uma impressora
- **THEN** nenhum registro entra na auditoria, e o alerta guarda quando abriu

### Requirement: Meta de indicador registrada

A mudança da meta de um indicador, dos alertas (spec indicadores) ou da operação (spec indicadores-da-operacao), SHALL ser registrada na auditoria da organização, com quem mudou, o indicador e o "antes → depois", como "2 dias → 1 dia". A avaliação diária dos indicadores e a notificação do indicador fora da meta SHALL NOT ser registradas na auditoria.

#### Scenario: Meta do toner mudada
- **WHEN** Ana muda a meta do tempo de atendimento do toner de 2 dias para 1 dia
- **THEN** a auditoria registra a mudança da meta, com Ana, o indicador e "2 dias → 1 dia"

#### Scenario: Meta das OS repetidas mudada
- **WHEN** Ana muda a meta das OS repetidas de 2 OS para 3 OS
- **THEN** a auditoria registra a mudança da meta, com Ana, o indicador e "2 OS → 3 OS"

#### Scenario: Avaliação diária
- **WHEN** a avaliação das 07:00 encontra o toner fora da meta e notifica quem administra os alertas
- **THEN** nenhum registro entra na auditoria

### Requirement: Eventos dos fornecedores registrados

SHALL ser registrados, na auditoria da organização, o cadastro, a edição, com o "antes → depois", a inativação e a reativação de um fornecedor, e a criação dos fornecedores a partir do texto dos ativos, pelo sistema, na atualização (spec cadastro-de-ativos).

#### Scenario: CNPJ informado depois
- **WHEN** Ana informa o CNPJ da "HP Brasil", criada sem ele
- **THEN** a auditoria registra a edição, com o CNPJ "vazio → 12.345.678/0001-95"

### Requirement: Eventos dos consumíveis registrados

SHALL ser registrados, na auditoria da organização, o cadastro, a edição, com o "antes → depois", a inativação e a reativação de um consumível. Na edição, os fornecedores e os modelos SHALL aparecer pelo nome, antes e depois.

#### Scenario: Modelo incluído
- **WHEN** Ana inclui a "HP LaserJet M428" no "CF258A", que já servia na "HP LaserJet M404"
- **THEN** a auditoria registra a edição do CF258A, com os modelos "HP LaserJet M404" antes e "HP LaserJet M404" e "HP LaserJet M428" depois

### Requirement: Eventos do estoque registrados

SHALL ser registrados, na auditoria da organização:
- cada movimentação lançada no estoque, com o tipo, o consumível, a quantidade, os locais e o detalhe do tipo: o fornecedor e a nota, o ativo e o contador de páginas, ou o motivo;
- cada mudança do mínimo de um consumível num local, com o "antes → depois".

#### Scenario: Saída registrada
- **WHEN** Ana lança a saída de 1 CF258A do Almoxarifado para a PAT-00412
- **THEN** a auditoria registra a saída, com o CF258A, a quantidade 1, o Almoxarifado, a PAT-00412, quem lançou e quando

#### Scenario: Mínimo mudado
- **WHEN** Ana muda o mínimo do CF258A no Almoxarifado de 5 para 8
- **THEN** a auditoria registra a mudança, com 5 antes e 8 depois

### Requirement: Eventos das solicitações registrados

SHALL ser registrados, na auditoria da organização, o registro, a alteração, o pedido ao fornecedor, a entrega, a mudança da situação, a conclusão e o cancelamento de uma solicitação, com o número, o tipo, quem pediu e o "antes → depois" do que mudou. A entrega do estoque SHALL ter também o registro da saída (spec estoque), e cada solicitação de um lote SHALL ter o próprio registro.

#### Scenario: Toner registrado
- **WHEN** Carla registra a solicitação 42, um Toner pedido por Joana Prado para a PAT-00412
- **THEN** a auditoria registra a 42, com o tipo, Joana Prado, a PAT-00412 e o item, quem registrou e quando

#### Scenario: Solicitação pelo número na auditoria
- **WHEN** alguém consulta a auditoria da mudança de situação da solicitação 45, um Conserto pedido por Joana Prado
- **THEN** o alvo do registro diz "Solicitação: 45 · Conserto · Joana Prado", como a solicitação está agora

#### Scenario: Lote na auditoria
- **WHEN** Carla muda três solicitações para Em atendimento num lote
- **THEN** a auditoria tem um registro para cada uma, com a situação antes e depois

### Requirement: Eventos das ordens de serviço registrados

SHALL ser registrados, na auditoria da organização, a abertura, a correção do problema e do fornecedor, a mudança da situação, com o fornecedor, a peça lançada, a resolução, a reabertura e o encerramento de uma ordem de serviço, com o número, o ativo e o "antes → depois" do que mudou. A peça do estoque SHALL ter também o registro da saída (spec estoque), a OS aberta pela solicitação SHALL ter também o registro da mudança da solicitação, e cada OS de um lote SHALL ter o próprio registro. O alvo SHALL ser a OS, com o nome como ela está agora, como "12 · NB-0031 · Não liga".

#### Scenario: OS aberta
- **WHEN** Carla abre a OS 12 no NB-0031, com o problema "Não liga"
- **THEN** a auditoria registra a 12, com o NB-0031 e o problema, quem abriu e quando

#### Scenario: OS pela solicitação na auditoria
- **WHEN** Carla abre a OS da solicitação 43
- **THEN** a auditoria tem o registro da abertura da OS e o da solicitação 43, que passou a Em atendimento, com a OS
