# painel-da-operacao Specification

## Purpose

O painel da operação: uma página local, no próprio servidor, que mostra o estado do Grafite e roda as tarefas da operação pelos mesmos comandos da linha de comando. Assim, quem opera o servidor não precisa decorar comandos.

## Requirements

### Requirement: Painel aberto só no próprio servidor

O comando de operação SHALL ter o comando `painel`. Ele SHALL:
- servir a página do painel só no endereço 127.0.0.1 do servidor, numa porta livre;
- abri-la no navegador da sessão de quem chamou o comando.

O painel SHALL exigir as mesmas permissões do comando: a elevação de administrador no Windows e o root no Linux.

A página SHALL abrir só com o código de uso único que o comando gera ao abrir o navegador. O painel SHALL recusar:
- o pedido sem a sessão desse código;
- o pedido com outro endereço no cabeçalho `Host` ou na origem.

O painel SHALL funcionar com os apps do Grafite parados. Ele SHALL encerrar quando a janela do comando fechar ou depois de 30 minutos sem uso.

No Windows, o atalho "Grafite" da área de trabalho SHALL abrir o painel. No Linux, o painel SHALL abrir pelo `sudo grafite painel`, numa sessão com interface gráfica.

#### Scenario: Painel pelo atalho
- **WHEN** quem opera dá dois cliques no atalho "Grafite" e aceita a elevação
- **THEN** o navegador do servidor abre o painel, já com a sessão, e mostra o estado do servidor

#### Scenario: Outro computador
- **WHEN** outra máquina da rede tenta abrir a porta do painel
- **THEN** a conexão é recusada, porque o painel atende só em 127.0.0.1

#### Scenario: Pedido sem o código
- **WHEN** outro programa do servidor chama a API do painel sem a sessão do código
- **THEN** o pedido é recusado, sem rodar nada

#### Scenario: Grafite parado
- **WHEN** a produção e o teste estão parados, e quem opera abre o painel
- **THEN** o painel abre, mostra os dois parados e oferece o botão de ligar cada um

### Requirement: Estado do servidor no painel

A tela principal do painel SHALL mostrar:
- cada serviço da instalação, com o nome, o estado escrito por extenso e os botões de ligar, desligar e reiniciar;
- a versão em uso e a anterior de cada ambiente;
- o último backup, com o momento e o resultado, e o último teste de restauração;
- os dias até o certificado do proxy vencer;
- o espaço livre no disco da instalação.

A lista dos serviços SHALL vir da instalação, e não de uma lista própria da página. Um serviço que a instalação passa a ter SHALL aparecer no painel sem mudar a página.

Uma faixa de avisos SHALL mostrar, em texto:
- um serviço parado que deveria estar rodando;
- o último backup com falha ou feito há mais de 26 horas;
- o certificado com menos de 14 dias de validade;
- o disco com menos de 10% de espaço livre.

O estado SHALL ser lido de novo a cada 30 segundos e depois de cada tarefa.

#### Scenario: Serviço parado
- **WHEN** o coletor da produção está parado
- **THEN** a linha dele diz "Parado" e tem o botão de ligar, e a faixa de avisos diz que o coletor está parado

#### Scenario: Certificado perto de vencer
- **WHEN** o certificado do proxy vence em 10 dias
- **THEN** a faixa de avisos diz em quantos dias ele vence e o que fazer, como diz o runbook

#### Scenario: Serviço novo na instalação
- **WHEN** uma atualização passa a instalar um serviço novo
- **THEN** ele aparece na lista do painel, com o estado e os botões, sem mudar a página

### Requirement: Tarefas do painel pelos mesmos comandos

Cada ação do painel SHALL rodar o comando de operação, com os mesmos argumentos que a linha de comando aceita e as mesmas conferências e confirmações.
- As perguntas e as confirmações do comando SHALL aparecer na página, e uma senha SHALL ser digitada sem aparecer.
- O que o comando escreve SHALL aparecer ao vivo no andamento da tarefa.
- O fim SHALL dizer o resultado: o sucesso, ou a mensagem da falha.
- Só uma tarefa SHALL rodar de cada vez. Enquanto ela roda, as outras ações SHALL ficar indisponíveis, com o motivo escrito.

