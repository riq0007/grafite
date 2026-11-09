# notificacoes Specification

## Purpose

Levar à tela o que precisa da atenção do usuário e guardar o histórico numa central, com as regras de severidade, tempo e quantidade da seção 7.4 da spec mestre e as escolhas do próprio usuário.

## Requirements

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

### Requirement: Retorno de operação

O aviso com o resultado de uma operação que o próprio usuário acabou de fazer SHALL seguir o tempo escolhido. Ele SHALL NOT entrar na central nem na contagem do sino, e as escolhas de severidade SHALL NOT escondê-lo.

#### Scenario: Operação concluída
- **WHEN** uma operação do usuário termina com sucesso, com os avisos de Informação desligados
- **THEN** o aviso de sucesso aparece, some no tempo escolhido e não entra na central

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

### Requirement: E-mail do crítico na hora

Cada notificação crítica SHALL ir por e-mail, logo depois de gravada, para o e-mail da pessoa da conta, quando:
- o servidor envia e-mail (requisito "Canais desligados sem configuração");
- a pessoa tem e-mail;
- a conta não desligou o e-mail do crítico (spec preferencias-da-interface).

O e-mail SHALL sair em texto, com:
- o assunto "Crítico: <título>";
- o título, a descrição e a origem;
- o endereço do registro, no endereço de acesso da organização, quando a notificação tem um;
- o nome da organização e onde mudar o que chega por e-mail, "Ajustes › Notificações".

A notificação SHALL ir por e-mail uma vez só, também quando o envio é tentado de novo. A falha do envio SHALL ser tentada de novo pela fila de tarefas e, esgotadas as tentativas, SHALL aparecer em Tarefas com falha (spec fila-de-tarefas), sem mudar a notificação na central.

#### Scenario: Alerta crítico com e-mail
- **WHEN** abre o alerta crítico "Black Toner Cartridge em 8%", e a pessoa da conta que o vê tem o e-mail ana.souza@empresa.com.br
- **THEN** chega a ana.souza@empresa.com.br um e-mail com o assunto "Crítico: Black Toner Cartridge em 8%" e o endereço da ficha da impressora

#### Scenario: Pessoa sem e-mail
- **WHEN** abre um alerta crítico, e a pessoa da conta não tem e-mail
- **THEN** nenhum e-mail sai para ela, e a notificação fica na central

#### Scenario: E-mail do crítico desligado
- **WHEN** a conta desligou o e-mail do crítico, e abre um alerta crítico que ela vê
- **THEN** nenhum e-mail sai na hora, e a notificação entra no resumo seguinte, se ainda não estiver lida

#### Scenario: Atenção não vai na hora
- **WHEN** chega uma notificação de Atenção
- **THEN** nenhum e-mail sai na hora, e ela espera o resumo

#### Scenario: Servidor de e-mail fora do ar
- **WHEN** o servidor de e-mail recusa a conexão em todas as tentativas
- **THEN** a entrega aparece em Tarefas com falha, e a notificação continua na central, não lida

### Requirement: Resumo diário por e-mail

Todo dia às 8h, no fuso do servidor, cada conta com o resumo ligado SHALL receber um e-mail só com as notificações dela que ainda não foram lidas nem foram por e-mail, da mais nova para a mais antiga, em até 50, com quantas mais há na central. Sem nenhuma, nenhum e-mail SHALL sair. As notificações do resumo SHALL contar como enviadas por e-mail, e o resumo seguinte SHALL NOT repeti-las.

O resumo SHALL valer só para a pessoa com e-mail, num servidor que envia e-mail. O assunto SHALL ser "Resumo do Grafite: N notificações não lidas", e cada linha SHALL trazer a severidade em texto, o título, a origem e o horário.

#### Scenario: Resumo com Atenção e Informação
- **WHEN** às 8h a conta tem 3 notificações não lidas, de Atenção e de Informação, que não foram por e-mail
- **THEN** chega um e-mail "Resumo do Grafite: 3 notificações não lidas", com as três

#### Scenario: Nada para resumir
- **WHEN** às 8h a conta não tem notificação não lida que não foi por e-mail
- **THEN** nenhum e-mail sai para ela

#### Scenario: Lida antes do resumo
- **WHEN** uma notificação de Atenção chega às 15h e é lida às 16h
- **THEN** o resumo do dia seguinte não a traz

#### Scenario: Crítico já enviado
- **WHEN** uma notificação crítica foi por e-mail na hora e continua não lida
- **THEN** o resumo seguinte não a repete

#### Scenario: Resumo desligado
- **WHEN** a conta desligou o resumo
- **THEN** nenhum resumo sai para ela

### Requirement: Push por severidade

Cada notificação SHALL ir por push, logo depois de gravada, para cada aparelho inscrito da conta (requisito "Aparelhos do push"), quando a severidade dela está entre as que a conta escolheu para o push (spec preferencias-da-interface). Com o modo Foco ligado, só o Crítico SHALL ir para o push.

O push SHALL mostrar, pelo sistema do aparelho, mesmo com o Grafite fechado:
- a severidade e o título, como "Crítico: Black Toner Cartridge em 8%";
- a descrição;
- o ícone do Grafite.

Tocar no push SHALL abrir o Grafite no endereço da notificação, ou na tela inicial quando ela não tem endereço, numa janela do Grafite já aberta quando houver. O conteúdo do push SHALL ir cifrado de ponta a ponta até o aparelho.

A notificação SHALL ir por push uma vez só para cada aparelho, também quando o envio é tentado de novo.

