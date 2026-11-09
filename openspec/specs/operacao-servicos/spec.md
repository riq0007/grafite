# operacao-servicos Specification

## Purpose

Instalar, atualizar e manter o Grafite no servidor interno Windows, com os ambientes de teste e de produção separados, os serviços do Windows, o pacote da versão, a promoção das migrations pelo teste e a volta à versão anterior.

## Requirements

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
- o coletor, só na produção, ligado à organização que opera o servidor (spec coletor-local);
- o proxy (spec https-interno);
- as duas instâncias do PostgreSQL.

Cada serviço SHALL iniciar com o Windows e reiniciar sozinho depois de uma falha. Os logs SHALL ficar numa pasta do ambiente, com rotação por tamanho. Os apps e o coletor SHALL atender só no próprio servidor, e a rede chega aos apps só pelo proxy. A fila em disco do coletor SHALL ficar na pasta da produção, legível só para os administradores do servidor e para a conta dos serviços.

#### Scenario: Falha do app
- **WHEN** o processo do app de produção termina com erro
- **THEN** o Windows o inicia de novo, e a falha fica no log do ambiente

#### Scenario: App fora do proxy
- **WHEN** outra máquina da rede tenta abrir a porta do app de produção direto
- **THEN** a conexão é recusada, e só o endereço do proxy responde

#### Scenario: Coletor da produção
- **WHEN** o serviço do coletor da produção inicia, com a faixa da rede do servidor cadastrada na tela
- **THEN** ele busca a configuração na API da produção pelo endereço da organização que opera o servidor e pinga os ativos dela

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

### Requirement: Volta à versão anterior

O comando de operação SHALL poder voltar um ambiente à versão que ele usava antes da última atualização, sem desfazer migrations. Isso SHALL funcionar porque toda mudança de estrutura acrescenta antes de remover, então a versão anterior roda no banco novo (spec mestre, seção 10.6).

Na produção, a volta SHALL pedir o nome do banco da produção digitado antes de mudar qualquer coisa, como a atualização. No roteiro automático, a confirmação SHALL vir pelo `--confirmar`.

#### Scenario: Volta depois de uma atualização
- **WHEN** a produção foi atualizada da 1.4.0 para a 1.5.0, e quem opera pede a volta
- **THEN** a produção passa a rodar a 1.4.0 no mesmo banco, e a saúde informa a 1.4.0

#### Scenario: Volta da produção sem a confirmação
- **WHEN** quem opera pede a volta da produção e digita outro nome no lugar do nome do banco
- **THEN** o comando recusa sem mudar nada

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

### Requirement: Versão desempacotada presa por um instante

Ao dar o nome final à pasta da versão desempacotada, o comando SHALL tentar de novo enquanto o Windows disser que a pasta está presa, por até 10 s somadas as esperas. Depois disso, ou com outro erro, ele SHALL falhar com o motivo do sistema, sem mudar o que está instalado.

#### Scenario: Antivírus conferindo a versão nova
- **WHEN** o antivírus segura um arquivo da versão recém-desempacotada por um instante
- **THEN** a versão ganha o nome final, e a instalação ou a atualização segue

### Requirement: Troca da chave do cofre pelo comando de operação

O comando de operação SHALL trocar a chave mestra do cofre dos dois ambientes. Antes de mudar qualquer coisa, ele SHALL pedir o nome do banco da produção digitado. No roteiro automático, a confirmação SHALL vir pelo `--confirmar`. Depois, ele SHALL:
- gerar a chave nova e gravar a atual como a anterior, na configuração dos dois ambientes;
- reiniciar os apps, que passam a ler com as duas e a gravar com a nova;
- cifrar de novo as chaves dos segredos da produção e do teste (spec cofre-de-segredos);
- tirar a chave anterior da configuração e reiniciar os apps de novo;
- dizer onde guardar a chave anterior: com os backups feitos antes da troca, que só abrem os segredos com ela.

Se algo falhar no meio, a configuração SHALL ficar com as duas chaves, e o comando SHALL dizer o que falhou e como continuar, pelo runbook.

#### Scenario: Troca completa
- **WHEN** quem opera o servidor troca a chave do cofre
- **THEN** os dois ambientes passam a usar a chave nova, os segredos revelam os mesmos valores, e o comando diz para guardar a anterior com os backups de antes

#### Scenario: Falha no meio da troca
- **WHEN** a nova cifragem dos segredos do teste falha
- **THEN** a configuração dos dois ambientes continua com a chave nova e a anterior, os segredos continuam abrindo, e o comando diz como continuar

#### Scenario: Troca sem a confirmação
- **WHEN** quem opera pede a troca da chave e digita outro nome no lugar do nome do banco da produção
- **THEN** o comando recusa sem gerar nem gravar nenhuma chave

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

A restauração da produção, a volta à versão anterior e a troca da chave do cofre SHALL NOT estar no menu: elas ficam no painel da operação (spec painel-da-operacao) e no comando.

A instalação SHALL criar, na raiz da instalação, o `Grafite.cmd`, e o atalho "Grafite" na área de trabalho de todos os usuários do servidor. O atalho SHALL pedir a elevação de administrador e abrir o painel da operação. O menu SHALL abrir pelo comando `grafite.ps1 menu`, para quem prefere o terminal ou está num servidor sem interface gráfica.

