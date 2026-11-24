## ADDED Requirements

### Requirement: Aba instalada no Windows

A aba SHALL ser um programa do Windows 10 e 11 de 64 bits, instalado por máquina pelo MSI. O MSI SHALL:
- receber pelas propriedades, que o Intune passa:
  - `GRAFITE_SERVIDOR`, o endereço do servidor;
  - `GRAFITE_CHAVE`, a chave da aba da organização;
  - `GRAFITE_ENTRADA`, a entrada sugerida para o computador (`windows` ou `senha`);
- guardar a chave sem ela ir ao log da instalação;
- instalar o serviço da aba, que roda como o sistema e guarda o que é do aparelho;
- instalar o WebView2 que faltar;
- pôr a aba para abrir quando a pessoa entra no Windows.

A instalação sem o endereço ou sem a chave SHALL terminar com a aba instalada e sem conexão, com o motivo "A aba não foi configurada. Fale com a TI.". O endereço SHALL ser `https://`, fora do `http://` de `localhost`, `127.0.0.1` e `::1`, que fica para o desenvolvimento. O certificado do servidor SHALL ser conferido pelo repositório de certificados do Windows, que tem a autoridade interna da empresa. A aba e o serviço SHALL falar direto com o servidor, ou pelo proxy manual do Windows, com as exceções dele; o PAC e o proxy com autenticação ficam fora.

A aba SHALL rodar uma instância por pessoa no Windows. Abrir a aba de novo SHALL só trazer a que já roda. Ela SHALL NOT aparecer na barra de tarefas nem no Alt+Tab. A pessoa SHALL NOT esconder nem mover a aba: o lugar é o da TI, e só a apresentação a encolhe.

O serviço e a aba SHALL gravar um log para a TI, com os contatos, as recusas e os erros, sem a chave, os tokens, as senhas e as mensagens:
- o do serviço, em `%ProgramData%\Grafite\Aba\logs`, numa pasta que só o sistema e os administradores do computador escrevem;
- o da aba, no `%LOCALAPPDATA%\Grafite\Aba\logs` da pessoa.

#### Scenario: Instalada pelo Intune
- **WHEN** o Intune instala o MSI no PC-FIN-09 com o endereço `https://grafite.empresa.local` e a chave da organização
- **THEN** na próxima entrada de Fernanda no Windows a aba aparece no alto da tela, sem ícone na barra de tarefas

#### Scenario: Sem a chave
- **WHEN** alguém instala o MSI à mão, sem a propriedade `GRAFITE_CHAVE`
- **THEN** a aba abre sem conexão e, aberta, diz "A aba não foi configurada. Fale com a TI."

#### Scenario: Aberta duas vezes
- **WHEN** Fernanda abre a aba pelo menu Iniciar com ela já rodando
- **THEN** nenhuma segunda aba aparece, e a que roda abre o painel

### Requirement: Aparelho registrado pela chave

Cada organização SHALL ter no máximo uma chave da aba que vale. A chave SHALL ser aleatória, com pelo menos 32 bytes. Ela SHALL aparecer uma vez só, quando o comando a cria ou troca, e o banco SHALL guardar só o hash dela.

O serviço da aba SHALL registrar o aparelho com a chave, sempre que encontra uma chave no registro do Windows e ainda não tem o token do aparelho, ou quando o token é recusado. Ele manda:
- o identificador da máquina;
- o nome do computador;
- a versão da aba;
- a entrada sugerida pelo MSI.

A API SHALL responder com o token do aparelho, aleatório e com pelo menos 32 bytes. O serviço o guarda cifrado, num lugar que só o sistema e os administradores do computador leem, e apaga a chave do registro. Os contatos seguintes SHALL usar o token do aparelho. Cada contato SHALL atualizar o último contato, o nome do computador e a versão.

A entrada do aparelho SHALL ser do servidor:
- no primeiro registro, a sugerida pelo MSI, ou a pelo Windows sem sugestão;
- depois, a que o comando escolher para o aparelho.

As duas entradas:
- **pelo Windows:** a aba entra sozinha com o usuário que está no Windows;
- **pela senha:** a aba pede o usuário e a senha do AD, para o computador de perfil genérico, que várias pessoas usam com o mesmo usuário do Windows.

O aparelho com a entrada pela senha SHALL recusar a pessoa pedida pelo SID, e o com a entrada pelo Windows, a pedida pela senha.

