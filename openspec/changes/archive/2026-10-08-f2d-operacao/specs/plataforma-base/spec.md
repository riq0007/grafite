## MODIFIED Requirements

### Requirement: Configuração validada na partida

A API e o coletor SHALL validar a configuração ao iniciar. Se faltar uma variável obrigatória ou algum valor for inválido, o processo SHALL recusar iniciar e SHALL informar qual variável falhou e por quê. Nenhum valor sensível SHALL ter padrão embutido no código.

A pasta dos arquivos SHALL ser obrigatória na configuração da API. Na partida, a API SHALL conferir que a pasta existe, ou criá-la, e que aceita gravação. Senão, ela SHALL recusar iniciar, com o nome da variável e o motivo.

O ambiente SHALL ser obrigatório na configuração da API, com um destes valores: `desenvolvimento`, `teste` ou `producao` (spec operacao-servicos). Sem ele, ou com outro valor, a API SHALL recusar iniciar, com o nome da variável e os valores aceitos.

#### Scenario: Variável obrigatória ausente
- **WHEN** a API é iniciada sem a variável de conexão com o banco
- **THEN** o processo encerra com uma mensagem que nomeia a variável ausente

#### Scenario: Segredo sem padrão
- **WHEN** alguém procura no código um valor padrão para uma chave ou senha
- **THEN** não encontra nenhum; o valor só vem da configuração do ambiente

#### Scenario: Pasta dos arquivos sem permissão de gravação
- **WHEN** a API é iniciada com a pasta dos arquivos num lugar em que o processo não pode gravar
- **THEN** o processo encerra com uma mensagem que nomeia a variável da pasta e diz que ela não aceita gravação

#### Scenario: Ambiente desconhecido
- **WHEN** a API é iniciada com o ambiente `homologacao`
- **THEN** o processo encerra com uma mensagem que nomeia a variável do ambiente e diz os valores aceitos

### Requirement: Saúde dos serviços

A API e o coletor SHALL expor um endpoint de saúde que informa estado e versão. O da API SHALL informar também:
- o ambiente;
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

#### Scenario: Ambiente na saúde
- **WHEN** a saúde do app de teste é consultada
- **THEN** a resposta informa o ambiente de teste e a versão que ele roda
