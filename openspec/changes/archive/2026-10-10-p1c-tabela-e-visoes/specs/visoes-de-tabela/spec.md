## Purpose

Guardar as visões de uma tabela, as de cada conta e as compartilhadas da organização, para cada usuário abrir a tabela com as colunas, a ordenação e os filtros que usa, em qualquer aparelho, e a organização oferecer os recortes que todos usam.

## ADDED Requirements

### Requirement: Visão de uma tabela

Uma visão SHALL ter um nome e guardar:
- as colunas à vista, com a ordem e a largura de cada uma;
- a ordenação, com a coluna e a direção;
- os filtros.

A visão SHALL NOT guardar a busca, a seleção nem a rolagem.

Cada tabela que oferece visões SHALL ter uma visão de fábrica, que não se edita, não se renomeia e não se remove. A da tabela dos ativos SHALL ser "Todos os ativos": a miniatura, o ativo, o patrimônio, o local e a situação, os cadastrados por último primeiro, só os ativos ativos.

#### Scenario: Busca fora da visão
- **WHEN** o usuário busca "laserjet" e salva a visão
- **THEN** a visão salva guarda as colunas, a ordenação e os filtros, e reaberta mostra a tabela sem a busca

#### Scenario: Visão de fábrica
- **WHEN** o usuário abre o menu da visão com "Todos os ativos" escolhida
- **THEN** o menu não oferece "Salvar alterações", "Renomear…" nem "Remover…" para ela

### Requirement: Visões da organização e da conta

O menu da visão SHALL mostrar, nesta ordem:
1. a visão de fábrica;
2. "Da organização": as visões compartilhadas, que toda conta que vê a tabela usa;
3. "Minhas visões": as da própria conta, que nenhuma outra conta vê.

Toda conta que vê a tabela SHALL poder criar, editar, renomear e remover as próprias visões. As visões da organização SHALL ser criadas, editadas, renomeadas e removidas só por quem tem `organizacao.editar`. A API SHALL recusar com 403 o pedido sobre uma visão da organização de quem não tem a permissão, com a recusa na auditoria, e SHALL responder 404 ao pedido sobre a visão de outra conta.

O nome SHALL ter de 1 a 60 caracteres e SHALL ser único entre as visões da organização e, à parte, entre as de cada conta, na mesma tabela, sem diferenciar acento e maiúsculas: "Já existe uma visão com este nome.". Cada conta SHALL ter até 50 visões por tabela, e a organização, até 100: "Você já tem 50 visões nesta tabela. Remova uma para criar outra." e "A organização já tem 100 visões nesta tabela. Remova uma para criar outra.".

As visões de uma tabela SHALL seguir o módulo dela: com o módulo desligado, a API SHALL recusá-las como recusa as rotas do módulo. A anonimização de uma pessoa SHALL remover as visões da conta dela.

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
- **THEN** as visões da conta de Bruno são removidas, e as visões da organização que ele criou continuam

### Requirement: Tabela alterada

Mudar as colunas, a largura, a ordem das colunas, a ordenação ou os filtros SHALL marcar a visão como "Alterada", em texto ao lado do nome dela. A busca SHALL NOT marcar a visão como alterada. O menu da visão alterada SHALL oferecer:
- "Salvar alterações", que grava a tabela como está na visão, quando a conta pode editá-la;
- "Salvar como nova visão…", com o nome e, para quem tem `organizacao.editar`, "Compartilhar com a organização";
- "Descartar alterações", que volta à visão como está salva.

A visão de fábrica alterada SHALL oferecer só "Salvar como nova visão…" e "Descartar alterações". Os retornos SHALL ser "Visão salva." e "Visão criada.".

#### Scenario: Coluna nova
- **WHEN** o usuário mostra a coluna "IP" na visão "Impressoras"
- **THEN** a visão aparece como "Impressoras · Alterada", e o menu oferece salvar e descartar

#### Scenario: Salvar como nova visão
- **WHEN** a tabela está alterada sobre "Todos os ativos" e o usuário salva como nova visão com o nome "Switches"
- **THEN** a visão "Switches" aparece em "Minhas visões", escolhida e sem a marca de alterada, e "Todos os ativos" continua como era

#### Scenario: Descartar
- **WHEN** a visão "Impressoras" está alterada com a coluna "IP" e o usuário escolhe "Descartar alterações"
- **THEN** a tabela volta às colunas, à ordenação e aos filtros salvos de "Impressoras"

#### Scenario: Visão da organização sem a permissão
- **WHEN** Bruno, sem `organizacao.editar`, altera uma visão da organização
- **THEN** o menu oferece "Salvar como nova visão…" e "Descartar alterações", e não "Salvar alterações"

### Requirement: Renomear e remover uma visão

"Renomear…" e "Remover…" SHALL valer para as visões que a conta pode editar. A remoção SHALL pedir a confirmação, "Remover a visão <nome>?", dizendo que a visão sai do menu da conta ou, na da organização, do menu de todos. A remoção SHALL ser definitiva. Os retornos SHALL ser "Visão renomeada." e "Visão removida.".

