## ADDED Requirements

### Requirement: Notificações gravadas no servidor

As notificações SHALL ficar gravadas no servidor, cada uma de uma conta, e cada conta SHALL ver só as dela. A leitura SHALL valer em toda aba e em todo aparelho da conta: ler uma notificação, ou todas, numa aba SHALL tirá-las da contagem das outras, sem recarregar. Recarregar a página SHALL manter a central como estava.

A manutenção diária SHALL apagar as notificações com mais de 90 dias, lidas ou não (spec fila-de-tarefas).

#### Scenario: Recarregar a página
- **WHEN** Ana tem 3 notificações não lidas e recarrega a página
- **THEN** a central mostra as mesmas 3 notificações, não lidas, e o sino diz "Notificações, 3 não lidas"

#### Scenario: Lida no outro aparelho
- **WHEN** Ana abre uma notificação no notebook, com a aplicação aberta também no celular
- **THEN** o sino do celular passa a contar uma não lida a menos, sem recarregar

#### Scenario: Notificação de outra conta
- **WHEN** Bruno pede à API para marcar como lida uma notificação de Ana
- **THEN** a API responde que ela não existe, e a notificação continua não lida para Ana

#### Scenario: Notificação antiga
- **WHEN** a manutenção diária roda, e Ana tem uma notificação de 91 dias e outra de 89
- **THEN** a de 91 dias é apagada, e a de 89 fica

### Requirement: Notificações dos alertas

Quando um alerta abre (spec alertas), cada conta ativa que vê o alerta naquele momento SHALL ganhar a notificação dele. Vê o alerta quem tem `alertas.ver`, ou uma permissão que a inclui, no escopo do local do ativo. No alerta de um coletor ou de um ativo sem local, vê quem tem a permissão na organização inteira.

A notificação SHALL ter:
- a severidade do alerta;
- o texto do alerta, como título;
- como descrição, o ativo, pelo nome e pelo patrimônio, ou o coletor, pelo nome;
- a origem "Alertas";
- o endereço da ficha do ativo, ou o da tela do coletor;
- o alerta, para as ações.

O alerta que abre com o ativo silenciado SHALL NOT notificar, nem quando o silêncio termina. Um alerta aberto SHALL NOT notificar de novo quando muda de texto ou de severidade, é reconhecido, é adiado ou volta do adiamento. O alerta que se resolve e abre de novo é outro alerta, e SHALL notificar.

Quando mais de 5 alertas abrem para a mesma conta numa avaliação, ela SHALL ganhar uma notificação só no lugar deles:
- o título "N alertas abertos", como "12 alertas abertos";
- a severidade mais alta entre eles;
- a origem "Alertas";
- o endereço da lista dos alertas abertos;
- nenhum alerta, e por isso sem as ações.

#### Scenario: Toner de Jundiaí
- **WHEN** abre o alerta "Black Toner Cartridge em 8%" de uma impressora de Jundiaí, e Ana vê os alertas na organização inteira, Bruno só em Jundiaí e Carla só em Campinas
- **THEN** Ana e Bruno ganham a notificação, com a descrição "HP LaserJet M404 · PAT-00412", e Carla não ganha

#### Scenario: Aberto no silêncio
- **WHEN** a impressora está silenciada até as 18:00, e o alerta do toner abre às 15:00
- **THEN** ninguém ganha a notificação, nem às 18:00

#### Scenario: Muitos alertas de uma vez
- **WHEN** 12 ativos de Jundiaí ficam offline, e os 12 alertas abrem na mesma avaliação, um deles Crítico
- **THEN** Ana ganha uma notificação só, "12 alertas abertos", Crítica, que leva à lista dos alertas abertos

#### Scenario: Conta inativa
- **WHEN** a conta de Bruno está inativa, e abre um alerta de Jundiaí
- **THEN** Bruno não ganha a notificação

### Requirement: Aviso numa aba só

Com a aplicação aberta em várias abas do mesmo navegador, cada notificação SHALL virar aviso numa aba só: a usada por último. As outras abas SHALL atualizar só o sino e a central.

O aviso SHALL sair da tela, em qualquer aba, quando:
- a notificação é lida;
- o alerta dela é reconhecido ou adiado, por esta conta ou por outra;
- o alerta dela se resolve.

#### Scenario: Duas abas
- **WHEN** Ana tem a aplicação aberta em duas abas, está usando a segunda, e chega uma notificação Crítica
- **THEN** o aviso aparece só na segunda aba, e o sino das duas conta a notificação

