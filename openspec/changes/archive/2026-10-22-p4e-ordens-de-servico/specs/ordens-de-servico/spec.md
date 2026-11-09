## Purpose

Registrar o trabalho da TI num ativo, da abertura ao encerramento: o problema, o histórico das situações, a espera pela peça ou pelo fornecedor, as peças do estoque e o que foi feito, aberta direto no ativo ou pela solicitação de conserto, sem nada apagado.

## ADDED Requirements

### Requirement: Ordem de serviço

A ordem de serviço (OS) SHALL ser o trabalho da TI num ativo, aberto por quem atende. Cada OS SHALL ter:
- o número, sequencial na organização, separado do das solicitações, que SHALL NOT se repetir nem mudar, mostrado como "OS 12";
- o ativo, entre os ativos ativos que a conta vê, de qualquer tipo;
- o problema, obrigatório, de até 1.000 caracteres;
- a situação (requisito "Situação e histórico da OS");
- a solicitação de conserto de que ela nasceu, quando nasceu de uma (requisito "OS pela solicitação de conserto");
- o local, que é o do ativo quando a OS foi aberta e SHALL NOT mudar com o ativo;
- quem a abriu e quando.

O problema SHALL poder ser corrigido enquanto a OS está em aberto. O ativo SHALL NOT mudar: a OS aberta no ativo errado se encerra sem resolver, e outra se abre no certo.

As recusas SHALL ficar no campo:
- "Escolha o ativo." e "O ativo escolhido está inativo.", no ativo, como nas solicitações;
- "Descreva o problema." e "Use até 1.000 caracteres.", no problema.

#### Scenario: Manutenção achada pela TI
- **WHEN** Carla abre uma OS no NB-0031, de Jundiaí, com o problema "Teclado falhando", sem nenhuma solicitação
- **THEN** a OS nasce Aberta, com o próximo número da organização, o NB-0031, o local Jundiaí › Expedição, Carla e o momento

#### Scenario: OS sem o problema
- **WHEN** Carla abre uma OS no NB-0031 sem o problema
- **THEN** a abertura é recusada com "Descreva o problema.", e nenhuma OS fica gravada

#### Scenario: Problema corrigido
- **WHEN** Carla muda o problema da OS 12, Em atendimento, de "Teclado falhando" para "Teclado e touchpad falhando"
- **THEN** a OS mostra o problema novo, e a auditoria guarda o antes e o depois

### Requirement: Situação e histórico da OS

A situação SHALL ser Aberta, Em atendimento, Aguardando peça, Aguardando fornecedor, Resolvida ou Encerrada, sempre em texto. A OS SHALL nascer Aberta, e:
- a em aberto, que é a Aberta, a Em atendimento, a Aguardando peça ou a Aguardando fornecedor, SHALL poder passar a Em atendimento, a Aguardando peça ou a Aguardando fornecedor, e SHALL NOT voltar a Aberta;
- a em aberto SHALL poder passar a Resolvida, com o que foi feito, obrigatório, de até 1.000 caracteres;
- a Resolvida SHALL poder reabrir, voltando a Em atendimento, com o motivo, obrigatório, de até 200 caracteres, ou passar a Encerrada;
- a em aberto SHALL poder se encerrar sem resolver, com o motivo, obrigatório, de até 200 caracteres;
- a Encerrada SHALL ser final: a OS SHALL NOT mudar mais.

Cada mudança SHALL entrar no histórico da OS, que só cresce, com a situação nova, quem mudou, quando e a observação, opcional, de até 500 caracteres, ou o que foi feito e o motivo. A resolução e o encerramento SHALL guardar também quem os fez e quando; a resolução de antes de uma reabertura SHALL ficar no histórico.

As recusas SHALL ser:
- "Descreva o que foi feito.", "Informe o motivo da reabertura.", "Informe o motivo do encerramento." e "Use até <limite> caracteres.", no campo;
- "A OS <número> já está <situação>.", na mudança para a situação em que ela já está e na encerrada;
- "A OS <número> está resolvida: reabra ou encerre.", na resolvida que passaria a outra situação;
- "A OS <número> ainda não foi resolvida.", no encerramento da em aberto sem o "sem resolver".

