## Purpose

Levar o usuário do primeiro pixel à casca pronta: um carregamento honesto, com etapas reais, as boas-vindas no primeiro acesso e a casca que se monta, sem nunca atrasar quem só quer trabalhar.

## ADDED Requirements

### Requirement: Carregamento com etapas reais

O carregamento SHALL mostrar a marca do produto, uma barra fina e a etapa atual em texto. As etapas SHALL ser esperas reais da chegada. No F1c, elas são:
- "Carregando o Grafite", o download e o início da aplicação;
- "Carregando suas preferências";
- "Pronto".

A barra SHALL avançar quando uma etapa termina, e nunca por tempo. Outras partes da aplicação SHALL poder acrescentar as suas etapas, como a sessão no F2 e os alertas no P3, sem mudança na chegada. A etapa atual SHALL ser anunciada ao leitor de tela.

A chegada SHALL NOT esperar o servidor: sem resposta da API, a casca abre, e o item de rede avisa.

#### Scenario: Etapas na ordem
- **WHEN** a aplicação leva 2 s para baixar
- **THEN** o carregamento mostra "Carregando o Grafite", depois "Carregando suas preferências" e "Pronto", e a barra avança a cada etapa concluída

#### Scenario: Barra sem tempo falso
- **WHEN** uma etapa demora mais do que as outras
- **THEN** a barra fica parada até essa etapa terminar

#### Scenario: Etapa acrescentada
- **WHEN** uma parte da aplicação acrescenta a etapa "Validando sessão"
- **THEN** ela aparece no carregamento, na sua vez, sem mudança no código da chegada

#### Scenario: Servidor fora do ar
- **WHEN** a API não responde e o usuário abre a aplicação
- **THEN** a casca abre normalmente, e o item de rede mostra "Sem conexão com o servidor"

### Requirement: Carregamento só quando demora

O carregamento SHALL aparecer só se a chegada passar de 500 ms, no primeiro acesso e nos seguintes. Uma chegada mais rápida SHALL ir direto às boas-vindas ou à casca, sem mostrar o carregamento. Ao terminar, o carregamento SHALL sair com uma troca de opacidade.

#### Scenario: Chegada rápida
- **WHEN** a casca fica pronta em 300 ms
- **THEN** nenhum carregamento aparece

#### Scenario: Chegada lenta
- **WHEN** a aplicação leva 2 s para baixar
- **THEN** o carregamento aparece depois de 500 ms, com "Carregando o Grafite"

### Requirement: Boas-vindas no primeiro acesso

No primeiro acesso a este navegador, depois da chegada, SHALL aparecer o "olá" escrito à mão, da esquerda para a direita, seguido de "Bem-vindo ao Grafite". As boas-vindas SHALL aparecer uma vez só, e nos acessos seguintes a casca SHALL abrir direto. Se o navegador não guarda dados, as boas-vindas SHALL NOT aparecer, para não se repetirem a cada recarga.

#### Scenario: Primeiro acesso
- **WHEN** o usuário abre a aplicação pela primeira vez neste navegador
- **THEN** o "olá" é escrito à mão, e aparece "Bem-vindo ao Grafite"

#### Scenario: Acesso seguinte
- **WHEN** o usuário já viu as boas-vindas e abre a aplicação de novo
- **THEN** a casca abre direto, sem o "olá"

#### Scenario: Armazenamento bloqueado
- **WHEN** o navegador recusa guardar dados e o usuário abre a aplicação
- **THEN** a casca abre direto, sem as boas-vindas

### Requirement: Pular as boas-vindas

As boas-vindas SHALL poder ser puladas com um clique, com Esc e com o botão "Pular", que recebe o foco quando elas aparecem. Pular SHALL levar à casca na hora e SHALL contar como boas-vindas vistas.

#### Scenario: Pular com Esc
- **WHEN** o "olá" está sendo escrito e o usuário pressiona Esc
- **THEN** a casca aparece na hora, e as boas-vindas não voltam no próximo acesso

#### Scenario: Pular pelo teclado
- **WHEN** as boas-vindas aparecem e o usuário pressiona Enter
- **THEN** o botão "Pular", que está com o foco, leva à casca

### Requirement: Montagem da casca

Depois das boas-vindas, a casca SHALL se montar: a barra superior desce, a janela de conteúdo aparece e o dock sobe com mola. No celular, a barra de abas sobe no lugar do dock. A montagem SHALL acontecer só depois das boas-vindas. Nos outros acessos, a casca SHALL aparecer já no lugar, sem montagem.

#### Scenario: Montagem depois das boas-vindas
- **WHEN** as boas-vindas terminam
- **THEN** a barra desce, a janela aparece e o dock sobe com mola

#### Scenario: Acesso seguinte sem montagem
- **WHEN** o usuário abre a aplicação depois de já ter visto as boas-vindas
- **THEN** a casca aparece no lugar, sem a barra descer nem o dock subir

### Requirement: Chegada com movimento reduzido

Com movimento reduzido, pedido pelo sistema operacional ou pelos Ajustes, a chegada SHALL usar só trocas de opacidade. O "olá" SHALL aparecer já escrito, e a casca SHALL aparecer sem deslocamentos.

#### Scenario: Primeiro acesso com movimento reduzido
- **WHEN** o sistema pede movimento reduzido e o usuário abre a aplicação pela primeira vez
- **THEN** o "olá" aparece já escrito, com troca de opacidade, e a casca aparece sem a barra descer nem o dock subir