#### Scenario: Crítico no celular
- **WHEN** abre um alerta crítico que a conta vê, e ela tem o celular inscrito
- **THEN** o celular mostra "Crítico: Black Toner Cartridge em 8%", e tocar nele abre a ficha da impressora no Grafite

#### Scenario: Atenção fora das escolhas
- **WHEN** chega uma notificação de Atenção, e a conta escolheu só o Crítico para o push
- **THEN** nenhum aparelho recebe push dela

#### Scenario: Foco no celular
- **WHEN** a conta escolheu Crítico e Atenção para o push, ligou o modo Foco, e chega uma notificação de Atenção
- **THEN** nenhum aparelho recebe push dela

#### Scenario: Dois aparelhos
- **WHEN** a conta tem o celular e o computador inscritos, e chega uma notificação crítica
- **THEN** os dois recebem o push

### Requirement: Aparelhos do push

A conta SHALL poder inscrever o aparelho em que está, pelos Ajustes, depois de o navegador permitir os avisos. A inscrição SHALL guardar o aparelho com um nome, como "Chrome no Android", e o momento. A conta SHALL ver os aparelhos dela, com "Este aparelho" no que está em uso, e SHALL poder tirar qualquer um deles. Uma conta SHALL NOT ver nem tirar os aparelhos de outra.

O aparelho que o serviço de push diz que não existe mais SHALL sair da lista sozinho. A conta inativada SHALL perder os aparelhos dela.

A API SHALL aceitar só a inscrição num serviço de push conhecido dos navegadores, em `https://`. A inscrição em outro endereço SHALL ser recusada com 400, sem nenhum pedido do servidor a ele: o servidor nunca manda o push a um endereço que a conta escolheu.

O aparelho sem como receber o push SHALL ver o motivo em texto:
- o navegador sem push;
- o iPhone e o iPad fora do Grafite instalado na tela de início;
- os avisos bloqueados no navegador, com a explicação de como liberar.

#### Scenario: Inscrever o celular
- **WHEN** a conta liga os avisos no celular, e o navegador permite
- **THEN** o celular aparece na lista como "Este aparelho" e passa a receber o push

#### Scenario: Avisos bloqueados
- **WHEN** a conta liga os avisos, e o navegador nega a permissão
- **THEN** o aparelho não entra na lista, e a seção explica que os avisos estão bloqueados no navegador e como liberar

#### Scenario: Tirar um aparelho
- **WHEN** a conta tira o computador da lista
- **THEN** ele some da lista e para de receber o push

#### Scenario: Aparelho que deixou de existir
- **WHEN** o serviço de push responde que a inscrição do aparelho não existe mais
- **THEN** o aparelho sai da lista da conta, e os outros continuam recebendo

#### Scenario: Aparelho de outra conta
- **WHEN** uma conta pede para tirar um aparelho de outra
- **THEN** a API responde 404, e o aparelho continua inscrito

#### Scenario: Endereço fora dos serviços de push
- **WHEN** um pedido inscreve um aparelho com o endereço `http://10.0.0.5/admin`
- **THEN** a API responde 400, nada é gravado, e o servidor não faz nenhum pedido a esse endereço

### Requirement: Teste dos canais

A conta SHALL poder mandar para si um e-mail de teste e um aviso de teste pelo push, nos Ajustes, para conferir o canal. O teste SHALL usar o mesmo caminho da notificação, SHALL NOT entrar na central, e a tela SHALL dizer o resultado em texto:
- "E-mail de teste enviado para <e-mail>.";
- "Aviso de teste enviado para N aparelhos.";
- ou o motivo da falha, com o código de rastreio.

#### Scenario: E-mail de teste
- **WHEN** a conta, com a pessoa com e-mail, escolhe "Mandar um e-mail de teste"
- **THEN** chega um e-mail de teste ao e-mail dela, a tela diz para qual e-mail foi, e nada entra na central

#### Scenario: Servidor de e-mail recusa
- **WHEN** o servidor de e-mail recusa o envio do teste
- **THEN** a tela diz que o servidor de e-mail recusou o envio, com o código de rastreio

#### Scenario: Aviso de teste
- **WHEN** a conta, com dois aparelhos inscritos, escolhe "Mandar um aviso de teste"
- **THEN** os dois aparelhos mostram o aviso de teste, a tela diz "Aviso de teste enviado para 2 aparelhos.", e nada entra na central

### Requirement: Canais desligados sem configuração

Sem o servidor de e-mail configurado, nenhum e-mail SHALL sair, e os Ajustes SHALL dizer "O envio de e-mail não está configurado neste servidor.". Sem as chaves do push, nenhum push SHALL sair, nenhum aparelho SHALL ser inscrito, e os Ajustes SHALL dizer "Os avisos no celular não estão configurados neste servidor.". Nos dois casos, as notificações SHALL continuar na central e no aviso na tela.

No ambiente de teste (spec operacao-servicos), o e-mail e o push SHALL ficar desligados, mesmo com a configuração, porque o teste tem a cópia das contas da produção. Os Ajustes SHALL dizer "O ambiente de teste não envia e-mail nem avisos no celular.".

#### Scenario: Servidor sem SMTP
- **WHEN** abre um alerta crítico num servidor sem o servidor de e-mail configurado
- **THEN** nenhum e-mail sai, a notificação fica na central, e os Ajustes dizem que o envio de e-mail não está configurado

#### Scenario: Ambiente de teste
- **WHEN** abre um alerta crítico no ambiente de teste, com a cópia das contas da produção
- **THEN** nenhum e-mail nem push sai para as pessoas, e os Ajustes dizem que o ambiente de teste não envia e-mail nem avisos no celular
