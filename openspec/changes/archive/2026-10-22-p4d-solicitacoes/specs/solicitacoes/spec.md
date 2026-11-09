## Purpose

Registrar o pedido de uma pessoa à TI, de toner, de conserto ou de um equipamento, do registro à conclusão: quem pediu, a situação, o atendimento pelo estoque ou pelo fornecedor e o histórico na auditoria, sem nada apagado.

## ADDED Requirements

### Requirement: Solicitação

A solicitação SHALL ser o pedido de uma pessoa à TI, registrado por quem atende. Cada solicitação SHALL ter:
- o número, sequencial na organização, que SHALL NOT se repetir nem mudar;
- o tipo: Toner, Conserto ou Equipamento;
- quem pediu, entre as pessoas ativas (spec administracao-de-pessoas), e nunca um texto livre no lugar da pessoa;
- a observação, opcional, de até 500 caracteres;
- a situação (requisito "Situação da solicitação");
- quem registrou e quando, e quando ela foi concluída ou cancelada.

Cada tipo SHALL ter:
- **Toner:** de 1 a 20 impressoras e os itens de cada uma (requisito "Itens do toner");
- **Conserto:** o ativo, entre os ativos ativos que a conta vê (spec cadastro-de-ativos), e o defeito, de até 1.000 caracteres;
- **Equipamento:** o tipo de ativo, entre os tipos ativos (spec catalogo-de-ativos), a quantidade, um número inteiro de 1 a 99, o motivo, de até 1.000 caracteres, e o local onde ele é preciso, entre os locais ativos (spec locais).

Os locais da solicitação SHALL ser os das impressoras, no toner, o do ativo, no conserto, e o escolhido, no equipamento. Uma impressora ou um ativo sem local SHALL dar à solicitação o alcance da organização inteira.

As recusas SHALL ficar no campo:
- "Escolha quem pediu.", "Escolha a impressora.", "Escolha o ativo.", "Escolha o tipo de ativo." e "Escolha o local.";
- "Descreva o defeito." e "Descreva o motivo.", e "Use até 1.000 caracteres.", no defeito e no motivo;
- "Use um número inteiro de 1 a 99.", na quantidade, e "Escolha até 20 impressoras.", nas impressoras;
- "Use até 500 caracteres.", na observação;
- "A pessoa escolhida está inativa. Escolha uma pessoa ativa.", "O ativo escolhido está inativo.", "O tipo escolhido está inativo. Escolha um tipo ativo." e "O local escolhido está inativo. Escolha um local ativo.", no campo do inativo.

Uma solicitação SHALL NOT ser apagada, nem pela API nem pelo banco com o papel da aplicação: a que não vai ser atendida é cancelada.

#### Scenario: Toner pedido pela Joana
- **WHEN** Carla, que atende as solicitações de Jundiaí, registra um Toner pedido por "Joana Prado", com 1 preto para a PAT-00412
- **THEN** a solicitação nasce Aberta, com o número seguinte ao da última da organização, Joana Prado como quem pediu e Carla como quem registrou, com o momento

#### Scenario: Quem pediu em texto livre
- **WHEN** a API recebe uma solicitação com o nome de quem pediu num texto, sem a pessoa
- **THEN** o registro é recusado com "Escolha quem pediu.", e nada é registrado

#### Scenario: Pessoa inativa
- **WHEN** Carla registra um pedido de "Marcos Lima", que está inativo
- **THEN** o registro é recusado com "A pessoa escolhida está inativa. Escolha uma pessoa ativa.", no campo Pedida por

#### Scenario: Conserto do notebook
- **WHEN** Carla registra um Conserto do NB-0031, que fica em "Jundiaí › Expedição", com o defeito "Não liga"
- **THEN** a solicitação mostra o NB-0031, o defeito e o local "Jundiaí › Expedição"

#### Scenario: Equipamento para a Expedição
- **WHEN** Carla registra um Equipamento de 2 "Notebook" para "Jundiaí › Expedição", com o motivo "Dois contratados novos"
- **THEN** a solicitação mostra o tipo, a quantidade 2, o motivo e o local