O aparelho SHALL ser identificado pelo identificador da máquina, na organização. Registrar de novo a mesma máquina SHALL trocar o token dela, e o anterior SHALL parar de valer, com a entrada e o bloqueio mantidos.

As recusas:
- a chave que não vale SHALL ser recusada com "Chave da aba recusada.", com o limite de requisições do endereço;
- trocar a chave SHALL fazer a anterior parar de valer para os registros. Os aparelhos já registrados SHALL seguir com o token deles;
- o token do aparelho que não vale, como depois de restaurar um backup do servidor, SHALL deixar a aba sem conexão com "Este computador precisa ser registrado de novo. Fale com a TI.", até a TI repor a chave no registro;
- o aparelho bloqueado SHALL ser recusado em todo contato, também no registro, com "Este computador foi bloqueado na aba. Fale com a TI.", e as sessões da aba e as do chat na aba dele SHALL terminar.

#### Scenario: Primeiro contato
- **WHEN** o serviço da aba do PC-FIN-09 faz o primeiro contato com a chave certa
- **THEN** o aparelho "PC-FIN-09" passa a existir na organização, com a entrada pelo Windows, o último contato e a versão, e a chave sai do registro do computador

#### Scenario: Chave trocada
- **WHEN** quem opera o servidor troca a chave da aba, com o PC-FIN-09 já registrado
- **THEN** o PC-FIN-09 segue conectado, e um computador novo com a chave anterior é recusado com "Chave da aba recusada."

#### Scenario: Aparelho bloqueado
- **WHEN** quem opera o servidor bloqueia o PC-FIN-09, com a aba de Fernanda aberta nele
- **THEN** em até 30 s a aba fica sem conexão, com "Este computador foi bloqueado na aba. Fale com a TI."

#### Scenario: Token perdido
- **WHEN** o servidor volta de um backup anterior ao registro do PC-FIN-09
- **THEN** a aba fica sem conexão com "Este computador precisa ser registrado de novo. Fale com a TI.", e conecta de novo quando a TI repõe a chave no registro pelo Intune

### Requirement: Pessoa pelo usuário do Windows

No aparelho com a entrada pelo Windows, o serviço da aba SHALL saber quem é a pessoa pelo próprio Windows, e não pelo que a tela da aba diz: ele lê o usuário que está do outro lado da conexão local com a aba. Ele manda à API, com o token do aparelho, o SID e o nome do usuário, que fica só na auditoria.

A API SHALL buscar a pessoa no AD com a conta de serviço, pelo SID, dentro da base e do filtro das pessoas do diretório. Do que achar, SHALL ler o atributo do usuário do diretório e fazer dele o usuário da conta, como na entrada pelo diretório. Valem as regras da entrada pelo diretório:
- ser de um grupo mapeado;
- a conta desativada no AD é recusada;
- a primeira vez cria a pessoa e a conta do diretório;
- cada vez atualiza o nome, o e-mail e os grupos mapeados.

A pessoa SHALL ficar sem conexão, com o motivo e sem conta criada, quando:
- o SID não está no diretório, como o usuário local do Windows: "Entre no Windows com o seu usuário da empresa para usar a aba.";
- o usuário do AD não serve de usuário do Grafite: a mesma frase;
- o usuário é de uma conta local do Grafite: "A conta deste usuário é local do Grafite e não entra pela aba.";
- a conta ou a pessoa está inativa no Grafite: "Sua conta está inativa no Grafite. Fale com a TI.";
- o usuário não está em nenhum grupo mapeado: a mesma frase da entrada pelo diretório;
- o diretório está desligado, ou o AD não responde: "A TI não está ao alcance agora." Nesse caso, a aba tenta de novo sozinha, como na rede caída.

Nas outras recusas a pessoa não tem o que fazer na aba. A aba SHALL tentar de novo a cada 10 minutos, e a recusa pelo mesmo motivo SHALL NOT repetir a auditoria. Assim, a TI reativa a conta ou mapeia o grupo, e a aba volta sem a pessoa sair do Windows.

#### Scenario: Fernanda na aba pela primeira vez
- **WHEN** Fernanda, do grupo Colaboradores-Financeiro no AD, entra no Windows do PC-FIN-09 pela primeira vez com a aba instalada
- **THEN** a conta dela no Grafite é criada pelo diretório, e a aba mostra as não lidas e as respostas dela

