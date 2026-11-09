# plataforma-base Specification

## Purpose

Estabelecer a base técnica do Grafite: estrutura do repositório, ambiente de desenvolvimento, configuração validada, saúde dos serviços, contrato da API, proteção contra segredos e verificação automática de qualidade.

## Requirements

### Requirement: Estrutura do repositório

O repositório SHALL ter três aplicações e quatro pacotes compartilhados:
- **aplicações:** web, API e coletor;
- **pacotes:** domínio, design system, banco e cliente da API.

Cada aplicação e pacote SHALL poder ser verificado (lint, tipos e testes) de forma independente e também todos de uma vez.

#### Scenario: Verificação completa
- **WHEN** o desenvolvedor executa a verificação do repositório inteiro
- **THEN** lint, checagem de tipos e testes rodam em todas as aplicações e pacotes, e o resultado indica qual deles falhou

### Requirement: Ambiente de desenvolvimento com um comando

Um único comando SHALL subir o ambiente de desenvolvimento: banco de dados, API, web e o coletor, com recarga automática ao editar o código. Na primeira execução com o banco vazio, o comando SHALL criar a organização de desenvolvimento, ligada aos endereços locais. Ela vem com a conta de administração `admin`, que não exige os dois passos e entra com a senha `admin123`, sem troca obrigatória.

A cada execução, o comando SHALL garantir essa senha: se ela tiver mudado ou estiver temporária, ela volta a `admin123`, e as sessões abertas da conta são encerradas. Se a senha já for `admin123`, nada SHALL ser gravado na conta. O terminal SHALL mostrar o usuário e a senha da conta de administração.

A senha fixa SHALL existir só no ambiente de desenvolvimento. O comando SHALL recusar gravá-la:
- numa organização com algum endereço que não seja local (`localhost`, `127.0.0.1` ou `::1`);
- num ambiente de produção.

O comando SHALL gerar uma vez a chave mestra do cofre no `.env` local, que nunca é versionado, e SHALL NOT trocá-la depois: os segredos já cifrados com ela deixariam de abrir.

O comando SHALL também garantir o coletor de desenvolvimento na organização de desenvolvimento, com a faixa `127.0.0.0/8` na criação e o token gerado uma vez e guardado só no `.env` local, que nunca é versionado. As faixas mudadas depois pela tela SHALL ficar como estão.

O comando SHALL subir também um servidor de e-mail local, que guarda os e-mails sem entregá-los e os mostra num endereço local, e SHALL ligar a API a ele. Ele SHALL gerar uma vez as chaves do push no `.env` local e SHALL NOT trocá-las depois: os aparelhos inscritos com elas deixariam de receber.

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

#### Scenario: E-mail no desenvolvimento
- **WHEN** a pessoa da conta `admin` tem um e-mail, e abre um alerta crítico no desenvolvimento
- **THEN** o e-mail aparece no servidor de e-mail local, e nenhum e-mail sai do computador

### Requirement: Configuração validada na partida

A API e o coletor SHALL validar a configuração ao iniciar. Se faltar uma variável obrigatória ou algum valor for inválido, o processo SHALL recusar iniciar e SHALL informar qual variável falhou e por quê. Nenhum valor sensível SHALL ter padrão embutido no código.

A pasta dos arquivos SHALL ser obrigatória na configuração da API. Na partida, a API SHALL conferir que a pasta existe, ou criá-la, e que aceita gravação. Senão, ela SHALL recusar iniciar, com o nome da variável e o motivo.

A chave mestra do cofre SHALL ser obrigatória na configuração da API, com 32 bytes em base64. A chave anterior do cofre SHALL ser aceita só durante a troca dela (spec cofre-de-segredos), no mesmo formato e diferente da atual. Sem a chave, fora do formato, ou com a anterior igual à atual, a API SHALL recusar iniciar, com o nome da variável e o motivo, sem mostrar a chave.

O ambiente SHALL ser obrigatório na configuração da API, com um destes valores: `desenvolvimento`, `teste` ou `producao` (spec operacao-servicos). Sem ele, ou com outro valor, a API SHALL recusar iniciar, com o nome da variável e os valores aceitos.

O servidor de e-mail SHALL ser opcional na configuração da API, inteiro ou nada:
- o endereço do SMTP, que começa com `smtp://` ou `smtps://`;
- o remetente, com o nome e o e-mail, como `Grafite <grafite@empresa.com.br>`.

