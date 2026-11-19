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

#### Scenario: Mensagem no celular
- **WHEN** Paulo Nunes manda uma mensagem direta a Fernanda Rocha, que escolheu só o Crítico para o push e tem o celular inscrito
- **THEN** o celular mostra "Mensagem de Paulo Nunes", com o começo do texto, e tocar nele abre a conversa no app do chat

#### Scenario: Mensagem no modo Foco
- **WHEN** Ana Souza ligou o modo Foco, e Fernanda Rocha responde o #1041
- **THEN** nenhum aparelho de Ana recebe push da resposta, e a notificação entra na central dela
