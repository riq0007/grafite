## MODIFIED Requirements

### Requirement: Notificar

Um módulo SHALL notificar pela API, que grava a notificação para cada conta que deve recebê-la, informando:
- a severidade: Crítico, Atenção ou Informação;
- o título e, se houver, a descrição;
- a origem, que é o módulo;
- se houver, o endereço do registro, para "Abrir";
- se houver, o alerta de que ela trata, que dá as ações de reconhecer e de adiar;
- se ela é uma mensagem, como as do chat e as respostas da TI no chamado (spec chat, "Notificações do chat", e spec chamados, "Notificações dos chamados").

Cada notificação SHALL entrar na central da conta como não lida, com o momento em que foi gravada.

#### Scenario: Notificação com endereço
- **WHEN** o módulo Alertas notifica Ana de "Black Toner Cartridge em 8%", Crítico, com o endereço da impressora
- **THEN** a notificação entra na central de Ana como não lida, e "Abrir" leva à ficha da impressora

### Requirement: Push por severidade

Cada notificação SHALL ir por push, logo depois de gravada, para cada aparelho inscrito da conta (requisito "Aparelhos do push"), quando a severidade dela está entre as que a conta escolheu para o push (spec preferencias-da-interface). A notificação de mensagem SHALL ir por push qualquer que seja a severidade escolhida. Com o modo Foco ligado, só o Crítico SHALL ir para o push, e a mensagem SHALL NOT ir.

O push SHALL mostrar, pelo sistema do aparelho, mesmo com o Grafite fechado:
- a severidade e o título, como "Crítico: Black Toner Cartridge em 8%", e, na mensagem, só o título, como "Mensagem de Paulo Nunes";
- a descrição;
- o ícone do Grafite.

Tocar no push SHALL abrir o Grafite no endereço da notificação, com a busca dele, como a mensagem do endereço do chat, ou na tela inicial quando ela não tem endereço, numa janela do Grafite já aberta quando houver: o endereço do app do chat, numa janela do app do chat ou, sem ela, numa da casca, na janela do Chat; os outros endereços, numa janela da casca (spec pwa, "App do chat instalado"). O conteúdo do push SHALL ir cifrado de ponta a ponta até o aparelho.

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

#### Scenario: Mensagem no celular
- **WHEN** Paulo Nunes manda uma mensagem direta a Fernanda Rocha, que escolheu só o Crítico para o push e tem o celular inscrito
- **THEN** o celular mostra "Mensagem de Paulo Nunes", com o começo do texto, e tocar nele abre a conversa no app do chat

#### Scenario: Mensagem no modo Foco
- **WHEN** Ana Souza ligou o modo Foco, e Fernanda Rocha responde o #1041
- **THEN** nenhum aparelho de Ana recebe push da resposta, e a notificação entra na central dela

#### Scenario: Push da casca com o app do chat aberto
- **WHEN** Ana Souza está só com o app do chat aberto e toca no push "Chamado #1043 com você"
- **THEN** o Grafite abre o #1043 numa janela nova, e o app do chat continua na conversa em que estava

### Requirement: Aparelhos do push

A conta SHALL poder inscrever o aparelho em que está, pelos Ajustes ou pelos Avisos do app do chat (spec modulo-chat, "Equipes e Avisos na tela"), depois de o navegador permitir os avisos. A inscrição SHALL guardar o aparelho com um nome, como "Chrome no Android", e o momento. A conta SHALL ver os aparelhos dela, com "Este aparelho" no que está em uso, e SHALL poder tirar qualquer um deles. Uma conta SHALL NOT ver nem tirar os aparelhos de outra.

O aparelho que o serviço de push diz que não existe mais SHALL sair da lista sozinho. A conta inativada SHALL perder os aparelhos dela.

A API SHALL aceitar só a inscrição num serviço de push conhecido dos navegadores, em `https://`. A inscrição em outro endereço SHALL ser recusada com 400, sem nenhum pedido do servidor a ele: o servidor nunca manda o push a um endereço que a conta escolheu.

O aparelho sem como receber o push SHALL ver o motivo em texto:
- o navegador sem push;
- o iPhone e o iPad fora do Grafite ou do app do chat instalado na tela de início;
- os avisos bloqueados no navegador, com a explicação de como liberar.

#### Scenario: Inscrever o celular
- **WHEN** a conta liga os avisos no celular, e o navegador permite
- **THEN** o celular aparece na lista como "Este aparelho" e passa a receber o push

#### Scenario: Inscrever pelo app do chat
- **WHEN** Fernanda Rocha, que só usa o chat, escolhe "Receber neste aparelho" nos Avisos do app do chat instalado no iPhone, e o iPhone permite
- **THEN** o iPhone entra nos aparelhos dela e passa a receber o push das mensagens

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