As chaves do push SHALL ser opcionais, também inteiras ou nada:
- a chave pública e a privada, num par válido;
- o contato do servidor para os serviços de push, que começa com `mailto:` ou `https://`.

Uma parte sem a outra, ou um valor fora do formato, SHALL fazer a API recusar iniciar, com o nome da variável e o motivo, sem mostrar a senha do SMTP nem a chave privada.

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

#### Scenario: SMTP sem remetente
- **WHEN** a API é iniciada com o endereço do SMTP e sem o remetente
- **THEN** o processo encerra com uma mensagem que nomeia a variável do remetente, sem mostrar a senha do SMTP

#### Scenario: Chave do push que não forma par
- **WHEN** a API é iniciada com uma chave pública do push que não é a da chave privada
- **THEN** o processo encerra com uma mensagem que nomeia as chaves do push, sem mostrar a chave privada

#### Scenario: Sem e-mail e sem push
- **WHEN** a API é iniciada sem o SMTP e sem as chaves do push
- **THEN** ela inicia, e os Ajustes dizem que o e-mail e os avisos no celular não estão configurados

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

### Requirement: Contrato da API gerado e verificado

A descrição OpenAPI da API SHALL ser gerada a partir das mesmas definições que validam as requisições. O cliente tipado usado pela web e pelo coletor SHALL ser gerado a partir dessa descrição. A verificação automática SHALL falhar quando a API mudar sem o cliente ter sido regenerado.

#### Scenario: Cliente desatualizado
- **WHEN** uma rota da API muda de formato e o cliente não é regenerado
- **THEN** a verificação automática falha indicando a divergência

### Requirement: Proteção contra segredos

Um commit que contenha um segredo (chave, senha, token ou string de conexão com credencial) SHALL ser bloqueado localmente. A mesma verificação SHALL rodar no CI. Os arquivos de ambiente reais SHALL ser ignorados pelo controle de versão.

#### Scenario: Commit com chave
- **WHEN** o desenvolvedor tenta fazer commit de um arquivo que contém uma chave de API
- **THEN** o commit é recusado e a mensagem aponta o arquivo e a linha

### Requirement: Qualidade verificada antes do commit e em cada PR

Lint e formatação SHALL ser verificados antes de cada commit. O CI SHALL verificar em cada PR:
- lint e checagem de tipos;
- testes unitários;
- testes de integração com banco real;
- testes de ponta a ponta de fumaça;
- busca de segredos.

Num PR que só muda documentação e specs (os arquivos de `docs/` e de `openspec/`), o CI SHALL verificar o lint, os tipos, os testes unitários e a busca de segredos, e SHALL pular os testes de integração, de ponta a ponta e de regressão visual, dizendo no resumo do run que foram pulados porque só a documentação e as specs mudaram. No push na branch principal, o CI SHALL rodar todas as verificações.

Um resultado de checagem de tipos ou de teste unitário reaproveitado de um run anterior SHALL valer só quando nenhum arquivo que a checagem ou o teste lê mudou, inclusive os arquivos fora do pacote testado.

Todos os arquivos de texto do repositório SHALL usar fim de linha LF.

#### Scenario: PR com teste falhando
- **WHEN** um PR contém um teste de integração que falha
- **THEN** o CI marca o PR como reprovado e indica o teste

#### Scenario: PR só de documentação
- **WHEN** um PR muda só arquivos de `docs/` e de `openspec/`
- **THEN** o CI roda o lint, os tipos, os unitários e a busca de segredos, pula a integração, as pontas a ponta e a regressão visual, e diz no resumo do run que elas foram puladas porque só a documentação e as specs mudaram

#### Scenario: PR com código e documentação
- **WHEN** um PR muda um arquivo de `docs/` e um arquivo fora de `docs/` e de `openspec/`
- **THEN** o CI roda todas as verificações

#### Scenario: Documento lido por um teste muda
- **WHEN** um PR muda só um documento que um teste unitário lê, e o pacote desse teste não muda
- **THEN** o teste roda de novo, em vez de ter o resultado reaproveitado de um run anterior

#### Scenario: Fim de linha no Windows
- **WHEN** um arquivo é salvo no Windows e adicionado ao repositório
- **THEN** ele é gravado com fim de linha LF

### Requirement: Imagens de contêiner para o produto

A API (com a web compilada) e o coletor SHALL ser empacotados como imagens de contêiner, que o servidor Linux roda (spec operacao-em-linux), ao lado dos serviços do servidor Windows. A imagem da aplicação SHALL:
- trazer tudo de que a API precisa para rodar, inclusive o tratamento de imagens e as ferramentas do PostgreSQL 18 que o backup usa;
- guardar os arquivos num volume, fora da imagem.

