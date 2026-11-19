## ADDED Requirements

### Requirement: Solicitação pelo chamado

O chamado (spec chamados) SHALL poder ter uma solicitação, de dois jeitos.

**"Pedir toner",** num chamado em aberto com uma impressora ligada, que usa consumíveis, por quem atende o chamado e as solicitações nos locais da impressora:
- havendo uma solicitação de Toner pendente com essa impressora, o chamado SHALL se juntar a ela, e nenhuma solicitação nova SHALL ser registrada;
- sem ela, SHALL abrir o registro do Toner com:
  - a pessoa do chamado como quem pediu;
  - a impressora;
  - um item da cor do chamado, com a quantidade 1.

A cor do chamado é a respondida no formulário: a da primeira escolha única, na ordem dos campos, cuja opção respondida tem o nome de uma cor de consumível (Preto, Ciano, Magenta, Amarelo ou Colorido), sem diferença de maiúsculas nem de acentos, quando a impressora usa um consumível dessa cor. Sem ela, é a cor mais baixa na última leitura válida dos suprimentos e, sem a leitura, o preto. A impressora usa as cores dos consumíveis compatíveis do modelo dela e, sem nenhum compatível cadastrado, todas. Na leitura, o ciano, o magenta e o amarelo da impressora que só usa o colorido contam como o colorido.

Quem atende pode mudar o registro antes de gravar, mas a solicitação SHALL levar a impressora do chamado: sem ela, a gravação SHALL ser recusada com "A solicitação do chamado leva a impressora dele, PAT-00139.". Se uma solicitação de Toner pendente com a impressora nascer enquanto o registro está aberto, a gravação SHALL ser recusada com "A PAT-00139 já está na solicitação 6: peça o toner de novo para o chamado se juntar a ela.", e nenhuma solicitação SHALL ser registrada.

As recusas da impressora e a permissão SHALL ser as do registro, com e sem a solicitação pendente: a impressora que a conta não vê, a inativa, a que não usa consumíveis e quem não atende as solicitações nos locais dela.

**O tipo que gera uma solicitação** (spec tipos-de-chamado), na abertura do chamado, na mesma transação:
- **Toner:** como o "Pedir toner", com a impressora do chamado e o item da cor do chamado, sem abrir o registro: havendo uma solicitação de Toner pendente com a impressora, o chamado SHALL se juntar a ela;
- **Equipamento:**
  - o tipo de ativo do tipo de chamado e a quantidade 1;
  - o motivo "Chamado #<número>: <título>";
  - o local de trabalho da pessoa ou, sem ele, o local do ativo ligado.

A solicitação gerada pelo tipo SHALL ser registrada por quem abriu o chamado, sem pedir a permissão das solicitações, porque quem ligou o "Gera uma Solicitação" no tipo atende as solicitações em todos os locais (spec tipos-de-chamado, requisito "O que acontece depois"). A auditoria da solicitação SHALL dizer o chamado e o tipo de chamado que a geraram.

A solicitação gerada SHALL seguir todas as regras do registro. Se o registro for recusado, o chamado SHALL abrir mesmo assim, sem a solicitação, e a conversa SHALL dizer "A solicitação não foi gerada: <motivo>.":
- sem local para o equipamento: "A solicitação não foi gerada: Marina Lopes não tem local de trabalho.";
- o Toner sem o ativo ligado: "A solicitação não foi gerada: o chamado não tem um ativo ligado.";
- o módulo Operação desligado: "A solicitação não foi gerada: o módulo Operação está desligado.";
- a impressora sem consumíveis: "A solicitação não foi gerada: PAT-00139 não usa consumíveis.";
- o tipo de ativo inativado: "A solicitação não foi gerada: o tipo de ativo Notebook está inativo.";
- o local inativado: "A solicitação não foi gerada: o local Financeiro está inativo.";
- qualquer outra recusa do registro: "A solicitação não foi gerada:" seguido da recusa.

