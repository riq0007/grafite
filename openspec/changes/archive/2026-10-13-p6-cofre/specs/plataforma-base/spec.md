## MODIFIED Requirements

### Requirement: Ambiente de desenvolvimento com um comando

Um único comando SHALL subir o ambiente de desenvolvimento: banco de dados, API, web e o coletor, com recarga automática ao editar o código. Na primeira execução com o banco vazio, o comando SHALL criar a organização de desenvolvimento, ligada aos endereços locais. Ela vem com a conta de administração `admin`, que não exige os dois passos e entra com a senha `admin123`, sem troca obrigatória.

A cada execução, o comando SHALL garantir essa senha: se ela tiver mudado ou estiver temporária, ela volta a `admin123`, e as sessões abertas da conta são encerradas. Se a senha já for `admin123`, nada SHALL ser gravado na conta. O terminal SHALL mostrar o usuário e a senha da conta de administração.

A senha fixa SHALL existir só no ambiente de desenvolvimento. O comando SHALL recusar gravá-la:
- numa organização com algum endereço que não seja local (`localhost`, `127.0.0.1` ou `::1`);
- num ambiente de produção.

O comando SHALL gerar uma vez a chave mestra do cofre no `.env` local, que nunca é versionado, e SHALL NOT trocá-la depois: os segredos já cifrados com ela deixariam de abrir.

O comando SHALL também garantir o coletor de desenvolvimento na organização de desenvolvimento, com a faixa `127.0.0.0/8` na criação e o token gerado uma vez e guardado só no `.env` local, que nunca é versionado. As faixas mudadas depois pela tela SHALL ficar como estão.

#### Scenario: Primeira execução
- **WHEN** o desenvolvedor executa o comando de desenvolvimento com o Docker ativo
- **THEN** o banco sobe, as migrations são aplicadas, e a API, a web e o coletor ficam no ar

#### Scenario: Organização de desenvolvimento
- **WHEN** o comando roda pela primeira vez com o banco vazio
- **THEN** a organização de desenvolvimento é criada, o terminal mostra o usuário `admin` e a senha `admin123`, e a entrada com eles abre a casca sem pedir uma senha nova

#### Scenario: Execuções seguintes
- **WHEN** o comando roda de novo com o mesmo banco, e a senha da conta `admin` continua `admin123`
- **THEN** a organização não é criada de novo, e nada é gravado na conta

#### Scenario: Senha mudada no desenvolvimento
- **WHEN** a senha da conta `admin` foi trocada, e o comando roda de novo
- **THEN** a senha volta a `admin123`, sem troca obrigatória, e as sessões abertas da conta são encerradas

#### Scenario: Organização com endereço de verdade
- **WHEN** a organização do endereço `localhost` tem também o endereço `grafite.empresa.local`
- **THEN** o comando recusa gravar a senha fixa, diz o motivo, e a conta não muda

#### Scenario: Ambiente de produção
- **WHEN** o passo que grava a senha fixa roda num ambiente de produção
- **THEN** ele recusa, diz o motivo, e nenhuma conta muda

#### Scenario: Docker inativo
- **WHEN** o comando de desenvolvimento é executado com o Docker fechado
- **THEN** o comando para e informa que o Docker precisa estar em execução

#### Scenario: Coletor de desenvolvimento
- **WHEN** o comando roda, e um ativo de um tipo com a disponibilidade na rede tem o IP `127.0.0.1`
- **THEN** o coletor de desenvolvimento pinga o ativo, e a tabela dos ativos o mostra "Online"

### Requirement: Configuração validada na partida

A API e o coletor SHALL validar a configuração ao iniciar. Se faltar uma variável obrigatória ou algum valor for inválido, o processo SHALL recusar iniciar e SHALL informar qual variável falhou e por quê. Nenhum valor sensível SHALL ter padrão embutido no código.

A pasta dos arquivos SHALL ser obrigatória na configuração da API. Na partida, a API SHALL conferir que a pasta existe, ou criá-la, e que aceita gravação. Senão, ela SHALL recusar iniciar, com o nome da variável e o motivo.

A chave mestra do cofre SHALL ser obrigatória na configuração da API, com 32 bytes em base64. A chave anterior do cofre SHALL ser aceita só durante a troca dela (spec cofre-de-segredos), no mesmo formato e diferente da atual. Sem a chave, fora do formato, ou com a anterior igual à atual, a API SHALL recusar iniciar, com o nome da variável e o motivo, sem mostrar a chave.

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

#### Scenario: Chave do cofre ausente
- **WHEN** a API é iniciada sem a chave mestra do cofre
- **THEN** o processo encerra com uma mensagem que nomeia a variável da chave do cofre, sem mostrar nenhuma chave