O comando de operação e o proxy, com o módulo do DNS da Cloudflare, SHALL ter as próprias imagens. O CI SHALL construir as imagens de cada versão e conferi-las pela instalação de teste no Linux.

#### Scenario: Construção das imagens
- **WHEN** o desenvolvedor executa a construção das imagens
- **THEN** são geradas as imagens da aplicação, do coletor, do comando de operação e do proxy, e a aplicação e o coletor respondem ao seu endpoint de saúde ao serem iniciados

#### Scenario: Foto enviada ao contêiner
- **WHEN** a aplicação roda no contêiner e recebe uma foto
- **THEN** a foto é tratada e gravada no volume dos arquivos, e continua lá depois que o contêiner é recriado a partir de uma imagem nova

#### Scenario: Backup no contêiner
- **WHEN** a aplicação roda no contêiner da produção, e chega o horário do backup
- **THEN** o backup usa as ferramentas do PostgreSQL 18 da própria imagem, sem nada instalado no servidor

### Requirement: Erros da API em formato único

Toda resposta de erro da API SHALL seguir um formato único (problem+json), com:
- o tipo do problema;
- o título e o detalhe em pt-BR;
- o status HTTP;
- o código de rastreio da requisição.

Um erro de validação SHALL trazer a mensagem de cada campo em pt-BR. Um erro inesperado SHALL responder só uma mensagem genérica, com o código de rastreio e sem detalhe interno. O código de rastreio SHALL ir também num cabeçalho de toda resposta e no log da requisição.

#### Scenario: Campo obrigatório ausente
- **WHEN** a entrada é enviada sem o usuário
- **THEN** a API responde 400 no formato único, com a mensagem "Informe o usuário." no campo do usuário

#### Scenario: Erro inesperado
- **WHEN** uma rota falha por um erro não previsto
- **THEN** a resposta é 500, com "Erro interno do servidor." e o código de rastreio, e o log guarda o erro com o mesmo código

#### Scenario: Rota inexistente
- **WHEN** a web chama uma rota que a API não tem
- **THEN** a resposta é 404 no formato único

### Requirement: Proteção contra requisições de outros sites

Uma requisição da API que altera dados SHALL ser recusada com 403, sem alterar nada, quando:
- vem de outro site, conforme a origem que o navegador informa;
- tem sessão e não traz o token dela no cabeçalho próprio.

A entrada, que ainda não tem sessão, SHALL exigir a mesma origem.

#### Scenario: Escrita vinda de outro site
- **WHEN** uma página de outro site envia uma escrita à API com o cookie da sessão
- **THEN** a API recusa com 403, e nada muda

#### Scenario: Escrita sem o token da sessão
- **WHEN** uma escrita com sessão chega sem o token no cabeçalho
- **THEN** a API recusa com 403, e nada muda

### Requirement: Limite de requisições

A API SHALL limitar as requisições de cada endereço IP:
- **em geral:** 600 por minuto;
- **na entrada e no código do segundo passo:** 20 por minuto.

Passado o limite, a API SHALL responder 429, com o tempo de espera em pt-BR, até a janela passar.

#### Scenario: Entradas demais do mesmo IP
- **WHEN** o mesmo IP envia a 21ª entrada dentro de um minuto
- **THEN** a API responde 429, com "Muitas requisições. Tente de novo em N s."

### Requirement: Listas paginadas por cursor

Toda lista da API que pode crescer sem limite SHALL ser paginada no servidor por cursor, com uma ordem estável. A resposta SHALL trazer os itens da página e o cursor da próxima, nulo na última. Nenhuma lista SHALL ter um teto fixo que deixe registros fora de alcance. O tamanho da página SHALL ser de no máximo 100 itens, com 50 como padrão.

#### Scenario: Última página
- **WHEN** a web pede a página seguinte de uma lista com 120 pessoas, depois das primeiras 100
- **THEN** a resposta traz as 20 restantes e o cursor da próxima nulo

#### Scenario: Página grande demais
- **WHEN** um pedido pede 500 itens por página
- **THEN** a API responde 400, com "Use até 100 itens por página." no campo do tamanho

### Requirement: Endereços da web servidos pela API

