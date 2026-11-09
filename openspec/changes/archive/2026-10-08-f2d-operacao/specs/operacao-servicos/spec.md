## Purpose

Instalar, atualizar e manter o Grafite no servidor interno Windows, com os ambientes de teste e de produção separados, os serviços do Windows, o pacote da versão, a promoção das migrations pelo teste e a volta à versão anterior.

## ADDED Requirements

### Requirement: Ambientes identificados

A configuração da API SHALL dizer o ambiente em que ela roda: desenvolvimento, teste ou produção. No ambiente de teste:
- a interface SHALL avisar, em texto, que é o ambiente de teste (specs estrutura-da-casca e tela-de-entrada);
- as tarefas agendadas que agem fora do sistema SHALL NOT rodar, como o backup agendado. As ações pedidas por uma pessoa e a manutenção diária SHALL continuar funcionando.

O banco de teste SHALL ficar numa instância do PostgreSQL separada da produção, com as próprias senhas. As credenciais do teste SHALL NOT abrir o banco da produção.

#### Scenario: Backup agendado no teste
- **WHEN** chega o horário do backup no ambiente de teste
- **THEN** o backup não roda, e nenhuma tarefa com falha é registrada por isso

#### Scenario: Credencial do teste contra a produção
- **WHEN** alguém usa a conexão do teste trocando só o nome do banco pelo da produção
- **THEN** a conexão é recusada

### Requirement: Serviços do Windows

No servidor interno, SHALL rodar como serviços do Windows:
- o app de produção (API, web compilada e tarefas agendadas);
- o app de teste;
- o coletor, só na produção, que até o P2 responde só à saúde;
- o proxy (spec https-interno);
- as duas instâncias do PostgreSQL.

Cada serviço SHALL iniciar com o Windows e reiniciar sozinho depois de uma falha. Os logs SHALL ficar numa pasta do ambiente, com rotação por tamanho. Os apps SHALL atender só no próprio servidor, e a rede chega a eles só pelo proxy.

#### Scenario: Falha do app
- **WHEN** o processo do app de produção termina com erro
- **THEN** o Windows o inicia de novo, e a falha fica no log do ambiente

#### Scenario: App fora do proxy
- **WHEN** outra máquina da rede tenta abrir a porta do app de produção direto
- **THEN** a conexão é recusada, e só o endereço do proxy responde

### Requirement: Pacote da versão

Cada versão SHALL ser publicada pelo CI como um pacote para Windows, com:
- a web compilada;
- as dependências de produção da API e do coletor, já para Windows;
- o gerenciador de serviços, o proxy e o comando de operação;
- o runbook.

O pacote SHALL ter o hash SHA-256 publicado junto. A versão do pacote SHALL ser a mesma que a saúde da API informa. O servidor SHALL NOT compilar nada nem baixar dependências para instalar ou atualizar.

#### Scenario: Pacote alterado
- **WHEN** o comando de operação recebe um pacote cujo hash não confere
- **THEN** ele recusa o pacote antes de mudar qualquer coisa, e diz que o pacote não confere

### Requirement: Instalação do zero

O comando de operação SHALL instalar o Grafite num servidor Windows com o Node 24 e o PostgreSQL 18 da produção já instalados. A instalação SHALL:
- conferir os pré-requisitos e dizer o que falta;
- criar a instância do PostgreSQL do teste;
- criar os papéis e os bancos dos dois ambientes, com senhas geradas, gravadas só na configuração de cada ambiente;
- aplicar as migrations e criar a primeira organização, com a senha temporária da primeira conta mostrada uma vez;
- registrar os serviços, configurar o proxy e as regras do firewall;
- iniciar tudo e conferir a saúde de cada app.

A configuração de cada ambiente SHALL ficar legível só para os administradores do servidor e para a conta dos serviços.

#### Scenario: Pré-requisito ausente
- **WHEN** a instalação roda num servidor sem o PostgreSQL 18
- **THEN** ela para antes de criar qualquer coisa e diz que o PostgreSQL 18 precisa estar instalado

#### Scenario: Porta do proxy ocupada
- **WHEN** outro programa, como o IIS, escuta na porta 80 ou na 443
- **THEN** a instalação para antes de criar qualquer coisa e diz qual porta liberar

