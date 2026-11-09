## ADDED Requirements

### Requirement: Início em blocos

O Início SHALL ser feito de blocos. "O que resolver agora" SHALL ser o primeiro bloco de fábrica e SHALL continuar com o título da janela, com o número de abertas. Os blocos dos módulos SHALL ter o título num carimbo de seção. Um módulo SHALL poder registrar blocos do Início, com as permissões de quem os vê, sem mudança na casca. O bloco de um módulo desligado, ou que a conta não pode ver, SHALL NOT aparecer.

No topo, o Início SHALL mostrar o campo "Buscar ativos, pessoas, locais e ações", que abre a busca global.

#### Scenario: Bloco de um módulo
- **WHEN** um módulo registra um bloco do Início, e a conta tem a permissão dele
- **THEN** o bloco aparece no Início, depois de "O que resolver agora", sem mudança no código da casca

#### Scenario: Busca no topo
- **WHEN** o usuário clica em "Buscar ativos, pessoas, locais e ações"
- **THEN** a busca global abre, como pelo Ctrl K

### Requirement: Suprimentos que acabam primeiro

O Ativos SHALL registrar o bloco "Suprimentos que acabam primeiro", para quem vê os ativos. O bloco SHALL mostrar até 6 impressoras, do menor nível para o maior. Cada uma SHALL trazer:
- o cartucho do suprimento de menor nível, na tinta dele;
- o nome da impressora e a descrição do suprimento;
- o nível, como "8%";
- a estimativa de quando acaba, como "Acaba em cerca de 9 dias", quando as leituras permitem.

Clicar numa impressora SHALL abrir a ficha dela. Sem impressora com o nível lido, o bloco SHALL mostrar "Nenhuma impressora com o nível lido.".

#### Scenario: Toner quase no fim
- **WHEN** a Impressora do RH tem o toner preto em 8%, e a do Financeiro, o ciano em 40%
- **THEN** o bloco mostra a do RH primeiro, com o cartucho preto, "8%" e a estimativa, e depois a do Financeiro

### Requirement: Backups do Control iD no Início

A Gestão de ativos SHALL registrar o bloco "Backups do Control iD", para quem vê os backups do Control iD. O bloco SHALL mostrar cada controle com:
- o nome;
- os rostos do último backup, como "120 rostos";
- a faixa dos últimos 14 dias, com uma forma por situação.

Os controles há mais dias sem backup SHALL vir primeiro. Clicar num controle SHALL abrir a ficha dele.

#### Scenario: Controle sem backup
- **WHEN** o Controle da portaria está há 5 dias sem backup, e o do almoxarifado teve backup hoje
- **THEN** o bloco mostra o da portaria primeiro, com os dias sem backup na faixa

### Requirement: Personalizar o Início

O Início SHALL ter "Personalizar o Início", que abre um modo em que cada bloco ganha Subir, Descer e Ocultar. "O que resolver agora" SHALL ficar sempre à vista: ele sobe e desce, sem Ocultar. Os blocos ocultos SHALL ficar numa lista, cada um com Mostrar. "Concluir" SHALL fechar o modo. A ordem e os ocultos SHALL ficar gravados na conta, e o bloco novo de um módulo SHALL entrar no fim, à vista.

#### Scenario: Subir um bloco
- **WHEN** o usuário personaliza o Início e sobe "Suprimentos que acabam primeiro" acima de "O que resolver agora"
- **THEN** o Início passa a abrir com os suprimentos primeiro, também depois de sair e voltar

#### Scenario: Ocultar e mostrar
- **WHEN** o usuário oculta "Backups do Control iD"
- **THEN** o bloco sai do Início e aparece na lista dos ocultos, com Mostrar, que o devolve ao fim

#### Scenario: O que resolver agora sempre à vista
- **WHEN** o usuário personaliza o Início
- **THEN** "O que resolver agora" tem Subir e Descer, sem Ocultar