#### Scenario: Reconhecido por outra conta
- **WHEN** o aviso Crítico do toner está na tela de Ana, e Bruno reconhece o alerta na lista
- **THEN** o aviso sai da tela de Ana, e a notificação continua na central dela, não lida

### Requirement: Ações do alerta na notificação

A notificação Crítica de um alerta aberto, ainda não reconhecido nem adiado, SHALL oferecer as ações no aviso e na central a quem pode tratar o alerta, com `alertas.tratar` no escopo dele:
- "Reconhecer", que reconhece o alerta (spec alertas) e marca a notificação como lida;
- "Adiar 15 min", que adia o alerta por 15 minutos e marca a notificação como lida.

Quem só vê o alerta SHALL ver a notificação sem essas ações. Depois que o alerta é reconhecido, adiado ou resolvido, a notificação SHALL ficar sem as ações, e a central SHALL dizer em texto como ele está: "Reconhecido por Ana Souza", "Adiado até 15:45" ou "Resolvido".

#### Scenario: Reconhecer pelo aviso
- **WHEN** Ana escolhe "Reconhecer" no aviso Crítico do toner
- **THEN** o alerta fica reconhecido por Ana, o aviso sai da tela, e a notificação passa a lida

#### Scenario: Só vê o alerta
- **WHEN** chega a Bruno, que só tem `alertas.ver`, a notificação Crítica do toner
- **THEN** o aviso aparece com "Abrir", sem "Reconhecer" nem "Adiar 15 min"

#### Scenario: Alerta já resolvido
- **WHEN** Ana abre a central depois que o toner foi trocado e o alerta se resolveu
- **THEN** a notificação do toner diz "Resolvido", sem as ações

### Requirement: Modo Foco

O usuário SHALL poder ligar e desligar o modo Foco na central e na seção Notificações dos Ajustes. Com o Foco ligado, só as notificações Críticas SHALL virar aviso. As de Atenção e de Informação SHALL ir direto para a central, sem mudar as escolhas de cada severidade. O Foco SHALL ficar nas preferências da conta, valendo em todo aparelho, até o usuário desligá-lo.

#### Scenario: Foco ligado
- **WHEN** Ana liga o Foco, e chega uma notificação de Atenção
- **THEN** nenhum aviso aparece, e a notificação está na central, não lida

#### Scenario: Crítico no Foco
- **WHEN** o Foco está ligado, e chega uma notificação Crítica
- **THEN** o aviso aparece e fica até ser reconhecido, adiado ou fechado

#### Scenario: Foco desligado
- **WHEN** Ana desliga o Foco, com a Atenção ligada nos Ajustes, e chega uma notificação de Atenção
- **THEN** o aviso aparece e some no tempo escolhido

## MODIFIED Requirements

### Requirement: Notificar

Um módulo SHALL notificar pela API, que grava a notificação para cada conta que deve recebê-la, informando:
- a severidade: Crítico, Atenção ou Informação;
- o título e, se houver, a descrição;
- a origem, que é o módulo;
- se houver, o endereço do registro, para "Abrir";
- se houver, o alerta de que ela trata, que dá as ações de reconhecer e de adiar.

Cada notificação SHALL entrar na central da conta como não lida, com o momento em que foi gravada.

#### Scenario: Notificação com endereço
- **WHEN** o módulo Alertas notifica Ana de "Black Toner Cartridge em 8%", Crítico, com o endereço da impressora
- **THEN** a notificação entra na central de Ana como não lida, e "Abrir" leva à ficha da impressora

### Requirement: Aviso na tela conforme as preferências

Uma notificação que chega com a aplicação aberta SHALL virar aviso na tela conforme a severidade:
- **Crítico:** sempre, e o aviso fica até ser reconhecido, adiado ou fechado.
- **Atenção e Informação:** só se o usuário mantiver essa severidade ligada nos Ajustes, com o modo Foco desligado. O aviso some depois do tempo escolhido (6 s de fábrica, 10 s ou 20 s), com a contagem pausada enquanto o ponteiro ou o foco estão sobre ele.

A notificação que não vira aviso SHALL ir direto para a central. Fechar um aviso SHALL NOT tirar a notificação da central nem marcá-la como lida. A notificação gravada com a aplicação fechada SHALL ir só para a central e para a contagem do sino, sem aviso.

#### Scenario: Informação desligada
- **WHEN** o usuário desligou os avisos de Informação e chega uma notificação de Informação
- **THEN** nenhum aviso aparece, e a notificação está na central, não lida

