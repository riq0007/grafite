## Purpose

Deixar as pessoas da organização conversarem entre si e com a TI, nas conversas diretas, nas equipes e nos canais, e acompanhar os próprios chamados como conversas, no computador, no celular e na casca.

## ADDED Requirements

### Requirement: Quem usa o chat

O chat SHALL ser de quem tem uma conta ativa com `chat.usar`, com o módulo Chat ligado (spec modulos-da-organizacao). Só essas contas SHALL participar das conversas, aparecer na escolha de uma conversa direta e receber as mensagens.

Cada conta SHALL aparecer no chat com o nome da pessoa dela e a foto, ou as iniciais sem a foto (spec administracao-de-pessoas, "Foto da pessoa"). A conta que tem `chamados.atender` em algum local SHALL levar "(TI)" depois do nome, para a pessoa saber que fala com a TI.

A conta que deixa de usar o chat, porque foi desativada, perdeu `chat.usar` ou saiu do grupo da equipe, SHALL sair das conversas na hora: deixa de receber as mensagens e de lê-las. As mensagens que ela escreveu SHALL ficar, com o nome dela. A pessoa anonimizada SHALL aparecer como "Pessoa anonimizada", com o código, e o texto das mensagens SHALL ficar como foi escrito.

#### Scenario: Conta da TI no chat
- **WHEN** Fernanda Rocha abre a conversa direta com Ana Souza, que atende os chamados
- **THEN** a conversa se chama "Ana Souza (TI)"

#### Scenario: Conta desativada
- **WHEN** a conta de Paulo Nunes é desativada
- **THEN** Paulo deixa de receber as mensagens, e as que ele escreveu continuam na Equipe Financeiro, com o nome dele

### Requirement: Conversas

Uma conversa SHALL ser de um destes tipos:
- **a conversa direta,** entre duas contas (requisito "Conversa direta");
- **a equipe,** com as contas de um grupo do Grafite (requisito "Equipes e canais");
- **o canal,** com todas as contas que usam o chat na organização (requisito "Equipes e canais");
- **a conversa do chamado,** com a pessoa do chamado e a TI (spec chamados, "Conversa do chamado" e "Leitura do chamado pela pessoa").

Participam da equipe as contas que usam o chat e são do grupo dela agora. Quem entra no grupo SHALL passar a participar e ler a conversa desde o começo. Quem sai do grupo SHALL deixar de participar. Com o grupo inativo, a equipe SHALL ficar sem ninguém até o grupo ser reativado.

A API SHALL responder como inexistente a conversa de que a conta não participa. Uma conversa SHALL NOT ser apagada, nem pela API nem pelo banco com o papel da aplicação. A equipe e o canal se arquivam.

#### Scenario: Entra no grupo
- **WHEN** Tatiana Ramos entra no grupo Financeiro, que é o da Equipe Financeiro
- **THEN** ela passa a participar da Equipe Financeiro e lê as mensagens desde a primeira

#### Scenario: Conversa de outros
- **WHEN** Paulo Nunes pede pela API a conversa direta entre Fernanda Rocha e Ana Souza
- **THEN** a API responde que a conversa não existe

### Requirement: Conversa direta

A conta SHALL começar uma conversa direta escolhendo uma pessoa entre as contas que usam o chat, pelas palavras do nome, sem diferenciar os acentos e as maiúsculas, até 20, pela ordem do nome. A própria conta SHALL NOT aparecer na escolha.

As mesmas duas contas SHALL ter no máximo uma conversa direta. A conversa SHALL nascer com a primeira mensagem: escolher a pessoa sem escrever nada SHALL NOT gravar a conversa.

Para cada uma das duas contas, a conversa SHALL se chamar pelo nome da outra. Quando a outra deixa de usar o chat, a conversa SHALL ficar na lista só para ler, com "Paulo Nunes não usa mais o chat." no lugar do campo de escrever, e a mensagem SHALL ser recusada com a mesma frase.

#### Scenario: Primeira mensagem
- **WHEN** Fernanda Rocha escolhe Paulo Nunes e manda "Você já falou com a TI?"
- **THEN** a conversa direta entre os dois nasce com a mensagem, e escolher Paulo de novo abre a mesma conversa

