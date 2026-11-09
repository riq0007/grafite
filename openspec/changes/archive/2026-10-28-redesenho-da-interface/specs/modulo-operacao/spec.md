## ADDED Requirements

### Requirement: Início do Operação

O endereço `/operacao` SHALL abrir o Início do Operação.

Ele SHALL ter as ações principais em blocos grandes, cada um com o nome e uma frase do que faz:
- o pedido de toner, o conserto e o equipamento, para quem atende as solicitações em algum local;
- a nova ordem de serviço, para quem atende as OS em algum local;
- a entrada no estoque, para quem movimenta o estoque em algum local.

Embaixo, ele SHALL ter os atalhos para as listas que a conta vê: Solicitações, Ordens de serviço, Estoque, Movimentações, Consumíveis e Indicadores.

Cada bloco SHALL abrir a gaveta da ação na lista dela. Quem não tem nenhuma ação SHALL ver só os atalhos.

#### Scenario: Pedido de toner pelo Início
- **WHEN** a técnica abre o Operação e escolhe "Pedido de toner"
- **THEN** a lista das solicitações abre com o formulário do toner

#### Scenario: Quem só vê as OS
- **WHEN** uma conta com `ordens.ver` e sem `ordens.atender` abre o Operação
- **THEN** ela vê o atalho das Ordens de serviço, sem o bloco "Nova ordem de serviço"

## MODIFIED Requirements

### Requirement: Operação no dock

A casca SHALL ter o módulo Operação, depois do Alertas e antes do Mapa. Ele SHALL ficar visível só para quem tem `consumiveis.ver`, `estoque.ver`, `solicitacoes.ver` ou `ordens.ver`, também pelas permissões que as incluem, e só com o módulo ligado na organização (spec modulos-da-organizacao).

O menu SHALL ter estes itens:
- "Início", para quem vê o módulo;
- "Consumíveis", para quem vê os consumíveis;
- "Estoque" e "Movimentações", para quem vê o estoque em algum local;
- "Solicitações", para quem vê as solicitações em algum local;
- "Ordens de serviço", para quem vê as OS em algum local;
- "Indicadores", para quem vê as OS ou o estoque em algum local.

O item do dock SHALL levar ao Início do Operação. No celular, o módulo SHALL ficar em "Mais".

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
- **THEN** o Operação abre no Início, com o bloco da entrada no estoque, e o menu mostra "Início", "Estoque", "Movimentações" e "Indicadores", sem "Consumíveis"

#### Scenario: Consumível pela busca
- **WHEN** quem vê os consumíveis busca "cf258"
- **THEN** a busca mostra o "CF258A" no grupo "Consumíveis", e escolhê-lo abre a ficha dele

#### Scenario: Atendente só das solicitações
- **WHEN** Eva, com `solicitacoes.atender` em Jundiaí e sem as permissões dos consumíveis e do estoque, abre o Operação pelo dock
- **THEN** o Operação abre no Início, com os blocos do toner, do conserto e do equipamento, e o menu mostra só "Início" e "Solicitações"

#### Scenario: Toner pela busca
- **WHEN** quem atende as solicitações busca "toner"
- **THEN** a busca oferece "Nova solicitação de toner", no caminho "Operação › Solicitações", que abre o formulário do Toner

#### Scenario: Técnico só das OS
- **WHEN** Davi, com `ordens.atender` em Jundiaí e sem as outras permissões do Operação, abre o Operação pelo dock
- **THEN** o Operação abre no Início, com o bloco "Nova ordem de serviço", e o menu mostra só "Início", "Ordens de serviço" e "Indicadores"

#### Scenario: Nova OS pela busca
- **WHEN** quem atende as OS busca "ordem"
- **THEN** a busca oferece "Nova ordem de serviço", no caminho "Operação › Ordens de serviço", que abre o formulário dela

#### Scenario: Indicadores pela busca
- **WHEN** quem vê as OS busca "indicadores"
- **THEN** a busca oferece "Indicadores", no caminho "Operação", que leva à tela dos indicadores da operação

#### Scenario: Quem administra a operação
- **WHEN** Ana, só com `operacao.administrar`, abre o Operação pelo dock
- **THEN** o Operação abre no Início, e o menu mostra "Início", "Estoque", "Movimentações", "Ordens de serviço" e "Indicadores"