#### Scenario: Usuário local do Windows
- **WHEN** alguém entra no PC-FIN-09 com o usuário local "suporte"
- **THEN** a aba fica sem conexão com "Entre no Windows com o seu usuário da empresa para usar a aba.", e nenhuma conta é criada

#### Scenario: Conta local com o mesmo usuário
- **WHEN** o usuário do AD de quem está no Windows é "admin", e "admin" é uma conta local do Grafite
- **THEN** a aba fica sem conexão com "A conta deste usuário é local do Grafite e não entra pela aba.", e a conta local não muda

### Requirement: Pessoa pela senha do AD

No aparelho com a entrada pela senha, a aba SHALL pedir o usuário e a senha do AD, que vão ao serviço e dele à API, com o token do aparelho. A API SHALL conferir pela mesma conferência da entrada pelo diretório, com as mesmas recusas e o bloqueio por tentativas. A conta local do Grafite SHALL NOT entrar pela aba.

O código do app:
- a conta que tem os dois passos cadastrados recebe a resposta de que falta o código, e a aba o pede. A segunda chamada leva o código, que conta nas tentativas do código, como na entrada;
- a conta que exige os dois passos e ainda não os cadastrou SHALL ser recusada com "Cadastre o código do app pelo navegador antes de usar a aba.".

A aba SHALL mostrar quem está nela, com "Sair". A sessão SHALL terminar no servidor, com a do chat na aba:
- com o "Sair";
- quando a pessoa sai do Windows ou o bloqueia;
- depois de 30 minutos sem uso, contados no servidor pelo último uso. O uso é a aba ou a tela maior com o foco.

Ao terminar, e também ao abrir, a aba SHALL apagar o que guardou da pessoa, também os dados do chat, e voltar a pedir o usuário. O token da sessão SHALL ficar só na memória da aba, e nunca no disco do perfil genérico.

A senha SHALL NOT ser guardada nem gravada no log. A renovação SHALL ir pelo token da sessão, sem a senha.

#### Scenario: Perfil genérico
- **WHEN** Carla entra no computador da linha de produção, de perfil genérico, e a aba pede o usuário
- **THEN** ela entra com o usuário e a senha do AD, e a aba mostra "Carla Dias" com "Sair"

#### Scenario: Troca de pessoa
- **WHEN** Carla escolhe "Sair", e Paulo entra na aba no mesmo computador
- **THEN** a aba e o chat dela mostram as conversas de Paulo, e nada de Carla fica no computador

### Requirement: Sessão da aba

A pessoa achada SHALL receber a sessão da aba, uma por conta e aparelho. A sessão SHALL ter:
- o token aleatório, com pelo menos 32 bytes, que o banco guarda só como hash e que a aba guarda cifrado só para aquela pessoa do Windows;
- a conta e o aparelho;
- quando começou e o último uso;
- a validade de 1 hora, renovada pelo serviço sem a pessoa ver.

A renovação SHALL manter a mesma sessão, com a validade estendida, e SHALL conferir de novo a pessoa no AD pela conta de serviço e no Grafite, e o aparelho. A auditoria SHALL registrar a abertura da sessão, e não cada renovação.

No aparelho com a entrada pelo Windows, a sessão de uma sexta conta diferente em 24 horas SHALL ser recusada com "Este computador abriu a aba para muitas pessoas hoje. Fale com a TI.", com a auditoria. O comando pode mudar o teto de um aparelho, como o da sala de treinamento ou o servidor de área de trabalho remota. A entrada pela senha não tem esse teto.

O token da aba SHALL valer só nas rotas da aba. As outras rotas da API SHALL recusá-lo como sem sessão. O cookie da web SHALL NOT valer nas rotas da aba.

A sessão da aba e a do chat na aba SHALL terminar:
- pelas mesmas mudanças da conta que encerram todas as sessões dela;
- quando o aparelho é bloqueado;
- quando a renovação não acha mais a pessoa, como fora do grupo mapeado.

Encerrar a sessão da aba pela lista das sessões, no aparelho com a entrada pelo Windows, SHALL valer só até a aba abrir outra. A lista SHALL dizer isso, e que quem para o computador é o bloqueio.

#### Scenario: Token da aba fora da aba
- **WHEN** alguém chama a lista dos ativos com o token da sessão da aba de Fernanda
- **THEN** a API recusa como sem sessão

