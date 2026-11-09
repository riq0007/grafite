## Purpose

Deixar cada organização ligar e desligar os módulos opcionais, para usar só o que precisa, sem perder os dados de um módulo desligado.

## ADDED Requirements

### Requirement: Módulos opcionais

Os módulos opcionais SHALL ser definidos pelo sistema, cada um com o nome e uma descrição em pt-BR. Neste momento, o único módulo opcional SHALL ser o Ativos, descrito como "O catálogo, o cadastro e a lista dos ativos.".

O Início, a Administração e os Ajustes SHALL NOT ser opcionais. Um módulo opcional SHALL começar ligado, numa organização nova e numa que já existia antes dele.

#### Scenario: Organização que já existia
- **WHEN** a versão com os módulos opcionais é instalada numa organização que já usava o catálogo
- **THEN** o módulo Ativos continua ligado, sem nenhuma ação de quem administra

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

#### Scenario: Sessão aberta
- **WHEN** o Ativos é desligado enquanto Bruno está com a lista dos ativos aberta
- **THEN** o Ativos some do dock de Bruno sem recarregar, e a tela diz que o módulo está desligado

#### Scenario: Religar
- **WHEN** quem edita a organização liga o Ativos de novo
- **THEN** o módulo volta ao dock de todos, com os tipos, os modelos e os ativos que havia
