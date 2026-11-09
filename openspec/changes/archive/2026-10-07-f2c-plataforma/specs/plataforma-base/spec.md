## MODIFIED Requirements

### Requirement: Configuração validada na partida

A API e o coletor SHALL validar a configuração ao iniciar. Se faltar uma variável obrigatória ou algum valor for inválido, o processo SHALL recusar iniciar e SHALL informar qual variável falhou e por quê. Nenhum valor sensível SHALL ter padrão embutido no código.

A pasta dos arquivos SHALL ser obrigatória na configuração da API. Na partida, a API SHALL conferir que a pasta existe, ou criá-la, e que aceita gravação. Senão, ela SHALL recusar iniciar, com o nome da variável e o motivo.

#### Scenario: Variável obrigatória ausente
- **WHEN** a API é iniciada sem a variável de conexão com o banco
- **THEN** o processo encerra com uma mensagem que nomeia a variável ausente

#### Scenario: Segredo sem padrão
- **WHEN** alguém procura no código um valor padrão para uma chave ou senha
- **THEN** não encontra nenhum; o valor só vem da configuração do ambiente

#### Scenario: Pasta dos arquivos sem permissão de gravação
- **WHEN** a API é iniciada com a pasta dos arquivos num lugar em que o processo não pode gravar
- **THEN** o processo encerra com uma mensagem que nomeia a variável da pasta e diz que ela não aceita gravação

### Requirement: Saúde dos serviços

A API e o coletor SHALL expor um endpoint de saúde que informa estado e versão. O da API SHALL informar também:
- se o banco responde;
- se a fila de tarefas está rodando;
- se a ligação com o aviso de eventos do banco está ativa.

Com o banco fora do ar, a resposta SHALL vir com código de erro. Com a fila ou o aviso de eventos fora, a resposta SHALL dizer que a API está degradada, sem código de erro, porque ela continua atendendo as requisições.

#### Scenario: Banco fora do ar
- **WHEN** o banco está indisponível e o endpoint de saúde da API é consultado
- **THEN** a resposta indica que o banco não responde, com código de erro, sem expor credenciais nem detalhes internos

#### Scenario: Aviso de eventos fora
- **WHEN** a ligação da API com o aviso de eventos do banco cai, e o banco continua respondendo
- **THEN** a saúde diz que a API está degradada e que os eventos não estão funcionando, e as outras rotas continuam respondendo

### Requirement: Imagens de contêiner para o produto

A API (com a web compilada) e o coletor SHALL poder ser empacotados como imagens de contêiner, mesmo que o servidor interno use serviços do Windows. A imagem da aplicação SHALL:
- trazer tudo de que a API precisa para rodar, inclusive o tratamento de imagens;
- guardar os arquivos num volume, fora da imagem.

#### Scenario: Construção das imagens
- **WHEN** o desenvolvedor executa a construção das imagens
- **THEN** são geradas as imagens da aplicação e do coletor, e cada uma responde ao seu endpoint de saúde ao ser iniciada

#### Scenario: Foto enviada ao contêiner
- **WHEN** a aplicação roda no contêiner e recebe uma foto
- **THEN** a foto é tratada e gravada no volume dos arquivos, e continua lá depois que o contêiner é recriado a partir de uma imagem nova
