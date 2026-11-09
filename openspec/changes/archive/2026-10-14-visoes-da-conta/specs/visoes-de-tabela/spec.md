## MODIFIED Requirements

### Requirement: Visão de uma tabela

Uma visão SHALL ter um nome e guardar:
- as colunas à vista, com a ordem e a largura de cada uma;
- a ordenação, com a coluna e a direção;
- os filtros.

A visão SHALL NOT guardar a busca, a seleção nem a rolagem.

Cada tabela que oferece visões SHALL ter uma visão de fábrica, que não se edita, não se renomeia e não se remove. A da tabela dos ativos SHALL ser "Todos os ativos": a miniatura, o ativo, o patrimônio, o local e a situação, os cadastrados por último primeiro, só os ativos ativos. A conta SHALL poder personalizar a visão de fábrica para si (requisito "Tabela alterada"), sem mudá-la para ninguém.

#### Scenario: Busca fora da visão
- **WHEN** o usuário busca "laserjet" e salva a visão
- **THEN** a visão salva guarda as colunas, a ordenação e os filtros, e reaberta mostra a tabela sem a busca

#### Scenario: Visão de fábrica
- **WHEN** o usuário abre o menu da visão com "Todos os ativos" escolhida
- **THEN** o menu oferece "Salvar como nova visão…" e "Duplicar…", e não "Salvar alterações", "Renomear…" nem "Remover…"

### Requirement: Visões da organização e da conta

O menu da visão SHALL mostrar, nesta ordem:
1. a visão de fábrica;
2. "Da organização": as visões compartilhadas, que toda conta que vê a tabela usa;
3. "Minhas visões": as da própria conta, que nenhuma outra conta vê.

Toda conta que vê a tabela SHALL poder criar, editar, renomear e remover as próprias visões. As visões da organização SHALL ser criadas, editadas, renomeadas e removidas só por quem tem `organizacao.editar`. A API SHALL recusar com 403 o pedido sobre uma visão da organização de quem não tem a permissão, com a recusa na auditoria, e SHALL responder 404 ao pedido sobre a visão de outra conta.

O nome SHALL ter de 1 a 60 caracteres e SHALL ser único entre as visões da organização e, à parte, entre as de cada conta, na mesma tabela, sem diferenciar acento e maiúsculas: "Já existe uma visão com este nome.". Cada conta SHALL ter até 50 visões por tabela, e a organização, até 100: "Você já tem 50 visões nesta tabela. Remova uma para criar outra." e "A organização já tem 100 visões nesta tabela. Remova uma para criar outra.".

As visões de uma tabela SHALL seguir o módulo dela: com o módulo desligado, a API SHALL recusá-las como recusa as rotas do módulo. A anonimização de uma pessoa SHALL remover as visões da conta dela e as mudanças dela sobre as outras visões.

#### Scenario: Visão compartilhada
- **WHEN** Ana, com `organizacao.editar`, salva "Impressoras de Jundiaí" marcando "Compartilhar com a organização"
- **THEN** a visão aparece em "Da organização" no menu de todas as contas que veem os ativos

#### Scenario: Visão de uma conta
- **WHEN** Bruno salva "Meus notebooks" sem compartilhar
- **THEN** a visão aparece em "Minhas visões" no menu de Bruno, e no de nenhuma outra conta

#### Scenario: Sem a permissão
- **WHEN** Bruno, sem `organizacao.editar`, salva uma visão nova
- **THEN** o diálogo não oferece "Compartilhar com a organização", e a visão fica em "Minhas visões"

#### Scenario: Nome repetido
- **WHEN** Bruno já tem "Notebooks" e salva outra visão com o nome "notebooks"
- **THEN** o diálogo recusa com "Já existe uma visão com este nome.", no nome

#### Scenario: Visão de outra conta pela API
- **WHEN** Carla pede à API a edição de uma visão de Bruno
- **THEN** a API responde 404, e a visão não muda

#### Scenario: Pessoa anonimizada
- **WHEN** a pessoa de Bruno, inativa, é anonimizada
- **THEN** as visões da conta de Bruno e as mudanças dele sobre as outras visões são removidas, e as visões da organização que ele criou continuam

### Requirement: Tabela alterada

