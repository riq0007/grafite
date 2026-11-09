## Purpose

Dizer, a partir das ordens de serviço e das saídas do estoque, se a operação da TI está dando conta: o tempo de resolução das OS, as OS repetidas e as páginas por toner, cada um com a meta da organização, a situação em texto e a decisão que ele pede, e quem administra a operação é avisado quando um indicador sai da meta.

## ADDED Requirements

### Requirement: Período dos indicadores da operação

Os indicadores da operação SHALL ser calculados sobre os últimos 30 dias até o momento da consulta e comparados com os 30 dias anteriores a eles, como os indicadores dos alertas (spec indicadores, "Período dos indicadores"). Cada indicador SHALL mostrar o valor do período e o do período anterior, como "Antes: 4,5 dias", ou "Antes: sem dado" quando o período anterior não tem dado para ele.

Os tempos e as porcentagens SHALL ser escritos como nos indicadores dos alertas, como "1,5 dia", "80%" e "61,7%". As quantidades SHALL levar a unidade, no singular e no plural, como "1 ativo", "3 ativos", "1 toner" e "2 toners".

#### Scenario: Comparação com os 30 dias anteriores
- **WHEN** o tempo de resolução das OS fica em 2 dias nos últimos 30 dias e ficou em 4,5 dias nos 30 dias antes deles
- **THEN** o indicador mostra "2 dias" e "Antes: 4,5 dias"

### Requirement: Tempo de resolução das OS

O indicador SHALL ser a mediana do tempo entre a abertura e a resolução das OS resolvidas no período, isto é, com a resolução dentro dele (spec ordens-de-servico). O tempo SHALL contar tudo, também a espera pela peça e pelo fornecedor: é o tempo em que o ativo ficou parado. A OS reaberta e resolvida de novo SHALL contar da abertura até a última resolução. A OS encerrada sem resolver SHALL NOT entrar.

O indicador SHALL listar as OS acima da meta: primeiro as em aberto há mais tempo que a meta, como "Aberta há 5 dias", da mais antiga para a mais nova, e depois as resolvidas no período depois da meta, da mais demorada para a mais rápida. Cada uma SHALL mostrar o número, que leva à ficha dela, o ativo, o local, o problema, o tempo e, quando houve, a espera, pela soma do tempo em Aguardando peça e em Aguardando fornecedor, como "4 dias esperando o fornecedor" ou "1 dia esperando a peça e 4 dias esperando o fornecedor".

Sem nenhuma OS resolvida no período, o indicador SHALL mostrar "Nenhuma OS resolvida nos últimos 30 dias.", sem valor.

#### Scenario: Mediana das OS resolvidas
- **WHEN** três OS foram resolvidas no período, depois de 1 dia, de 2 dias e de 6 dias, e a meta é 3 dias
- **THEN** o indicador mostra "2 dias", dentro da meta, e lista a OS que levou 6 dias

#### Scenario: Espera pelo fornecedor
- **WHEN** a OS 12 levou 6 dias da abertura à resolução, 4 deles Aguardando fornecedor
- **THEN** a lista mostra a OS 12 com "6 dias" e "4 dias esperando o fornecedor"

#### Scenario: OS ainda em aberto
- **WHEN** a OS 20 está aberta há 5 dias, e a meta é 3 dias
- **THEN** a lista mostra a OS 20 antes das resolvidas, com "Aberta há 5 dias"

#### Scenario: OS aberta por engano
- **WHEN** a OS 15 foi encerrada sem resolver no período
- **THEN** ela não entra na mediana nem na lista

### Requirement: OS repetidas

O indicador SHALL contar os ativos com a quantidade de OS da meta ou mais, abertas no período, em qualquer situação, menos as encerradas sem resolver, que marcam a OS aberta por engano ou no ativo errado. Ele SHALL listá-los do que teve mais OS para o que teve menos e, no empate, do que teve a última mais recente, com o ativo, que leva à ficha dele, o local, quantas OS, como "3 OS", e as OS, cada uma com o número, que leva à ficha dela, e o problema.

Sem nenhum, o indicador SHALL mostrar "Nenhum ativo com <meta> OS nos últimos 30 dias.", como "Nenhum ativo com 2 OS nos últimos 30 dias.".

#### Scenario: Problema que voltou
- **WHEN** o NB-0031 teve a OS 12, "Não liga", e a OS 20, "Não liga de novo", abertas no período, e a meta é 2 OS
- **THEN** o indicador mostra "1 ativo", fora da meta, e lista o NB-0031 com "2 OS", a OS 12 e a OS 20

#### Scenario: OS no ativo errado
- **WHEN** a OS 15 foi aberta no NB-0031 por engano e encerrada sem resolver, e o NB-0031 tem só mais uma OS no período
- **THEN** o NB-0031 não entra no indicador

### Requirement: Páginas por toner

