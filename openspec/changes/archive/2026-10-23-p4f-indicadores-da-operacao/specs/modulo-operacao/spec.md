## MODIFIED Requirements

### Requirement: Operação no dock

A casca SHALL ter o módulo Operação, depois do Alertas e antes do Cofre. Ele SHALL ficar visível só para quem tem `consumiveis.ver`, `estoque.ver`, `solicitacoes.ver` ou `ordens.ver`, também pelas permissões que as incluem, e só com o módulo ligado na organização (spec modulos-da-organizacao). O menu SHALL ter "Consumíveis", para quem vê os consumíveis, "Estoque" e "Movimentações", para quem vê o estoque em algum local, "Solicitações", para quem vê as solicitações em algum local, "Ordens de serviço", para quem vê as OS em algum local, e "Indicadores", para quem vê as OS ou o estoque em algum local. O item do dock SHALL levar à primeira tela do menu que a conta vê, na ordem Consumíveis, Estoque, Solicitações e Ordens de serviço. No celular, o módulo SHALL ficar em "Mais".

A busca (Ctrl+K) SHALL oferecer:
- "Consumíveis", "Estoque", "Movimentações", "Solicitações", "Ordens de serviço" e "Indicadores", no caminho "Operação", para quem vê cada um;
- os consumíveis, no grupo "Consumíveis", para quem vê os consumíveis: pelo código, sem diferenciar maiúsculas, espaços e hífens, e pelo nome, sem diferenciar acento e maiúsculas, cada um levando à ficha;
- a ação "Novo consumível", para quem edita os consumíveis, no caminho "Operação › Consumíveis";
- as ações "Nova entrada no estoque", "Nova saída do estoque", "Nova transferência no estoque" e "Novo ajuste do estoque", para quem movimenta o estoque em algum local, no caminho "Operação › Estoque";
- as ações "Nova solicitação de toner", "Nova solicitação de conserto" e "Nova solicitação de equipamento", para quem atende as solicitações em algum local, no caminho "Operação › Solicitações";
- a ação "Nova ordem de serviço", para quem atende as OS em algum local, no caminho "Operação › Ordens de serviço".

Sem a permissão, o endereço do Operação SHALL dizer "Você não tem acesso à Operação.", com a quem pedir acesso.

#### Scenario: Conta sem a permissão
- **WHEN** uma conta sem `consumiveis.ver`, sem `estoque.ver`, sem `solicitacoes.ver` e sem `ordens.ver` entra
- **THEN** o dock e a busca não mostram o Operação, e o endereço dele diz "Você não tem acesso à Operação."

#### Scenario: Novo consumível pela busca
- **WHEN** quem edita os consumíveis busca "consumível"
- **THEN** a busca oferece "Novo consumível", no caminho "Operação › Consumíveis", que abre o cadastro

#### Scenario: Almoxarife sem os consumíveis
- **WHEN** Carla, com `estoque.movimentar` em Jundiaí e sem `consumiveis.ver`, abre o Operação pelo dock
- **THEN** o Operação abre no Estoque, e o menu mostra "Estoque", "Movimentações" e "Indicadores", sem "Consumíveis"

#### Scenario: Consumível pela busca
- **WHEN** quem vê os consumíveis busca "cf258"
- **THEN** a busca mostra o "CF258A" no grupo "Consumíveis", e escolhê-lo abre a ficha dele

#### Scenario: Atendente só das solicitações
- **WHEN** Eva, com `solicitacoes.atender` em Jundiaí e sem as permissões dos consumíveis e do estoque, abre o Operação pelo dock
- **THEN** o Operação abre nas Solicitações, e o menu mostra só "Solicitações"

#### Scenario: Toner pela busca
- **WHEN** quem atende as solicitações busca "toner"
- **THEN** a busca oferece "Nova solicitação de toner", no caminho "Operação › Solicitações", que abre o formulário do Toner

#### Scenario: Técnico só das OS
- **WHEN** Davi, com `ordens.atender` em Jundiaí e sem as outras permissões do Operação, abre o Operação pelo dock
- **THEN** o Operação abre nas Ordens de serviço, e o menu mostra só "Ordens de serviço" e "Indicadores"

#### Scenario: Nova OS pela busca
- **WHEN** quem atende as OS busca "ordem"
- **THEN** a busca oferece "Nova ordem de serviço", no caminho "Operação › Ordens de serviço", que abre o formulário dela

#### Scenario: Indicadores pela busca
- **WHEN** quem vê as OS busca "indicadores"
- **THEN** a busca oferece "Indicadores", no caminho "Operação", que leva à tela dos indicadores da operação

#### Scenario: Quem administra a operação
- **WHEN** Ana, só com `operacao.administrar`, abre o Operação pelo dock
- **THEN** o Operação abre no Estoque, e o menu mostra "Estoque", "Movimentações", "Ordens de serviço" e "Indicadores"

### Requirement: Operação atualizada pelos eventos

A lista e a ficha dos consumíveis e os consumíveis compatíveis na ficha do modelo SHALL se atualizar sozinhos quando o evento `consumiveis.mudaram` chega, sem uma ação do usuário. O nome trocado de um fornecedor ou de um modelo SHALL aparecer do mesmo jeito, pelos eventos deles. O estoque, as movimentações, a seção Estoque da ficha do consumível, o saldo no cartão da ficha do ativo e as ocorrências do estoque no Início SHALL se atualizar do mesmo jeito quando o evento `estoque.mudou` chega. A lista e a ficha das solicitações e a seção Solicitações da ficha do ativo SHALL se atualizar do mesmo jeito quando o evento `solicitacoes.mudaram` chega. A lista e a ficha das OS, a seção Ordens de serviço da ficha do ativo e a OS na ficha da solicitação SHALL se atualizar do mesmo jeito quando o evento `ordens.mudaram` chega. A tela dos indicadores da operação SHALL se atualizar do mesmo jeito quando chega o evento `ordens.mudaram`, `estoque.mudou`, `consumiveis.mudaram` ou `metas.mudaram`. Um formulário em edição SHALL manter o que foi digitado.

#### Scenario: Consumível cadastrado com a lista aberta
- **WHEN** Ana cadastra o "CF258X" enquanto Bruno está com a lista dos consumíveis aberta
- **THEN** a lista de Bruno mostra o CF258X, sem recarregar a página

#### Scenario: Modelo renomeado com a ficha aberta
- **WHEN** quem edita os modelos renomeia a "HP LaserJet M404" enquanto a ficha do CF258A está aberta em outra sessão
- **THEN** a ficha mostra o nome novo nos modelos, sem uma ação do usuário

#### Scenario: Saída lançada com o estoque aberto
- **WHEN** Ana lança a saída de 1 CF258A do Almoxarifado enquanto Bruno está com o Estoque aberto
- **THEN** o saldo do CF258A no Almoxarifado de Bruno diminui 1, sem recarregar a página

#### Scenario: Solicitação registrada com a lista aberta
- **WHEN** Carla registra um Toner enquanto Bruno está com as Solicitações abertas
- **THEN** a lista de Bruno mostra a solicitação nova, sem recarregar a página

#### Scenario: OS resolvida com a ficha aberta
- **WHEN** Carla resolve a OS 12 enquanto Bruno está com a ficha dela aberta
- **THEN** a ficha de Bruno mostra a OS Resolvida, com o que foi feito, sem recarregar a página

#### Scenario: OS resolvida com os indicadores abertos
- **WHEN** Carla resolve a OS 12 enquanto Bruno está com os indicadores da operação abertos
- **THEN** o tempo de resolução de Bruno passa a contar a OS 12, sem recarregar a página
