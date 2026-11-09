## MODIFIED Requirements

### Requirement: Carregamento com etapas reais

O carregamento SHALL mostrar a marca do produto, uma barra fina e a etapa atual em texto. As etapas SHALL ser esperas reais da chegada. Desde o F2a, elas são:
- "Carregando o Grafite", o download e o início da aplicação;
- "Carregando suas preferências";
- "Validando sessão";
- "Conectando alertas", com a sessão valendo: a contagem das notificações não lidas e a conexão de eventos (spec notificacoes);
- "Pronto".

A barra SHALL avançar quando uma etapa termina, e nunca por tempo. Outras partes da aplicação SHALL poder acrescentar as suas etapas, como os alertas no P3, sem mudança na chegada. A etapa atual SHALL ser anunciada ao leitor de tela.

A chegada SHALL NOT esperar o servidor por mais de 5 s, somadas as etapas que dependem dele. Sem resposta da API nesse prazo, a casca abre, com a sessão desconhecida ou sem a contagem das notificações, e o item de rede avisa.

#### Scenario: Etapas na ordem
- **WHEN** a aplicação leva 2 s para baixar, com a sessão valendo
- **THEN** o carregamento mostra "Carregando o Grafite", depois "Carregando suas preferências", "Validando sessão", "Conectando alertas" e "Pronto", e a barra avança a cada etapa concluída

#### Scenario: Sem sessão
- **WHEN** a aplicação abre sem sessão e leva 2 s para baixar
- **THEN** o carregamento passa de "Validando sessão" a "Pronto", sem "Conectando alertas", e a tela de entrada abre

#### Scenario: Barra sem tempo falso
- **WHEN** uma etapa demora mais do que as outras
- **THEN** a barra fica parada até essa etapa terminar

#### Scenario: Etapa acrescentada
- **WHEN** uma parte da aplicação acrescenta a etapa "Conectando alertas"
- **THEN** ela aparece no carregamento, na sua vez, sem mudança no código da chegada

#### Scenario: Servidor fora do ar
- **WHEN** a API não responde e o usuário abre a aplicação
- **THEN** a casca abre em até 5 s depois de "Validando sessão", e o item de rede mostra "Sem conexão com o servidor"
