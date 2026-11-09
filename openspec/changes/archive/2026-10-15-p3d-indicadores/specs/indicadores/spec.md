## Purpose

Dizer, a partir do histórico dos alertas, se a operação está dando conta: cada indicador tem a meta da organização, a situação em texto e a decisão que ele pede, e quem administra os alertas é avisado quando um indicador sai da meta.

## ADDED Requirements

### Requirement: Período dos indicadores

Os indicadores SHALL ser calculados sobre os últimos 30 dias até o momento da consulta e comparados com os 30 dias anteriores a eles. Cada indicador SHALL mostrar o valor do período e o valor do período anterior, como "Antes: 2,3 dias", ou "Antes: sem dado" quando o período anterior não tem dado para o indicador.

Os tempos SHALL ser escritos como "menos de 1 min" abaixo de 1 minuto, em minutos inteiros abaixo de 1 hora, como "32 min", em horas abaixo de 1 dia, como "1,5 h", e em dias a partir de 1 dia, como "1 dia", "1,5 dia" ou "2,3 dias", com uma casa decimal quando ela não for zero. A disponibilidade SHALL ser escrita em porcentagem com uma casa decimal quando ela não for zero, como "97,5%" ou "99%".

#### Scenario: Comparação com os 30 dias anteriores
- **WHEN** o tempo de atendimento do toner fica em 1,5 dia nos últimos 30 dias e ficou em 2,3 dias nos 30 dias antes deles
- **THEN** o indicador mostra "1,5 dia" e "Antes: 2,3 dias"

#### Scenario: Período anterior sem dado
- **WHEN** nenhum toner foi trocado nos 30 dias antes dos últimos 30
- **THEN** o indicador mostra "Antes: sem dado"

### Requirement: Alertas que entram nos indicadores

Os indicadores SHALL ler os alertas que abriram, abertos ou resolvidos, guardados pela retenção (spec alertas). O alerta que abriu com o ativo silenciado SHALL NOT entrar em nenhum indicador: o silêncio marca uma parada combinada, como uma manutenção.

#### Scenario: Ativo em manutenção
- **WHEN** a impressora do RH está silenciada com o motivo "Em manutenção", e o alerta "Offline" dela abre
- **THEN** esse alerta não entra na disponibilidade nem nos alertas que voltam

### Requirement: Tempo de atendimento do toner

O indicador SHALL ser a mediana do tempo entre a abertura e o fim dos alertas das regras do nível do toner que terminaram no período por terem voltado ao normal, isto é, pela troca do toner. O alerta encerrado porque a regra deixou de valer para o ativo SHALL NOT entrar.

O indicador SHALL listar os alertas do toner acima da meta: primeiro os ainda abertos há mais tempo que a meta, como "Esperando há 3 dias", do mais antigo para o mais novo, e depois os que terminaram no período depois da meta, do mais demorado para o mais rápido, cada um com o ativo, o local e o texto do alerta.

Sem nenhum toner trocado no período, o indicador SHALL mostrar "Nenhum toner trocado nos últimos 30 dias.", sem valor.

#### Scenario: Mediana dos toners trocados
- **WHEN** três alertas do toner terminaram no período pela troca, depois de 1 dia, de 1,5 dia e de 4 dias, e a meta é 2 dias
- **THEN** o indicador mostra "1,5 dia", dentro da meta, e lista o toner que esperou 4 dias

#### Scenario: Toner ainda esperando
- **WHEN** o alerta do toner da impressora do RH está aberto há 3 dias, e a meta é 2 dias
- **THEN** a lista mostra esse alerta primeiro, com "Esperando há 3 dias"

#### Scenario: Regra que deixou de valer
- **WHEN** o alerta do toner de uma impressora termina porque ela saiu do escopo da regra
- **THEN** esse alerta não entra na mediana

### Requirement: Tempo até reconhecer o Crítico

O indicador SHALL ser a mediana do tempo entre a abertura e o reconhecimento dos alertas Críticos abertos no período. O alerta Crítico ainda aberto e sem reconhecimento SHALL entrar com o tempo desde a abertura até o momento da consulta. O alerta Crítico que terminou sem reconhecimento SHALL NOT entrar: ele não esperou ninguém.

O indicador SHALL listar os alertas Críticos acima da meta, do mais demorado para o mais rápido, com o ativo ou o coletor, o texto do alerta, o tempo e quem reconheceu, ou "Sem reconhecimento".

Sem nenhum alerta Crítico que entre no indicador, ele SHALL mostrar "Nenhum alerta Crítico para reconhecer nos últimos 30 dias.", sem valor.

#### Scenario: Crítico sem reconhecimento
- **WHEN** um alerta Crítico está aberto há 2 h sem reconhecimento, e a meta é 30 min
- **THEN** a lista mostra esse alerta com "2 h" e "Sem reconhecimento"

