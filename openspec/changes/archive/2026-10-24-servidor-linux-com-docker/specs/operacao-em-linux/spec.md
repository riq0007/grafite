## Purpose

Instalar, atualizar e manter o Grafite num servidor Linux dedicado ao Docker, com a produção e o teste no mesmo servidor, os processos em contêineres, o pacote da versão com as imagens e as mesmas regras de atualização, volta, teste e backup do servidor Windows.

## ADDED Requirements

### Requirement: Contêineres no servidor Linux

No servidor Linux, SHALL rodar como contêineres do Docker:
- o app de produção (API, web compilada e tarefas agendadas);
- o app de teste;
- o coletor, só na produção, ligado à organização que opera o servidor (spec coletor-local);
- o proxy (spec https-interno);
- um PostgreSQL 18 para cada ambiente, cada um com as próprias senhas.

Cada contêiner SHALL iniciar com o Docker quando o servidor liga e reiniciar sozinho depois de uma falha. Os logs de cada contêiner SHALL ficar em rotação por tamanho. Só o proxy SHALL atender a rede, nas portas 80 e 443. Os apps, o coletor e os bancos SHALL ficar numa rede interna do Docker, sem porta aberta para fora do servidor. A configuração, os dados e a fila em disco do coletor SHALL ficar na pasta da instalação, `/opt/grafite` por padrão, legíveis só para o root e para os contêineres que os usam.

#### Scenario: Falha do app
- **WHEN** o processo do app de produção termina com erro
- **THEN** o Docker inicia o contêiner dele de novo, e a falha fica no log do contêiner

#### Scenario: App fora do proxy
- **WHEN** outra máquina da rede tenta abrir direto a porta do app de produção ou a do banco
- **THEN** a conexão é recusada, e só o proxy responde, nas portas 80 e 443

#### Scenario: Servidor reiniciado
- **WHEN** o servidor Linux reinicia
- **THEN** os contêineres do Grafite voltam com o Docker, e a produção responde pelo HTTPS sem nenhum comando

#### Scenario: Coletor da produção
- **WHEN** o contêiner do coletor inicia, com a faixa da rede do servidor cadastrada na tela dos coletores
- **THEN** ele busca a configuração na API da produção pelo endereço da organização que opera o servidor e pinga os ativos dela

### Requirement: Pacote da versão para Linux

Cada versão SHALL ser publicada pelo CI, na mesma release do pacote para Windows, também como um pacote para Linux, com:
- as imagens da versão: a aplicação, o coletor, o comando de operação, o proxy e o PostgreSQL 18;
- o lançador do comando de operação e o roteiro de instalação;
- o runbook.

O pacote SHALL ter o hash SHA-256 publicado junto. A versão do pacote SHALL ser a mesma que a saúde da API informa. O servidor SHALL NOT compilar nada nem baixar imagens ou dependências para instalar ou atualizar: as imagens SHALL vir do pacote.

#### Scenario: Pacote alterado
- **WHEN** o comando de operação recebe um pacote para Linux cujo hash não confere
- **THEN** ele recusa o pacote antes de mudar qualquer coisa, e diz que o pacote não confere

#### Scenario: Servidor sem internet
- **WHEN** a instalação roda num servidor Linux sem acesso à internet, com o pacote e o hash copiados para ele
- **THEN** ela termina sem baixar nada

### Requirement: Comando de operação no Linux

O servidor Linux SHALL ter o comando `grafite`, que roda o comando de operação da versão da produção. Ele SHALL oferecer os mesmos comandos e pedir as mesmas confirmações do servidor Windows (spec operacao-servicos):
- `instalar`, `atualizar`, `voltar` e `preparar-teste`;
- `backup` e `restaurar`;
- `proxy` e `servicos`;
- `cofre` e `email`;
- `organizacao` e `conta`.

O comando SHALL exigir o root e SHALL recusar rodar sem o Docker. Os comandos `organizacao` e `conta` SHALL rodar o comando da API da versão do ambiente, com a configuração dele.

