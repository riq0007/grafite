## MODIFIED Requirements

### Requirement: Ambiente de desenvolvimento com um comando

Um único comando SHALL subir o ambiente de desenvolvimento: banco de dados, API, web e o coletor, com recarga automática ao editar o código. Na primeira execução com o banco vazio, o comando SHALL criar a organização de desenvolvimento, ligada aos endereços locais. Ela vem com a conta de administração `admin`, que não exige os dois passos e entra com a senha `admin123`, sem troca obrigatória.

A cada execução, o comando SHALL garantir essa senha: se ela tiver mudado ou estiver temporária, ela volta a `admin123`, e as sessões abertas da conta são encerradas. Se a senha já for `admin123`, nada SHALL ser gravado na conta. O terminal SHALL mostrar o usuário e a senha da conta de administração.

A senha fixa SHALL existir só no ambiente de desenvolvimento. O comando SHALL recusar gravá-la:
- numa organização com algum endereço que não seja local (`localhost`, `127.0.0.1` ou `::1`);
- num ambiente de produção.

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

### Requirement: Saúde dos serviços

A API e o coletor SHALL expor um endpoint de saúde que informa estado e versão. O da API SHALL informar também:
- o ambiente;
- se o banco responde;
- se a fila de tarefas está rodando;
- se a ligação com o aviso de eventos do banco está ativa.

O do coletor SHALL informar também:
- o momento da última configuração recebida e quantos alvos ela trouxe;
- o momento do último lote aceito pela API;
- quantos lotes estão na fila em disco e quantos foram descartados;
- se a API recusou o token.

Com o banco fora do ar, a resposta da API SHALL vir com código de erro. Com a fila ou o aviso de eventos fora, a resposta SHALL dizer que a API está degradada, sem código de erro, porque ela continua atendendo as requisições. Com o token recusado ou a API sem responder há mais de 10 minutos, a saúde do coletor SHALL dizer que ele está degradado, sem código de erro.

#### Scenario: Banco fora do ar
- **WHEN** o banco está indisponível e o endpoint de saúde da API é consultado
- **THEN** a resposta indica que o banco não responde, com código de erro, sem expor credenciais nem detalhes internos

#### Scenario: Aviso de eventos fora
- **WHEN** a ligação da API com o aviso de eventos do banco cai, e o banco continua respondendo
- **THEN** a saúde diz que a API está degradada e que os eventos não estão funcionando, e as outras rotas continuam respondendo

#### Scenario: Ambiente na saúde
- **WHEN** a saúde do app de teste é consultada
- **THEN** a resposta informa o ambiente de teste e a versão que ele roda

#### Scenario: Coletor com a API fora do ar
- **WHEN** a API está fora do ar há 15 minutos, e a saúde do coletor é consultada
- **THEN** a resposta diz que o coletor está degradado, com os lotes guardados na fila em disco, sem o token nem as faixas