#### Scenario: Aguardando a peça
- **WHEN** Carla passa a OS 12, Em atendimento, a Aguardando peça, com a observação "Fonte pedida ao almoxarifado"
- **THEN** a OS fica Aguardando peça, e o histórico mostra Em atendimento e depois Aguardando peça, com Carla, o momento e a observação

#### Scenario: Resolvida reaberta
- **WHEN** a OS 12 foi resolvida com "Fonte trocada", e Carla a reabre com o motivo "Voltou a desligar sozinho"
- **THEN** a OS volta a Em atendimento, e o histórico guarda a resolução de antes e a reabertura, com o motivo

#### Scenario: Encerrada não muda
- **WHEN** alguém tenta passar a OS 12, Encerrada, a Em atendimento
- **THEN** a mudança é recusada com "A OS 12 já está encerrada."

#### Scenario: OS aberta por engano
- **WHEN** Carla encerra sem resolver a OS 15, Aberta, com o motivo "Aberta no ativo errado"
- **THEN** a OS fica Encerrada sem a resolução, com o motivo, Carla e o momento

### Requirement: Fornecedor da OS

Ao passar a OS a Aguardando fornecedor, quem atende SHALL informar o fornecedor, entre os ativos (spec fornecedores), e o número da OS no fornecedor, opcional, de até 40 caracteres, como a assistência técnica ou a garantia. O fornecedor e o número SHALL poder ser corrigidos enquanto a OS está em aberto, também depois que ela sai de Aguardando fornecedor, e SHALL ficar na OS depois da resolução.

As recusas SHALL ficar no campo: "Escolha o fornecedor.", "O fornecedor escolhido está inativo. Escolha um fornecedor ativo." e "Use até 40 caracteres.", no número da OS.

#### Scenario: Notebook na assistência
- **WHEN** Carla passa a OS 12 a Aguardando fornecedor, com a "Dell Assistência" e o número "DL-5521"
- **THEN** a OS fica Aguardando fornecedor, com a Dell Assistência e o DL-5521, e o histórico mostra a mudança

#### Scenario: Número da assistência informado depois
- **WHEN** a OS 12 está Aguardando fornecedor com a Dell Assistência, sem o número, e Carla a corrige com o número "DL-5521"
- **THEN** a OS mostra o DL-5521, e a auditoria guarda o antes e o depois

### Requirement: Peças da OS

Na OS em aberto, quem atende SHALL poder lançar as peças usadas, do estoque (spec estoque). Cada peça SHALL ter o consumível, de qualquer tipo, como a Peça (spec consumiveis), a quantidade e o local de origem. A peça SHALL lançar no livro-razão a saída desse consumível, do local para o ativo da OS, com a quantidade e a observação "OS <número>", com as regras da saída: o saldo, `estoque.movimentar` no local de origem e o ativo ativo que a conta vê.

A OS SHALL listar as peças com o consumível, a quantidade, o local, quem lançou, quando e o caminho para a movimentação. Uma peça lançada SHALL NOT mudar nem sair da OS: a peça errada se corrige no estoque, por um ajuste.

As recusas SHALL ficar no campo: "Escolha o consumível.", "Escolha o local." e as da saída, como "O saldo do FNT-65W em Jundiaí › Almoxarifado é 0.", na quantidade. Na OS resolvida ou encerrada, a recusa SHALL ser "A OS <número> não está em aberto.".

#### Scenario: Fonte trocada
- **WHEN** o Almoxarifado tem 3 "Fonte 65W", do tipo Peça, e Carla lança 1 na OS 12, do NB-0031
- **THEN** o saldo da Fonte 65W no Almoxarifado passa a 2, a saída aparece nas movimentações com o NB-0031 e "OS 12", e a OS lista a peça, com Carla e o momento

#### Scenario: Peça sem saldo
- **WHEN** o Almoxarifado não tem a Fonte 65W, de código FNT-65W, e Carla a lança na OS 12
- **THEN** a peça é recusada com "O saldo do FNT-65W em Jundiaí › Almoxarifado é 0.", na quantidade, e nada é lançado

#### Scenario: Peça na OS resolvida
- **WHEN** Carla lança uma peça na OS 12, Resolvida
- **THEN** a peça é recusada com "A OS 12 não está em aberto."

### Requirement: OS pela solicitação de conserto