#### Scenario: Sem o root
- **WHEN** uma conta sem o root roda `grafite servicos estado`
- **THEN** o comando recusa e diz para rodar com o `sudo`

#### Scenario: Conta criada na produção
- **WHEN** quem opera roda `grafite conta criar --ambiente producao` com as opções da conta
- **THEN** a conta é criada pelo comando da API da versão da produção, com a configuração da produção

### Requirement: Instalação do zero no Linux

O comando de operação SHALL instalar o Grafite num servidor Linux x86-64 com o Docker Engine e o plugin compose já instalados. A instalação SHALL:
- conferir os pré-requisitos, o hash do pacote e as portas 80 e 443 e dizer o que falta, antes de criar qualquer coisa;
- carregar as imagens do pacote;
- criar o banco de cada ambiente, no PostgreSQL dele, com os papéis e as senhas geradas, gravadas só na configuração de cada ambiente;
- gerar a chave mestra do cofre, a mesma nos dois ambientes, e as chaves do push, só na produção;
- aplicar as migrations e criar a primeira organização, com a senha temporária da primeira conta mostrada uma vez;
- ligar o coletor da produção a essa organização, com o nome "Servidor" e sem faixas;
- configurar o proxy, iniciar tudo e conferir a saúde de cada app pela rede interna e pelo HTTPS.

As perguntas, as respostas por arquivo e a retomada da instalação interrompida SHALL ser as do servidor Windows (spec operacao-servicos). O fim da instalação SHALL dizer que o coletor só coleta depois que as faixas de rede dele forem cadastradas na tela dos coletores e que o e-mail só sai depois de configurado pelo comando de operação.

#### Scenario: Docker ausente
- **WHEN** o roteiro de instalação roda num servidor sem o Docker ou sem o plugin compose
- **THEN** ele para antes de criar qualquer coisa e diz o que instalar

#### Scenario: Porta do proxy ocupada
- **WHEN** outro programa escuta na porta 80 ou na 443 do servidor
- **THEN** a instalação para antes de criar qualquer coisa e diz qual porta liberar

#### Scenario: Instalação completa
- **WHEN** a instalação termina num servidor com os pré-requisitos
- **THEN** a produção e o teste respondem pelos endereços configurados, com HTTPS, e a saúde de cada um informa a versão instalada

#### Scenario: Instalação interrompida
- **WHEN** a instalação para no meio, e quem opera roda o mesmo comando de novo
- **THEN** ela continua de onde parou, com as mesmas senhas

### Requirement: Atualização e volta pelas imagens

A atualização no Linux SHALL seguir as regras da atualização pelo teste antes da produção (spec operacao-servicos):
- a versão nova vai primeiro ao teste;
- a produção só recebe a versão que roda no teste, com saúde e com as migrations dela aplicadas no teste;
- antes de mudar a produção, o backup é feito e conferido, e o nome do banco da produção é digitado;
- depois de uma falha com os contêineres parados, eles ficam parados, o backup fica guardado, e o comando diz o que falhou e o que fazer.

No Linux, cada versão SHALL ser o conjunto das imagens do pacote dela, carregadas uma vez só. A atualização SHALL passar o ambiente às imagens da versão nova, com as migrations aplicadas pela imagem da versão nova.

A volta SHALL passar o ambiente às imagens da versão de antes da última atualização, no mesmo banco, sem desfazer migrations. As imagens da versão de antes SHALL ficar no servidor até a atualização seguinte do ambiente.

#### Scenario: Versão que não passou pelo teste
- **WHEN** se tenta atualizar a produção para a versão 1.5.0, e o teste roda a 1.4.0
- **THEN** o comando recusa e diz que a 1.5.0 precisa rodar no teste primeiro

#### Scenario: Volta depois de uma atualização
- **WHEN** a produção foi atualizada da 1.4.0 para a 1.5.0, e quem opera pede a volta
- **THEN** a produção passa a rodar as imagens da 1.4.0 no mesmo banco, e a saúde informa a 1.4.0

