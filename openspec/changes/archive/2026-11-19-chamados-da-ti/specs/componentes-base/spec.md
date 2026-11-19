## MODIFIED Requirements

### Requirement: Ação principal da tela em destaque

O cabeçalho de cada tela SHALL trazer a ação principal no grupo das ações, à direita do título (requisito "Cabeçalho da página"):
- a ação principal SHALL vir primeiro no grupo, no nível primário, na altura dos outros botões;
- as outras ações SHALL vir depois dela;
- uma linha SHALL separar o cabeçalho do conteúdo.

No cabeçalho com o quadro, as ações vão embaixo do título, a partir da esquerda, e a ação principal SHALL fechar o grupo, depois das outras, como no chamado aberto.

Cada tela SHALL ter no máximo uma ação no nível primário à vista, fora dos diálogos e das gavetas. O estado vazio que repete a ação do cabeçalho SHALL oferecê-la no nível secundário.

#### Scenario: Lista das solicitações
- **WHEN** a técnica abre a lista das solicitações
- **THEN** "Nova solicitação" aparece à direita do título, no nível primário, e é a única ação primária da tela

#### Scenario: Lista vazia
- **WHEN** a lista dos modelos não tem nenhum modelo
- **THEN** o estado vazio oferece "Novo modelo" no nível secundário, e o "Novo modelo" do cabeçalho continua a única ação primária

#### Scenario: Ação principal com o quadro
- **WHEN** quem atende abre o #1041, com o quadro do prazo no cabeçalho
- **THEN** "Transferir", "Virar OS" e "Resolver" vêm embaixo do título, a partir da esquerda, e "Responder", no nível primário, fecha o grupo

### Requirement: Cabeçalho da página

O catálogo SHALL ter o cabeçalho da página:
- **à esquerda:** a marca opcional, como o ícone do tipo ou a foto da pessoa, o título da janela, os selos ao lado do título e o detalhe opcional embaixo, no texto secundário;
- **à direita:** as ações da tela, lado a lado, na ordem dada, que quebram para baixo quando a largura não comporta;
- **em cima, opcional:** a trilha, numa linha só dela, a 2 passos do título;
- **antes do título, opcional:** a seta de voltar, na linha do título e fora do título da janela;
- **o quadro, opcional:** um bloco à direita do título e das ações, como o do prazo do chamado aberto.

Com o quadro:
- as ações SHALL ir embaixo do título, a partir da esquerda;
- o quadro SHALL ficar à direita, no meio da altura do título e das ações;
- o título SHALL ficar no alto, no mesmo lugar, também quando o quadro é mais alto que ele;
- quando a largura não comporta o título e o quadro lado a lado, o quadro SHALL descer para baixo das ações, ainda à direita.

O título SHALL continuar o título da janela, de nível 1, que recebe o foco ao abrir a tela. Toda tela do app SHALL mostrar o título nesse cabeçalho, também nos estados de carregamento, de erro, vazio e sem acesso. O Início, feito de blocos que a conta ordena, fica de fora. Um teste-guarda SHALL reprovar o título da janela solto nas telas da web.

#### Scenario: Ações à direita
- **WHEN** a ficha da OS 3 mostra o título, o selo "Aberta" e as ações "Mudar a situação", "Lançar peça" e "Resolver"
- **THEN** o título e o selo ficam à esquerda, e as três ações ficam juntas, à direita, na mesma linha

#### Scenario: Detalhe embaixo do título
- **WHEN** a ficha da OS 3 dá o detalhe "PAT-00139 · Impressora 139"
- **THEN** o detalhe aparece embaixo do título, no texto secundário, e o leitor de tela lê o título como nível 1

#### Scenario: Seta de voltar
- **WHEN** o chamado aberto dá a seta de voltar
- **THEN** ela fica antes do título, na linha dele, e o leitor de tela lê o título da janela sem ela

#### Scenario: Tela carregando
- **WHEN** a ficha da OS 3 ainda está carregando
- **THEN** o título "OS 3" já aparece no cabeçalho da página, com a linha embaixo, e ela continua no mesmo lugar quando a ficha chega