#### Scenario: Conta inativada
- **WHEN** a conta de Fernanda é inativada com a aba aberta
- **THEN** em até 30 s a aba fica sem conexão, e o token dela deixa de valer

#### Scenario: Desativada no AD
- **WHEN** a conta de Fernanda é desativada no AD
- **THEN** na renovação seguinte, em até 1 hora, a aba fica sem conexão

### Requirement: Estado da aba

A aba SHALL ler o estado dela numa rota só, com:
- as não lidas do chat da pessoa;
- as respostas novas dos chamados dela, com quantas;
- as respostas por ver, com quantas e com a última: quem respondeu, o número e o título do chamado e a hora;
- a versão da configuração da aba.

A aba SHALL se atualizar pelos eventos do servidor, pelo token da aba, quando:
- chega uma mensagem do chat ou uma resposta no chamado;
- a pessoa lê uma conversa ou vê uma resposta em outro lugar;
- a configuração muda;
- a sessão ou o aparelho termina.

Nos eventos que vão a muitas abas de uma vez, como a configuração e a mensagem num canal, a releitura SHALL esperar um atraso sorteado de até 3 s. Na resposta a uma pessoa, a releitura é na hora. A conexão dos eventos SHALL ter o sinal de vida a cada 10 s, e a aba SHALL ficar sem conexão quando ele falta por 30 s. Com a conexão caída, a aba SHALL ler o estado a cada 60 s até ela voltar. O limite de requisições das rotas da aba SHALL ser por token, e não pelo endereço IP.

#### Scenario: Resposta chega
- **WHEN** Ana Souza responde no #1041, de Fernanda, às 09:21
- **THEN** em até 5 s a aba de Fernanda mostra "1 resposta nova · Ana Souza"

#### Scenario: Vista no celular
- **WHEN** Fernanda abre o #1041 no chat do celular
- **THEN** a aba volta ao repouso, e o "1 nova" de "Visualizar chamados" fica até ela responder ou marcar como vista

### Requirement: Configuração da aba

Cada organização SHALL ter a configuração da aba, com:
- a forma: a pílula, de fábrica, ou o entalhe;
- o contato de reserva, de até 80 caracteres, como "Ramal 2000, das 8h às 18h";
- a versão, que sobe a cada mudança.

A configuração SHALL vir pelo token do aparelho, e não pela sessão da pessoa: ela vale também para quem ainda não entrou ou foi recusado. O serviço SHALL guardar a última cópia para todas as pessoas do computador e lê-la de novo quando a versão muda. Sem nenhuma sessão aberta no computador, o serviço SHALL conferir a configuração e a entrada do aparelho a cada 60 s. A aba SHALL aplicar a configuração nova sem reiniciar.

#### Scenario: Contato mudou
- **WHEN** a TI muda o contato para "Ramal 2010, das 7h às 19h"
- **THEN** a aba de Fernanda passa à versão nova em até 30 s e mostra o contato novo quando fica sem conexão

#### Scenario: Usuário local vê o ramal
- **WHEN** alguém com o usuário local do Windows abre a aba
- **THEN** a aba mostra o motivo e "Ramal 2000, das 8h às 18h"

### Requirement: Aba fechada

A aba fechada SHALL ficar no alto e no meio da tela principal, por cima das janelas, na forma da configuração:
- a pílula, de fábrica, com 162×34 px e o rótulo "Suporte da TI";
- o entalhe, preso à borda de cima, com 184×32 px, que cresce para 36 px com o mouse em cima.

A aba fechada SHALL NOT mostrar o logo. Ela SHALL ter os estados repouso, mouse em cima, pressionada e foco, este com o anel do token. Fora da forma, o clique e a rolagem SHALL passar para a janela de baixo.

Numa tela de 1366 px de largura ou menos, a pílula SHALL ter 160×32 px. A aba SHALL acompanhar a escala do Windows e a troca da tela principal.

#### Scenario: Clique ao lado da aba
- **WHEN** Fernanda clica na planilha 4 px à esquerda da pílula
- **THEN** o clique chega à planilha, e a aba não abre

#### Scenario: Entalhe configurado
- **WHEN** a configuração da organização passa para o entalhe
- **THEN** a aba fechada vira o entalhe preso à borda de cima, sem reiniciar

