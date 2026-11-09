## ADDED Requirements

### Requirement: Atalho de instalação

O pacote da versão SHALL ter um atalho de instalação, `Instalar-Grafite.cmd`, que instala o Grafite num servidor Windows com dois cliques. O atalho SHALL:
- pedir a elevação de administrador, se não estiver elevado;
- achar o zip do pacote na própria pasta e conferir o hash dele pelo `.sha256` antes de extrair qualquer coisa;
- extrair o pacote numa pasta ao lado do zip;
- instalar o Node 24, se o servidor não o tiver;
- instalar o PostgreSQL 18 da produção, se o servidor não o tiver, com:
  - a senha do `postgres` pedida sem eco e confirmada;
  - a pasta dos dados perguntada. O padrão é `D:\PostgreSQL\18\data` quando o servidor tem um disco D:, e a pasta padrão do instalador oficial, `C:\Program Files\PostgreSQL\18\data`, quando não tem;
  - a porta 5432, o serviço com início automático e o servidor atendendo só no próprio computador;
- quando o serviço do IIS ocupa a porta 80 ou a 443, perguntar se pode parar e desligar o serviço, e só seguir com a resposta afirmativa;
- então chamar a instalação do zero do comando de operação, que segue com as perguntas dela.

Os instaladores do Node 24 e do PostgreSQL 18 SHALL ter a versão e o SHA-256 fixados no pacote. O atalho SHALL usar o instalador que estiver na mesma pasta do zip e, se não houver, baixá-lo da fonte oficial. Ele SHALL NOT rodar um instalador cujo hash não confere. A senha do `postgres` SHALL NOT aparecer na tela, num arquivo que fique depois da instalação nem nos argumentos de um processo.

Uma pasta dos dados que já existe e não está vazia SHALL ser recusada, e o atalho SHALL perguntar outra, sem instalar nada antes.

Um pré-requisito já presente SHALL ficar como está. Um PostgreSQL de outra versão SHALL fazer o atalho parar antes de instalar qualquer coisa, dizendo que a produção precisa do PostgreSQL 18.

#### Scenario: Servidor limpo
- **WHEN** quem opera põe o zip, o `.sha256` e o `Instalar-Grafite.cmd` numa pasta de um Windows Server sem o Node e sem o PostgreSQL, e dá dois cliques no atalho
- **THEN** o atalho pede a elevação, instala o Node 24, pergunta a pasta dos dados e a senha do `postgres` (esta duas vezes, sem mostrá-la), instala o PostgreSQL 18 e chama a instalação do zero, que faz as perguntas dela

#### Scenario: Dados do PostgreSQL no disco D:
- **WHEN** o servidor tem um disco D:, e quem opera aceita a pasta proposta
- **THEN** os dados do PostgreSQL da produção ficam em `D:\PostgreSQL\18\data`, os programas continuam em `C:\Program Files\PostgreSQL\18`, e o serviço `postgresql-x64-18` inicia com o servidor

#### Scenario: Servidor sem disco D:
- **WHEN** o servidor só tem o disco C:
- **THEN** o atalho propõe `C:\Program Files\PostgreSQL\18\data`, a pasta padrão do instalador oficial

#### Scenario: Pasta dos dados com arquivos
- **WHEN** quem opera informa uma pasta dos dados que já tem arquivos
- **THEN** o atalho a recusa, diz que a pasta precisa estar vazia ou não existir, e pergunta de novo, sem ter instalado o PostgreSQL

#### Scenario: Instalador alterado
- **WHEN** o instalador do PostgreSQL baixado tem um hash diferente do fixado no pacote
- **THEN** o atalho não o roda, apaga o arquivo, diz que o instalador não confere e para sem instalar o Grafite

#### Scenario: Servidor sem internet
- **WHEN** o servidor não alcança a internet, e os instaladores oficiais estão na mesma pasta do zip
- **THEN** o atalho usa esses instaladores, depois de conferir o hash de cada um, sem tentar baixar nada

#### Scenario: Instalador que falta sem internet
- **WHEN** o servidor não alcança a internet, e o instalador do PostgreSQL não está na pasta do zip
- **THEN** o atalho para e diz o nome do arquivo que falta e de onde baixá-lo, sem ter mudado o servidor

#### Scenario: IIS nas portas do proxy
- **WHEN** o serviço do IIS escuta na porta 80, e quem opera responde que pode desligá-lo
- **THEN** o atalho para o serviço, desliga o início automático dele e segue para a instalação

#### Scenario: Zip alterado
- **WHEN** o hash do zip ao lado do atalho não confere com o `.sha256`
- **THEN** o atalho para antes de extrair, diz que o pacote não confere e não muda o servidor