Cada toner SHALL ser medido pelas páginas que a impressora imprimiu com ele: a diferença do total de páginas (spec impressoras-por-snmp) entre a saída do estoque que o levou à impressora (spec estoque) e a saída seguinte de um toner da mesma cor para a mesma impressora, que o trocou. As páginas SHALL ser comparadas com o rendimento do consumível dele (spec consumiveis), em porcentagem do rendimento.

Um toner trocado no período, isto é, com a saída seguinte dentro dele, SHALL entrar no indicador quando:
- o consumível dele é do tipo Toner e tem o rendimento;
- as duas saídas têm o total de páginas, e o da seguinte não é menor que o da dele;
- a saída dele levou um toner só: a de mais de um não diz quando o segundo foi posto.

O toner de cor SHALL contar pelo total de páginas da impressora, como o preto, porque a coleta traz só o total.

O indicador SHALL contar os toners trocados no período que renderam menos que a meta e SHALL listá-los do que rendeu menos para o que rendeu mais, com a impressora, que leva à ficha dela, o local, o consumível, as páginas sobre o rendimento, como "1.850 de 3.000 páginas (61,7%)", e quando o toner foi trocado.

Sem nenhum toner trocado no período que entre no indicador, ele SHALL mostrar "Nenhum toner trocado com o total de páginas nos últimos 30 dias.", sem valor. Com os toners e nenhum abaixo da meta, SHALL mostrar "Nenhum toner abaixo de <meta> do rendimento.", como "Nenhum toner abaixo de 80% do rendimento.".

#### Scenario: Toner que rendeu pouco
- **WHEN** o CF258A, de 3.000 páginas, saiu para a PAT-00412 com o total de 40.000 páginas e foi trocado por outro toner preto com 41.850, e a meta é 80%
- **THEN** o indicador conta esse toner e o lista com "1.850 de 3.000 páginas (61,7%)"

#### Scenario: Troca sem o total de páginas
- **WHEN** a saída que trocou o toner preto da PAT-00412 não tem o total de páginas, porque a impressora não respondia
- **THEN** esse toner não entra no indicador

#### Scenario: Saída de dois toners
- **WHEN** a saída levou 2 CF258A de uma vez para a PAT-00412
- **THEN** o toner dessa saída não entra no indicador

#### Scenario: Compatível na troca
- **WHEN** o CF258A da PAT-00412 foi trocado pelo CF258X, outro toner preto
- **THEN** as páginas do CF258A contam até a saída do CF258X, comparadas com o rendimento do CF258A

### Requirement: Situação e decisão dos indicadores da operação

Cada indicador SHALL mostrar a meta, como "Meta: 3 dias", e a situação, em texto e com o ícone: "Dentro da meta", "Fora da meta" ou "Sem dado". O tempo de resolução SHALL ficar fora da meta quando a mediana passa da meta; as OS repetidas e as páginas por toner, quando há pelo menos um ativo ou um toner na lista. Fora da meta, o indicador SHALL mostrar a decisão que ele pede:
- tempo de resolução das OS: "Veja onde as OS esperam: deixe no estoque as peças que mais faltam, ou cobre os fornecedores que mais demoram.";
- OS repetidas: "Confira se o conserto resolveu a causa do problema, ou se o ativo deve ser substituído.";
- páginas por toner: "Confira a qualidade do consumível e do fornecedor, e a configuração da impressora.".

#### Scenario: Resolução fora da meta
- **WHEN** a mediana do tempo de resolução fica em 4 dias, e a meta é 3 dias
- **THEN** o indicador mostra "Fora da meta" e "Veja onde as OS esperam: deixe no estoque as peças que mais faltam, ou cobre os fornecedores que mais demoram."

#### Scenario: Sem dado
- **WHEN** nenhuma OS foi resolvida nos últimos 30 dias
- **THEN** o tempo de resolução mostra "Sem dado", sem a decisão

### Requirement: Metas dos indicadores da operação

Cada indicador SHALL ter uma meta da organização, a mesma para todas as contas, com a meta de fábrica e os limites:

| Indicador | De fábrica | Limites |
|---|---|---|
| Tempo de resolução das OS | 3 dias | de 1 h a 30 dias |
| OS repetidas | 2 OS | de 2 a 10 OS |
| Páginas por toner | 80% | de 50% a 100%, com uma casa decimal |

Quem tem `operacao.administrar` SHALL mudar a meta pela tela dos indicadores, com o retorno "Meta salva.". A meta fora dos limites SHALL ser recusada com "A meta deve ficar entre <mínimo> e <máximo>.", como "A meta deve ficar entre 50% e 100%.". A mudança SHALL ser registrada na auditoria (spec auditoria) e SHALL atualizar a tela dos indicadores da operação de quem estiver com ela aberta, sem recarregar.

#### Scenario: Meta mudada
- **WHEN** quem administra a operação muda a meta das OS repetidas de 2 OS para 3 OS
- **THEN** a tela mostra "Meta salva.", o indicador passa a contar os ativos com 3 OS ou mais, e a auditoria registra "2 OS → 3 OS"

