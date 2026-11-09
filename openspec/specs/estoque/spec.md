# estoque Specification

## Purpose
Guardar o estoque dos consumíveis por local como um livro-razão: cada entrada, saída, transferência e ajuste fica lançado para sempre, e o saldo e o mínimo de cada consumível em cada local saem dele.

## Requirements

### Requirement: Movimentação do estoque

O estoque SHALL ser um livro-razão: cada mudança no saldo SHALL ser uma movimentação lançada, e uma movimentação lançada SHALL NOT ser editada nem apagada. Cada movimentação SHALL ter:
- o tipo: Entrada, Saída, Transferência ou Ajuste;
- o consumível (spec consumiveis);
- a quantidade, um número inteiro de 1 a 100.000;
- os locais, conforme o tipo (spec locais);
- a observação, opcional, de até 200 caracteres;
- quem lançou e quando.

Cada tipo SHALL ter:
- **Entrada:** o local de destino, o fornecedor, entre os ativos (spec fornecedores), e o número da nota fiscal, de até 40 caracteres;
- **Saída:** o local de origem e o ativo que recebeu o consumível, entre os ativos ativos que a conta vê;
- **Transferência:** o local de origem e o de destino, diferentes;
- **Ajuste:** o local, a direção, "Acrescentar" ou "Retirar", e o motivo, de uma lista fixa: Inventário, Perda, Avaria, Devolução ao fornecedor ou Outro. O motivo Outro SHALL exigir a observação.

As recusas SHALL ficar no campo:
- "Escolha o consumível.", "Escolha o local.", "Escolha o fornecedor.", "Escolha o ativo." e "Escolha o motivo.";
- "Escolha se o ajuste acrescenta ou retira.", na direção do ajuste;
- "Informe o número da nota fiscal." e "Use até 40 caracteres.", na nota;
- "Use um número inteiro de 1 a 100.000.", na quantidade;
- "Escolha um destino diferente da origem.", na transferência;
- "Descreva o motivo na observação.", no ajuste com o motivo Outro, e "Use até 200 caracteres.", na observação;
- "O consumível escolhido está inativo. Escolha um consumível ativo.", "O local escolhido está inativo. Escolha um local ativo.", "O fornecedor escolhido está inativo. Escolha um fornecedor ativo." e "O ativo escolhido está inativo.", no campo do inativo.

O consumível e o local que recebem o saldo, na entrada, no destino da transferência e no ajuste de acrescentar, SHALL estar ativos. A saída, a origem da transferência e o ajuste de retirar SHALL aceitar o consumível e o local inativos, para o saldo que sobrou sair deles.

#### Scenario: Entrada de toners
- **WHEN** quem movimenta o estoque de Jundiaí lança a entrada de 10 "CF258A" no "Almoxarifado", da "HP Brasil", com a nota "12345"
- **THEN** o saldo do CF258A no Almoxarifado aumenta 10, e a movimentação mostra o fornecedor, a nota, quem lançou e quando

#### Scenario: Saída para a impressora
- **WHEN** alguém lança a saída de 1 CF258A do Almoxarifado para a PAT-00412
- **THEN** o saldo do CF258A no Almoxarifado diminui 1, e a movimentação mostra a PAT-00412

#### Scenario: Transferência para a Expedição
- **WHEN** alguém transfere 3 CF258A do Almoxarifado para a Expedição
- **THEN** o saldo no Almoxarifado diminui 3, o da Expedição aumenta 3, e uma movimentação só mostra a origem e o destino

#### Scenario: Ajuste do inventário
- **WHEN** a contagem acha 7 CF258A no Almoxarifado, que tinha 8, e alguém lança o ajuste de retirar 1, com o motivo Inventário
- **THEN** o saldo passa a 7, e a movimentação mostra o motivo

#### Scenario: Ajuste sem a observação
- **WHEN** alguém lança um ajuste com o motivo Outro, sem a observação
- **THEN** o lançamento é recusado com "Descreva o motivo na observação.", no campo Observação

#### Scenario: Fornecedor inativo na entrada
- **WHEN** alguém lança uma entrada da "Locadora Norte", que está inativa
- **THEN** o lançamento é recusado com "O fornecedor escolhido está inativo. Escolha um fornecedor ativo.", no campo Fornecedor, e nada é lançado

#### Scenario: Toner que saiu de linha
- **WHEN** o CF258A foi inativado com 4 no Almoxarifado, e alguém lança a saída de 1 para a PAT-00412
- **THEN** a saída é lançada, e uma entrada do CF258A é recusada com "O consumível escolhido está inativo. Escolha um consumível ativo."

#### Scenario: Movimentação lançada
- **WHEN** alguém tenta mudar ou apagar uma movimentação lançada, pela API ou pelo banco com o papel da aplicação
- **THEN** a mudança é recusada, e a movimentação continua como foi lançada

### Requirement: Saldo que nunca fica negativo

O saldo de um consumível num local SHALL ser a soma das movimentações dele:
- somam as entradas, as transferências que chegam e os ajustes de acrescentar;
- subtraem as saídas, as transferências que saem e os ajustes de retirar.