### Requirement: Aba aberta

Clicar na aba SHALL abrir o painel 2+1 (293 px de largura), com o logo do Grafite no alto e:
- "Abrir chamado", larga e clara, em cima;
- "Abrir chat", com as não lidas, como "4 não lidas";
- "Visualizar chamados", com as respostas novas, como "1 nova".

No aparelho com a entrada pela senha, o painel SHALL mostrar também quem está na aba, com "Sair". O painel SHALL fechar com o Esc, com o clique fora dele, na própria aba, ou quando outra janela ganha o foco. Numa tela de 1366 px de largura ou menos, o painel SHALL ter 225 px de largura.

#### Scenario: Painel aberto
- **WHEN** Fernanda, com 4 não lidas e 1 resposta nova, clica na aba
- **THEN** o painel abre com o logo, "Abrir chamado", "Abrir chat · 4 não lidas" e "Visualizar chamados · 1 nova"

### Requirement: Aviso da resposta nova

Com uma resposta por ver da TI num chamado da pessoa, a aba fechada SHALL alargar e dizer o aviso em texto, com o ponto ao lado. O aviso SHALL contar os chamados com resposta por ver, e não as mensagens, como "Visualizar chamados" conta:
- com um, "1 resposta nova · Ana Souza", com o nome de quem respondeu por último, cortado com reticências em até 280 px de aviso, também quando Ana escreveu duas mensagens seguidas;
- com mais, "3 respostas novas".

O ponto SHALL pulsar por 1.400 ms quando a resposta chega, e depois ficar parado.

Aberta, a linha da resposta SHALL ficar no alto do painel, com o número, o título e a hora. O painel com a linha SHALL ter 372 px de largura, ou 300 px numa tela de 1366 px de largura ou menos, e SHALL manter essa largura até fechar. Escolher a linha SHALL abrir aquele chamado no chat da aba.

A resposta SHALL deixar de estar por ver quando a pessoa abre a conversa daquele chamado, no chat da aba, da web ou do celular. Isso tira o aviso da aba fechada e a linha do painel. O "1 nova" de "Visualizar chamados" SHALL ficar até a pessoa responder ou marcar como vista, e as não lidas de "Abrir chat" SHALL seguir as do chat. O aviso SHALL NOT depender só da cor.

#### Scenario: Linha da resposta
- **WHEN** Fernanda abre a aba com a resposta da Ana no #1041 e escolhe a linha da resposta
- **THEN** o #1041 abre no chat da aba, e a aba fechada volta ao repouso

### Requirement: Movimento da aba

O movimento da aba SHALL seguir os tempos, que são tokens:
- abrir: 220 ms, com a cascata das opções até 340 ms, que é a exceção nomeada da aba aos 300 ms;
- fechar: 160 ms;
- o mouse em cima do entalhe: 120 ms;
- o ponto do aviso: 1.400 ms.

Com o reduzir movimento do Windows, SHALL valer 1 ms, e o ponto SHALL NOT pulsar.

#### Scenario: Reduzir movimento
- **WHEN** o Windows de Fernanda tem as animações desligadas e chega uma resposta
- **THEN** a aba muda para o aviso sem crescer aos poucos, e o ponto fica parado

### Requirement: Aba pelo teclado

O atalho Ctrl+Alt+T SHALL abrir o painel de qualquer programa, com o foco em "Abrir chamado". As setas SHALL andar pela grade, e o Enter SHALL escolher. O Esc SHALL fechar o painel e devolver o foco à janela que estava na frente antes do atalho. Na tela maior, o Esc SHALL voltar ao painel.

Se outro programa já usa o atalho, a aba SHALL seguir sem ele, e o painel SHALL dizer "O atalho Ctrl+Alt+T está com outro programa.".

#### Scenario: Pelo teclado
- **WHEN** Fernanda, na planilha, aperta Ctrl+Alt+T, seta para baixo e Enter
- **THEN** o painel abre com o foco em "Abrir chamado", o foco vai para "Abrir chat", e o chat abre na tela maior

### Requirement: Temas do Windows

A aba SHALL seguir o tema do Windows: o escuro, o claro e o de alto contraste, e SHALL mudar quando ele muda, sem reiniciar. No alto contraste, ela SHALL usar só as cores do sistema. Cada par de texto e fundo da aba SHALL passar o contraste do WCAG AA nos três temas, e o foco SHALL ficar visível sobre o fundo claro e o escuro.