#### Scenario: Meta fora dos limites
- **WHEN** alguém tenta pôr a meta das páginas por toner em 40%
- **THEN** a meta é recusada com "A meta deve ficar entre 50% e 100%."

#### Scenario: Quem atende sem administrar
- **WHEN** uma conta com `ordens.atender`, sem `operacao.administrar`, abre os indicadores
- **THEN** ela vê as metas, sem "Mudar a meta", e a API recusa a mudança dela com 403

### Requirement: Quem vê os indicadores da operação

O tempo de resolução e as OS repetidas SHALL aparecer para quem tem `ordens.ver` em algum escopo, calculados só com as OS que a conta vê (spec ordens-de-servico, "Quem vê e quem atende as OS"). As páginas por toner SHALL aparecer para quem tem `estoque.ver` em algum escopo, calculadas só com os toners trocados por saídas que a conta vê (spec estoque, "Quem vê e quem movimenta o estoque"); da saída anterior de cada toner SHALL entrar só o total de páginas e o consumível, qualquer que seja o local dela.

#### Scenario: Técnico de Jundiaí
- **WHEN** Carla tem `ordens.atender` só em Jundiaí, sem `estoque.ver`
- **THEN** ela vê o tempo de resolução e as OS repetidas calculados com as OS de Jundiaí, sem as páginas por toner

#### Scenario: Almoxarife
- **WHEN** uma conta com `estoque.ver`, sem `ordens.ver`, abre os indicadores da operação
- **THEN** ela vê só as páginas por toner

### Requirement: Tela dos indicadores da operação

A tela Indicadores do Operação SHALL mostrar o período, "Últimos 30 dias, comparados com os 30 anteriores", e os indicadores que a conta vê, nesta ordem: o tempo de resolução das OS, as OS repetidas e as páginas por toner. Cada um SHALL ter o nome, uma linha com o que ele mede e a base do cálculo, como "Mediana de 12 OS resolvidas", "34 ativos com OS no período" ou "8 toners trocados com o total de páginas", o valor, o valor anterior, a meta, a situação, a decisão fora da meta e a lista, com até 20 linhas e "E mais <N>." quando passar disso. Para quem tem `operacao.administrar`, cada indicador SHALL oferecer "Mudar a meta", num diálogo, como nos indicadores dos alertas.

Enquanto os indicadores carregam, a tela SHALL mostrar o esqueleto. Com a falha da API, SHALL mostrar "Não foi possível carregar os indicadores." e "Tentar de novo". A tela SHALL se atualizar sozinha quando as OS, o estoque, os consumíveis ou as metas mudam, sem uma ação do usuário. O endereço da tela SHALL aceitar o indicador em foco, que a notificação usa.

#### Scenario: Abrir pela notificação
- **WHEN** quem administra a operação abre a notificação "OS repetidas fora da meta"
- **THEN** a tela dos indicadores da operação abre com o foco nas OS repetidas

#### Scenario: Lista longa
- **WHEN** 23 toners trocados no período renderam menos que a meta
- **THEN** a lista mostra os 20 que renderam menos e "E mais 3."

### Requirement: Indicador da operação fora da meta avisa

Uma vez por dia, às 07:00 no horário de Brasília, cada organização com o módulo Operação ligado SHALL ter os indicadores da operação avaliados com todas as OS e todas as saídas dela. Quando um indicador sai da meta, isto é, está fora da meta e, na avaliação anterior, estava dentro, sem dado ou ainda não tinha sido avaliado, o sistema SHALL notificar (spec notificacoes) cada conta ativa com `operacao.administrar`, com a severidade Atenção, a origem "Operação", o endereço da tela dos indicadores da operação com o foco no indicador, a decisão como descrição e o título:
- "Tempo de resolução das OS fora da meta: <valor>, com a meta de <meta>";
- "OS repetidas fora da meta: <N> ativos com <meta> OS ou mais", com "1 ativo" no singular;
- "Páginas por toner fora da meta: <N> toners abaixo de <meta> do rendimento", com "1 toner" no singular.

Enquanto o indicador continua fora da meta, o sistema SHALL NOT notificar de novo. Depois de voltar à meta ou de ficar sem dado, uma nova saída SHALL notificar de novo. Se o servidor estava desligado na hora marcada, a avaliação SHALL rodar uma vez quando ele voltar.

#### Scenario: Resolução sai da meta
- **WHEN** na avaliação das 07:00 a mediana do tempo de resolução fica em 4,2 dias, com a meta de 3 dias, e no dia anterior estava dentro da meta
- **THEN** cada conta com `operacao.administrar` recebe a notificação de Atenção "Tempo de resolução das OS fora da meta: 4,2 dias, com a meta de 3 dias"

#### Scenario: Continua fora da meta
- **WHEN** no dia seguinte as páginas por toner continuam com toners abaixo da meta
- **THEN** nenhuma notificação nova sai

#### Scenario: Módulo desligado
- **WHEN** a organização desligou o módulo Operação
- **THEN** os indicadores da operação dela não são avaliados, e nada é notificado