#### Scenario: Solicitação não se apaga
- **WHEN** alguém tenta apagar uma solicitação, pela API ou pelo banco com o papel da aplicação
- **THEN** a exclusão é recusada, e a solicitação continua como estava

### Requirement: Situação da solicitação

A situação SHALL ser Aberta, Em atendimento, Aguardando entrega, Concluída ou Cancelada, sempre em texto. A solicitação SHALL nascer Aberta, e:
- a pendente, Aberta, Em atendimento ou Aguardando entrega, SHALL poder passar a Em atendimento, a Aguardando entrega, a Concluída ou a Cancelada, e SHALL NOT voltar a Aberta;
- Aguardando entrega SHALL valer só para o toner e o equipamento;
- o toner SHALL se concluir pela entrega de todos os itens (requisito "Entrega do toner") ou pelo lote, com o pedido ao fornecedor (requisito "Mudança da situação em lote");
- o conserto e o equipamento SHALL se concluir por "Concluir", com o que foi feito, opcional, de até 1.000 caracteres;
- o cancelamento SHALL pedir o motivo, de até 200 caracteres;
- Concluída e Cancelada SHALL ser finais: a solicitação SHALL NOT mudar mais, e o pedido de novo é outra solicitação.

A conclusão e o cancelamento SHALL guardar quem os fez e quando.

As recusas SHALL ser:
- "Informe o motivo do cancelamento." e "Use até 200 caracteres.", no motivo;
- "A solicitação <número> já está concluída." e "A solicitação <número> já está cancelada.", na concluída e na cancelada;
- "Aguardando entrega vale só para toner e equipamento.", no conserto;
- "O toner se conclui pela entrega dos itens.", no toner concluído fora da entrega e do lote com o fornecedor.

#### Scenario: Notebook consertado
- **WHEN** Carla conclui o Conserto do NB-0031, que estava Em atendimento, com "Fonte trocada"
- **THEN** a solicitação fica Concluída, com Carla, o momento e o que foi feito

#### Scenario: Pedido cancelado com o motivo
- **WHEN** Carla cancela a solicitação 42 com o motivo "Pedido em duplicidade"
- **THEN** a solicitação fica Cancelada, com o motivo, quem cancelou e quando

#### Scenario: Cancelamento sem o motivo
- **WHEN** Carla cancela uma solicitação sem o motivo
- **THEN** o cancelamento é recusado com "Informe o motivo do cancelamento.", e a solicitação continua como estava

#### Scenario: Concluída não muda
- **WHEN** alguém muda a situação da solicitação 42, que está Concluída
- **THEN** a mudança é recusada com "A solicitação 42 já está concluída."

#### Scenario: Conserto aguardando entrega
- **WHEN** Carla passa um Conserto a Aguardando entrega
- **THEN** a mudança é recusada com "Aguardando entrega vale só para toner e equipamento."

### Requirement: Itens do toner

Cada item do toner SHALL ter:
- uma impressora da solicitação;
- a cor: Preto, Ciano, Magenta, Amarelo ou Colorido (spec consumiveis);
- a quantidade, um número inteiro de 1 a 99.

Uma impressora e uma cor SHALL estar num item só, e cada impressora SHALL ter ao menos um item. As impressoras SHALL ser ativos ativos que a conta vê, de um tipo que liga os consumíveis compatíveis (spec catalogo-de-ativos).

Cada item SHALL sugerir o consumível:
- o compatível ativo do modelo da impressora com a cor do item (spec consumiveis);
- entre vários, o de maior saldo nos locais em que a conta vê o estoque (spec estoque) e, no empate, o de menor código;
- sem compatível da cor, o item SHALL ficar sem o consumível, com "Nenhum compatível dessa cor.".

Quem atende SHALL poder trocar o consumível de um item pendente por outro compatível ativo da mesma cor.

As recusas SHALL ficar no campo:
- "Escolha a cor." e "Use um número inteiro de 1 a 99.";
- "Essa cor já está pedida para essa impressora.", na cor repetida;
- "Inclua ao menos um item para cada impressora.", na impressora sem item;
- "<ativo> não usa consumíveis.", na impressora de um tipo sem os consumíveis compatíveis;
- "Escolha um compatível dessa cor.", no consumível que não é compatível da cor.