Com a web compilada, a API SHALL entregar o `index.html` a todo pedido de página (um GET que aceita HTML, sem extensão no caminho) fora do `/api`, mesmo quando o endereço é o de uma rota da API, como `/ativos`. Fora do `/api`, só a saúde (`/health`) SHALL continuar com a API. A web SHALL falar com a API sempre pelo `/api`.

#### Scenario: Recarregar a lista dos ativos
- **WHEN** o usuário recarrega a página `/ativos` no navegador
- **THEN** a web abre a lista dos ativos, e não a resposta da API

#### Scenario: A saúde aberta no navegador
- **WHEN** alguém abre `/health` no navegador
- **THEN** a API responde a saúde

### Requirement: Executores do CI

O CI e o workflow das versões SHALL rodar só em executores descartáveis hospedados pelo GitHub, que começam cada job numa máquina nova. Nenhum executor próprio SHALL estar ligado ao repositório: nenhum PR, nem um vindo de um fork, SHALL rodar código numa máquina da equipe. Um job SHALL NOT encontrar arquivos, caches nem imagens deixados por outro run, e o resultado de um PR SHALL NOT mudar o de um run seguinte, nem o da branch principal ou o de uma tag.

#### Scenario: PR de um fork pede um executor próprio
- **WHEN** alguém de fora abre um PR que muda um workflow para rodar num executor próprio
- **THEN** nenhuma máquina da equipe roda o job, porque o repositório não tem executor próprio

#### Scenario: Release da versão
- **WHEN** a tag de uma versão é criada
- **THEN** os pacotes para Windows e para Linux são montados, instalados do zero e publicados na release por executores do GitHub, sem passar por uma máquina da equipe

#### Scenario: Run seguinte começa limpo
- **WHEN** o job de um PR deixa arquivos, caches ou imagens de contêiner na máquina em que rodou
- **THEN** o run seguinte, inclusive o da branch principal e o de uma tag, começa sem eles

### Requirement: Sintaxe dos passos em PowerShell conferida

Os testes unitários SHALL passar cada passo em PowerShell dos workflows pelo parser do PowerShell e SHALL reprovar o passo que não passa, com o workflow, o job e o passo. Um passo que roda no Windows PowerShell 5.1 SHALL ser recusado também quando usa uma sintaxe que só o PowerShell 7 aceita, inclusive onde só o PowerShell 7 está instalado para conferir.

#### Scenario: Variável seguida de dois-pontos num passo do Windows
- **WHEN** um passo em PowerShell de um workflow escreve `"$LASTEXITCODE: nova tentativa"`, que o PowerShell lê como uma variável com unidade
- **THEN** o `pnpm test` reprova, com o workflow, o job, o passo e a mensagem do parser, antes de o job rodar no GitHub

#### Scenario: Sintaxe do PowerShell 7 num passo do 5.1
- **WHEN** um passo que roda no Windows PowerShell 5.1 usa o `??` ou o `&&`
- **THEN** o `pnpm test` reprova, no Windows pelo parser do 5.1 e no Linux pelo do PowerShell 7

### Requirement: Árvore sem termos privados

Os arquivos versionados SHALL NOT conter os termos da lista privada de quem mantém o repositório, como o domínio da empresa, os nomes das máquinas e o nome de quem desenvolve. A lista SHALL ficar fora do repositório: no CI, num secret; na máquina de quem desenvolve, numa pasta que o Git ignora.

A conferência SHALL rodar no CI e antes de cada commit, nos arquivos de texto e nos binários, sem diferença de caixa nem de acento. Ela SHALL dizer só o arquivo e o número do termo na lista, e SHALL NOT escrever o termo nem a linha.

Sem a lista, a conferência SHALL dizer que não conferiu. No push da branch principal, a falta da lista SHALL reprovar o CI.

#### Scenario: Commit com um termo da lista
- **WHEN** quem desenvolve tenta fazer commit de um teste que tem um termo da lista
- **THEN** o commit é recusado, e a mensagem diz o arquivo e o número do termo, sem o termo

#### Scenario: Termo achado no CI
- **WHEN** o CI acha um termo da lista num PR
- **THEN** o job reprova, e o log mostra o arquivo e o número do termo, nunca o termo

#### Scenario: PR de um fork
- **WHEN** um PR de um fork roda o CI sem acesso ao secret
- **THEN** o passo diz que não conferiu, e a conferência roda de novo no push da branch principal

#### Scenario: Termo com outra caixa e sem acento
- **WHEN** um arquivo traz um termo da lista em maiúsculas e sem o acento
- **THEN** a conferência acha o termo do mesmo jeito
