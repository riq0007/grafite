## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Volta à versão anterior

O comando de operação SHALL poder voltar um ambiente à versão que ele usava antes da última atualização, sem desfazer migrations. Isso SHALL funcionar porque toda mudança de estrutura acrescenta antes de remover, então a versão anterior roda no banco novo (spec mestre, seção 10.6).

Na produção, a volta SHALL pedir o nome do banco da produção digitado antes de mudar qualquer coisa, como a atualização. No roteiro automático, a confirmação SHALL vir pelo `--confirmar`.

#### Scenario: Volta depois de uma atualização
- **WHEN** a produção foi atualizada da 1.4.0 para a 1.5.0, e quem opera pede a volta
- **THEN** a produção passa a rodar a 1.4.0 no mesmo banco, e a saúde informa a 1.4.0

#### Scenario: Volta da produção sem a confirmação
- **WHEN** quem opera pede a volta da produção e digita outro nome no lugar do nome do banco
- **THEN** o comando recusa sem mudar nada

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
