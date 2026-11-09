## MODIFIED Requirements

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
