# eventos-em-tempo-real Specification

## Purpose

Levar às telas abertas, em tempo real, o aviso de que um registro mudou: o evento gravado com a mudança, o aviso depois do commit e a conexão que retoma de onde parou. Cada conta recebe só o que pode ver, e as listas e as fichas se atualizam sozinhas.

## Requirements

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
| `notificacoes.mudaram` | uma notificação de uma conta foi gravada ou lida | as sessões dessa conta |
| `fornecedores.mudaram` | um fornecedor foi cadastrado, editado, inativado ou reativado | toda sessão da organização |
| `consumiveis.mudaram` | um consumível foi cadastrado, editado, inclusive nos fornecedores e nos modelos, inativado ou reativado | toda sessão da organização |
| `estoque.mudou` | uma movimentação foi lançada no estoque, ou o mínimo de um consumível num local mudou | quem vê o estoque no escopo dos locais da mudança, a origem e o destino |
| `solicitacoes.mudaram` | uma solicitação foi registrada, alterada, pedida ao fornecedor, entregue, concluída, cancelada ou mudou de situação | quem vê as solicitações no escopo dos locais dela, os de antes e os de depois da mudança |
| `ordens.mudaram` | uma ordem de serviço foi aberta, teve o problema corrigido, mudou de situação, ganhou uma peça, foi resolvida, reaberta ou encerrada | quem vê as OS no escopo do local dela |
| `metas.mudaram` | a meta de um indicador mudou, dos alertas (spec indicadores) ou da operação (spec indicadores-da-operacao) | quem vê aquele indicador: quem vê alertas, nos dos alertas; quem vê as OS, no tempo de resolução e nas OS repetidas; quem vê o estoque, nas páginas por toner |

Uma leitura que só confirma a situação de antes SHALL NOT gravar evento: a idade do dado avança sozinha na tela (spec leituras-e-estado). O último contato de um coletor também SHALL NOT gravar evento. A liberação do cofre, a revelação e a cópia de um segredo SHALL NOT gravar evento, e o evento do cofre SHALL NOT levar o valor de nenhum segredo. A avaliação dos alertas que não muda nada que a tela mostra SHALL NOT gravar evento, e o evento dos alertas SHALL NOT levar o texto do alerta. O evento das notificações SHALL NOT levar o título nem a descrição delas.

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

#### Scenario: Notificação gravada
- **WHEN** o alerta do toner notifica Ana e Bruno
- **THEN** as sessões de Ana e de Bruno recebem o evento `notificacoes.mudaram`, sem o título, e as de Carla não recebem

#### Scenario: Meta de um indicador mudada
- **WHEN** quem administra os alertas muda a meta do tempo de atendimento do toner
- **THEN** quem vê alertas recebe o evento `metas.mudaram`, sem a meta, e a tela dos indicadores aberta se atualiza

#### Scenario: Meta das OS mudada
- **WHEN** quem administra a operação muda a meta do tempo de resolução das OS
- **THEN** quem vê as OS recebe o evento `metas.mudaram`, sem a meta, e a tela dos indicadores da operação aberta se atualiza, e quem só vê o estoque não recebe

#### Scenario: Fornecedor renomeado com a tabela aberta
- **WHEN** a "HP Brasil" é renomeada enquanto a tabela dos ativos está aberta em outra sessão
- **THEN** a tabela mostra o nome novo, sem uma ação do usuário

#### Scenario: Toner incluído com a ficha da impressora aberta
- **WHEN** quem edita os consumíveis inclui a "HP LaserJet M404" no "CF258X" enquanto Bruno está com a ficha da PAT-00412, dessa impressora, aberta
- **THEN** o cartão "Consumíveis compatíveis" de Bruno mostra o CF258X, sem recarregar a página, e o evento `consumiveis.mudaram` não leva o código nem o nome

#### Scenario: Saída lançada com o estoque aberto
- **WHEN** Ana lança a saída de 1 CF258A do Almoxarifado de Jundiaí
- **THEN** quem vê o estoque de Jundiaí recebe o evento `estoque.mudou`, sem o código nem a quantidade, e quem vê só o estoque de Campinas não recebe

#### Scenario: Solicitação registrada com a lista aberta
- **WHEN** Carla registra um Toner para a PAT-00412, de Jundiaí
- **THEN** quem vê as solicitações de Jundiaí recebe o evento `solicitacoes.mudaram`, sem o nome de quem pediu, e quem vê só as de Campinas não recebe

#### Scenario: OS aberta com a lista aberta
- **WHEN** Carla abre uma OS no NB-0031, de Jundiaí
- **THEN** quem vê as OS de Jundiaí recebe o evento `ordens.mudaram`, sem o problema, e quem vê só as de Campinas não recebe

### Requirement: Aviso depois do commit

O banco SHALL avisar a API de cada evento só depois do commit da transação que o gravou. A API SHALL entregar o evento às conexões que podem recebê-lo em até 2 s depois do commit. O evento de uma transação desfeita SHALL NOT ser entregue.