#### Scenario: Espaço depois do cabeçalho
- **WHEN** a ficha da OS 3 carregando mostra o cabeçalho e o aviso "Carregando a ordem de serviço…"
- **THEN** o aviso começa a 4 passos da linha do cabeçalho, como o conteúdo da ficha carregada

#### Scenario: Título oculto com a barra das abas
- **WHEN** o cadastro do ativo, cujo cabeçalho só tem o título que a primeira aba repete, fica atrás da barra das abas
- **THEN** o cabeçalho não deixa faixa nem linha em cima do conteúdo, e o título continua para o leitor de tela e para o foco

#### Scenario: Título solto numa tela nova
- **WHEN** uma tela da web mostra o título da janela fora do cabeçalho da página, fora do Início
- **THEN** o teste-guarda reprova, com o arquivo e a linha do título

#### Scenario: Trilha e quadro
- **WHEN** o #1041 mostra a trilha "Chamados › Acesso e senha › #1041", o quadro do prazo e as ações
- **THEN** a trilha fica em cima do título, o quadro fica à direita, encostado na borda, e as ações ficam embaixo do título, a partir da esquerda, na mesma linha

#### Scenario: Quadro na largura estreita
- **WHEN** o cabeçalho com o quadro fica estreito demais para o título e o quadro lado a lado
- **THEN** o quadro desce para baixo das ações, ainda à direita, e as ações continuam embaixo do título

#### Scenario: Quadro mais alto que o título
- **WHEN** quem só vê os chamados abre o #1036, sem ações, com o quadro do prazo mais alto que o título e os dados
- **THEN** o título fica no mesmo lugar de quando o chamado carregava, e o quadro fica à direita

### Requirement: Escolha com as opções à vista

A busca com sugestões SHALL abrir a lista ao clicar no campo, ao focá-lo pelo teclado com Alt+↓ ou seta para baixo, e pelo botão de abrir ao lado dele, antes de qualquer tecla. Ela SHALL NOT abrir vazia:
- com as opções na memória, ela SHALL mostrar todas, com as sugeridas pelo contexto primeiro, numa seção "Sugeridos", e as outras depois, em ordem alfabética do português;
- com as opções vindas da API, ela SHALL mostrar as sugestões do contexto e as primeiras em ordem alfabética, e, quando houver mais, o rodapé "Digite para buscar entre N" com o total.

Digitar SHALL filtrar a lista sem diferenciar acento e maiúsculas, como hoje. A origem de uma sugestão SHALL estar escrita, como "Sugerido: local de trabalho de Bruno". A escolha SHALL continuar acessível pelo teclado: setas, Home e End, Enter para escolher e Esc para fechar sem mudar o valor.

Cada opção SHALL poder trazer um detalhe, numa segunda linha no texto secundário, que o leitor de tela lê como a descrição dela, como o tipo, o local e o responsável de um ativo.

#### Scenario: Ver antes de digitar
- **WHEN** alguém clica no campo do fuso horário em Ajustes
- **THEN** a lista abre com "Seguir o sistema" e os fusos do Brasil em "Sugeridos", seguidos dos outros fusos

#### Scenario: Opções que vêm da API
- **WHEN** alguém abre a escolha do responsável de um ativo, numa organização com 300 pessoas, sem digitar
- **THEN** a lista mostra as primeiras pessoas em ordem alfabética e o rodapé "Digite para buscar entre 300"

#### Scenario: Fechar sem mudar
- **WHEN** alguém abre a lista, desce até outra opção pelas setas e aperta Esc
- **THEN** a lista fecha, e o valor escolhido continua o mesmo

#### Scenario: Detalhe da opção
- **WHEN** a busca do ativo no "Trocar o ativo" acha a PAT-00139
- **THEN** a opção mostra "Impressora · Matriz › Financeiro · Marina Rocha" embaixo do nome, e o leitor de tela lê o nome e depois o detalhe
