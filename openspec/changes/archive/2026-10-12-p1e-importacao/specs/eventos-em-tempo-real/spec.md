## MODIFIED Requirements

### Requirement: Evento de saída gravado com a mudança

Toda mudança que a API ou o comando no servidor grava, e que uma tela mostra, SHALL gravar um evento de saída na mesma transação do dado. Se um dos dois falha, nenhum dos dois SHALL ficar gravado.

O evento SHALL levar só:
- o tipo;
- o momento;
- o alvo, com o tipo e o identificador.

Ele SHALL NOT levar nomes, textos nem outros dados pessoais.

Os tipos de evento SHALL ser:

| Tipo | Quando | Quem recebe |
|---|---|---|
| `pessoas.mudaram` | uma pessoa, a conta dela ou a foto dela mudou | quem vê pessoas no escopo do local de trabalho dela, o de antes e o de depois da mudança, e a própria conta da pessoa |
| `locais.mudaram` | um local mudou | toda sessão da organização |
| `acessos.mudaram` | um perfil, um grupo, um membro de grupo ou uma atribuição mudou | toda sessão da organização |
| `padroes.mudaram` | os padrões da organização mudaram | toda sessão da organização |
| `preferencias.mudaram` | as preferências de uma conta mudaram | as sessões dessa conta |
| `sessao.encerrada` | uma sessão foi encerrada por uma ação | a própria sessão |
| `tarefas.mudaram` | uma tarefa com falha entrou na lista ou foi repetida | quem administra as tarefas |
| `operacao.mudou` | um backup ou um teste de restauração terminou, ou o horário deles mudou | quem administra o backup, na organização que opera o servidor |
| `catalogo.mudou` | um tipo de ativo, um campo, um modelo ou a imagem de um modelo mudou | toda sessão da organização |
| `ativos.mudaram` | um ativo mudou | quem vê ativos no escopo do local do ativo, o de antes e o de depois da mudança |
| `modulos.mudaram` | um módulo opcional foi ligado ou desligado | toda sessão da organização |
| `visoes.mudaram` | uma visão de tabela foi criada, mudada ou removida | na visão da organização, toda sessão da organização; na visão de uma conta, as sessões dessa conta |
| `importacoes.mudaram` | uma importação de ativos foi criada, descartada, posta na fila, avançou, terminou ou falhou | as sessões da conta que importou |

Um tipo novo SHALL entrar nessa tabela, com quem o recebe, antes de ser gravado.

#### Scenario: Falha depois do evento
- **WHEN** a edição de uma pessoa grava o evento e a transação falha depois
- **THEN** nem a edição nem o evento ficam gravados, e nenhuma tela recebe o aviso

#### Scenario: Evento sem dados pessoais
- **WHEN** o nome de João é trocado
- **THEN** o evento gravado traz o tipo `pessoas.mudaram` e o identificador de João, sem o nome antigo nem o novo

#### Scenario: Mudança pelo comando no servidor
- **WHEN** o comando no servidor cria uma conta enquanto a lista de pessoas está aberta na web
- **THEN** a lista mostra a conta nova, sem uma ação do usuário

#### Scenario: Backup terminado com a tela aberta
- **WHEN** um backup termina enquanto a tela de backup está aberta
- **THEN** a tela mostra o backup novo, sem uma ação do usuário

#### Scenario: Modelo cadastrado com a tela aberta
- **WHEN** um modelo é cadastrado enquanto a tela de modelos está aberta em outra sessão
- **THEN** a tela mostra o modelo novo, sem uma ação do usuário

#### Scenario: Ativo mudado de local
- **WHEN** um ativo passa de "Jundiaí" para "Campinas"
- **THEN** recebem o evento quem vê ativos em Jundiaí e quem vê ativos em Campinas, e quem vê só os ativos de outra unidade não recebe

#### Scenario: Importação avançando
- **WHEN** a tarefa da importação de Ana grava mais linhas
- **THEN** recebem o evento `importacoes.mudaram` só as sessões de Ana

#### Scenario: Visão de uma conta
- **WHEN** Bruno salva a visão "Meus notebooks" só para ele
- **THEN** recebem o evento só as sessões de Bruno, e o nome da visão não vai no evento


### Requirement: Telas atualizadas sozinhas

Ao receber um evento, a web SHALL atualizar as consultas que os módulos declararam para o tipo dele. As listas e as fichas abertas SHALL mostrar a mudança em até 5 s depois do commit, sem uma ação do usuário. Numa rajada de eventos, como a de uma importação, cada consulta SHALL ser relida uma vez por vez: a releitura em andamento termina antes da próxima, que começa depois do último evento recebido, e nenhuma releitura é cortada por um evento novo. Um formulário em edição SHALL NOT perder o que foi digitado quando o registro dele muda em outro lugar. Um diálogo aberto SHALL NOT fechar quando a releitura muda o registro dele, nem mesmo pelo evento da própria ação que o diálogo mostra, como a senha temporária, que não aparece de novo.

A casca SHALL tratar os eventos que são dela:
- **`acessos.mudaram`:** consulta de novo o acesso da conta e passa a esconder o que deixou de valer;
- **`padroes.mudaram` e `preferencias.mudaram`:** aplica as preferências novas;
- **`sessao.encerrada`:** mostra a tela de entrada por cima da casca.

#### Scenario: Ficha aberta
- **WHEN** Carla está com a ficha de João aberta, e Ana troca o telefone dele
- **THEN** a ficha de Carla mostra o telefone novo em até 5 s

#### Scenario: Formulário em edição
- **WHEN** Carla está editando o nome de João, e Ana troca o telefone dele
- **THEN** o nome que Carla digitou continua no formulário

#### Scenario: Senha temporária à vista
- **WHEN** Ana cria a conta de João, e o evento da criação relê a ficha dele na tela dela
- **THEN** a senha temporária continua no diálogo até Ana fechá-lo

#### Scenario: Importação com a lista aberta
- **WHEN** uma importação muda 2.000 ativos enquanto Bruno está com a lista dos ativos aberta
- **THEN** a lista de Bruno é relida uma vez por vez durante a importação e, no fim, mostra os ativos importados em até 5 s depois da última gravação

#### Scenario: Perfil retirado
- **WHEN** o perfil que dá `auditoria.ver` a Bruno é retirado enquanto ele está na casca
- **THEN** em até 5 s, Auditoria some do menu de Administração de Bruno, sem uma ação dele