Se a API perde a ligação com o aviso do banco, ela SHALL refazer a ligação sozinha e depois mandar cada conexão atualizar todos os dados, porque pode ter perdido eventos no intervalo.

#### Scenario: Duas telas abertas
- **WHEN** Ana edita João enquanto Carla está com a lista de pessoas aberta
- **THEN** o evento chega à conexão de Carla em até 2 s depois do commit da edição

#### Scenario: Ligação com o banco refeita
- **WHEN** o banco reinicia e a API refaz a ligação com o aviso de eventos
- **THEN** as telas abertas atualizam todos os dados, sem uma ação do usuário

### Requirement: Conexão de eventos

A web SHALL receber os eventos por uma conexão de eventos enviados pelo servidor (SSE). A conexão SHALL ser aberta só por uma sessão que vale:
- sem sessão, a API SHALL recusar com 401;
- com a sessão pendente, com 403, dizendo que a entrada não terminou.

A conexão SHALL mandar um sinal de vida a cada 25 s, para não ser fechada por falta de tráfego. Ela SHALL NOT contar como uso da sessão.

A conexão SHALL terminar com a sessão:
- na hora, com o evento `sessao.encerrada`, quando a sessão é encerrada por uma ação;
- em até 1 min quando a sessão expira.

#### Scenario: Sem sessão
- **WHEN** alguém abre a conexão de eventos sem o cookie de uma sessão
- **THEN** a API responde 401, e nenhum evento é enviado

#### Scenario: Sessão encerrada pelo usuário em outro aparelho
- **WHEN** o usuário encerra, no computador, a sessão do celular, que está com a conexão aberta
- **THEN** a conexão do celular recebe `sessao.encerrada` e é fechada

#### Scenario: Conexão aberta sem uso
- **WHEN** a casca fica aberta, com a conexão de eventos, sem nenhuma outra requisição por 2 horas
- **THEN** a sessão expira, e a conexão termina em até 1 min

### Requirement: Retomada de onde parou

Quando a conexão cai, a web SHALL reconectar sozinha, informando o último evento recebido. A API SHALL então enviar os eventos das últimas 24 h que a conta pode ver e que a tela ainda não recebeu. Um evento SHALL chegar pelo menos uma vez, e a tela SHALL tolerar a repetição.

Quando o último evento recebido tem mais de 24 h ou é desconhecido, a API SHALL mandar a tela atualizar todos os dados.

#### Scenario: Rede caiu por 30 segundos
- **WHEN** a rede do computador de Carla cai por 30 s, e nesse tempo Ana edita João
- **THEN** quando a rede volta, a conexão de Carla recebe o evento da edição de João, e a lista dela mostra a mudança

#### Scenario: Computador suspenso por dois dias
- **WHEN** o computador de Carla volta de dois dias suspenso, com a casca aberta
- **THEN** a conexão manda a tela atualizar todos os dados, e as listas abertas mostram o estado atual

### Requirement: Só o que a conta pode ver

Cada conexão SHALL receber só os eventos da organização dela que a conta pode receber, conforme a tabela dos tipos, com o acesso que a conta tem no momento do evento. Uma mudança no acesso da conta SHALL valer também para a conexão já aberta. Os eventos de uma organização SHALL NOT chegar às conexões de outra.

#### Scenario: Escopo de local
- **WHEN** Bruno, que vê pessoas só em "Jundiaí", está conectado, e são editadas João, de "Jundiaí › Expedição", e Maria, de "Campinas"
- **THEN** a conexão de Bruno recebe o evento de João e não recebe o de Maria

#### Scenario: Pessoa que saiu do escopo
- **WHEN** o local de trabalho de João muda de "Jundiaí › Expedição" para "Campinas"
- **THEN** a conexão de Bruno recebe o evento, e a lista dele deixa de mostrar João

#### Scenario: A própria pessoa
- **WHEN** uma conta sem `pessoas.ver` está conectada, e a administração troca a foto da pessoa dela
- **THEN** a conexão dessa conta recebe o evento da própria pessoa, e o menu do usuário mostra a foto nova

#### Scenario: Outra organização
- **WHEN** uma pessoa da organização A é editada
- **THEN** nenhuma conexão da organização B recebe o evento

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

### Requirement: Abas escondidas

Uma aba escondida por mais de 5 min SHALL fechar a conexão de eventos. Ao voltar a ficar visível, ela SHALL reabrir a conexão e retomar de onde parou.

#### Scenario: Aba de volta
- **WHEN** uma aba fica 10 min escondida, e nesse tempo uma pessoa é cadastrada
- **THEN** a aba não tem conexão aberta enquanto está escondida, e ao voltar recebe o evento e mostra a pessoa nova

### Requirement: Eventos guardados por 24 horas

Os eventos SHALL ficar guardados por pelo menos 24 h, para a retomada. A manutenção diária SHALL apagar os eventos com mais de 24 h.

#### Scenario: Manutenção dos eventos
- **WHEN** a manutenção diária roda
- **THEN** os eventos com mais de 24 h são apagados, e os mais novos continuam