#### Scenario: Crítico que se resolveu sozinho
- **WHEN** o alerta Crítico "Offline" do switch termina em 10 min, sem reconhecimento, porque o switch voltou
- **THEN** esse alerta não entra no indicador

### Requirement: Disponibilidade dos ativos

O tempo fora do ar de cada ativo SHALL ser a soma, dentro do período, dos intervalos dos alertas das regras de ativo offline que abriram para ele, de quando a falta de resposta começou até o fim do alerta, ou até o momento da consulta no alerta ainda aberto. A disponibilidade do ativo SHALL ser a parte do período sem esse tempo.

O indicador SHALL ser a quantidade de ativos com a disponibilidade abaixo da meta, e SHALL listá-los da menor disponibilidade para a maior, com o ativo, o local, a disponibilidade e o tempo fora do ar, como "18 h fora do ar".

Sem nenhuma regra de ativo offline ativa, o indicador SHALL mostrar "Nenhuma regra de ativo offline ativa.", sem valor. Com a regra e sem ativo abaixo da meta, SHALL mostrar "Nenhum ativo abaixo de <meta>.", como "Nenhum ativo abaixo de 99%.".

#### Scenario: Ativo abaixo da meta
- **WHEN** a impressora do RH ficou 18 h sem responder nos últimos 30 dias, e a meta é 99%
- **THEN** o indicador conta a impressora e a lista com "97,5%" e "18 h fora do ar"

#### Scenario: Queda que começou antes do período
- **WHEN** o alerta "Offline" do switch começou 2 dias antes do período e terminou 1 dia depois do começo dele
- **THEN** só o dia dentro do período entra no tempo fora do ar do switch

### Requirement: Alertas que voltam

O indicador SHALL contar os ativos e os coletores em que alertas da mesma regra abriram no período a quantidade de vezes da meta ou mais. Ele SHALL listá-los do que mais voltou para o que menos voltou, com o ativo ou o coletor, a regra, quantas vezes, como "4 vezes", e quando abriu da última vez.

Sem nenhum, o indicador SHALL mostrar "Nenhum alerta abriu <meta> vezes no mesmo ativo.", como "Nenhum alerta abriu 3 vezes no mesmo ativo.".

#### Scenario: Switch que cai sempre
- **WHEN** o alerta "Offline" do switch do 2º andar abriu 4 vezes no período, e a meta é 3 vezes
- **THEN** o indicador mostra 1, fora da meta, e lista o switch com a regra e "4 vezes"

### Requirement: Situação e decisão

Cada indicador SHALL mostrar a meta, como "Meta: 2 dias", e a situação, em texto e com o ícone: "Dentro da meta", "Fora da meta" ou "Sem dado". O tempo de atendimento do toner e o tempo até reconhecer o Crítico SHALL ficar fora da meta quando a mediana passa da meta; a disponibilidade e os alertas que voltam, quando há pelo menos um ativo ou coletor na lista. Fora da meta, o indicador SHALL mostrar a decisão que ele pede:
- tempo de atendimento do toner: "Deixe toner de reserva nos locais que mais esperam, ou suba o limite da regra do toner para o alerta abrir antes.";
- tempo até reconhecer o Crítico: "Confira quem pode tratar os alertas e quem recebe o Crítico por e-mail e no celular.";
- disponibilidade dos ativos: "Confira a rede e a energia desses ativos, ou se eles ainda estão em uso.";
- alertas que voltam: "Verifique o equipamento, ou a duração e a folga da regra, se o alerta não pede ação.".

#### Scenario: Toner fora da meta
- **WHEN** a mediana do toner fica em 3 dias, e a meta é 2 dias
- **THEN** o indicador mostra "Fora da meta" e "Deixe toner de reserva nos locais que mais esperam, ou suba o limite da regra do toner para o alerta abrir antes."

#### Scenario: Sem dado
- **WHEN** nenhum toner foi trocado nos últimos 30 dias
- **THEN** o indicador mostra "Sem dado", sem a decisão

### Requirement: Metas da organização

Cada indicador SHALL ter uma meta da organização, a mesma para todas as contas, com a meta de fábrica e os limites:

| Indicador | De fábrica | Limites |
|---|---|---|
| Tempo de atendimento do toner | 2 dias | de 1 h a 30 dias |
| Tempo até reconhecer o Crítico | 30 min | de 1 min a 1 dia |
| Disponibilidade dos ativos | 99% | de 90% a 99,9%, com uma casa decimal |
| Alertas que voltam | 3 vezes | de 2 a 20 vezes |

Quem tem `alertas.administrar` SHALL mudar a meta pela tela dos indicadores, com o retorno "Meta salva.". A meta fora dos limites SHALL ser recusada com "A meta deve ficar entre <mínimo> e <máximo>.", como "A meta deve ficar entre 90% e 99,9%.". A mudança SHALL ser registrada na auditoria (spec auditoria) e SHALL atualizar a tela dos indicadores de quem estiver com ela aberta, sem recarregar.

