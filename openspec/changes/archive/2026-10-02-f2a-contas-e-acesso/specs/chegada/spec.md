## MODIFIED Requirements

### Requirement: Carregamento com etapas reais

O carregamento SHALL mostrar a marca do produto, uma barra fina e a etapa atual em texto. As etapas SHALL ser esperas reais da chegada. Desde o F2a, elas são:
- "Carregando o Grafite", o download e o início da aplicação;
- "Carregando suas preferências";
- "Validando sessão";
- "Pronto".

A barra SHALL avançar quando uma etapa termina, e nunca por tempo. Outras partes da aplicação SHALL poder acrescentar as suas etapas, como os alertas no P3, sem mudança na chegada. A etapa atual SHALL ser anunciada ao leitor de tela.

A chegada SHALL NOT esperar o servidor por mais de 5 s. Sem resposta da API nesse prazo, a casca abre, com a sessão desconhecida, e o item de rede avisa.

#### Scenario: Etapas na ordem
- **WHEN** a aplicação leva 2 s para baixar
- **THEN** o carregamento mostra "Carregando o Grafite", depois "Carregando suas preferências", "Validando sessão" e "Pronto", e a barra avança a cada etapa concluída

#### Scenario: Barra sem tempo falso
- **WHEN** uma etapa demora mais do que as outras
- **THEN** a barra fica parada até essa etapa terminar

#### Scenario: Etapa acrescentada
- **WHEN** uma parte da aplicação acrescenta a etapa "Conectando alertas"
- **THEN** ela aparece no carregamento, na sua vez, sem mudança no código da chegada

#### Scenario: Servidor fora do ar
- **WHEN** a API não responde e o usuário abre a aplicação
- **THEN** a casca abre em até 5 s depois de "Validando sessão", e o item de rede mostra "Sem conexão com o servidor"

### Requirement: Carregamento só quando demora

O carregamento SHALL aparecer só se a chegada passar de 500 ms, no primeiro acesso e nos seguintes. Uma chegada mais rápida SHALL ir direto às boas-vindas, à tela de entrada ou à casca, sem mostrar o carregamento. Ao terminar, o carregamento SHALL sair com uma troca de opacidade.

#### Scenario: Chegada rápida
- **WHEN** a casca fica pronta em 300 ms
- **THEN** nenhum carregamento aparece

#### Scenario: Chegada lenta
- **WHEN** a aplicação leva 2 s para baixar
- **THEN** o carregamento aparece depois de 500 ms, com "Carregando o Grafite"

### Requirement: Boas-vindas no primeiro acesso

No primeiro acesso a este navegador, depois do carregamento, SHALL aparecer o "olá" escrito à mão, da esquerda para a direita, seguido de "Bem-vindo ao Grafite". Sem sessão, a tela de entrada SHALL vir depois das boas-vindas. As boas-vindas SHALL aparecer uma vez só, e nos acessos seguintes a aplicação SHALL ir direto à tela de entrada ou à casca. Se o navegador não guarda dados, as boas-vindas SHALL NOT aparecer, para não se repetirem a cada recarga.

#### Scenario: Primeiro acesso
- **WHEN** o usuário abre a aplicação pela primeira vez neste navegador, sem sessão
- **THEN** o "olá" é escrito à mão, aparece "Bem-vindo ao Grafite", e depois vem a tela de entrada

#### Scenario: Acesso seguinte
- **WHEN** o usuário já viu as boas-vindas e abre a aplicação de novo, com a sessão valendo
- **THEN** a casca abre direto, sem o "olá"

#### Scenario: Armazenamento bloqueado
- **WHEN** o navegador recusa guardar dados e o usuário abre a aplicação
- **THEN** a aplicação vai direto à tela de entrada ou à casca, sem as boas-vindas

### Requirement: Pular as boas-vindas

As boas-vindas SHALL poder ser puladas com um clique, com Esc e com o botão "Pular", que recebe o foco quando elas aparecem. Pular SHALL levar na hora à tela de entrada, sem sessão, ou à casca, e SHALL contar como boas-vindas vistas.

#### Scenario: Pular com Esc
- **WHEN** o "olá" está sendo escrito, sem sessão, e o usuário pressiona Esc
- **THEN** a tela de entrada aparece na hora, e as boas-vindas não voltam no próximo acesso

#### Scenario: Pular pelo teclado
- **WHEN** as boas-vindas aparecem e o usuário pressiona Enter
- **THEN** o botão "Pular", que está com o foco, leva adiante

### Requirement: Montagem da casca

A casca SHALL se montar depois das boas-vindas, e depois da tela de entrada quando ela vem entre as duas: a barra superior desce, a janela de conteúdo aparece e o dock sobe com mola. No celular, a barra de abas sobe no lugar do dock. A montagem SHALL acontecer só nesse primeiro acesso. Nos outros acessos, a casca SHALL aparecer já no lugar, sem montagem. Depois de uma entrada sem boas-vindas, ela SHALL aparecer com uma troca de opacidade.

#### Scenario: Montagem depois das boas-vindas
- **WHEN** o usuário vê as boas-vindas e entra pela primeira vez neste navegador
- **THEN** a barra desce, a janela aparece e o dock sobe com mola, depois da tela de entrada

#### Scenario: Acesso seguinte sem montagem
- **WHEN** o usuário abre a aplicação com a sessão valendo, depois de já ter visto as boas-vindas
- **THEN** a casca aparece no lugar, sem a barra descer nem o dock subir

#### Scenario: Entrada num acesso seguinte
- **WHEN** o usuário entra pela tela de entrada num acesso que não é o primeiro
- **THEN** a casca aparece com uma troca de opacidade, sem a barra descer nem o dock subir

## ADDED Requirements

### Requirement: Sessão validada na chegada

A etapa "Validando sessão" SHALL consultar a sessão no servidor. O que vem depois da chegada depende da resposta:
- **sessão valendo:** a casca, com o nome da conta;
- **sem sessão:** a tela de entrada;
- **sessão pendente:** a tela de entrada, no passo da vez;
- **endereço desconhecido:** a mensagem do endereço desconhecido.

Sem resposta do servidor, a casca SHALL abrir com a sessão desconhecida e SHALL validá-la quando o servidor voltar. Se ela não valer mais, a tela de entrada SHALL cobrir a casca.

#### Scenario: Sessão pendente na chegada
- **WHEN** o usuário fechou a aplicação no passo do código e a reabre dentro de 10 minutos
- **THEN** a chegada leva ao passo do código

#### Scenario: Servidor de volta sem a sessão
- **WHEN** a casca abriu sem servidor e, quando ele volta, a sessão não vale mais
- **THEN** a tela de entrada cobre a casca