Mudar as colunas, a largura, a ordem das colunas, a ordenação ou os filtros SHALL ser guardado sem uma ação do usuário, no servidor, em até 1 s depois da última mudança:
- **numa visão de "Minhas visões":** na própria visão, sem nenhuma marca de alterada;
- **na visão de fábrica e numa visão da organização:** como mudanças da conta sobre aquela visão, que só a conta vê. A visão SHALL aparecer como "<nome> · Personalizada", em texto, com "Restaurar a visão" e "Salvar como nova visão…" à vista, numa linha sob a barra da tabela.

A busca SHALL NOT ser guardada nem marcar a visão. A largura SHALL ser guardada como as outras mudanças.

O menu da visão SHALL oferecer:
- "Salvar como nova visão…", em qualquer visão, com o nome e, para quem tem `organizacao.editar`, "Compartilhar com a organização"; a visão nova guarda a tabela como está, e as mudanças da conta sobre a visão de onde ela saiu são apagadas;
- "Duplicar…", em qualquer visão, que cria uma visão da conta com o nome pedido e a tabela como está, com as mudanças da conta;
- "Restaurar a visão", quando há mudanças da conta, que as apaga e mostra a visão como está salva;
- numa visão da organização personalizada, para quem tem `organizacao.editar`, "Salvar na visão da organização", que grava a tabela como está na visão, apaga as mudanças dessa conta e entra na auditoria; para descartá-las, vale o "Restaurar a visão".

Os retornos SHALL ser "Visão salva.", "Visão criada.", "Visão restaurada." e "Visão duplicada.". As mudanças da conta SHALL NOT entrar na auditoria.

#### Scenario: Coluna nova
- **WHEN** o usuário mostra a coluna "IP" na visão da organização "Impressoras", que ele não edita
- **THEN** a visão aparece como "Impressoras · Personalizada", com "Restaurar a visão" e "Salvar como nova visão…" à vista

#### Scenario: Salvar como nova visão
- **WHEN** a tabela está personalizada sobre "Todos os ativos" e o usuário salva como nova visão com o nome "Switches"
- **THEN** a visão "Switches" aparece em "Minhas visões", escolhida, e "Todos os ativos" volta a ser como era, sem as mudanças

#### Scenario: Descartar
- **WHEN** a visão "Impressoras" está personalizada com a coluna "IP" e o usuário escolhe "Restaurar a visão"
- **THEN** a tabela volta às colunas, à ordenação e aos filtros salvos de "Impressoras"

#### Scenario: Colunas guardadas sem salvar
- **WHEN** o usuário mostra a coluna "IP" em "Todos os ativos", vai a outro módulo e volta pelo dock
- **THEN** a tabela abre em "Todos os ativos · Personalizada", com a coluna "IP"

#### Scenario: Outro aparelho
- **WHEN** o usuário personaliza "Todos os ativos" no computador e depois abre os ativos no notebook
- **THEN** a tabela do notebook abre com as mesmas colunas, como "Todos os ativos · Personalizada"

#### Scenario: Visão da conta
- **WHEN** Bruno muda a ordenação da visão "Meus notebooks", que é dele
- **THEN** a visão guarda a ordenação nova, sem a marca de alterada

#### Scenario: Restaurar
- **WHEN** a visão "Todos os ativos" está personalizada, e o usuário escolhe "Restaurar a visão"
- **THEN** a tabela volta às colunas, à ordenação e aos filtros de fábrica, sem a marca de personalizada

#### Scenario: Publicar na visão da organização
- **WHEN** Ana, com `organizacao.editar`, personaliza "Impressoras de Jundiaí" e escolhe "Salvar na visão da organização"
- **THEN** a visão muda para todos, as mudanças de Ana saem, e a auditoria registra a mudança da visão

#### Scenario: Visão da organização sem a permissão
- **WHEN** Bruno, sem `organizacao.editar`, muda uma visão da organização
- **THEN** a mudança fica só para ele, como "Personalizada", e o menu não oferece "Salvar na visão da organização"

### Requirement: Renomear e remover uma visão