#### Scenario: Escolher sem escrever
- **WHEN** Fernanda Rocha escolhe Paulo Nunes e sai sem escrever
- **THEN** nenhuma conversa é gravada, e a lista de Paulo não muda

### Requirement: Equipes e canais

Quem tem `chat.configurar` SHALL cadastrar as equipes e os canais, até 100 ativos na organização. Cada um SHALL ter:
- **o nome,** de 1 a 60 caracteres, único na organização entre os ativos;
- **o tipo,** que não muda depois:
  - **Equipe,** com o grupo do Grafite cujas contas participam;
  - **Canal,** de que participam todas as contas que usam o chat;
- **quem escreve:** "Todos que participam" ou um grupo, cujas contas que participam são as únicas que escrevem, como "Só a TI escreve" num canal de avisos;
- **"Avisar a cada mensagem":** ligado, cada mensagem notifica quem participa (requisito "Notificações do chat"). Começa desligado.

A equipe e o canal SHALL poder ser arquivados e reativados. O arquivado SHALL sair da lista de quem participa e SHALL NOT receber mensagens, e a conversa SHALL ficar guardada. Reativado, ele SHALL voltar com a conversa. Reativar SHALL conferir o nome e o teto como o cadastro, e o teto SHALL contar só as equipes e os canais ativos.

As recusas SHALL ser:
- "Escreva o nome.", "Use até 60 caracteres." e "Já existe uma equipe ou um canal com esse nome.", no nome;
- "Escolha o grupo da equipe.", na equipe sem grupo;
- "Escolha o grupo que escreve.", em quem escreve;
- "A organização já tem 100 equipes e canais.".

#### Scenario: Equipe pelo grupo do AD
- **WHEN** quem configura cria a Equipe Financeiro com o grupo Financeiro, ligado ao grupo do AD "Financeiro"
- **THEN** quem é do grupo e usa o chat participa da equipe, e a lista de cada um mostra "Equipe Financeiro" em EQUIPES E CANAIS

#### Scenario: Canal de avisos
- **WHEN** quem configura cria o canal "Avisos da TI", em que só o grupo TI escreve, com "Avisar a cada mensagem"
- **THEN** todos que usam o chat participam do canal, e só as contas do grupo TI escrevem nele

#### Scenario: Equipe arquivada
- **WHEN** quem configura arquiva a Equipe Financeiro
- **THEN** ela sai da lista de quem participa, a mensagem nela é recusada com "A equipe Equipe Financeiro está arquivada.", e reativá-la a traz de volta com a conversa

#### Scenario: Reativar com o nome em uso
- **WHEN** quem configura reativa o canal arquivado "Avisos", e outro canal ativo já se chama "Avisos"
- **THEN** a reativação é recusada com "Já existe uma equipe ou um canal com esse nome.", e o canal segue arquivado

### Requirement: Mensagem

A mensagem SHALL ter o texto, de 1 a 4.000 caracteres, sem os espaços das pontas, contados em caracteres, ou só os anexos, e até 5 anexos (spec arquivos-e-imagens, "Anexos do chat"). Cada mensagem SHALL guardar quem escreveu e quando, na hora do servidor, e SHALL NOT ser editada nem apagada.

O começo da mensagem só com os anexos, na resposta, nas notificações e nas listas, SHALL ser o nome do anexo, como "folha-manchada.jpg", e, com mais de um, o do primeiro com quantos vêm depois, como "folha-manchada.jpg e mais 2 arquivos".

A mensagem SHALL poder responder a outra da mesma conversa. A resposta SHALL mostrar, em cima, quem escreveu a respondida e o começo dela, e levar a ela.

As recusas SHALL ser:
- "Escreva a mensagem.", na mensagem sem o texto e sem anexo, "Use até 4.000 caracteres." e "Anexe até 5 arquivos.", além das recusas dos anexos;
- "A mensagem respondida não está nesta conversa.";
- "Só <grupo> escreve neste canal.", como "Só TI escreve neste canal.", na conta que não escreve no canal, e "Só <grupo> escreve nesta equipe.", na equipe;
- "A equipe <nome> está arquivada." e "O canal <nome> está arquivado.".

