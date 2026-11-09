# modulos-da-organizacao Specification

## Purpose
Deixar cada organização ligar e desligar os módulos opcionais, para usar só o que precisa, sem perder os dados de um módulo desligado.

## Requirements

### Requirement: Módulos opcionais

Os módulos opcionais SHALL ser definidos pelo sistema, cada um com o nome e uma descrição em pt-BR. Neste momento, os módulos opcionais SHALL ser:
- o Ativos, descrito como "O catálogo, o cadastro e a lista dos ativos.";
- o Cofre, descrito como "Os segredos da organização, com o acesso por segredo.";
- o Alertas, descrito como "As regras de alerta e os alertas dos ativos e dos coletores.";
- o Operação, descrito como "Os consumíveis, os modelos em que eles servem, o estoque por local, as solicitações, as ordens de serviço e os indicadores da operação.";
- o Salas, descrito como "As salas de reunião, a agenda, os pedidos de reserva e os convites.";
- o Painéis, descrito como "Os painéis das VMs, a verificação de cada um e a grade que os mostra lado a lado.".

O Início, a Administração e os Ajustes SHALL NOT ser opcionais. Um módulo opcional SHALL começar ligado, numa organização nova e numa que já existia antes dele.

#### Scenario: Organização que já existia
- **WHEN** a versão com os módulos opcionais é instalada numa organização que já usava o catálogo
- **THEN** o módulo Ativos continua ligado, sem nenhuma ação de quem administra

#### Scenario: Cofre numa organização que já existia
- **WHEN** a versão com o Cofre é instalada numa organização que já existia
- **THEN** o módulo Cofre começa ligado, e quem tem `cofre.usar` o vê no dock

#### Scenario: Alertas numa organização que já existia
- **WHEN** a versão com os alertas é instalada numa organização que já existia
- **THEN** o módulo Alertas começa ligado, e quem tem `alertas.ver` o vê no dock

#### Scenario: Operação numa organização que já existia
- **WHEN** a versão com os consumíveis é instalada numa organização que já existia
- **THEN** o módulo Operação começa ligado, e quem tem `consumiveis.ver`, `estoque.ver`, `solicitacoes.ver` ou `ordens.ver` o vê no dock

#### Scenario: Salas numa organização que já existia
- **WHEN** a versão com as salas é instalada numa organização que já existia
- **THEN** o módulo Salas começa ligado, e quem tem `salas.ver` o vê no dock

#### Scenario: Painéis numa organização que já existia
- **WHEN** a versão com os painéis é instalada numa organização que já existia
- **THEN** o módulo Painéis começa ligado, e quem tem `paineis.ver` o vê no dock

### Requirement: Ligar e desligar um módulo

Quem tem `organizacao.editar` SHALL ligar e desligar cada módulo opcional na seção Módulos da Administração.

Desligar SHALL pedir confirmação, dizendo que o módulo some para todos e que os dados ficam guardados. Ligar SHALL NOT pedir confirmação.

Cada mudança SHALL ir para a auditoria e gravar o evento `modulos.mudaram`. Os retornos SHALL ser "Módulo ligado." e "Módulo desligado.".

#### Scenario: Desligar o Ativos
- **WHEN** quem edita a organização desliga o Ativos e confirma
- **THEN** um aviso diz "Módulo desligado.", e a auditoria registra quem desligou e quando

### Requirement: Módulo desligado

Com um módulo desligado, para todas as sessões da organização:
- o dock, a barra de abas do celular e a busca SHALL NOT mostrar o módulo, os menus e os registros dele;
- as sessões abertas SHALL deixar de mostrá-lo sem recarregar, em até 5 s;
- a API SHALL recusar as rotas do módulo com 403 e "O módulo Ativos está desligado nesta organização.";
- os dados do módulo SHALL continuar guardados, e ligar o módulo de novo SHALL trazer tudo como estava.

O endereço de uma tela do módulo desligado SHALL dizer que o módulo está desligado e a quem pedir para ligá-lo.

A Gestão de ativos faz parte do módulo Ativos (spec modulo-gestao-de-ativos): o Ativos desligado SHALL tirar também a Gestão de ativos do dock, da barra de abas e da busca, e o endereço de uma tela dela SHALL dizer que o módulo Ativos está desligado.

#### Scenario: Sessão aberta
- **WHEN** o Ativos é desligado enquanto Bruno está com a lista dos ativos aberta
- **THEN** o Ativos some do dock de Bruno sem recarregar, e a tela diz que o módulo está desligado

#### Scenario: Religar
- **WHEN** quem edita a organização liga o Ativos de novo
- **THEN** o módulo volta ao dock de todos, com os tipos, os modelos e os ativos que havia

#### Scenario: Gestão de ativos com o Ativos desligado
- **WHEN** o Ativos é desligado enquanto Bruno está com a tela de tipos aberta
- **THEN** o Ativos e a Gestão de ativos somem do dock de Bruno sem recarregar, e a tela diz "O módulo Ativos está desligado nesta organização."