#### Scenario: Migration que falha na produção
- **WHEN** uma migration falha ao ser aplicada na produção
- **THEN** o app e o coletor ficam parados, o backup feito antes continua guardado, e o comando mostra o erro e os passos da recuperação

### Requirement: Teste com a cópia da produção no Linux

O teste SHALL ficar no mesmo servidor Linux, com o próprio banco, a própria pasta dos arquivos e os próprios endereços. O `preparar-teste` SHALL fazer o que faz no Windows (spec operacao-servicos):
- restaurar o último backup da produção no banco e na pasta dos arquivos do teste;
- trocar os endereços de acesso pelos do teste;
- aplicar as migrations da versão que o teste roda.

As credenciais do teste SHALL NOT abrir o banco da produção.

#### Scenario: Teste preparado
- **WHEN** quem opera prepara o teste, e a produção tem a organização no endereço `grafite.empresa.com.br`
- **THEN** o teste passa a ter os dados da produção, e a organização atende em `grafite-teste.empresa.com.br`, não no endereço da produção

#### Scenario: Credencial do teste contra a produção
- **WHEN** alguém usa a conexão do teste trocando só o endereço do banco pelo da produção
- **THEN** a conexão é recusada

### Requirement: Backup no Linux

O backup diário, o teste de restauração e a restauração da produção (spec backup) SHALL funcionar no Linux como no Windows, com o mesmo banco, os mesmos arquivos e o mesmo manifesto. As ferramentas do PostgreSQL 18 SHALL vir na imagem da aplicação, sem nada instalado no servidor. Os destinos do backup SHALL ser pastas do servidor, como um compartilhamento de rede montado pelo sistema. O horário do backup e a janela SHALL seguir o fuso do servidor, como no Windows.

Um destino SHALL ser marcado na instalação. O backup SHALL recusar gravar num destino sem a marca, como o ponto de montagem de um compartilhamento que não está montado.

#### Scenario: Backup no compartilhamento
- **WHEN** o destino do backup é a pasta onde o servidor montou o compartilhamento do NAS
- **THEN** o backup diário grava nela a pasta do backup, com o banco, os arquivos e o manifesto

#### Scenario: Compartilhamento desmontado
- **WHEN** o compartilhamento do NAS não está montado na hora do backup
- **THEN** o backup falha nesse destino, com o motivo, e não grava no disco do servidor no lugar dele

#### Scenario: Fuso do servidor
- **WHEN** o servidor está no fuso de São Paulo, e o horário do backup é 02:00
- **THEN** o backup roda às 02:00 de São Paulo

### Requirement: Instalação de teste no Linux pelo CI

Antes de publicar a release de uma versão, o CI SHALL instalar o pacote para Linux dela, do zero, num Linux com o Docker. Lá, ele SHALL conferir:
- a saúde da produção e do teste pelo HTTPS;
- a atualização e a volta;
- o backup.

Os PRs que mexem na operação, nas imagens ou no pacote SHALL rodar a mesma instalação.

#### Scenario: Imagem quebrada
- **WHEN** um PR muda a imagem da aplicação, e ela não sobe
- **THEN** a instalação de teste no Linux reprova o PR antes de qualquer release

### Requirement: Runbook da operação no Linux

O runbook SHALL cobrir a operação no Linux, ao lado da do Windows:
- os pré-requisitos do servidor e a instalação do Docker Engine e do plugin compose;
- a montagem dos destinos do backup;
- a instalação, a atualização, a volta e a preparação do teste;
- o backup, a restauração e a guarda das chaves, com a pasta da configuração no Linux;
- os contêineres e os logs.

#### Scenario: Log pelo runbook
- **WHEN** quem opera precisa ver por que o app da produção reiniciou
- **THEN** o runbook dá o comando que mostra o log do contêiner dele