Numa solicitação de conserto pendente e sem OS (spec solicitacoes), quem atende SHALL poder abrir a OS dela, com o ativo da solicitação e o defeito como o problema. A OS SHALL ficar ligada à solicitação, que SHALL passar a Em atendimento, e cada solicitação SHALL ter uma OS só. Abrir a OS pela solicitação SHALL pedir também `solicitacoes.atender` nos locais da solicitação.

Daí em diante, a solicitação SHALL seguir a OS:
- a OS resolvida SHALL concluir a solicitação, com o que foi feito, quem resolveu e quando;
- a OS encerrada sem resolver SHALL cancelar a solicitação, com o motivo;
- a solicitação concluída ou cancelada SHALL NOT mudar mais: a OS reaberta, resolvida de novo ou encerrada sem resolver a deixa como está, e a reabertura fica no histórico da OS.

As recusas SHALL ser "A solicitação <número> já tem a OS <número>.", na segunda OS, e "A OS nasce só da solicitação de conserto.", no toner e no equipamento.

#### Scenario: Conserto vira OS
- **WHEN** Carla abre a OS da solicitação 43, um Conserto Aberto do NB-0031 com o defeito "Não liga"
- **THEN** a OS nasce Aberta, no NB-0031, com o problema "Não liga" e ligada à solicitação 43, que passa a Em atendimento

#### Scenario: OS resolvida conclui o conserto
- **WHEN** Carla resolve a OS da solicitação 43 com "Fonte trocada"
- **THEN** a OS fica Resolvida, e a solicitação 43 fica Concluída, com "Fonte trocada", Carla e o momento

#### Scenario: OS encerrada sem resolver cancela o conserto
- **WHEN** Carla encerra sem resolver a OS da solicitação 44 com o motivo "Equipamento substituído"
- **THEN** a OS fica Encerrada, e a solicitação 44 fica Cancelada, com o mesmo motivo

#### Scenario: Conserto já com a OS
- **WHEN** alguém tenta abrir outra OS para a solicitação 43, que já tem a OS 12
- **THEN** a abertura é recusada com "A solicitação 43 já tem a OS 12."

### Requirement: Mudança da situação das OS em lote

Quem atende SHALL poder selecionar várias OS na lista, também entre as trazidas pelo "Carregar mais", e mudar a situação de todas de uma vez para Em atendimento, Aguardando peça ou Encerrada. Cada OS SHALL seguir as regras da situação, e a que não pode mudar SHALL ficar como estava; no lote, a Encerrada SHALL valer só para a Resolvida. A OS que a conta não atende SHALL ficar como estava.

O retorno SHALL dizer quantas mudaram e quais não, com o motivo, como "5 ordens de serviço mudaram. A 12 não: ainda não foi resolvida.".

#### Scenario: Resolvidas encerradas em lote
- **WHEN** Carla seleciona cinco OS Resolvidas e muda a situação delas para Encerrada
- **THEN** as cinco ficam Encerradas, e o retorno diz "5 ordens de serviço mudaram."

#### Scenario: Uma em aberto no encerramento em lote
- **WHEN** o lote para Encerrada inclui a OS 12, Em atendimento
- **THEN** as outras mudam, a 12 fica como estava, e o retorno diz "A 12 não: ainda não foi resolvida."

### Requirement: Quem vê e quem atende as OS

As permissões SHALL ser:
- `ordens.ver`: ver as OS e as fichas delas;
- `ordens.atender`: abrir e corrigir as OS, mudar a situação, informar o fornecedor, lançar as peças, resolver, reabrir e encerrar; inclui `ordens.ver`.

O escopo SHALL ser o local da OS. A OS de um ativo sem local SHALL valer só para quem tem a permissão na organização inteira. Abrir uma OS SHALL pedir `ordens.atender` no local do ativo.

A equipe toda SHALL atender: a OS SHALL NOT ter um responsável, e o histórico SHALL dizer quem fez cada mudança.

#### Scenario: Atendente de Jundiaí
- **WHEN** Carla tem `ordens.atender` só em Jundiaí
- **THEN** ela vê e atende as OS dos ativos de Jundiaí, e não vê as de Campinas

#### Scenario: Quem só vê
- **WHEN** Bruno tem `ordens.ver` em Jundiaí, sem `ordens.atender`
- **THEN** ele abre a ficha das OS de Jundiaí, com o histórico e as peças, sem nenhuma ação, e a API recusa a abertura de uma OS por ele com 403
