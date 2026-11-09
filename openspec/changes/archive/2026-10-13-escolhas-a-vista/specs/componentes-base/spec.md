## ADDED Requirements

### Requirement: Escolha com as opções à vista

A busca com sugestões SHALL abrir a lista ao clicar no campo, ao focá-lo pelo teclado com Alt+↓ ou seta para baixo, e pelo botão de abrir ao lado dele, antes de qualquer tecla. Ela SHALL NOT abrir vazia:
- com as opções na memória, ela SHALL mostrar todas, com as sugeridas pelo contexto primeiro, numa seção "Sugeridos", e as outras depois, em ordem alfabética do português;
- com as opções vindas da API, ela SHALL mostrar as sugestões do contexto e as primeiras em ordem alfabética, e, quando houver mais, o rodapé "Digite para buscar entre N" com o total.

Digitar SHALL filtrar a lista sem diferenciar acento e maiúsculas, como hoje. A origem de uma sugestão SHALL estar escrita, como "Sugerido: local de trabalho de Bruno". A escolha SHALL continuar acessível pelo teclado: setas, Home e End, Enter para escolher e Esc para fechar sem mudar o valor.

#### Scenario: Ver antes de digitar
- **WHEN** alguém clica no campo do fuso horário em Ajustes
- **THEN** a lista abre com "Seguir o sistema" e os fusos do Brasil em "Sugeridos", seguidos dos outros fusos

#### Scenario: Opções que vêm da API
- **WHEN** alguém abre a escolha do responsável de um ativo, numa organização com 300 pessoas, sem digitar
- **THEN** a lista mostra as primeiras pessoas em ordem alfabética e o rodapé "Digite para buscar entre 300"

#### Scenario: Fechar sem mudar
- **WHEN** alguém abre a lista, desce até outra opção pelas setas e aperta Esc
- **THEN** a lista fecha, e o valor escolhido continua o mesmo

### Requirement: Escolha de local em árvore

A escolha de um local SHALL mostrar, no painel que abre ao clicar, a árvore dos locais ativos com o ícone e o tipo de cada um, os ramos expansíveis pelo mouse e pelo teclado, e um campo para filtrar sem diferenciar acento e maiúsculas. O filtro SHALL mostrar os locais que casam com o caminho completo deles, como "Jundiaí › Expedição". Quando a tela dá um local provável, ele SHALL aparecer no topo, com a origem em texto. O local escolhido SHALL aparecer pelo caminho completo no campo.

#### Scenario: Escolher pela árvore
- **WHEN** alguém abre a escolha do local de trabalho e expande "Jundiaí"
- **THEN** o painel mostra os locais de dentro de "Jundiaí", e escolher "Expedição" põe "Jundiaí › Expedição" no campo

#### Scenario: Filtrar pelo nome
- **WHEN** alguém digita "expedicao" no filtro do painel
- **THEN** o painel mostra "Jundiaí › Expedição" e os outros locais com esse nome no caminho

#### Scenario: Local sugerido
- **WHEN** a tela de atribuição de perfil abre a escolha do local para Bruno, que trabalha em "Jundiaí › Expedição"
- **THEN** o topo do painel mostra "Jundiaí › Expedição" com "Sugerido: local de trabalho de Bruno"