#### Scenario: Meta mudada
- **WHEN** quem administra os alertas muda a meta do toner de 2 dias para 1 dia
- **THEN** a tela mostra "Meta salva.", o indicador passa a comparar a mediana com 1 dia, e a auditoria registra "2 dias → 1 dia"

#### Scenario: Meta fora dos limites
- **WHEN** alguém tenta pôr a meta da disponibilidade em 100%
- **THEN** a meta é recusada com "A meta deve ficar entre 90% e 99,9%."

#### Scenario: Quem só vê os alertas
- **WHEN** uma conta com só `alertas.ver` abre os indicadores
- **THEN** ela vê as metas, sem "Mudar a meta", e a API recusa a mudança dela com 403

### Requirement: Quem vê os indicadores

Quem tem `alertas.ver` em algum escopo SHALL ver os indicadores calculados só com os alertas que a conta vê (spec alertas, "Quem vê os alertas"): os dos ativos dos locais do alcance dela e, só com o alcance na organização inteira, os dos coletores e os dos ativos sem local.

#### Scenario: Conta de um local
- **WHEN** uma conta com `alertas.ver` só em Campinas abre os indicadores
- **THEN** eles são calculados só com os alertas dos ativos de Campinas, com as metas da organização

### Requirement: Tela dos indicadores

A tela Indicadores do Alertas SHALL mostrar o período, "Últimos 30 dias, comparados com os 30 anteriores", e os quatro indicadores, nesta ordem: o tempo de atendimento do toner, o tempo até reconhecer o Crítico, a disponibilidade dos ativos e os alertas que voltam. Cada um SHALL ter o nome, uma linha com o que ele mede e a base do cálculo, como "Mediana de 3 trocas" ou "5 ativos com queda no período", o valor, o valor anterior, a meta, a situação, a decisão fora da meta e a lista, com até 20 linhas e "E mais <N>." quando passar disso. A linha de um ativo SHALL levar à ficha dele, e a de um coletor, à tela dos coletores.

Enquanto os indicadores carregam, a tela SHALL mostrar o esqueleto. Com a falha da API, SHALL mostrar "Não foi possível carregar os indicadores." e "Tentar de novo". A tela SHALL se atualizar sozinha quando os alertas ou as metas mudam, sem uma ação do usuário. O endereço da tela SHALL aceitar o indicador em foco, que a notificação usa.

#### Scenario: Abrir pela notificação
- **WHEN** quem administra os alertas abre a notificação "Tempo de atendimento do toner fora da meta"
- **THEN** a tela dos indicadores abre com o foco no tempo de atendimento do toner

#### Scenario: Lista longa
- **WHEN** 23 ativos estão abaixo da meta da disponibilidade
- **THEN** a lista mostra os 20 com a menor disponibilidade e "E mais 3."

### Requirement: Indicador fora da meta avisa

Uma vez por dia, às 07:00 no horário de Brasília, cada organização com o módulo Alertas ligado SHALL ter os indicadores avaliados com todos os alertas dela. Quando um indicador sai da meta, isto é, está fora da meta e, na avaliação anterior, estava dentro, sem dado ou ainda não tinha sido avaliado, o sistema SHALL notificar (spec notificacoes) cada conta ativa com `alertas.administrar`, com a severidade Atenção, a origem "Alertas", o endereço da tela dos indicadores com o foco no indicador, a decisão como descrição e o título:
- "Tempo de atendimento do toner fora da meta: <valor>, com a meta de <meta>";
- "Tempo até reconhecer o Crítico fora da meta: <valor>, com a meta de <meta>";
- "Disponibilidade fora da meta: <N> ativos abaixo de <meta>", com "1 ativo" no singular;
- "Alertas que voltam fora da meta: <N> ativos com o mesmo alerta <meta> vezes ou mais", com "1 ativo" no singular.

Enquanto o indicador continua fora da meta, o sistema SHALL NOT notificar de novo. Depois de voltar à meta ou de ficar sem dado, uma nova saída SHALL notificar de novo. Se o servidor estava desligado na hora marcada, a avaliação SHALL rodar uma vez quando ele voltar.

#### Scenario: Toner sai da meta
- **WHEN** na avaliação das 07:00 a mediana do toner fica em 3,2 dias, com a meta de 2 dias, e no dia anterior estava dentro da meta
- **THEN** cada conta com `alertas.administrar` recebe a notificação de Atenção "Tempo de atendimento do toner fora da meta: 3,2 dias, com a meta de 2 dias"

#### Scenario: Continua fora da meta
- **WHEN** no dia seguinte a mediana do toner continua acima da meta
- **THEN** nenhuma notificação nova sai

#### Scenario: Volta e sai de novo
- **WHEN** o indicador volta à meta num dia e sai dela de novo uma semana depois
- **THEN** a nova saída notifica quem administra os alertas de novo

#### Scenario: Módulo desligado
- **WHEN** a organização desligou o módulo Alertas
- **THEN** os indicadores dela não são avaliados, e nada é notificado