Uma tabela aberta numa visão removida, em qualquer sessão, SHALL passar à visão que abre a tabela e avisar "A visão <nome> foi removida.".

#### Scenario: Remover uma visão da organização
- **WHEN** Ana remove "Impressoras de Jundiaí" enquanto Bruno está com ela aberta
- **THEN** a visão sai do menu de todos, e a tabela de Bruno passa à visão que abre, com o aviso "A visão Impressoras de Jundiaí foi removida."

#### Scenario: Renomear
- **WHEN** Bruno renomeia "Meus notebooks" para "Notebooks da engenharia"
- **THEN** o menu mostra o nome novo, e a tabela continua na mesma visão

### Requirement: A visão que abre

Ao abrir a tabela sem uma visão no endereço, SHALL valer, nesta ordem:
1. a visão escolhida pela conta, se ela ainda existe e a conta pode usá-la;
2. a visão padrão da organização, se ela ainda existe;
3. a visão de fábrica.

Escolher uma visão no menu SHALL torná-la a escolhida da conta, guardada no servidor e valendo em qualquer aparelho em que a conta entrar. Quem tem `organizacao.editar` SHALL poder escolher uma visão da organização como a padrão, por "Usar como padrão da organização", com o retorno "Padrão da organização definido.". Uma visão de uma conta SHALL NOT ser a padrão da organização.

Uma visão do endereço que não existe ou que a conta não pode usar SHALL dar lugar à visão que abre, com o aviso "A visão do endereço não está disponível.".

#### Scenario: Primeira vez
- **WHEN** uma conta que nunca escolheu uma visão abre os ativos, e a organização tem "Equipamentos em uso" como padrão
- **THEN** a tabela abre em "Equipamentos em uso"

#### Scenario: Outro aparelho
- **WHEN** o usuário escolhe "Switches" no computador e depois abre os ativos no notebook
- **THEN** a tabela do notebook abre em "Switches"

#### Scenario: Escolhida removida
- **WHEN** a visão escolhida pela conta foi removida, e a organização não tem visão padrão
- **THEN** a tabela abre em "Todos os ativos"

#### Scenario: Visão de outra conta no endereço
- **WHEN** Carla abre um link com uma visão de Bruno
- **THEN** a tabela abre na visão que vale para Carla, com o aviso "A visão do endereço não está disponível."

### Requirement: Estado da tabela no endereço

O endereço SHALL guardar a visão aberta e, quando a tabela está alterada, o que mudou: as colunas com a largura, a ordenação e os filtros. A busca SHALL ficar no endereço também. Recarregar a página, voltar de um registro e abrir o endereço em outro navegador SHALL mostrar a mesma tabela. Num endereço com mudanças sobre uma visão que a conta não pode usar, as mudanças SHALL valer sobre a visão que abre. Abrir a tabela pelo dock, pelo menu ou pela busca SHALL mostrar a visão que abre, sem as mudanças não salvas.

#### Scenario: Voltar da ficha
- **WHEN** a tabela está alterada com o filtro "Tipo: Switch", o usuário abre um ativo e volta
- **THEN** a tabela aparece com o filtro, alterada, como estava

#### Scenario: Link enviado
- **WHEN** Ana manda a Bruno o endereço da tabela alterada com as colunas "IP" e "Modelo" e a ordem pelo IP
- **THEN** Bruno abre a tabela com as mesmas colunas e a mesma ordem, alterada

#### Scenario: Pelo dock
- **WHEN** a tabela está alterada e o usuário vai a outro módulo e volta pelo dock
- **THEN** a tabela aparece na visão que abre, sem as mudanças

### Requirement: Visões atualizadas sozinhas

O menu da visão aberto SHALL mostrar, sem uma ação do usuário, em até 5 s, a visão criada, mudada ou removida em outra sessão: as da organização em todas as sessões da organização, e as de uma conta nas sessões dessa conta. Uma tabela aberta numa visão salva em outra sessão SHALL passar ao que foi salvo, mantendo as mudanças não salvas do endereço.

#### Scenario: Visão compartilhada em outra sessão
- **WHEN** Ana compartilha "Impressoras de Jundiaí" enquanto Bruno está com a tabela dos ativos aberta
- **THEN** em até 5 s o menu da visão de Bruno mostra a visão nova em "Da organização"

### Requirement: Colunas que deixam de valer

Uma coluna que deixa de estar disponível para a conta, como a de um campo inativado ou a de um campo restrito para quem não o vê, SHALL sair da tabela, e o filtro e a ordenação por ela SHALL deixar de valer, sem mudar a visão guardada e sem marcá-la como alterada. A coluna SHALL voltar quando estiver disponível de novo.

#### Scenario: Campo inativado
- **WHEN** a visão "Nobreaks" mostra a coluna "Tensão", e o campo "Tensão" é inativado
- **THEN** a tabela abre sem a coluna "Tensão", e ela volta à visão quando o campo é reativado