#### Scenario: Alto contraste
- **WHEN** Fernanda liga o alto contraste do Windows com a aba aberta
- **THEN** a aba passa às cores do sistema, sem reiniciar

### Requirement: Aba sem conexão

Sem a API, a aba SHALL ficar no tom neutro, sem vermelho, amarelo ou pulso, com "Sem conexão" escrito. Aberta, no painel de 372 px de largura, ou 300 px numa tela de 1366 px de largura ou menos, ela SHALL mostrar:
- o motivo, que na rede caída é "Sem conexão com o Grafite.";
- o contato de reserva da configuração, como "Ramal 2000, das 8h às 18h";
- "Abrir chat", a linha da resposta e o chat da tela maior indisponíveis, com o motivo.

A configuração SHALL vir da última cópia guardada no computador. A aba sem cópia nenhuma SHALL usar a de fábrica, sem o contato. A aba SHALL tentar de novo sozinha, e a volta da conexão SHALL voltar a aba ao estado dela, sem a pessoa fazer nada.

#### Scenario: Rede caída
- **WHEN** a rede do PC-FIN-09 cai
- **THEN** em até 30 s a aba fica cinza com "Sem conexão", e aberta mostra "Ramal 2000, das 8h às 18h"

#### Scenario: Rede de volta
- **WHEN** a rede volta
- **THEN** em até 30 s a aba volta ao azul, com as não lidas e as respostas

### Requirement: Aba durante uma apresentação

Com um programa em tela cheia, ou com o Windows no modo de apresentação, a aba SHALL encolher para a linha de 96×4 px. Ela SHALL NOT abrir pelo clique nem avisar, e o clique na linha SHALL passar para a janela de baixo. O atalho SHALL seguir abrindo o painel.

Ao sair desse modo, com respostas que chegaram durante ele, a aba SHALL dizer por 1 minuto "1 resposta nova · chegou às 09:21", ou "3 respostas novas · a última às 09:30", e depois o aviso de sempre.

#### Scenario: Apresentação
- **WHEN** Fernanda apresenta em tela cheia e a resposta da Ana chega às 09:21
- **THEN** a aba segue como a linha de 96×4, sem aviso

#### Scenario: Depois da apresentação
- **WHEN** a apresentação acaba às 09:34
- **THEN** a aba diz "1 resposta nova · chegou às 09:21" até as 09:35, e depois "1 resposta nova · Ana Souza"

### Requirement: Tela maior da aba

"Abrir chat", "Abrir chamado" e "Visualizar chamados" SHALL abrir a tela maior da aba, embaixo dela, com:
- a trilha, como "Aba › Abrir chat";
- o "Esc volta".

Nesta versão, a tela maior de "Abrir chamado" e a de "Visualizar chamados" SHALL dizer que a abertura ou a lista dos chamados pela aba chega numa versão seguinte, com "Abrir no chat", que leva ao chat da tela maior.

#### Scenario: Abrir chamado nesta versão
- **WHEN** Fernanda escolhe "Abrir chamado"
- **THEN** a tela maior abre com a trilha "Aba › Abrir chamado", a frase e "Abrir no chat"

### Requirement: Chat dentro da aba

"Abrir chat" SHALL abrir o chat do Grafite na tela maior da aba, com as conversas, os chamados e as mensagens do app do chat, sem abrir o navegador. A linha da resposta SHALL abrir ali o chamado dela.

O chat da aba SHALL entrar pela sessão da aba. A aba pede à API um bilhete de uso único, que vale por 60 s e tem como destino o chat ou um chamado pelo número. O chat da aba troca o bilhete por uma sessão do chat na aba, só daquela pessoa e daquele aparelho, ligada à sessão da aba. Ela SHALL terminar junto com a sessão da aba.

A sessão do chat na aba SHALL valer só no alcance da aba, uma lista escolhida e fixada num teste:
- as rotas do chat;
- a leitura da sessão, das preferências, dos padrões e dos módulos;
- a foto, só para ver;
- os eventos, só os tipos que o chat usa.

Ficam fora de propósito:
- as rotas da conta, como os dois passos, as sessões e os aparelhos;
- as do módulo Chamados, e com elas o "Andamento" do chat, que a aba não mostra;
- tudo o que é da casca.