Na frase do Equipamento sem local, a pessoa SHALL aparecer pelo nome de agora: a anonimizada, pelo nome anonimizado, como no chamado. As outras frases SHALL ficar como foram escritas na abertura.

A solicitação SHALL mostrar os chamados ligados a ela, como "Do chamado #1042" ou "Dos chamados #1040 e #1042". O chamado SHALL mostrar a solicitação e a situação dela a quem vê as solicitações. Cada chamado SHALL ter uma solicitação só, e a recusa da segunda SHALL ser "O chamado #1042 já está na solicitação 4.". A solicitação SHALL seguir as regras de toda solicitação: concluí-la ou cancelá-la SHALL NOT mudar o chamado.

#### Scenario: Toner pelo chamado sem pendente
- **WHEN** Ana usa "Pedir toner" no #1042, com a PAT-00139, cujo preto está a 8% e o ciano a 40%, sem solicitação pendente, e grava
- **THEN** a solicitação nasce Aberta, pedida por Marina Lopes, com 1 preto para a PAT-00139 e ligada ao #1042, e a conversa ganha "Pediu toner: solicitação 5"

#### Scenario: Pendente nascida com o registro aberto
- **WHEN** Ana usa "Pedir toner" no #1042, com a PAT-00139, sem solicitação pendente, e, antes de ela gravar, Carla registra a solicitação 6 para a PAT-00139
- **THEN** a gravação de Ana é recusada com "A PAT-00139 já está na solicitação 6: peça o toner de novo para o chamado se juntar a ela.", e o "Pedir toner" seguinte junta o #1042 à solicitação 6

#### Scenario: Toner pelo chamado na impressora que só usa o colorido
- **WHEN** Ana usa "Pedir toner" no #1042, com uma impressora cujos compatíveis são um preto e um colorido, com o ciano a 5% e o preto a 30%
- **THEN** o registro vem com 1 colorido

#### Scenario: Toner com a cor respondida
- **WHEN** Ana abre um chamado de Toner para Marina Lopes, com a PAT-00139, cujo preto está a 8% e o ciano a 40%, responde "Ciano" em "Qual cor acabou?", e não há solicitação pendente
- **THEN** a solicitação gerada leva 1 ciano para a PAT-00139, e não o preto, que está mais baixo

#### Scenario: Toner gerado com uma solicitação pendente
- **WHEN** Ana abre um chamado de Toner para Marina Lopes, com a PAT-00139, que já está na solicitação 5, Aberta
- **THEN** o chamado se junta à solicitação 5, nenhuma solicitação nova é registrada, e a conversa ganha "Juntou-se à solicitação 5"

#### Scenario: Equipamento gerado pelo tipo
- **WHEN** Ana abre um chamado de "Equipamento novo", que gera a solicitação de Equipamento de "Notebook", para Marina Lopes, do Financeiro
- **THEN** a solicitação de 1 Notebook para o Financeiro nasce na mesma transação, com o motivo "Chamado #1043: Equipamento novo para Marina", registrada por Ana e ligada ao #1043

#### Scenario: Solicitação recusada na abertura
- **WHEN** Ana abre um chamado de "Equipamento novo" para Marina Lopes, e o tipo de ativo Notebook foi inativado
- **THEN** o chamado abre sem a solicitação, e a conversa diz "A solicitação não foi gerada: o tipo de ativo Notebook está inativo."

#### Scenario: Equipamento sem local
- **WHEN** Ana abre um chamado de "Equipamento novo" para Rita Moraes, que não tem local de trabalho, sem ativo ligado
- **THEN** o chamado abre sem a solicitação, e a conversa diz "A solicitação não foi gerada: Rita Moraes não tem local de trabalho."

#### Scenario: Equipamento sem local e a pessoa anonimizada
- **WHEN** Rita Moraes é anonimizada depois de o chamado abrir sem a solicitação, por ela não ter local de trabalho
- **THEN** a conversa do chamado diz "A solicitação não foi gerada:" seguido do nome anonimizado, com o código, e de "não tem local de trabalho."