#### Scenario: Toner sugerido
- **WHEN** a PAT-00412 é uma HP LaserJet M404, que tem o CF258A preto como compatível, e Carla pede 1 preto para ela
- **THEN** o item sugere o CF258A

#### Scenario: Cor sem compatível
- **WHEN** Carla pede 1 ciano para a PAT-00412, que imprime só em preto e não tem compatível ciano
- **THEN** o item fica sem o consumível, com "Nenhum compatível dessa cor."

#### Scenario: Duas impressoras na mesma solicitação
- **WHEN** Carla registra 1 preto para a PAT-00412 e 2 pretos para a PAT-00415
- **THEN** uma solicitação só reúne as duas impressoras, cada item com a sua

#### Scenario: Cor repetida
- **WHEN** Carla pede o preto duas vezes para a PAT-00412
- **THEN** o registro é recusado com "Essa cor já está pedida para essa impressora."

#### Scenario: Ativo sem consumíveis
- **WHEN** Carla escolhe o NB-0031, um notebook, como impressora de um Toner
- **THEN** o registro é recusado com "NB-0031 não usa consumíveis."

### Requirement: Contador congelado na solicitação

Cada impressora SHALL guardar, no momento em que entra na solicitação, o total de páginas e o momento da leitura (spec impressoras-por-snmp), quando a leitura é válida. Sem a leitura válida, a impressora SHALL ficar sem o contador, sem um valor inventado. O contador guardado SHALL NOT mudar com as coletas seguintes nem com as alterações da solicitação. A solicitação SHALL mostrá-lo como "Total de páginas: 48.210, lido em 21/10 14:02", ou "Sem leitura do total de páginas".

#### Scenario: Contador na abertura
- **WHEN** Carla registra um Toner para a PAT-00412, que tem o total de 48.210 páginas lido às 14:02 de 21/10
- **THEN** a solicitação mostra "Total de páginas: 48.210, lido em 21/10 14:02"

#### Scenario: Coleta depois do registro
- **WHEN** o total da PAT-00412 passa a 48.900 depois do registro
- **THEN** a solicitação continua com 48.210

#### Scenario: Impressora sem coleta
- **WHEN** a impressora da solicitação não tem a leitura do total de páginas
- **THEN** a solicitação mostra "Sem leitura do total de páginas"

#### Scenario: Impressora incluída depois
- **WHEN** Carla inclui a PAT-00415 numa solicitação já registrada com a PAT-00412
- **THEN** a PAT-00415 guarda o contador daquele momento, e o da PAT-00412 não muda

### Requirement: Pedido ao fornecedor

No toner e no equipamento pendentes, quem atende SHALL poder registrar o pedido ao fornecedor: o fornecedor, entre os ativos (spec fornecedores), e o número da OS no fornecedor, opcional, de até 40 caracteres. O pedido SHALL passar a solicitação a Aguardando entrega e SHALL poder ser corrigido até a conclusão.

As recusas SHALL ficar no campo: "Escolha o fornecedor.", "O fornecedor escolhido está inativo. Escolha um fornecedor ativo." e "Use até 40 caracteres.", no número da OS.

#### Scenario: Toner pedido à locadora
- **WHEN** Carla registra o pedido da solicitação 42 à "Locadora Sul", com a OS "OS-7781"
- **THEN** a solicitação fica Aguardando entrega, com a Locadora Sul e a OS-7781

#### Scenario: OS informada depois
- **WHEN** Carla corrige o pedido da solicitação 42 com a OS "OS-7790"
- **THEN** a solicitação mostra a OS-7790, e a auditoria guarda a OS-7781 antes e a OS-7790 depois

### Requirement: Entrega do toner