#### Scenario: Instalação completa
- **WHEN** a instalação termina num servidor com os pré-requisitos
- **THEN** a produção e o teste respondem pelos endereços configurados, com HTTPS, e a saúde de cada um informa a versão instalada

### Requirement: Atualização pelo teste antes da produção

Uma versão nova SHALL ser instalada primeiro no teste. Lá, o comando SHALL parar o app, aplicar as migrations, passar a usar a versão nova, iniciar e conferir a saúde.

Na produção, o comando SHALL recusar a versão que não roda no teste, com saúde, e com todas as migrations dela aplicadas no teste. Antes de mudar a produção, ele SHALL:
- fazer um backup da produção e conferir que ele pode ser lido;
- pedir o nome do banco da produção digitado.

Depois, nesta ordem, ele SHALL parar o coletor e o app, aplicar as migrations, passar a usar a versão nova, iniciar o app, conferir a saúde e iniciar o coletor.

Se algo falhar depois de parar os serviços, eles SHALL ficar parados, o backup SHALL ficar guardado, e o comando SHALL dizer o que falhou e o que fazer.

#### Scenario: Versão que não passou pelo teste
- **WHEN** se tenta atualizar a produção para a versão 1.5.0, e o teste roda a 1.4.0
- **THEN** o comando recusa e diz que a 1.5.0 precisa rodar no teste primeiro

#### Scenario: Migration que falha na produção
- **WHEN** uma migration falha ao ser aplicada na produção
- **THEN** o app e o coletor ficam parados, o backup feito antes continua guardado, e o comando mostra o erro e os passos da recuperação

#### Scenario: Nome do banco errado
- **WHEN** quem atualiza a produção digita um nome que não é o do banco da produção
- **THEN** o comando para sem mudar nada

### Requirement: Volta à versão anterior

O comando de operação SHALL poder voltar um ambiente à versão que ele usava antes da última atualização, sem desfazer migrations. Isso SHALL funcionar porque toda mudança de estrutura acrescenta antes de remover, então a versão anterior roda no banco novo (spec mestre, seção 10.6).

#### Scenario: Volta depois de uma atualização
- **WHEN** a produção foi atualizada da 1.4.0 para a 1.5.0, e quem opera pede a volta
- **THEN** a produção passa a rodar a 1.4.0 no mesmo banco, e a saúde informa a 1.4.0

### Requirement: Teste com a cópia da produção

Sob pedido, e depois do nome do banco do teste digitado, o comando de operação SHALL substituir os dados do teste pela cópia da produção. Ele SHALL:
- restaurar o último backup da produção, banco e arquivos, na instância do teste;
- trocar os endereços de acesso de cada organização pelos do teste, conforme a configuração;
- aplicar as migrations da versão que o teste roda.

Os dados do teste SHALL NOT ir para a produção, nunca.

#### Scenario: Teste preparado
- **WHEN** quem opera prepara o teste, e a produção tem a organização no endereço `grafite.empresa.com.br`
- **THEN** o teste passa a ter os dados da produção, e a organização atende em `grafite-teste.empresa.com.br`, não no endereço da produção

#### Scenario: Migration nova validada nos dados reais
- **WHEN** o teste roda uma versão mais nova que a da produção, e quem opera prepara o teste
- **THEN** as migrations da versão nova são aplicadas na cópia dos dados da produção, e uma falha aparece antes de chegar à produção

### Requirement: Runbook da operação

O Grafite SHALL ter um runbook em pt-BR, versionado com o código e incluído no pacote da versão, que cubra:
- os pré-requisitos do servidor e a instalação do PostgreSQL 18;
- a escolha do modo do certificado e a distribuição da AC interna;
- a instalação, a atualização, a volta e a preparação do teste;
- o backup, o teste de restauração, a restauração da produção e a guarda das chaves;
- os serviços e os logs.

#### Scenario: Restauração pelo runbook
- **WHEN** quem opera precisa restaurar a produção a partir de um backup
- **THEN** o runbook dá os passos, os comandos e o que conferir depois, sem precisar ler o código
