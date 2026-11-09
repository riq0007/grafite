## MODIFIED Requirements

### Requirement: Instalação do zero

O comando de operação SHALL instalar o Grafite num servidor Windows com o Node 24 e o PostgreSQL 18 da produção já instalados. A instalação SHALL:
- conferir os pré-requisitos e dizer o que falta;
- criar a instância do PostgreSQL do teste;
- criar os papéis e os bancos dos dois ambientes, com senhas geradas, gravadas só na configuração de cada ambiente;
- gerar a chave mestra do cofre, a mesma nos dois ambientes, porque o teste usa a cópia dos dados da produção, gravada só na configuração deles;
- gerar as chaves do push só na configuração da produção, com o contato no endereço da organização que opera o servidor;
- aplicar as migrations e criar a primeira organização, com a senha temporária da primeira conta mostrada uma vez;
- ligar o coletor da produção a essa organização, com o nome "Servidor", sem faixas, e com o token gerado na configuração do coletor, que nunca aparece na tela;
- registrar os serviços, configurar o proxy e as regras do firewall;
- iniciar tudo e conferir a saúde de cada app.

A configuração de cada ambiente SHALL ficar legível só para os administradores do servidor e para a conta dos serviços. O fim da instalação SHALL dizer que o coletor só coleta depois que as faixas de rede dele forem cadastradas na tela dos coletores, e que o e-mail só sai depois de configurado pelo comando de operação.

#### Scenario: Pré-requisito ausente
- **WHEN** a instalação roda num servidor sem o PostgreSQL 18
- **THEN** ela para antes de criar qualquer coisa e diz que o PostgreSQL 18 precisa estar instalado

#### Scenario: Porta do proxy ocupada
- **WHEN** outro programa, como o IIS, escuta na porta 80 ou na 443
- **THEN** a instalação para antes de criar qualquer coisa e diz qual porta liberar

#### Scenario: Instalação completa
- **WHEN** a instalação termina num servidor com os pré-requisitos
- **THEN** a produção e o teste respondem pelos endereços configurados, com HTTPS, e a saúde de cada um informa a versão instalada

#### Scenario: Coletor da instalação
- **WHEN** a instalação termina, e quem administra a primeira organização abre a tela dos coletores
- **THEN** a tela mostra o "Servidor", ativo, sem faixas, e o fim da instalação disse para cadastrar as faixas

#### Scenario: Push depois da instalação
- **WHEN** a instalação termina, e uma conta da produção abre a seção Notificações dos Ajustes num navegador com push
- **THEN** "Receber neste aparelho" está disponível, e a configuração do teste não tem as chaves do push

### Requirement: Atualização pelo teste antes da produção

Uma versão nova SHALL ser instalada primeiro no teste. Lá, o comando SHALL parar o app, aplicar as migrations, passar a usar a versão nova, iniciar e conferir a saúde.

A configuração sem a chave mestra do cofre SHALL ganhar uma, gerada uma vez e gravada na configuração dos dois ambientes antes de o app do teste iniciar; a produção, que ainda roda a versão anterior, só a usa na atualização dela.

Na produção, o comando SHALL recusar a versão que não roda no teste, com saúde, e com todas as migrations dela aplicadas no teste. Antes de mudar a produção, ele SHALL:
- fazer um backup da produção e conferir que ele pode ser lido;
- pedir o nome do banco da produção digitado.

Depois, nesta ordem, ele SHALL parar o coletor e o app, aplicar as migrations, passar a usar a versão nova, iniciar o app, conferir a saúde e iniciar o coletor.

A configuração da produção sem as chaves do push SHALL ganhar as chaves, geradas uma vez, antes de o app da produção iniciar. Uma configuração que já as tem SHALL ficar com elas: os aparelhos inscritos deixariam de receber com outras.

Antes de iniciar o coletor, a atualização SHALL ligá-lo à organização que opera o servidor, como a instalação faz, se ele ainda não estiver ligado: uma produção instalada antes do coletor ganha o "Servidor", sem faixas, e uma que já o tem continua como está.

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

#### Scenario: Produção de antes do coletor
- **WHEN** a produção instalada antes desta versão é atualizada
- **THEN** a organização que opera o servidor ganha o coletor "Servidor", sem faixas, com o token que o coletor já tinha, e uma segunda atualização não cria outro

#### Scenario: Instalação de antes do cofre
- **WHEN** um servidor instalado antes do cofre atualiza o teste para a versão com o cofre
- **THEN** a configuração dos dois ambientes ganha a mesma chave mestra do cofre, e a atualização seguinte não a troca

#### Scenario: Instalação de antes do push
- **WHEN** um servidor instalado antes do push atualiza a produção para a versão com o push
- **THEN** a configuração da produção ganha as chaves do push, a do teste continua sem elas, e a atualização seguinte não as troca

### Requirement: Runbook da operação

O Grafite SHALL ter um runbook em pt-BR, versionado com o código e incluído no pacote da versão, que cubra:
- os pré-requisitos do servidor e a instalação do PostgreSQL 18;
- a escolha do modo do certificado e a distribuição da AC interna;
- a instalação, a atualização, a volta e a preparação do teste;
- o backup, o teste de restauração, a restauração da produção e a guarda das chaves, com a chave mestra do cofre;
- a troca da chave mestra do cofre;
- o e-mail e o push: a configuração do SMTP, o teste do envio, as chaves do push e a saída do servidor para os serviços de push;
- os serviços e os logs.

#### Scenario: Restauração pelo runbook
- **WHEN** quem opera precisa restaurar a produção a partir de um backup
- **THEN** o runbook dá os passos, os comandos e o que conferir depois, sem precisar ler o código

#### Scenario: E-mail pelo runbook
- **WHEN** quem opera precisa ligar o e-mail do Grafite no SMTP da empresa
- **THEN** o runbook dá o comando, o formato do endereço e do remetente, e como conferir o envio

## ADDED Requirements

### Requirement: E-mail configurado pelo comando de operação

O comando de operação SHALL configurar o servidor de e-mail da produção: ele SHALL gravar o endereço do SMTP e o remetente na configuração da produção, com o acesso restrito, reiniciar o app e conferir a saúde. A senha do SMTP SHALL NOT aparecer na tela nem no log. Um endereço ou um remetente fora do formato SHALL ser recusado antes de gravar, com o motivo.

O comando SHALL também mandar um e-mail de teste para um endereço dado, pela configuração gravada, e dizer o resultado: o envio aceito pelo servidor de e-mail, ou a recusa com o motivo que ele deu.

A configuração do teste SHALL NOT ganhar o servidor de e-mail.

#### Scenario: E-mail configurado
- **WHEN** quem opera configura o SMTP da empresa com o remetente `Grafite <grafite@empresa.com.br>`
- **THEN** a configuração da produção passa a tê-lo, o app reinicia com saúde, e os Ajustes da produção deixam de dizer que o e-mail não está configurado

#### Scenario: Teste do envio pelo comando
- **WHEN** quem opera manda o e-mail de teste para ti@empresa.com.br, e o SMTP recusa a autenticação
- **THEN** o comando diz que o servidor de e-mail recusou a autenticação, sem mostrar a senha

#### Scenario: Remetente fora do formato
- **WHEN** quem opera configura o remetente `Grafite`, sem o e-mail
- **THEN** o comando recusa antes de gravar e diz o formato do remetente