Quem atende SHALL entregar os itens pendentes do toner, todos ou só alguns. Cada item entregue SHALL guardar quem entregou, quando e a origem:
- **Do estoque:** o consumível, um compatível da cor do item, e o local de origem. A entrega SHALL lançar no livro-razão a saída desse consumível, do local para a impressora do item, com a quantidade do item e a observação "Solicitação <número>", com as regras da saída (spec estoque): o saldo, o contador de páginas, `estoque.movimentar` no local de origem e a impressora ativa que a conta vê;
- **Pelo fornecedor:** o fornecedor do pedido, ou outro ativo escolhido na entrega, e o consumível, opcional, sem movimentação no estoque.

A entrega SHALL ser uma só: com um item recusado, nenhum item SHALL ser entregue nem saída lançada. Um item entregue SHALL NOT mudar: o consumível errado se corrige no estoque, por um ajuste (spec estoque). Com todos os itens entregues, a solicitação SHALL ficar Concluída; com parte deles, Aguardando entrega.

As recusas SHALL ficar no campo do item:
- "Escolha os itens a entregar.", sem nenhum item escolhido;
- "Escolha o consumível.", "Escolha o local." e "Escolha o fornecedor.";
- as da saída, como "O saldo do CF258A em Jundiaí › Almoxarifado é 1.", na quantidade.

#### Scenario: Toner do estoque
- **WHEN** o Almoxarifado tem 6 CF258A, e Carla entrega o preto da solicitação 42 com 1 CF258A do Almoxarifado
- **THEN** o saldo do CF258A no Almoxarifado passa a 5, a saída aparece nas movimentações com a PAT-00412, o total de páginas e "Solicitação 42", e a solicitação fica Concluída

#### Scenario: Entrega maior que o saldo
- **WHEN** o Almoxarifado tem 2 CF258A, e Carla entrega, do Almoxarifado, 2 pretos para a PAT-00412 e 1 preto para a PAT-00415
- **THEN** a entrega é recusada com "O saldo do CF258A em Jundiaí › Almoxarifado é 0.", no item da PAT-00415, nenhum item é entregue, e o saldo continua 2

#### Scenario: Entrega em parte
- **WHEN** Carla entrega só o preto da PAT-00412, numa solicitação com a PAT-00412 e a PAT-00415
- **THEN** o item da PAT-00412 fica entregue, o da PAT-00415 pendente, e a solicitação fica Aguardando entrega

#### Scenario: Toner que veio da locadora
- **WHEN** Carla entrega pelo fornecedor o item da solicitação 42, pedida à Locadora Sul
- **THEN** o item fica entregue pela Locadora Sul, sem movimentação no estoque, e a solicitação fica Concluída

#### Scenario: Sem movimentar o estoque
- **WHEN** Bruno atende as solicitações de Jundiaí, sem `estoque.movimentar`, e entrega um item
- **THEN** a entrega dele só pode ser pelo fornecedor, e a API recusa a entrega do estoque com 403

### Requirement: Alteração da solicitação

Quem atende SHALL poder alterar a solicitação pendente, com as mesmas regras do registro:
- quem pediu e a observação;
- no toner, as impressoras, os itens pendentes e o consumível sugerido de cada item;
- no conserto, o ativo e o defeito;
- no equipamento, o tipo de ativo, a quantidade, o motivo e o local.

A impressora com um item entregue SHALL ficar na solicitação, e o item entregue SHALL NOT mudar. A solicitação concluída ou cancelada SHALL NOT ser alterada. Cada alteração SHALL ir para a auditoria com o "antes → depois".

As recusas SHALL ser "<ativo> tem item entregue e fica na solicitação.", na impressora, e as da situação, na concluída e na cancelada.

#### Scenario: Quantidade corrigida antes da entrega
- **WHEN** Carla muda o preto da PAT-00412 de 1 para 2, na solicitação 42 ainda Aberta
- **THEN** o item passa a 2, e a auditoria guarda 1 antes e 2 depois

#### Scenario: Impressora com item entregue
- **WHEN** Carla tenta tirar da solicitação a PAT-00412, que tem o preto entregue
- **THEN** a alteração é recusada com "PAT-00412 tem item entregue e fica na solicitação."

#### Scenario: Impressora já entregue na alteração
- **WHEN** Carla muda para 2 o preto da PAT-00415, numa solicitação em que o preto da PAT-00412 já foi entregue
- **THEN** a alteração passa, e a PAT-00412 fica na solicitação com o item entregue, sem item pendente, porque o item entregue conta como o item dela