#### Scenario: Pré-requisitos presentes
- **WHEN** o servidor já tem o Node 24 e o PostgreSQL 18
- **THEN** o atalho não pede a senha do `postgres` nem a pasta dos dados, não reinstala nada e chama a instalação do zero

### Requirement: Menu da operação

No servidor Windows, o comando de operação SHALL ter um menu, que mostra as tarefas da operação numeradas:
- o estado dos serviços;
- criar uma conta;
- redefinir um acesso;
- fazer o backup agora;
- listar os backups;
- configurar o e-mail;
- testar o e-mail;
- atualizar um ambiente;
- preparar o teste;
- reiniciar um ambiente;
- abrir a pasta dos logs.

Cada tarefa SHALL perguntar os campos que o comando dela precisa, com os padrões tirados da instalação, como o endereço da organização que opera o servidor e a produção como ambiente. Depois SHALL rodar o mesmo comando que a linha de comando roda, com as mesmas conferências e confirmações. Ao fim de cada tarefa, com sucesso ou com falha, o menu SHALL mostrar o resultado e voltar à lista. Uma resposta fora da lista SHALL ser recusada, e o menu SHALL perguntar de novo.

A restauração da produção, a volta à versão anterior e a troca da chave do cofre SHALL NOT estar no menu: continuam só pelo comando.

A instalação SHALL criar, na raiz da instalação, um atalho do menu, o `Grafite.cmd`, e o atalho "Grafite" na área de trabalho de todos os usuários do servidor. O atalho SHALL pedir a elevação de administrador e abrir o menu.

#### Scenario: Conta criada pelo menu
- **WHEN** quem opera escolhe "Criar conta" no menu e informa o nome, o usuário e que a pessoa é administradora, aceitando o endereço proposto
- **THEN** a conta é criada na produção, na organização que opera o servidor, com o perfil Administrador, a senha temporária aparece uma vez, e o menu volta à lista

#### Scenario: Atualização pelo menu
- **WHEN** quem opera escolhe "Atualizar", informa o zip e escolhe a produção
- **THEN** a atualização roda como pelo comando: recusa a versão que não roda no teste e pede o nome do banco da produção digitado antes de mudar qualquer coisa

#### Scenario: Restauração fora do menu
- **WHEN** quem opera procura a restauração no menu
- **THEN** ela não está na lista, e o fim da lista diz que a restauração, a volta e a troca da chave do cofre são pelo comando, como diz o runbook

#### Scenario: Tarefa que falha
- **WHEN** o teste do e-mail pelo menu é recusado pelo servidor de e-mail
- **THEN** o menu mostra o motivo da recusa e volta à lista, sem fechar

#### Scenario: Atalho do menu na área de trabalho
- **WHEN** a instalação termina, e quem opera dá dois cliques no atalho "Grafite" da área de trabalho
- **THEN** o Windows pede a elevação, e o menu da operação abre

## MODIFIED Requirements

### Requirement: Pacote da versão

Cada versão SHALL ser publicada pelo CI como um pacote para Windows, com:
- a web compilada;
- as dependências de produção da API e do coletor, já para Windows;
- o gerenciador de serviços, o proxy e o comando de operação;
- o atalho de instalação e a versão e o SHA-256 dos instaladores do Node 24 e do PostgreSQL 18;
- o runbook.

O pacote SHALL ter o hash SHA-256 publicado junto. A release SHALL ter também o atalho de instalação ao lado do zip, para quem opera baixar os três arquivos para a mesma pasta. A versão do pacote SHALL ser a mesma que a saúde da API informa. O servidor SHALL NOT compilar nada nem baixar as dependências do Grafite para instalar ou atualizar. Só o atalho de instalação SHALL baixar alguma coisa: os instaladores oficiais dos pré-requisitos que faltam, conferidos pelo hash fixado.

#### Scenario: Pacote alterado
- **WHEN** o comando de operação recebe um pacote cujo hash não confere
- **THEN** ele recusa o pacote antes de mudar qualquer coisa, e diz que o pacote não confere

#### Scenario: Release da versão
- **WHEN** a tag de uma versão gera a release
- **THEN** a release tem o zip, o `.sha256` e o `Instalar-Grafite.cmd`, e o atalho de dentro do zip é igual ao de fora

### Requirement: Instalação do zero