#### Scenario: Resposta a uma mensagem
- **WHEN** Tatiana Ramos responde à mensagem das 10:19 de Paulo Nunes com "Aqui também manchou"
- **THEN** a resposta entra na conversa com "Paulo Nunes" e o começo da mensagem dele em cima, e escolher a citação leva à mensagem das 10:19

#### Scenario: Quem não escreve no canal
- **WHEN** Fernanda Rocha tenta mandar uma mensagem no canal "Avisos da TI", em que só o grupo TI escreve
- **THEN** a mensagem é recusada com "Só TI escreve neste canal.", e nada é gravado

#### Scenario: Só a foto
- **WHEN** Paulo Nunes manda a Fernanda Rocha só a foto "folha-manchada.jpg", sem texto
- **THEN** a mensagem entra na conversa com a foto, e Fernanda recebe "Mensagem de Paulo Nunes", com "folha-manchada.jpg"

#### Scenario: Mensagem vazia
- **WHEN** Fernanda Rocha manda pela API uma mensagem só com espaços e sem anexo
- **THEN** a mensagem é recusada com "Escreva a mensagem.", e nada é gravado

### Requirement: Reações

Quem participa SHALL reagir às mensagens das conversas diretas, das equipes e dos canais com um texto curto:
- os três de sempre: "+1", "ok" e "visto";
- ou outro, de 1 a 20 caracteres, sem os espaços das pontas.

Cada conta SHALL ter no máximo uma reação de cada texto numa mensagem: reagir de novo com o mesmo texto SHALL tirar a reação. A mensagem SHALL ter no máximo 10 textos diferentes. Cada reação SHALL mostrar o texto e quantas contas reagiram, na ordem da primeira reação de cada texto, e dizer quem reagiu.

As conversas dos chamados SHALL NOT ter reações.

As recusas SHALL ser "Escreva a reação.", "Use até 20 caracteres." e "A mensagem já tem 10 reações diferentes.".

#### Scenario: Reagir e desfazer
- **WHEN** Fernanda Rocha reage "+1" à mensagem de Paulo Nunes, que já tinha 3 "+1", e depois reage "+1" de novo
- **THEN** a reação vai a "+1 · 4" e volta a "+1 · 3"

#### Scenario: Reação escrita
- **WHEN** Tatiana Ramos reage "Também manchou" à mensagem de Paulo Nunes, e Fernanda reage o mesmo
- **THEN** a mensagem mostra "Também manchou · 2", e a dica diz "Tatiana Ramos e Fernanda Rocha"

### Requirement: Link da mensagem

Cada mensagem SHALL ter um endereço do app do chat que abre a conversa nela, com a mensagem marcada. A quem não participa da conversa, o endereço SHALL dizer "A mensagem não foi encontrada.".

#### Scenario: Link colado noutra conversa
- **WHEN** Fernanda Rocha copia o link da mensagem de Paulo Nunes e o abre
- **THEN** o app abre a Equipe Financeiro na mensagem das 10:19, marcada

### Requirement: Não lidas

Cada conta SHALL ter, em cada conversa de que participa, a última mensagem lida. Abrir a conversa numa janela à vista SHALL marcar como lidas as mensagens mostradas. As mensagens que chegam com a conversa aberta e à vista SHALL ficar lidas na hora.

As não lidas de uma conversa SHALL ser as mensagens dos outros depois da última lida. As da própria conta SHALL NOT contar.

O total do chat SHALL somar as não lidas das conversas diretas, das equipes e dos canais, fora as silenciadas (requisito "Silenciar uma conversa"). As dos chamados contam à parte, pela resposta nova (spec chamados, "Resposta nova"). Os números acima de 99 SHALL aparecer como "99+".

A leitura SHALL valer em todas as sessões da conta: ler no celular SHALL baixar o contador do computador. Ler uma conversa SHALL marcar como lidas as notificações das mensagens lidas (requisito "Notificações do chat").

#### Scenario: Contador da equipe
- **WHEN** chegam 3 mensagens na Equipe Financeiro com Fernanda Rocha noutra conversa
- **THEN** a Equipe Financeiro mostra 3, e o total do chat sobe 3