O `Grafite.cmd` da raiz SHALL seguir a produção: a atualização e a volta da produção SHALL trazer o da versão que passa a rodar. Numa versão sem o painel, o atalho abre o menu dela.

#### Scenario: Conta criada pelo menu
- **WHEN** quem opera escolhe "Criar conta" no menu e informa o nome, o usuário e que a pessoa é administradora, aceitando o endereço proposto
- **THEN** a conta é criada na produção, na organização que opera o servidor, com o perfil Administrador, a senha temporária aparece uma vez, e o menu volta à lista

#### Scenario: Atualização pelo menu
- **WHEN** quem opera escolhe "Atualizar", informa o zip e escolhe a produção
- **THEN** a atualização roda como pelo comando: recusa a versão que não roda no teste e pede o nome do banco da produção digitado antes de mudar qualquer coisa

#### Scenario: Restauração fora do menu
- **WHEN** quem opera procura a restauração no menu
- **THEN** ela não está na lista, e o fim da lista diz que a restauração, a volta e a troca da chave do cofre estão no painel e no comando, como diz o runbook

#### Scenario: Tarefa que falha
- **WHEN** o teste do e-mail pelo menu é recusado pelo servidor de e-mail
- **THEN** o menu mostra o motivo da recusa e volta à lista, sem fechar

#### Scenario: Atalho do painel na área de trabalho
- **WHEN** a instalação termina, e quem opera dá dois cliques no atalho "Grafite" da área de trabalho
- **THEN** o Windows pede a elevação, e o painel da operação abre no navegador do servidor

#### Scenario: Atalho do menu na área de trabalho
- **WHEN** a produção volta a uma versão sem o painel, como a v0.1.1, e quem opera dá dois cliques no atalho "Grafite" da área de trabalho
- **THEN** o Windows pede a elevação, e o menu da operação dessa versão abre, porque a volta trouxe o `Grafite.cmd` dela

#### Scenario: Menu pelo comando
- **WHEN** quem opera roda `grafite.ps1 menu` num terminal como administrador
- **THEN** o menu da operação abre, com as tarefas numeradas

### Requirement: Serviços e configurações pelo comando de operação

O comando de operação SHALL ligar e desligar cada ambiente:
- `servicos parar --ambiente teste|producao` para o app do ambiente e, na produção, também o coletor. Na produção, ele SHALL pedir o nome do banco da produção digitado antes de parar;
- `servicos iniciar --ambiente teste|producao` inicia o que estiver parado e confere a saúde do app.

O comando de operação SHALL configurar o backup da produção com o `backup configurar`, que recebe:
- os destinos;
- a janela do horário;
- a retenção dos diários, dos semanais e dos mensais;
- a frequência do teste de restauração.

Antes de gravar, ele SHALL conferir que cada destino existe e aceita gravação. Depois, SHALL gravar na configuração da produção, reiniciar a produção e conferir a saúde.

O comando de operação SHALL configurar o certificado do proxy com o `certificado configurar`:
- o modo interno, com a AC do proxy ou com os arquivos da AC da empresa;
- ou o modo público, com o e-mail e o token do DNS, pedido sem aparecer na tela.

Ele SHALL gravar o modo na configuração da instalação e o token só na configuração do proxy. Depois, SHALL gerar de novo a configuração do proxy, reiniciá-lo e conferir a saúde dos dois ambientes pelo HTTPS.

O comando de operação SHALL acrescentar e tirar endereços:
- `enderecos acrescentar <endereço>` acrescenta o endereço à produção e o endereço do teste correspondente ao teste. O endereço do teste é perguntado, com o padrão `grafite-teste` no lugar do primeiro nome. Os dois SHALL entrar também nos endereços de acesso da organização que opera o servidor, no banco de cada ambiente. Depois, ele SHALL gerar de novo a configuração do proxy, conferir a saúde e dizer para cadastrar os dois endereços no DNS da empresa;
- `enderecos tirar <endereço>` pede o endereço digitado e tira o endereço e o do teste correspondente. Ele SHALL recusar tirar o último endereço da produção.

Um valor fora do formato SHALL ser recusado antes de gravar, com o motivo.

#### Scenario: Produção desligada pelo comando
- **WHEN** quem opera roda `servicos parar --ambiente producao` e digita o nome do banco da produção
- **THEN** o app e o coletor da produção param, e o `servicos estado` mostra os dois parados

#### Scenario: Destino do backup que não grava
- **WHEN** quem opera configura um destino de backup que não existe
- **THEN** o comando recusa antes de gravar e diz qual destino não existe

#### Scenario: Certificado público pelo comando
- **WHEN** quem opera muda o certificado para o modo público, com o e-mail e o token da Cloudflare
- **THEN** o token vai só para a configuração do proxy, sem aparecer na tela, e o proxy reinicia e responde pelo HTTPS nos dois ambientes

#### Scenario: Endereço acrescentado
- **WHEN** quem opera acrescenta `grafite.acme.example`, aceitando o endereço do teste proposto
- **THEN** a produção passa a atender também por ele, o teste passa a atender por `grafite-teste.acme.example`, a organização que opera o servidor entra pelos dois, e o comando diz para cadastrá-los no DNS

#### Scenario: Último endereço
- **WHEN** quem opera tenta tirar o único endereço da produção
- **THEN** o comando recusa e diz que a produção precisa de pelo menos um endereço