Fora do alcance, a API SHALL recusar com "Fora do que o chat da aba pode fazer.", com um código próprio, e não como sem sessão.

O bilhete:
- vale uma vez só;
- o usado, o vencido e o desconhecido SHALL ter a mesma resposta, e o chat da aba pede outro uma vez antes de mostrar o erro;
- no aparelho com a entrada pelo Windows, a conta que exige os dois passos, ou que os tem cadastrados, SHALL NOT receber o bilhete. O chat da aba mostra a entrada do chat, com o usuário, a senha e o código, e a sessão que sai dela também fica no alcance da aba, ligada à sessão da aba.

No chat da aba:
- a tela maior SHALL ficar só no app do chat, e o link para fora dele SHALL abrir no navegador padrão;
- o Esc que o chat não usa, como para fechar um menu ou um diálogo, SHALL fechar a tela maior;
- a sessão do chat que vence no meio do uso SHALL ser trocada por outra pelo bilhete, sem a pessoa fazer nada;
- fechar a tela maior SHALL fechar o chat, que abre de novo na próxima vez;
- o que leva à casca, como "Abrir no Chamados", SHALL NOT aparecer;
- a instalação do app e o push SHALL NOT aparecer.

#### Scenario: Chat aberto
- **WHEN** Fernanda escolhe "Abrir chat"
- **THEN** a tela maior abre o chat dela, com "Aba › Abrir chat", sem pedir a senha

#### Scenario: Sessão do chat fora do chat
- **WHEN** alguém chama a lista dos ativos com a sessão do chat na aba de Fernanda
- **THEN** a API recusa com "Fora do que o chat da aba pode fazer.", e o chat da aba segue aberto

#### Scenario: Conta com os dois passos
- **WHEN** Bruno, da TI, com os dois passos, escolhe "Abrir chat" no computador dele
- **THEN** a tela maior mostra a entrada do chat, que pede a senha e o código, e a sessão que sai dela não abre a casca

### Requirement: Comando da aba no servidor

O comando no servidor SHALL ter o `aba`, para quem opera o servidor:
- `aba chave criar` e `aba chave trocar`: mostram a chave uma vez, com o exemplo das propriedades do MSI;
- `aba configurar`, com a forma e o contato;
- `aba aparelhos`: lista os aparelhos, com o identificador curto, o nome, a entrada, o último contato, a versão e a situação, e marca os registrados nas últimas 24 horas;
- `aba entrada`, com `windows` ou `senha`, de um aparelho;
- `aba teto`, com o número de contas por dia de um aparelho;
- `aba bloquear` e `aba desbloquear` de um aparelho.

O aparelho SHALL ser escolhido pelo nome ou pelo identificador curto. Com o nome repetido, como o computador reinstalado, o comando SHALL recusar e listar os identificadores. `aba chave criar` SHALL recusar quando a organização já tem chave, e mandar usar o `trocar`.

#### Scenario: Chave criada
- **WHEN** quem opera o servidor roda `grafite aba chave criar --endereco grafite.empresa.local`
- **THEN** a saída mostra a chave uma vez e o exemplo das propriedades do MSI para o Intune

#### Scenario: Computador de perfil genérico
- **WHEN** quem opera o servidor roda `grafite aba entrada PC-PROD-03 senha`
- **THEN** a aba do PC-PROD-03 passa a pedir o usuário e a senha do AD em até 30 s

### Requirement: Auditoria e eventos da aba

A auditoria SHALL registrar, sem a chave, os tokens e as senhas:
- a criação e a troca da chave, a configuração, a entrada e o bloqueio e o desbloqueio de um aparelho, feitos pelo comando no servidor;
- o registro de um aparelho;
- a chave e o token do aparelho recusados;
- a pessoa recusada, com o motivo e o aparelho;
- a sessão da aba aberta, com a entrada;
- a sessão do chat na aba aberta pelo bilhete.

Os eventos:
- o da configuração e o da entrada SHALL ir às abas do aparelho e da organização;
- o do bloqueio SHALL ir às abas do aparelho;
- o fim da sessão SHALL ir à aba e ao chat da aba daquela sessão.

#### Scenario: Sessão pelo bilhete na auditoria
- **WHEN** Fernanda abre o chat pela aba
- **THEN** a auditoria registra a sessão do chat na aba aberta pelo bilhete, com a conta e o aparelho "PC-FIN-09"