#### Scenario: Lido no celular
- **WHEN** Fernanda Rocha lê a Equipe Financeiro no celular, com o computador aberto noutra conversa
- **THEN** o contador da Equipe Financeiro some no computador, e as notificações dessas mensagens ficam lidas

### Requirement: Silenciar uma conversa

Cada conta SHALL silenciar e voltar a ouvir cada conversa direta, equipe ou canal de que participa. A conversa silenciada SHALL NOT notificar a conta, e as não lidas dela SHALL NOT entrar no total do chat. O contador da conversa SHALL continuar na lista.

#### Scenario: Equipe silenciada
- **WHEN** Fernanda Rocha silencia a Equipe Financeiro, e chega uma mensagem nela
- **THEN** Fernanda não recebe a notificação, a equipe mostra 1, e o total do chat não muda

### Requirement: Chamado citado numa mensagem

Na mensagem de uma conversa direta, de uma equipe ou de um canal, "#" seguido do número de um chamado, separado das outras palavras, SHALL citar o chamado, como "a impressora já está no #1045".

Quem vê o resumo do chamado SHALL ver a citação como o chip "#1045 · EM ANDAMENTO · Bruno Lima": o número, a situação nas palavras do colaborador (spec chamados, "Leitura do chamado pela pessoa") e quem atende, se há alguém. A quem não participa do chamado, a espera SHALL ser "Aguardando o colaborador", e não "Aguardando você": a resposta não é dela. O chip SHALL seguir o chamado: quando a situação ou quem atende muda, o chip muda.

Vê o resumo de um chamado:
- quem participa dele: a pessoa do chamado e quem o abriu pelo chat (spec chamados);
- quem vê o chamado com `chamados.ver`;
- quem participa da conversa de onde ele foi aberto (requisito "Chamados da conversa").

O chip SHALL abrir o resumo, com a situação, o título, quem atende e "Copiar link". A quem participa do chamado e a quem o vê com `chamados.ver`, o resumo SHALL mostrar também as duas últimas mensagens que a conta vê, o ativo ligado, a hora da abertura e "Abrir chamado".

Para quem não vê o resumo, e para o número que não é de um chamado, a citação SHALL ficar como o texto escrito.

#### Scenario: Chip na equipe
- **WHEN** Paulo Nunes escreve "a impressora já está no #1045" na Equipe Financeiro, de onde o #1045 foi aberto
- **THEN** quem participa da equipe vê o chip "#1045 · EM ANDAMENTO · Bruno Lima"

#### Scenario: Chip do chamado que espera a pessoa
- **WHEN** Bruno Lima pede a Fernanda Rocha o nome da pasta, e o #1045, aberto por ela na Equipe Financeiro, fica aguardando
- **THEN** Fernanda vê o chip "#1045 · AGUARDANDO VOCÊ · Bruno Lima", e Paulo Nunes, "#1045 · AGUARDANDO O COLABORADOR · Bruno Lima"

#### Scenario: Resumo de quem participa
- **WHEN** Fernanda Rocha, que abriu o #1045, escolhe o chip
- **THEN** o resumo mostra a situação, o título, as duas últimas mensagens, o ativo, a hora da abertura, "Abrir chamado" e "Copiar link"

#### Scenario: Chamado que a conta não vê
- **WHEN** Paulo Nunes escreve "#1030" na conversa direta com Tatiana Ramos, e o #1030 é de Fernanda Rocha, aberto pela TI
- **THEN** Paulo e Tatiana veem o texto "#1030", sem o chip

### Requirement: Chamados da conversa

O chamado aberto a partir de uma mensagem (spec chamados, "Abrir um chamado pelo chat") SHALL ser da conversa dessa mensagem:
- a mensagem SHALL ganhar a marca de que virou o chamado, e SHALL NOT virar outro;
- a conversa SHALL ganhar, na hora da abertura, na ordem das mensagens, o evento "Fernanda Rocha transformou esta mensagem no chamado #1045 · 10:32", que leva à mensagem de origem, com "Abrir chamado" a quem participa do chamado e a quem o vê com `chamados.ver`;
- quem participa da conversa SHALL ver o resumo do chamado (requisito "Chamado citado numa mensagem").