O saldo SHALL NOT ficar negativo. A saída, a transferência e o ajuste de retirar maiores que o saldo da origem SHALL ser recusados com "O saldo do <código> em <local> é <saldo>.", no campo Quantidade, e nada SHALL ser lançado. Dois lançamentos ao mesmo tempo no mesmo consumível e local SHALL ser conferidos um depois do outro, e os dois juntos SHALL NOT tirar mais que o saldo.

#### Scenario: Saída maior que o saldo
- **WHEN** o Almoxarifado tem 2 CF258A e alguém lança a saída de 3
- **THEN** o lançamento é recusado com "O saldo do CF258A em Jundiaí › Almoxarifado é 2.", e o saldo continua 2

#### Scenario: Duas saídas ao mesmo tempo
- **WHEN** o Almoxarifado tem 1 CF258A, e Ana e Bruno lançam a saída de 1 ao mesmo tempo
- **THEN** uma das saídas é lançada, a outra é recusada pelo saldo, e o saldo fica 0

### Requirement: Mínimo do consumível no local

Quem movimenta o estoque de um local SHALL definir o mínimo de cada consumível nele, um número inteiro de 0 a 100.000, em que 0 é sem mínimo, com a recusa "Use um número inteiro de 0 a 100.000.". O retorno SHALL ser "Mínimo salvo.".

A situação do consumível no local SHALL ser dita em texto:
- "Sem estoque", com o saldo 0;
- "Abaixo do mínimo", com o saldo maior que 0 e menor que o mínimo;
- "Em estoque", nos outros casos.

O consumível SHALL ficar abaixo do mínimo num local quando o mínimo é maior que 0 e o saldo é menor que ele, também com o saldo 0. Ele SHALL guardar o momento em que o saldo ou o mínimo o puseram abaixo do mínimo, até voltar ao mínimo.

#### Scenario: Abaixo do mínimo pela saída
- **WHEN** o mínimo do CF258A no Almoxarifado é 5, o saldo é 5, e alguém lança a saída de 1
- **THEN** a situação passa a "Abaixo do mínimo", desde o momento da saída

#### Scenario: Mínimo zerado
- **WHEN** alguém muda o mínimo do CF258A no Almoxarifado para 0
- **THEN** o CF258A deixa de ficar abaixo do mínimo ali, e a situação segue o saldo

### Requirement: Contador de páginas na saída

A saída para um ativo que tem a leitura válida do total de páginas (spec impressoras-por-snmp) SHALL guardar o total lido e o momento da leitura. Sem a leitura válida, a saída SHALL ficar sem o contador. A movimentação SHALL mostrar o contador como "Total de páginas: 45.210, lido em 21/10 14:32", no fuso escolhido (spec estrutura-da-casca, "Datas e horas no fuso escolhido").

#### Scenario: Toner trocado na impressora monitorada
- **WHEN** alguém lança a saída de 1 CF258A para a PAT-00412, que tem o total de 45.210 páginas lido às 14:32
- **THEN** a saída guarda o total 45.210 e o momento 14:32

#### Scenario: Ativo sem leitura
- **WHEN** alguém lança a saída de 1 CF258A para uma impressora sem coleta
- **THEN** a saída é lançada sem o contador

### Requirement: Quem vê e quem movimenta o estoque

`estoque.ver` SHALL dar os saldos, o mínimo e as movimentações dos locais do ramo, e `estoque.movimentar`, que inclui `estoque.ver`, o lançamento das movimentações e o mínimo nos locais do ramo. As duas SHALL aceitar o escopo de local (spec permissoes):
- a entrada, a saída, o ajuste e o mínimo SHALL exigir `estoque.movimentar` no local deles;
- a transferência SHALL exigir `estoque.movimentar` na origem e no destino;
- uma movimentação SHALL aparecer para quem vê o estoque na origem ou no destino dela.

A API SHALL recusar com 403 o que a conta não pode. O consumível, o fornecedor, o local e o ativo de uma movimentação SHALL aparecer pelo nome para quem vê o estoque, como referência, sem as permissões deles; o caminho para a ficha de cada um SHALL aparecer só para quem pode abri-la.

#### Scenario: Almoxarife de Jundiaí
- **WHEN** Carla tem `estoque.movimentar` só em Jundiaí e abre o estoque
- **THEN** ela vê e movimenta os saldos dos locais de Jundiaí, e não vê os de Campinas

#### Scenario: Transferência para outra unidade
- **WHEN** Carla, que movimenta só em Jundiaí, transfere CF258A para Campinas pela API
- **THEN** a API responde 403, e nada é lançado

#### Scenario: Saída sem a permissão
- **WHEN** uma conta com só `estoque.ver` tenta lançar uma saída pela API
- **THEN** a API responde 403

#### Scenario: Fornecedor como referência
- **WHEN** Carla, sem `fornecedores.ver`, abre uma entrada da "HP Brasil"
- **THEN** ela vê o nome "HP Brasil", sem o caminho para a ficha do fornecedor
