## ADDED Requirements

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