O painel SHALL ter as tarefas:
- ligar, desligar e reiniciar cada ambiente;
- a atualização de um ambiente, com o teste proposto antes da produção. O pacote SHALL ser escolhido entre os das pastas de Downloads e de `C:\Temp`, no Windows, ou digitado;
- o backup agora, a lista dos backups e o teste de restauração;
- a preparação do teste;
- o log de cada serviço, com as últimas linhas e a busca por um texto.

#### Scenario: Atualização pelo painel
- **WHEN** quem opera escolhe um pacote e a produção
- **THEN** a atualização roda como pelo comando:
  - ela recusa a versão que não roda no teste;
  - antes de mudar qualquer coisa, ela pede o nome do banco da produção digitado;
  - o andamento aparece ao vivo;
  - o fim diz o resultado e o caminho do backup de antes

#### Scenario: Desligar a produção
- **WHEN** quem opera desliga a produção
- **THEN** o painel pede o nome do banco da produção digitado e só então para o app e o coletor da produção

#### Scenario: Tarefa que falha
- **WHEN** o teste do e-mail pelo painel é recusado pelo servidor de e-mail
- **THEN** o painel mostra o motivo da recusa e volta à tela, sem fechar

#### Scenario: Duas tarefas ao mesmo tempo
- **WHEN** uma atualização está rodando, e quem opera pede o backup agora
- **THEN** o painel diz que o backup espera a atualização terminar, e não o roda

### Requirement: Operações sensíveis no painel

O painel SHALL ter:
- a restauração da produção, por um backup da lista;
- a volta de um ambiente à versão anterior;
- a troca da chave do cofre.

Antes de mudar qualquer coisa, cada uma SHALL explicar o que vai fazer e pedir o nome do banco do ambiente digitado. Esses são os mesmos pedidos que o comando faz. No fim, cada uma SHALL mostrar o mesmo resultado do comando, com o que fazer depois, como diz o runbook.

#### Scenario: Restauração pelo painel
- **WHEN** quem opera escolhe um backup da lista e confirma com o nome do banco da produção
- **THEN** a restauração roda como pelo comando, e o fim diz o nome do banco de antes, que ficou guardado, e o que conferir

#### Scenario: Confirmação que não confere
- **WHEN** quem opera digita outro nome na confirmação da volta da produção
- **THEN** nada muda, e o painel diz que a confirmação não confere

### Requirement: Configurações no painel

O painel SHALL mostrar e mudar, pelos comandos de operação:
- o e-mail: o servidor, o remetente e a senha, com o envio de teste;
- o backup: os destinos, a janela do horário, a retenção e a frequência do teste de restauração;
- o certificado: o modo, a AC e o token do DNS;
- os endereços da produção e do teste;
- as contas e os acessos: criar uma conta e redefinir um acesso, na produção ou no teste.

Os valores atuais SHALL vir da instalação. Os segredos, como a senha do e-mail e o token do DNS, SHALL NOT voltar para a página: ela só diz se eles estão configurados. Um valor fora do formato SHALL ser recusado antes de gravar, com o motivo.

#### Scenario: Destino do backup acrescentado
- **WHEN** quem opera acrescenta um compartilhamento de rede aos destinos do backup
- **THEN** o comando confere que o destino grava, guarda a configuração da produção e reinicia a produção com saúde, e o painel mostra os destinos novos

#### Scenario: Senha do e-mail fora da página
- **WHEN** quem opera abre as configurações do e-mail
- **THEN** o painel mostra o servidor e o remetente e diz que a senha está configurada, sem mostrá-la

#### Scenario: Conta criada pelo painel
- **WHEN** quem opera cria uma conta de administradora na produção pelo painel
- **THEN** a conta é criada como pelo comando, e a senha temporária aparece uma vez, com o aviso de entregá-la à pessoa