A equipe e o canal SHALL ter "Chamados da equipe" (no canal, "Chamados do canal"): os chamados abertos das mensagens dela, o mais novo primeiro, com o número, o título, a situação nas palavras do colaborador, com a espera como no chip (requisito "Chamado citado numa mensagem"), quem atende, quem abriu e quando.

#### Scenario: Evento na equipe
- **WHEN** Fernanda Rocha transforma a mensagem das 10:19 de Paulo Nunes no #1045
- **THEN** a Equipe Financeiro mostra a mensagem com a marca, o evento "Fernanda Rocha transformou esta mensagem no chamado #1045 · 10:32", e o #1045 em "Chamados da equipe"

#### Scenario: Mensagem que já virou chamado
- **WHEN** Tatiana Ramos tenta transformar a mesma mensagem de Paulo Nunes
- **THEN** o pedido é recusado com "Esta mensagem já virou o chamado #1045.", e nada é gravado

### Requirement: Notificações do chat

O chat SHALL notificar pela notificação da plataforma (spec notificacoes), como mensagem, na severidade Informação, com a origem "Chat" e o endereço da mensagem:
- **a mensagem direta,** à outra conta: "Mensagem de Paulo Nunes", com o começo do texto;
- **a mensagem da equipe ou do canal com "Avisar a cada mensagem",** a cada conta que participa: "Ana Souza em Avisos da TI", com o começo do texto.

O começo do texto SHALL ter até 120 caracteres, cortado no fim de uma palavra, com reticências quando foi cortado. Na mensagem só com os anexos, ele SHALL ser o nome do anexo (requisito "Mensagem").

SHALL NOT ser notificados quem escreveu, quem silenciou a conversa e a conta que já leu a mensagem quando a notificação seria gravada.

#### Scenario: Mensagem direta
- **WHEN** Paulo Nunes manda a Fernanda Rocha "Você já falou com a TI sobre a impressora?"
- **THEN** Fernanda recebe "Mensagem de Paulo Nunes", com o texto, e o endereço abre a conversa nessa mensagem

#### Scenario: Equipe sem aviso
- **WHEN** chega uma mensagem na Equipe Financeiro, com "Avisar a cada mensagem" desligado
- **THEN** ninguém recebe notificação, e a equipe mostra a não lida

### Requirement: Permissões, auditoria e eventos do chat

O catálogo SHALL ter, na área "Chat":
- `chat.usar`: "Usar o chat: as conversas diretas, as equipes e os canais", na organização;
- `chat.configurar`: "Configurar as equipes e os canais do chat", na organização.

O perfil Administrador SHALL ter as duas.

A auditoria SHALL registrar a equipe e o canal criados, alterados, arquivados e reativados, com o "antes → depois" e o alvo pelo nome de agora. As mensagens, as reações e as leituras SHALL NOT ir para a auditoria: a conversa as guarda.

Os eventos em tempo real (spec eventos-em-tempo-real) SHALL ser `chat.mudou`:
- quando uma conversa ganha uma mensagem ou uma reação, quando uma equipe ou um canal muda, ou quando um chamado aberto de uma mensagem dela muda de situação ou de quem atende, às sessões de quem participa dela, antes e depois da mudança;
- quando uma conta lê ou silencia uma conversa, às sessões dessa conta.

Os eventos SHALL NOT levar o texto, os nomes nem o nome da conversa.

Com o módulo Chat desligado, as rotas do chat SHALL responder como as de um módulo desligado (spec modulos-da-organizacao, "Módulo desligado"), e as conversas SHALL ficar guardadas.

#### Scenario: Conta sem o chat
- **WHEN** uma conta sem `chat.usar` pede as conversas pela API
- **THEN** a API responde 403, e nada é lido

#### Scenario: Canal na auditoria
- **WHEN** quem configura muda "Quem escreve" do canal "Avisos da TI" de "Todos que participam" para o grupo TI
- **THEN** a auditoria registra "Avisos da TI", com o antes e o depois de quem escreve