O comando de operação SHALL instalar o Grafite num servidor Windows com o Node 24 e o PostgreSQL 18 da produção já instalados, à mão ou pelo atalho de instalação. A instalação SHALL:
- conferir os pré-requisitos e dizer o que falta;
- criar a instância do PostgreSQL do teste;
- criar os papéis e os bancos dos dois ambientes, com senhas geradas, gravadas só na configuração de cada ambiente;
- gerar a chave mestra do cofre, a mesma nos dois ambientes, porque o teste usa a cópia dos dados da produção, gravada só na configuração deles;
- gerar as chaves do push só na configuração da produção, com o contato no endereço da organização que opera o servidor;
- aplicar as migrations e criar a primeira organização, com a senha temporária da primeira conta mostrada uma vez;
- ligar o coletor da produção a essa organização, com o nome "Servidor", sem faixas, e com o token gerado na configuração do coletor, que nunca aparece na tela;
- registrar os serviços, configurar o proxy e as regras do firewall;
- criar o atalho do menu da operação na raiz da instalação e na área de trabalho de todos os usuários;
- iniciar tudo e conferir a saúde de cada app.

A configuração de cada ambiente SHALL ficar legível só para os administradores do servidor e para a conta dos serviços. O fim da instalação SHALL dizer:
- que o coletor só coleta depois que as faixas de rede dele forem cadastradas na tela dos coletores;
- que o e-mail só sai depois de configurado;
- que a operação do dia a dia abre pelo atalho "Grafite" da área de trabalho.

#### Scenario: Pré-requisito ausente
- **WHEN** a instalação roda num servidor sem o PostgreSQL 18
- **THEN** ela para antes de criar qualquer coisa e diz que o PostgreSQL 18 precisa estar instalado, à mão ou pelo atalho de instalação

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

#### Scenario: Atalho do menu na instalação
- **WHEN** a instalação termina
- **THEN** a raiz da instalação tem o `Grafite.cmd`, a área de trabalho de todos os usuários tem o atalho "Grafite", e uma instalação retomada não cria um segundo atalho

### Requirement: Atualização pelo teste antes da produção

Uma versão nova SHALL ser instalada primeiro no teste. Lá, o comando SHALL parar o app, aplicar as migrations, passar a usar a versão nova, iniciar e conferir a saúde.

A configuração sem a chave mestra do cofre SHALL ganhar uma, gerada uma vez e gravada na configuração dos dois ambientes antes de o app do teste iniciar; a produção, que ainda roda a versão anterior, só a usa na atualização dela.

Na produção, o comando SHALL recusar a versão que não roda no teste, com saúde, e com todas as migrations dela aplicadas no teste. Antes de mudar a produção, ele SHALL:
- fazer um backup da produção e conferir que ele pode ser lido;
- pedir o nome do banco da produção digitado.

Depois, nesta ordem, ele SHALL parar o coletor e o app, aplicar as migrations, passar a usar a versão nova, iniciar o app, conferir a saúde e iniciar o coletor.

A configuração da produção sem as chaves do push SHALL ganhar as chaves, geradas uma vez, antes de o app da produção iniciar. Uma configuração que já as tem SHALL ficar com elas: os aparelhos inscritos deixariam de receber com outras.

Antes de iniciar o coletor, a atualização SHALL ligá-lo à organização que opera o servidor, como a instalação faz, se ele ainda não estiver ligado: uma produção instalada antes do coletor ganha o "Servidor", sem faixas, e uma que já o tem continua como está.

A atualização da produção SHALL criar o atalho do menu da operação, na raiz da instalação e na área de trabalho de todos os usuários, quando ele faltar, e SHALL trocar o `Grafite.cmd` da raiz pelo da versão nova.

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

#### Scenario: Produção de antes do menu
- **WHEN** um servidor instalado na v0.1.0 atualiza a produção para a versão com o menu
- **THEN** a raiz da instalação ganha o `Grafite.cmd`, a área de trabalho de todos os usuários ganha o atalho "Grafite", e a atualização seguinte não cria um segundo atalho

### Requirement: Runbook da operação

O Grafite SHALL ter um runbook em pt-BR, versionado com o código e incluído no pacote da versão, que cubra:
- os pré-requisitos do servidor e a instalação do PostgreSQL 18, pelo atalho de instalação ou à mão, com a pasta dos dados num disco separado;
- a escolha do modo do certificado e a distribuição da AC interna;
- a instalação pelo atalho, com os arquivos da release e a pasta onde ficam, e a instalação pelo comando, para o roteiro;
- a operação do dia a dia pelo menu, com o que cada tarefa pergunta, e o que fica só no comando;
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

#### Scenario: Instalação pelo runbook
- **WHEN** quem opera vai instalar o Grafite num servidor novo
- **THEN** o runbook diz quais arquivos baixar da release, em que pasta do servidor pô-los, onde dar os dois cliques e o que o atalho vai perguntar