#### Scenario: Tempo de 20 s
- **WHEN** o tempo escolhido é 20 s e chega uma notificação de Atenção
- **THEN** o aviso fica 20 s na tela, sem contar o tempo em que o ponteiro está sobre ele

#### Scenario: Crítico
- **WHEN** chega uma notificação Crítica
- **THEN** o aviso fica na tela até o usuário reconhecer, adiar ou fechar, qualquer que seja o tempo escolhido

#### Scenario: Aplicação fechada
- **WHEN** um alerta Crítico abre de madrugada, com a aplicação de Ana fechada
- **THEN** ao abrir a aplicação, Ana vê a notificação na central e no sino, sem aviso na tela

### Requirement: Sino e não lidas

A barra superior SHALL ter o item Notificações, com um sino e, havendo não lidas, o número delas: até 99, e "99+" acima disso. Com o modo Foco ligado, o item SHALL mostrar também o texto "Foco". O nome acessível SHALL dizer o número exato, como "Notificações, 3 não lidas", e o Foco, quando ligado, como "Notificações, 3 não lidas, Foco ligado". Escolher o item SHALL abrir a central. A contagem SHALL vir do servidor e mudar na hora em que uma notificação chega ou é lida, em qualquer aba da conta.

#### Scenario: Nenhuma não lida
- **WHEN** não há notificação não lida
- **THEN** o sino aparece sem número, e o nome acessível é "Notificações, nenhuma não lida"

#### Scenario: Muitas não lidas
- **WHEN** há 120 notificações não lidas
- **THEN** o sino mostra "99+", e o nome acessível diz "Notificações, 120 não lidas"

#### Scenario: Foco ligado no sino
- **WHEN** o Foco está ligado, e há 2 notificações não lidas
- **THEN** o item mostra o sino com "2" e o texto "Foco", e o nome acessível é "Notificações, 2 não lidas, Foco ligado"

### Requirement: Central de notificações

A central SHALL abrir como gaveta à direita, com superfície sólida e o foco preso. SHALL fechar com Esc, devolvendo o foco ao sino.

A central SHALL listar as notificações da conta da mais recente para a mais antiga, agrupadas por dia ("Hoje", "Ontem" e a data), e trazer as seguintes ao chegar ao fim da lista. Cada notificação SHALL mostrar a severidade em texto, o título, a descrição, a origem, o horário e se está lida. A central SHALL oferecer:
- filtros por severidade e "Só não lidas", aplicados pelo servidor sobre todas as notificações da conta;
- "Abrir", quando a notificação tem endereço, que leva ao registro e a marca como lida;
- "Marcar como lida" em cada notificação e "Marcar todas como lidas", que vale para todas as da conta, também as que a central ainda não trouxe;
- as ações do alerta, nas notificações que as têm;
- o modo Foco, ligado ou desligado.

Sem notificações, a central SHALL mostrar "Nenhuma notificação.". Quando os filtros não deixam nenhuma, SHALL mostrar "Nenhuma notificação com esses filtros." e "Limpar filtros". Sem resposta do servidor, SHALL mostrar "Não foi possível carregar as notificações." e "Tentar de novo".

#### Scenario: Filtro por severidade
- **WHEN** a central tem notificações Críticas e de Informação, e o usuário filtra por Crítico
- **THEN** só as Críticas aparecem

#### Scenario: Abrir
- **WHEN** o usuário escolhe "Abrir" numa notificação com endereço
- **THEN** a central fecha, a casca navega até o registro, e a notificação passa a lida

#### Scenario: Central vazia
- **WHEN** não há nenhuma notificação
- **THEN** a central mostra "Nenhuma notificação."

#### Scenario: Central no celular
- **WHEN** a central abre num celular com 390 px de largura
- **THEN** ela ocupa a largura da tela, sem rolagem horizontal

#### Scenario: Marcar todas
- **WHEN** Ana tem 130 notificações não lidas, a central mostra as 50 primeiras, e ela escolhe "Marcar todas como lidas"
- **THEN** as 130 passam a lidas, e o sino fica sem número

## REMOVED Requirements

### Requirement: Notificações da sessão até o P3

**Reason**: O P3b grava as notificações no servidor, e a central não esvazia mais ao recarregar a página.

**Migration**: As notificações vêm da API, pelo requisito "Notificações gravadas no servidor". As da sessão não são guardadas, e nenhuma notificação de exemplo é criada.