#### Scenario: Concluída não se altera
- **WHEN** Carla tenta mudar a observação da solicitação 42, que está Concluída
- **THEN** a alteração é recusada com "A solicitação 42 já está concluída."

### Requirement: Mudança da situação em lote

Quem atende SHALL poder selecionar várias solicitações na lista, também entre as trazidas pelo "Carregar mais", e mudar a situação de todas de uma vez para Em atendimento, Aguardando entrega, Concluída ou Cancelada, com um motivo só, no cancelamento. Cada solicitação SHALL seguir as regras da situação, e a que não pode mudar SHALL ficar como estava. No lote:
- o toner com o pedido ao fornecedor SHALL se concluir com os itens pendentes entregues por esse fornecedor, sem movimentação no estoque;
- o toner sem o pedido ao fornecedor SHALL ficar como estava;
- a solicitação que a conta não atende SHALL ficar como estava.

O retorno SHALL dizer quantas mudaram e quais não, com o motivo, como "3 solicitações mudaram. A 42 não: já está concluída.". Sem uma solicitação selecionada ou sem a situação, nada SHALL mudar.

#### Scenario: Lote aplicado
- **WHEN** Carla seleciona as solicitações 40, 41 e 43, Abertas, e muda a situação para Em atendimento
- **THEN** as três ficam Em atendimento, e o retorno diz "3 solicitações mudaram."

#### Scenario: Uma que não pode mudar
- **WHEN** o lote inclui a solicitação 42, que está Concluída
- **THEN** as outras mudam, a 42 fica como estava, e o retorno diz "A 42 não: já está concluída."

#### Scenario: Toners entregues pela locadora
- **WHEN** Carla seleciona dez toners pedidos à Locadora Sul e muda a situação para Concluída
- **THEN** os dez ficam Concluídos, com os itens pendentes entregues pela Locadora Sul, sem movimentação no estoque

#### Scenario: Toner sem fornecedor no lote
- **WHEN** o lote para Concluída inclui o toner 44, sem o pedido ao fornecedor
- **THEN** a 44 fica como estava, e o retorno diz "A 44 não: o toner sem fornecedor se conclui pela entrega."

### Requirement: Quem vê e quem atende as solicitações

As permissões SHALL ser:
- `solicitacoes.ver`: ver as solicitações e as fichas delas;
- `solicitacoes.atender`: registrar, alterar, pedir ao fornecedor, entregar, concluir e cancelar; inclui `solicitacoes.ver`.

As duas SHALL ter escopo de local (spec permissoes). A conta SHALL ver a solicitação que tem algum dos locais no alcance de `solicitacoes.ver` e SHALL atender a que tem todos os locais no alcance de `solicitacoes.atender`. A solicitação com uma impressora ou um ativo sem local SHALL pedir a permissão na organização inteira.

A solicitação SHALL mostrar quem pediu pelo nome, sem os outros dados da pessoa, e a impressora, o ativo, o tipo de ativo e o fornecedor pela referência, também a quem não vê o cadastro deles. Sem a permissão, a API SHALL responder 403, e a tela SHALL dizer que a conta não tem acesso e a quem pedir.

#### Scenario: Atendente de Jundiaí
- **WHEN** Carla tem `solicitacoes.atender` só em Jundiaí
- **THEN** ela vê e atende as solicitações de Jundiaí, e não vê as de Campinas

#### Scenario: Solicitação de dois locais
- **WHEN** uma solicitação reúne a PAT-00412, de Jundiaí, e uma impressora de Campinas
- **THEN** Carla a vê, sem as ações de atender, e quem atende as duas cidades a atende

#### Scenario: Quem só vê
- **WHEN** Bruno, com `solicitacoes.ver`, abre a ficha da solicitação 42
- **THEN** ele vê todos os dados, sem nenhuma ação

#### Scenario: Sem a permissão
- **WHEN** Davi, sem nenhuma das duas permissões, abre as solicitações
- **THEN** a tela diz que ele não tem acesso e a quem pedir
