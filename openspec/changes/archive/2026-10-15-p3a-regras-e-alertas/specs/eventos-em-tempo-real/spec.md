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
| `disponibilidade.mudou` | a situação da disponibilidade de um ativo mudou, como de online para offline | quem vê ativos no escopo do local do ativo |
| `coletores.mudaram` | um coletor foi cadastrado, editado, teve o token trocado, foi inativado ou reativado | quem administra os coletores |
| `cofre.mudou` | um segredo foi cadastrado, editado, teve o valor ou o acesso mudado, foi inativado ou reativado | quem usa o cofre |
| `alertas.mudaram` | um alerta abriu, mudou de texto ou de severidade, foi reconhecido, adiado ou voltou do adiamento, se resolveu ou foi encerrado; os alertas de um ativo foram silenciados ou retomados; uma regra de alerta mudou | quem vê alertas no escopo do local do ativo; no alerta de um coletor, quem os vê na organização inteira; na mudança de uma regra, quem vê alertas |

Uma leitura que só confirma a situação de antes SHALL NOT gravar evento: a idade do dado avança sozinha na tela (spec leituras-e-estado). O último contato de um coletor também SHALL NOT gravar evento. A liberação do cofre, a revelação e a cópia de um segredo SHALL NOT gravar evento, e o evento do cofre SHALL NOT levar o valor de nenhum segredo. A avaliação dos alertas que não muda nada que a tela mostra SHALL NOT gravar evento, e o evento dos alertas SHALL NOT levar o texto do alerta.

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

#### Scenario: Impressora que caiu
- **WHEN** um lote traz a leitura offline de uma impressora de Jundiaí que estava online
- **THEN** quem vê ativos em Jundiaí recebe o evento `disponibilidade.mudou`, com o identificador da impressora

#### Scenario: Leitura que confirma a situação
- **WHEN** um lote traz a leitura online de uma impressora que já estava online
- **THEN** nenhum evento é gravado, e o estado atual passa a ter o momento da leitura nova

#### Scenario: Segredo liberado a outra conta
- **WHEN** quem administra o cofre libera o "Switch do CPD" ao grupo "Suporte"
- **THEN** quem usa o cofre recebe o evento `cofre.mudou`, com o identificador do segredo, sem o nome nem o valor

#### Scenario: Alerta aberto
- **WHEN** abre o alerta do toner de uma impressora de Jundiaí
- **THEN** quem vê alertas em Jundiaí recebe o evento `alertas.mudaram`, sem o texto do alerta, e quem vê só os alertas de Campinas não recebe

#### Scenario: Avaliação sem mudança
- **WHEN** a avaliação do minuto acha os mesmos alertas, com os mesmos textos
- **THEN** nenhum evento é gravado
