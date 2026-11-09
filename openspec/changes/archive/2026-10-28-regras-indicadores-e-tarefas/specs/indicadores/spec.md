## ADDED Requirements

### Requirement: Indicadores da organização

Quem tem `alertas.administrar` SHALL poder criar, editar e apagar os indicadores da organização. Cada um SHALL ter:
- o nome, de 1 a 80 caracteres, único entre os da organização;
- a medida, uma das do sistema: o tempo de atendimento do toner, o tempo até reconhecer o Crítico, a disponibilidade dos ativos, os alertas que voltam ou os backups do Control iD em dia;
- o recorte, opcional: um tipo de ativo ou um modelo, e um local com os locais de baixo;
- a meta, nos limites da medida.

O indicador criado SHALL ser calculado como a medida dele, só com os ativos do recorte, e mostrado com a situação e a decisão da medida. Quem vê os indicadores SHALL ver os criados, calculados só com os alertas que a conta vê.

A gravação SHALL recusar o que não confere, com a mensagem no campo:

| O que não confere | Mensagem |
|---|---|
| nome vazio | "Informe o nome do indicador." |
| nome com mais de 80 caracteres | "Use até 80 caracteres no nome." |
| nome de outro indicador da organização | "Já existe um indicador com esse nome." |
| medida que não existe | "Escolha a medida." |
| tipo e modelo juntos | "Escolha o tipo ou o modelo, não os dois." |
| tipo, modelo ou local que falta ou está inativo | "Escolha um tipo ativo.", "Escolha um modelo ativo." ou "Escolha um local ativo." |
| meta fora dos limites da medida | "A meta deve ficar entre <mínimo> e <máximo>." |

A criação, a mudança e a exclusão SHALL ser registradas na auditoria e SHALL atualizar a tela dos indicadores de quem estiver com ela aberta. Os indicadores criados SHALL NOT notificar fora da meta.

#### Scenario: Disponibilidade das impressoras de Jundiaí
- **WHEN** quem administra os alertas cria "Impressoras de Jundiaí", com a disponibilidade dos ativos, o tipo Impressora, o local Jundiaí e a meta de 98%
- **THEN** a tela mostra o indicador calculado só com as impressoras de Jundiaí, comparado com 98%

#### Scenario: Nome repetido
- **WHEN** quem administra os alertas cria outro indicador com o nome "Impressoras de Jundiaí"
- **THEN** a gravação é recusada com "Já existe um indicador com esse nome."

#### Scenario: Quem só vê os alertas
- **WHEN** uma conta com só `alertas.ver` abre os indicadores
- **THEN** ela vê os indicadores criados, sem "Novo indicador", "Editar" e "Apagar", e a API recusa a criação dela com 403

### Requirement: Backups do Control iD em dia

A medida "Backups do Control iD em dia" SHALL ser a parte dos controles ativos, dos tipos com o backup do Control iD ligado (spec backup-do-control-id), que têm um backup com sucesso ou parcial nas últimas 26 horas, em porcentagem com uma casa decimal.

A lista SHALL trazer os controles sem o backup em dia, com a data do último backup bom ou "Nenhum backup". A meta de fábrica SHALL ser 100%, com os limites de 50% a 100%. Fora da meta, a decisão SHALL ser "Confira o coletor e o login desses controles, ou peça o backup pela ficha deles.". Sem nenhum controle com o backup ligado, a medida SHALL ficar "Sem dado".

#### Scenario: Um controle sem backup
- **WHEN** 4 controles têm o backup ligado, e um deles não tem um backup bom há 3 dias
- **THEN** a medida mostra 75%, fora da meta de 100%, com esse controle na lista

## MODIFIED Requirements

### Requirement: Tela dos indicadores

A tela Indicadores do Alertas SHALL explicar, no alto: "Um indicador mede o atendimento nos últimos 30 dias e o compara com a meta. Fora da meta, ele diz o que fazer. Crie um indicador para olhar só um tipo, um modelo ou um local, com a meta dele."

A tela SHALL mostrar o período, "Últimos 30 dias, comparados com os 30 anteriores", e os quatro indicadores, nesta ordem: o tempo de atendimento do toner, o tempo até reconhecer o Crítico, a disponibilidade dos ativos e os alertas que voltam. Cada um SHALL ter:
- o nome e uma linha com o que ele mede;
- a base do cálculo, como "Mediana de 3 trocas" ou "5 ativos com queda no período";
- o valor, o valor anterior, a meta e a situação;
- a decisão fora da meta;
- a lista, com até 20 linhas e "E mais <N>." quando passar disso.

A linha de um ativo SHALL levar à ficha dele, e a de um coletor, à tela dos coletores.

Depois dos quatro, a tela SHALL mostrar os indicadores da organização, em ordem de nome, cada um com a medida e o recorte em texto, como "Disponibilidade dos ativos · Impressora · Jundiaí". Para quem tem `alertas.administrar`, a seção SHALL ter "Novo indicador", e cada indicador, "Editar" e "Apagar". Sem nenhum criado, a seção SHALL dizer "Nenhum indicador criado." e explicar para que eles servem.

Enquanto os indicadores carregam, a tela SHALL mostrar o esqueleto. Com a falha da API, SHALL mostrar "Não foi possível carregar os indicadores." e "Tentar de novo". A tela SHALL se atualizar sozinha quando os alertas, as metas ou os indicadores da organização mudam, sem uma ação do usuário. O endereço da tela SHALL aceitar o indicador em foco, que a notificação usa.

#### Scenario: Abrir pela notificação
- **WHEN** quem administra os alertas abre a notificação "Tempo de atendimento do toner fora da meta"
- **THEN** a tela dos indicadores abre com o foco no tempo de atendimento do toner

#### Scenario: Lista longa
- **WHEN** 23 ativos estão abaixo da meta da disponibilidade
- **THEN** a lista mostra os 20 com a menor disponibilidade e "E mais 3."

#### Scenario: Nenhum indicador criado
- **WHEN** quem administra os alertas abre a tela, e a organização não criou nenhum indicador
- **THEN** a seção diz "Nenhum indicador criado.", explica para que eles servem e oferece "Novo indicador"