"Renomear…" e "Remover…" SHALL valer para as visões que a conta pode editar. A remoção SHALL pedir a confirmação, "Remover a visão <nome>?", dizendo que a visão sai do menu da conta ou, na da organização, do menu de todos. A remoção SHALL ser definitiva e SHALL apagar as mudanças de toda conta sobre aquela visão. Os retornos SHALL ser "Visão renomeada." e "Visão removida.".

Uma tabela aberta numa visão removida, em qualquer sessão, SHALL passar à visão que abre a tabela e avisar "A visão <nome> foi removida.".

#### Scenario: Remover uma visão da organização
- **WHEN** Ana remove "Impressoras de Jundiaí" enquanto Bruno está com ela aberta e personalizada
- **THEN** a visão sai do menu de todos, as mudanças de Bruno sobre ela são apagadas, e a tabela de Bruno passa à visão que abre, com o aviso "A visão Impressoras de Jundiaí foi removida."

#### Scenario: Renomear
- **WHEN** Bruno renomeia "Meus notebooks" para "Notebooks da engenharia"
- **THEN** o menu mostra o nome novo, e a tabela continua na mesma visão

### Requirement: Estado da tabela no endereço

O endereço SHALL guardar a visão aberta e, quando a tabela difere da visão salva com as mudanças da conta, o que mudou: as colunas com a largura, a ordenação e os filtros. A busca SHALL ficar no endereço também. Recarregar a página, voltar de um registro e abrir o endereço em outro navegador SHALL mostrar a mesma tabela. Num endereço com mudanças sobre uma visão que a conta não pode usar, as mudanças SHALL valer sobre a visão que abre.

Um endereço com mudanças SHALL valer, naquela visita, sobre as mudanças da conta, e a visão SHALL aparecer como "<nome> · Do link". A primeira mudança feita pelo usuário sobre ele SHALL passar a ser guardada na conta (requisito "Tabela alterada"). Abrir a tabela pelo dock, pelo menu ou pela busca SHALL mostrar a visão que abre, com as mudanças da conta sobre ela.

#### Scenario: Voltar da ficha
- **WHEN** a tabela está com o filtro "Tipo: Switch", o usuário abre um ativo e volta
- **THEN** a tabela aparece com o filtro, como estava

#### Scenario: Link enviado
- **WHEN** Ana manda a Bruno o endereço da tabela com as colunas "IP" e "Modelo" e a ordem pelo IP
- **THEN** Bruno abre a tabela com as mesmas colunas e a mesma ordem, como "Do link", e as mudanças dele sobre a visão continuam guardadas

#### Scenario: Pelo dock
- **WHEN** a tabela está personalizada e o usuário vai a outro módulo e volta pelo dock
- **THEN** a tabela aparece na visão que abre, com as mudanças da conta

### Requirement: Visões atualizadas sozinhas

O menu da visão aberto SHALL mostrar, sem uma ação do usuário, em até 5 s, a visão criada, mudada ou removida em outra sessão: as da organização em todas as sessões da organização, e as de uma conta nas sessões dessa conta. As mudanças da conta guardadas numa sessão SHALL chegar às outras sessões da mesma conta em até 5 s; entre duas gravações, a última SHALL valer.

Uma tabela aberta numa visão da organização salva em outra sessão SHALL passar ao que foi salvo, mantendo as mudanças da conta sobre ela, e SHALL avisar "A visão <nome> foi atualizada pela organização. Suas mudanças continuam sobre ela." quando a conta tem mudanças sobre ela.

#### Scenario: Visão compartilhada em outra sessão
- **WHEN** Ana compartilha "Impressoras de Jundiaí" enquanto Bruno está com a tabela dos ativos aberta
- **THEN** em até 5 s o menu da visão de Bruno mostra a visão nova em "Da organização"

#### Scenario: Mudanças em duas sessões da conta
- **WHEN** Bruno personaliza "Todos os ativos" no computador, com a tabela aberta também no notebook
- **THEN** em até 5 s a tabela do notebook passa a ter as mesmas mudanças

#### Scenario: Organização muda a visão personalizada
- **WHEN** Bruno tem mudanças sobre "Impressoras de Jundiaí", e Ana salva a visão da organização
- **THEN** a tabela de Bruno passa à visão salva por Ana, com as mudanças dele por cima, e o aviso de que a visão foi atualizada pela organização
