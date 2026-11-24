# modulo-chat Specification

## Purpose
Mostrar o chat na tela, no app "Grafite · Chat" do colaborador, no computador e no celular, e no módulo Chat da casca, com as conversas, os chamados de cada pessoa como conversas bem marcadas e o atalho para transformar uma mensagem em chamado.

## Requirements

### Requirement: App do chat

O app do chat SHALL responder em `/chat`, com o título "Grafite · Chat", sem a casca e sem a chegada, para quem usa o chat (spec chat, "Quem usa o chat"). Ele SHALL ter a trilha à esquerda (requisito "Trilha do chat"), a lista e a conversa.

Sem a sessão, o app SHALL mostrar a entrada (spec tela-de-entrada) e, depois dela, voltar ao endereço do chat que foi pedido. Sem `chat.usar`, o app SHALL dizer "Você não tem acesso ao chat.", com a quem pedir acesso (spec permissoes, "A quem pedir acesso"), e com o módulo desligado, "O chat está desligado nesta organização.".

No pé da trilha, a foto ou as iniciais da conta SHALL abrir o menu da conta, com o tema (spec preferencias-da-interface) e "Sair". O app SHALL seguir o tema, o destaque e o fuso escolhidos pela conta, como a casca.

#### Scenario: Entrar pelo app
- **WHEN** Fernanda Rocha abre `/chat` sem a sessão e entra com o usuário do AD
- **THEN** o app do chat abre na vista Chat, sem passar pela chegada

#### Scenario: Conta sem o chat
- **WHEN** Paula, sem `chat.usar`, abre `/chat`
- **THEN** o app diz "Você não tem acesso ao chat.", com a quem pedir acesso

### Requirement: Chat na casca

A casca SHALL ter o módulo Chat, com o ícone do balão de conversa, logo depois do Chamados na ordem de fábrica do dock (spec dock), visível para quem usa o chat. No celular, o módulo SHALL ficar na barra de abas, depois do Chamados.

O item do dock SHALL levar o selo com o total do chat mais os chamados com resposta nova, e SHALL abrir a janela do Chat, com a trilha Chat, Equipes e Chamados, a lista e a conversa, como no app. Os avisos ficam no sino da casca. O menu SHALL ter "Chat", "Equipes" e "Chamados" e, para quem configura o chat, "Equipes e canais" (requisito "Equipes e canais na tela"). "Abrir no app do chat" SHALL abrir o mesmo lugar em `/chat` numa janela nova.

A janela do Chat SHALL ter os endereços dela na casca, fora do `/chat`, que é do app: recarregar a casca com a janela do Chat aberta SHALL reabri-la na casca. Na casca, os endereços do app do chat, como os das notificações do chat, SHALL abrir o mesmo lugar na janela do Chat.

#### Scenario: Selo no dock
- **WHEN** Ana Souza tem 2 mensagens não lidas em conversas diretas e nenhum chamado com resposta nova
- **THEN** o Chat do dock dela mostra o selo 2

#### Scenario: Recarregar com o Chat aberto
- **WHEN** Ana Souza recarrega a casca com a janela do Chat aberta na Equipe Financeiro
- **THEN** a casca volta com a janela do Chat na Equipe Financeiro, e não o app do chat

#### Scenario: Notificação do chat na casca
- **WHEN** Ana Souza escolhe "Abrir" na notificação "Mensagem de Paulo Nunes", na central da casca
- **THEN** a janela do Chat abre na conversa direta com Paulo, na mensagem

### Requirement: Trilha do chat

A trilha SHALL ter, nesta ordem:
- **Chat,** com o total do chat (spec chat, "Não lidas");
- **Equipes;**
- **Chamados,** com quantos chamados da conta têm resposta nova (spec chamados, "Resposta nova"), no azul do chamado, só com o módulo Chamados ligado;
- **Avisos,** com as notificações não lidas da conta, só no app.

O item escolhido SHALL ficar marcado com a barra e o nome dele dito como a página atual. Cada item SHALL ter o ícone e o nome em texto embaixo.

#### Scenario: Contadores da trilha
- **WHEN** Fernanda Rocha tem 3 não lidas na Equipe Financeiro, 1 em Avisos da TI e o #1041 com resposta nova
- **THEN** a trilha mostra Chat 4 e Chamados 1

### Requirement: Lista do Chat

A lista da vista Chat SHALL ter o título "Chat", com "Nova conversa", e as seções:
- **CHAMADOS · N,** no azul do chamado, com os chamados abertos da conta (Aberto, Em andamento e Aguardando você): os que aguardam a conta primeiro e depois os outros, o aberto mais novo primeiro. O chamado que a conta acaba de abrir SHALL entrar no alto, com o contorno forte, até a lista se carregar de novo. Cada chamado SHALL ficar num cartão com o contorno azul, com o título em peso forte, que quebra a linha e não corta, a situação no selo, o contador da resposta nova, em azul, e o número em mono. A seção SHALL começar aberta e se recolher pela seta do título, como FECHADOS. A escolha de quem a recolhe SHALL ficar guardada no navegador. Recolhida, a seção SHALL mostrar ao lado do título o contador azul com quantos chamados dela têm resposta nova, como o item Chamados da trilha, e o título SHALL dizer esse número ao leitor de tela, como "Chamados · 3, 1 com resposta nova". A seção SHALL abrir sozinha quando a conversa escolhida é a de um dos chamados dela, ou quando a conta acaba de abrir um chamado;
- **FECHADOS · N,** recolhido, com os chamados resolvidos da conta que ainda se reabrem, cada um com o selo dele. O título SHALL abrir e fechar a seção pela seta. A seção SHALL abrir sozinha quando a conversa escolhida é a de um deles;
- **EQUIPES E CANAIS,** em ordem de nome, a equipe com as iniciais dela e o canal com o "#", cada um com o contador, neutro;
- **RECENTES,** as conversas diretas, a da mensagem mais nova primeiro, com a foto ou as iniciais e o contador.

"Nova conversa" SHALL abrir a escolha da pessoa (spec chat, "Conversa direta"). A conversa escolhida SHALL ficar marcada na lista. As seções vazias SHALL sumir, fora CHAMADOS com o módulo ligado, que diz "Nenhum chamado aberto.".

#### Scenario: Chamado novo no alto
- **WHEN** Fernanda Rocha abre o #1045 pelo chat, com o #1041 aguardando ela e o #1044 em andamento
- **THEN** a lista mostra CHAMADOS · 3, com o #1045 no alto, com o contorno forte e o selo ABERTO

#### Scenario: Fechados recolhidos
- **WHEN** Fernanda Rocha abre o chat com o #1030 resolvido ontem
- **THEN** a lista mostra "Fechados · 1", recolhido, e abri-lo mostra o #1030 com o selo RESOLVIDO

#### Scenario: Chamados recolhidos pela seta
- **WHEN** Fernanda Rocha recolhe CHAMADOS pela seta e abre o chat de novo no dia seguinte
- **THEN** a lista mostra "Chamados · 3" recolhido, com o contador "1" do #1041, com resposta nova, ao lado do título e as equipes logo abaixo, e escolher o #1041 pelo evento de uma conversa abre a seção com ele marcado

### Requirement: Conversa na tela

A conversa SHALL ter:
- **o cabeçalho:** a foto ou as iniciais e o nome; na equipe, quantas pessoas participam, como "12 pessoas"; no canal, quem escreve, como "Só TI escreve";
- **na equipe e no canal, as abas** "Conversa", "Arquivos" (os anexos das mensagens, o mais novo primeiro, com quem mandou e quando) e "Chamados da equipe" ou "Chamados do canal" (spec chat, "Chamados da conversa");
- **as mensagens,** com a foto ou as iniciais, o nome em peso forte, a hora em mono, o texto em 14 px na cor principal, os anexos e as reações, e as mensagens seguidas da mesma pessoa juntas, sem repetir o nome;
- **a imagem anexada,** na miniatura (spec arquivos-e-imagens, "Miniatura do anexo de imagem"), que baixa o arquivo, com o nome e o tamanho embaixo. A imagem sem a miniatura fica como os outros anexos, com o nome e o tamanho;
- **o dia,** em separadores como "Hoje", "Ontem" e "12/11";
- **os eventos,** numa linha, como "Fernanda Rocha transformou esta mensagem no chamado #1045 · 10:32", com "Abrir chamado".

A conversa SHALL abrir na primeira não lida, com o separador "Mensagens novas", ou, sem não lidas, na última mensagem, e ficar presa embaixo enquanto chegam as mensagens. A conversa que a conta nunca leu, como a equipe de quem acaba de entrar no grupo, SHALL abrir na última mensagem, sem o separador. As mais antigas SHALL vir ao rolar para cima, com "Mensagens anteriores". Com a conversa rolada para cima, a mensagem que chega SHALL mostrar "Mensagens novas · 2", que leva ao fim.

#### Scenario: Mensagem que chega
- **WHEN** Paulo Nunes manda uma mensagem na Equipe Financeiro, com Fernanda Rocha no fim da conversa
- **THEN** a mensagem aparece embaixo, sem recarregar, e a conversa continua presa embaixo

#### Scenario: Rolada para cima
- **WHEN** chegam 2 mensagens com Fernanda Rocha lendo as mensagens de ontem
- **THEN** a conversa não se mexe, e aparece "Mensagens novas · 2"

#### Scenario: Primeira vez na equipe
- **WHEN** Tatiana Ramos entra no grupo Financeiro e abre a Equipe Financeiro pela primeira vez
- **THEN** a conversa abre na última mensagem, sem o separador "Mensagens novas", e o contador da equipe some

#### Scenario: Foto na conversa
- **WHEN** Paulo Nunes manda na Equipe Financeiro a foto "folha-manchada.jpg"
- **THEN** a conversa mostra a miniatura da foto, com "folha-manchada.jpg" e o tamanho embaixo, e escolher a miniatura baixa a foto

### Requirement: Caixa de escrever do chat

A caixa SHALL ser arredondada, com a borda à vista, o texto de ajuda, como "Escrever uma mensagem em Equipe Financeiro…", e, dentro dela, o clipe e o envio. Enter SHALL mandar, e Shift+Enter SHALL quebrar a linha. O envio SHALL ficar sem ação enquanto a caixa está vazia e sem anexo: com um anexo, a mensagem vai sem o texto (spec chat, "Mensagem").

A caixa SHALL ocupar a largura inteira da coluna, na conversa e no chamado, e a frase que fica no lugar dela também. As mensagens SHALL ficar na largura de leitura, alinhadas à esquerda com a caixa, e o dia, os eventos, o resumo dos tempos e a avaliação, no meio dela.

A caixa SHALL ter, em cima, a mensagem respondida, com quem escreveu, o começo dela e "Tirar", e embaixo os anexos, cada um com o nome, o tamanho e "Tirar".

Além do clipe, os anexos SHALL entrar na caixa, com as mesmas regras e recusas:
- **colados:** colar arquivos, ou uma imagem sem o texto, como um print, SHALL anexá-los. A imagem colada SHALL ganhar o nome "Imagem colada 22-11-2026 14.05.33.png", com a data e a hora em que foi colada, no fuso da conta. Colar o texto com a imagem que vai junto, como uma célula de planilha, SHALL colar o texto, e o arquivo copiado de uma pasta SHALL entrar também quando traz o nome dele como texto;
- **soltos:** arrastar arquivos sobre a conversa SHALL mostrar "Solte para anexar" sobre ela, e soltá-los SHALL anexá-los. Na conversa sem a caixa e durante o envio, o arquivo solto SHALL NOT entrar.

No app do chat, como na casca (spec estrutura-da-casca, "Arquivo solto fora de um lugar de soltar"), o arquivo solto fora da conversa, como na lista das conversas, SHALL NOT trocar o Grafite pelo arquivo.

Escrever "#" SHALL abrir a lista dos chamados de que a conta participa, pelo número e pelo título, para citar (requisito "Chamado citado na tela"). A dica "# cita um chamado" SHALL ficar no texto de ajuda da caixa de uma conversa de chamado.

No canal ou na equipe em que a conta não escreve, a caixa SHALL dar lugar a "Só TI escreve neste canal.". Na equipe ou no canal arquivado, a "Esta equipe foi arquivada." e "Este canal foi arquivado.".

O que se escreve SHALL continuar na caixa quando a conversa se atualiza e quando a conta vai a outra conversa e volta. A recusa SHALL ficar embaixo da caixa, com a frase dela.

#### Scenario: Enter manda
- **WHEN** Fernanda Rocha escreve "Eu vou abrir um chamado agora." e aperta Enter
- **THEN** a mensagem entra na conversa, e a caixa esvazia

#### Scenario: Volta à conversa
- **WHEN** Fernanda Rocha escreve na Equipe Financeiro sem mandar, abre o #1041 e volta
- **THEN** o texto continua na caixa da Equipe Financeiro

#### Scenario: Caixa na largura da coluna
- **WHEN** Fernanda Rocha abre a Equipe Financeiro numa tela de 2560 px
- **THEN** a caixa vai de uma borda à outra da coluna, o texto das mensagens quebra a linha na largura de leitura, e o "Hoje" fica no meio dela, em cima das mensagens

#### Scenario: Colar um print
- **WHEN** Fernanda Rocha tira um print da tela às 14:05:33 de 22/11/2026 e cola na caixa da Equipe Financeiro
- **THEN** o print entra nos anexos da caixa como "Imagem colada 22-11-2026 14.05.33.png", e o envio ganha ação, sem o texto

#### Scenario: Colar de uma planilha
- **WHEN** Fernanda Rocha copia uma célula de uma planilha, que vai com a imagem dela, e cola na caixa
- **THEN** o texto da célula entra na caixa, e nenhum anexo entra

#### Scenario: Soltar um arquivo
- **WHEN** Fernanda Rocha arrasta um PDF sobre a conversa da Equipe Financeiro
- **THEN** a conversa mostra "Solte para anexar", e, solto, o PDF entra nos anexos da caixa

### Requirement: Menu da mensagem

Passar o mouse ou pôr o foco numa mensagem SHALL mostrar a barra dela, com "Responder", "Reagir" e "Mais". "Mais" SHALL abrir o menu, em camada opaca:
- "Responder";
- "Reagir", com "+1", "ok" e "visto" e a reação escrita, num submenu ou, na postura celular, no próprio menu, com o nome "Reagir" em cima;
- "Copiar link da mensagem";
- "Transformar em chamado", com o atalho Ctrl+Shift+T, no azul do chamado, só a quem pode abrir pelo chat (spec chamados, "Abrir um chamado pelo chat"), e sem ação na mensagem que já virou chamado, com "Já virou o #1045";
- "Selecionar", só a quem pode abrir pelo chat, que começa a seleção com a mensagem (requisito "Mensagens selecionadas");
- "Silenciar a conversa" ou "Voltar a ouvir a conversa".

Ctrl+Shift+T SHALL abrir o transformar na mensagem com o foco ou com o mouse e, na seleção, com as mensagens marcadas. As conversas dos chamados SHALL NOT ter a barra nem o menu, porque não têm reações.

O botão direito do mouse na mensagem SHALL abrir o mesmo menu, onde o ponteiro está, e a tecla de menu ou o Shift+F10, na mensagem com o foco ou num botão dela, SHALL abri-lo junto do "Mais". Num link e no texto selecionado, o menu SHALL ser o do navegador, para abrir e copiar. No toque, o toque longo SHALL continuar abrindo a folha (requisito "Chat no celular").

Com o menu da mensagem aberto, o botão direito fora dele SHALL fechá-lo e valer onde cai: em outra mensagem, o menu dela SHALL abrir no lugar deste. Em outro lugar, como a caixa, um link ou o texto selecionado, o clique SHALL só fechar o menu, sem o do navegador, e o foco SHALL voltar à mensagem; o clique seguinte abre o do navegador.

#### Scenario: Menu da mensagem do Paulo
- **WHEN** Fernanda Rocha passa o mouse na mensagem das 10:19 de Paulo Nunes e escolhe "Mais"
- **THEN** o menu abre com "Transformar em chamado" no azul, com "Ctrl+Shift+T", e "Selecionar"

#### Scenario: Botão direito na mensagem
- **WHEN** Fernanda Rocha clica com o botão direito na mensagem das 10:19 de Paulo Nunes
- **THEN** o menu da mensagem abre onde o ponteiro está, com "Transformar em chamado" no azul

#### Scenario: Botão direito num link
- **WHEN** Fernanda Rocha clica com o botão direito no link da mensagem de Paulo Nunes
- **THEN** abre o menu do navegador, e não o da mensagem

#### Scenario: Botão direito em outra mensagem com o menu aberto
- **WHEN** Fernanda Rocha, com o menu da mensagem das 10:19 de Paulo Nunes aberto, clica com o botão direito na mensagem de Tatiana Ramos
- **THEN** o menu da mensagem de Paulo fecha, e o da mensagem de Tatiana abre onde o ponteiro está, sem o menu do navegador

#### Scenario: Sem o chamado pelo chat
- **WHEN** Paulo Nunes, sem `chamados.pedir`, abre o menu de uma mensagem da Equipe Financeiro
- **THEN** o menu não tem "Transformar em chamado" nem "Selecionar"

### Requirement: Transformar em chamado na tela

"Transformar em chamado" SHALL abrir o diálogo, em camada opaca sobre o véu, com:
- a mensagem citada como ela é, com quem escreveu e a hora, como "Paulo Nunes · 10:19", ou, com várias, as mensagens citadas, na ordem da conversa, cada uma com quem escreveu e a hora, com o título "3 mensagens" em cima e a lista que rola dentro do diálogo. Sem nenhuma, como quando a recusa tira a última, "Nenhuma mensagem selecionada.", com "Abrir chamado" sem ação;
- os tipos, em chips com o ícone, que quebram em linhas e nenhum se corta;
- o título, com o contador, como "20/120";
- no tipo que pede o ativo, o ativo sugerido, com o nome e o patrimônio, e "Trocar", que lista os sugeridos;
- "No nome de Fernanda Rocha", com "Trocar", que busca a pessoa pelo nome;
- "Cancelar" e "Abrir chamado", a ação principal.

Aberto o chamado, o diálogo SHALL fechar, a seleção SHALL sair, a lista SHALL mostrar o chamado no alto de CHAMADOS e a conversa SHALL mostrar o evento no fim, na hora da abertura, com o "esta mensagem", ou o "3 mensagens", levando à mensagem de origem, e a marca em cada mensagem citada. A recusa SHALL ficar no campo dela; a das mensagens, no alto do diálogo, que tira das citadas a que já virou chamado (requisito "Mensagens selecionadas").

#### Scenario: Abrir pelo diálogo
- **WHEN** Fernanda Rocha escolhe Impressora, escreve "Impressora manchando" e escolhe "Abrir chamado"
- **THEN** o diálogo fecha, o #1045 entra no alto de CHAMADOS · 3, e a Equipe Financeiro mostra "Fernanda Rocha transformou esta mensagem no chamado #1045 · 10:32"

#### Scenario: Abrir com três mensagens
- **WHEN** Fernanda Rocha transforma as três mensagens marcadas, escolhe Rede, escreve "Sala sem rede" e escolhe "Abrir chamado"
- **THEN** o diálogo fecha, a seleção sai, as três mensagens ganham a marca, e a conversa mostra "Fernanda Rocha transformou 3 mensagens no chamado #1046 · 10:32"

### Requirement: Chamado no chat

A conversa de um chamado, para quem participa dele (spec chamados, "Leitura do chamado pela pessoa"), SHALL ter:
- **o cabeçalho:** "CHAMADO #1045" no selo, o título em peso forte e a situação à direita e, a quem atende pelo chat, o "Andamento" (requisito "Andamento do chamado no chat");
- **as etapas,** Aberto, Em andamento, Aguardando você e Resolvido, cada uma com a hora ou "ainda não" (spec chamados, "Leitura do chamado pela pessoa"), com a de agora marcada em texto. A quem participa pela TI, a espera SHALL ser "Aguardando o colaborador";
- **"Seus outros chamados",** os outros chamados abertos da conta em pílulas com o título inteiro, que quebram a linha, e levam a eles;
- **a conversa:** a abertura, com o resumo das respostas ou as mensagens citadas, na ordem, as mensagens da TI e as de quem participa, com a imagem anexada na miniatura, como na conversa (requisito "Conversa na tela"), e os eventos nas palavras do colaborador, como a espera, na linha "Aguardando você", com a hora;
- **a resposta nova:** o separador "Resposta nova" antes da primeira mensagem dela e "Marcar como vista";
- **a pergunta com opções:** as opções em chips de 36 px com a borda à vista, que se escolhem pelo teclado, com as setas, e pelo mouse; respondida, a escolhida cheia, na cor do destaque e com o ✓, e as outras apagadas. A quem participa pela TI, as opções SHALL ficar sem ação, como no Chamados;
- **o cartão do ativo:** o ícone, o nome em peso forte, o modelo e o patrimônio em mono, o selo do suprimento e a barra do nível com o número ao lado, e o IP e a situação;
- **no resolvido:** o evento do resolvido, com o resumo dos tempos, e, a quem participa como quem pediu, a avaliação, com os quatro níveis em cartões e o comentário, e "Enviar avaliação", sem ação até um nível ser marcado. Avaliado, o quadro SHALL dizer "Você marcou: Ótimo. Obrigado!";
- **o painel "Neste chamado",** ao lado, que recolhe: ANEXOS, ATIVO LIGADO e QUEM ATENDE, ou QUEM ATENDEU no resolvido, cada um num cartão.

A caixa SHALL dizer:
- no aberto, "Responder no #1045…" e, a quem participa pela TI, "Escrever para Fernanda no #1045…". A mensagem de quem participa pela TI SHALL ir como a da TI (spec chamados, "Quem atende pelo chat"), e, quando a pessoa não usa o chat, a caixa SHALL dizer "Fernanda ainda não usa o chat: a mensagem fica no chamado.", como no Chamados;
- no resolvido, "Escrever aqui reabre o chamado", com o cadeado, e o botão "Reabrir até 18/11". A quem participa pela TI, no lugar da caixa, o cadeado, "O #1045 está resolvido." e "Reabrir";
- no fechado, "O chamado fechou em 18/11. Para o mesmo problema, abra outro chamado.", sem a caixa.

#### Scenario: Pergunta pelo teclado
- **WHEN** Fernanda Rocha chega pelo Tab à pergunta das 10:52 e aperta Enter no "Pode ser"
- **THEN** "Pode ser" fica cheio, com o ✓, e as outras duas opções ficam apagadas

#### Scenario: Avaliar no chat
- **WHEN** Fernanda Rocha abre o #1045 resolvido, marca "Ótimo" e escolhe "Enviar avaliação"
- **THEN** o quadro diz "Você marcou: Ótimo. Obrigado!", e a caixa diz "Escrever aqui reabre o chamado", com "Reabrir até 18/11"

#### Scenario: Caixa de quem participa pela TI
- **WHEN** Ana Souza abre no chat o #1050, que ela abriu no nome de Paulo Nunes e atende
- **THEN** a caixa diz "Escrever para Paulo no #1050…", e a mensagem que ela manda aparece como a dela, da TI

#### Scenario: Resolvido para quem participa pela TI
- **WHEN** Ana Souza abre no chat o #1050 resolvido
- **THEN** no lugar da caixa fica "O #1050 está resolvido.", com "Reabrir", e a avaliação não aparece para ela

### Requirement: Vista Chamados

A vista Chamados SHALL ter o título "Chamados", com a contagem dos abertos, como "3 abertos", e os grupos pela vez de quem age, só os que têm chamados, nesta ordem:
- AGUARDANDO VOCÊ;
- EM ANDAMENTO;
- ABERTOS;
- FECHADOS, recolhido, com os resolvidos e os fechados, o mais novo primeiro, que carregam mais ao rolar.

Cada chamado SHALL ter o contorno, o ícone do tipo, o selo da situação, a hora da última mensagem e o começo dela, com quem escreveu, cortado pela largura, como "Bruno: Já vi aqui. O sistema mostra o nível…". O título SHALL NOT ser cortado. A frase de um evento SHALL NOT entrar no lugar da última mensagem.

#### Scenario: Grupos dos chamados
- **WHEN** Fernanda Rocha abre a vista Chamados às 10:51, com o #1041 aguardando ela e o #1044 e o #1045 em andamento
- **THEN** a vista mostra "3 abertos", AGUARDANDO VOCÊ · 1, EM ANDAMENTO · 2 e FECHADOS recolhido

### Requirement: Equipes e Avisos na tela

A vista Equipes SHALL listar as equipes e os canais de que a conta participa, com quantas pessoas cada um tem. Escolher um SHALL mostrar quem participa, pelo nome, e "Abrir a conversa".

A vista Avisos SHALL mostrar as notificações da conta, como a central da casca (spec notificacoes, "Central de notificações"), com "Abrir", que leva ao chat no endereço da notificação, ou, quando o endereço é da casca, abre o Grafite nele numa janela nova.

A vista Avisos SHALL ter, em cima, "Receber neste aparelho", que inscreve no push o aparelho em que a conta está (spec notificacoes, "Aparelhos do push"), com "Este aparelho recebe os avisos." quando ele já está inscrito e, quando ele não pode receber, o motivo em texto.

#### Scenario: Pessoas da equipe
- **WHEN** Fernanda Rocha escolhe a Equipe Financeiro na vista Equipes
- **THEN** a tela mostra as 12 pessoas da equipe e "Abrir a conversa"

#### Scenario: Receber no celular pelo app
- **WHEN** Fernanda Rocha, com o app do chat instalado no celular, escolhe "Receber neste aparelho" nos Avisos, e o celular permite
- **THEN** os Avisos dizem "Este aparelho recebe os avisos.", e o celular passa a receber o push das mensagens

#### Scenario: Endereço da casca nos Avisos
- **WHEN** Ana Souza escolhe "Abrir" na notificação "Chamado #1043 com você", nos Avisos do app do chat
- **THEN** o Grafite abre o #1043 numa janela nova, e o app do chat continua onde estava

### Requirement: Chamado citado na tela

O chip do chamado citado (spec chat, "Chamado citado numa mensagem") SHALL ter 32 px de altura, o número em mono, o selo da situação e quem atende. Passar o mouse ou pôr o foco no chip SHALL abrir o resumo embaixo dele, em camada opaca, e Esc SHALL fechá-lo.

"Abrir chamado" SHALL abrir, no app, a conversa do chamado e, na casca, para quem vê os chamados, o chamado aberto do módulo Chamados. "Copiar link" SHALL copiar o endereço do chamado.

#### Scenario: Resumo do chip
- **WHEN** Fernanda Rocha passa o mouse no chip "#1045 · EM ANDAMENTO · Bruno Lima" da mensagem de Paulo Nunes
- **THEN** o resumo abre embaixo, com a mensagem de Bruno das 10:52 e a dela das 10:53, o ativo, a hora da abertura, "Abrir chamado" e "Copiar link"

### Requirement: Chat no celular

Abaixo de 768 px, o app SHALL mostrar a lista e a conversa em telas separadas, com a seta de voltar na conversa, e a trilha na barra de baixo. Os alvos de toque SHALL ter pelo menos 44 px: as linhas da lista, os itens da trilha, as opções das perguntas, a caixa, o envio, "Nova conversa" e as caixas de marcar e os botões da seleção.

O toque longo numa mensagem SHALL levantar a mensagem e abrir a folha de baixo, com as reações e o menu da mensagem, "Transformar em chamado" no azul e "Selecionar". O transformar SHALL abrir o formulário em tela cheia, com o título "Transformar em chamado", "Cancelar" e "Abrir chamado" de 52 px no pé.

Na seleção (requisito "Mensagens selecionadas"), o toque numa mensagem SHALL marcá-la ou desmarcá-la, o toque longo SHALL NOT abrir a folha, e a barra da seleção SHALL ficar embaixo, no lugar da caixa.

Na conversa de um chamado, o cabeçalho SHALL dizer quem atende e a previsão da resposta, como "Atende: Ana Souza · responde em ~1 h", e o painel "Neste chamado" SHALL abrir numa folha, pelo botão dele no cabeçalho. A quem atende pelo chat, o cabeçalho SHALL ter também o botão "Andamento do #1045", que abre o menu do andamento.

#### Scenario: Transformar no celular
- **WHEN** Fernanda Rocha toca e segura a mensagem de Paulo Nunes no celular e escolhe "Transformar em chamado"
- **THEN** o formulário abre em tela cheia, com os 8 tipos em linhas, sem nenhum cortado, e "Abrir chamado" no pé

#### Scenario: Selecionar no celular
- **WHEN** Fernanda Rocha toca e segura a mensagem das 10:19 de Paulo Nunes, escolhe "Selecionar" e toca a das 10:20
- **THEN** as duas ficam marcadas, e a barra embaixo diz "2 mensagens selecionadas", com "Transformar em chamado"

#### Scenario: Andamento no celular
- **WHEN** Ana Souza abre no celular o #1050, que ela atende pelo chat, e toca "Andamento do #1050"
- **THEN** o menu do andamento abre, com o "Passar para…" abrindo o submenu embaixo do item

### Requirement: Equipes e canais na tela

Para quem tem `chat.configurar`, a tela "Equipes e canais" do módulo Chat SHALL listar as equipes e os canais, com o nome, o tipo, o grupo, quem escreve, "Avisar a cada mensagem" escrito e a situação, "Ativo" ou "Arquivado", em texto.

"Nova equipe", "Novo canal" e a escolha de uma linha SHALL abrir a gaveta, com o nome, o grupo da equipe, quem escreve, "Avisar a cada mensagem", "Salvar" e "Arquivar" ou "Reativar". O retorno SHALL vir num aviso, como "Equipe Financeiro criada.", e a recusa SHALL ficar no campo dela.

#### Scenario: Criar a equipe
- **WHEN** quem configura escolhe "Nova equipe", escreve "Equipe Financeiro", escolhe o grupo Financeiro e salva
- **THEN** a tela avisa "Equipe Financeiro criada.", e a linha nova mostra "Equipe", "Financeiro" e "Ativo"

### Requirement: Selos e movimento do chat

A situação do chamado SHALL vir sempre em texto, num selo com borda, maiúsculas e ícone, e a mesma palavra SHALL ter sempre a mesma marca:

| Selo | Marca | Ícone |
|---|---|---|
| Aberto | neutro | o tíquete |
| Em andamento | informação | a chave |
| Aguardando você | atenção | a ampulheta |
| Aguardando o colaborador | informação | a ampulheta |
| Resolvido | sucesso | o visto |
| Fechado | neutro | a caixa de arquivo |
| Toner crítico | perigo | o círculo com a exclamação |

"Aguardando você" SHALL ter a atenção porque pede a resposta da conta. "Aguardando o colaborador", a espera de quem não participa e de quem participa pela TI (spec chamados, "Quem atende pelo chat"), SHALL ter a informação, como no Chamados: a resposta é de outra pessoa.

O chamado SHALL ser marcado na lista pelo contorno, pelo título "CHAMADOS" e pelo número, além do azul do chamado. A resposta nova SHALL ter o número escrito, e nunca só a cor.

O movimento SHALL ser só de mudança de estado, dentro de 300 ms, e parado com "reduzir movimento":
- a barra e o menu da mensagem: 170 ms;
- o diálogo, o chamado novo na lista e o evento: 200 ms;
- o fundo ao passar o mouse e ao escolher: 120 ms;
- a escolha de uma opção e as seções que abrem e fecham: 200 ms;
- o resumo do chip: 120 ms;
- a folha do celular: 300 ms.

#### Scenario: Reduzir movimento
- **WHEN** Fernanda Rocha pede "reduzir movimento" no sistema e abre o menu da mensagem
- **THEN** o menu aparece sem a animação

#### Scenario: Espera de quem participa pela TI
- **WHEN** Ana Souza vê na lista do Chat o #1050, que ela abriu no nome de Paulo Nunes, atende e põe aguardando Paulo
- **THEN** o selo diz "AGUARDANDO O COLABORADOR", com a ampulheta na marca de informação, e Paulo vê "AGUARDANDO VOCÊ" na de atenção

### Requirement: Telas do chat atualizadas e avisos

As telas do chat SHALL se atualizar sozinhas quando chegam os eventos `chat.mudou` e `chamados.mudaram`, sem uma ação do usuário e sem perder o que se escreve na caixa.

O aviso na tela de uma notificação do chat SHALL NOT aparecer quando a conversa dela está aberta e à vista. "Abrir", no aviso e na notificação, SHALL levar à conversa na mensagem, no app ou na janela do Chat da casca, conforme onde a conta está.

#### Scenario: Conversa aberta sem aviso
- **WHEN** Paulo Nunes manda uma mensagem direta a Fernanda Rocha, que está com a conversa dos dois aberta e à vista
- **THEN** a mensagem aparece na conversa, e nenhum aviso aparece na tela

### Requirement: Andamento do chamado no chat

A quem atende pelo chat (spec chamados, "Quem atende pelo chat"), o chamado no chat SHALL ter o menu "Andamento", em camada opaca:
- no computador, pelo botão "Andamento" do cabeçalho, antes de "Neste chamado";
- no celular, pelo botão de ícone "Andamento do #1045", ao lado do de "Neste chamado".

O menu SHALL ter as ações que o chamado aceita agora, na ordem da spec chamados, e, separado no fim, "Abrir no Chamados":
- "Assumir";
- "Passar para…", com o submenu de quem recebe o chamado. Cada conta vem com os abertos dela, como "2 abertos". Enquanto a lista vem, o submenu diz "Carregando quem atende…", e sem ninguém, "Ninguém mais atende os locais do chamado.";
- "Devolver à triagem";
- "Aguardar Fernanda…", que abre o diálogo "Aguardar Fernanda no #1045", com "Mensagem para Fernanda", "Cancelar" e "Enviar e aguardar". À pessoa que não usa o chat, o diálogo SHALL dizer "Fernanda ainda não usa o chat: a mensagem fica no chamado.", como no Chamados;
- "Retomar";
- "Resolver…", que abre o diálogo "Resolver o #1045", com "O que foi feito", "Cancelar" e "Resolver";
- "Reabrir".

"Abrir no Chamados" SHALL abrir o chamado aberto do módulo Chamados: na casca, no módulo; no app do chat, o Grafite numa janela nova.

Cada ação SHALL dar o retorno no aviso, com as frases do Chamados:
- "Você assumiu o #1045.", com "Desfazer";
- "Você passou o #1045 a Bruno.";
- "Você devolveu o #1045 à triagem.";
- "Você pôs o #1045 aguardando Fernanda.";
- "Você retomou o #1045.";
- "Você resolveu o #1045.";
- "Você reabriu o #1045.".

A recusa SHALL ir no aviso crítico, com a frase dela, como no Chamados. Nos diálogos, a recusa do campo SHALL ficar no campo, e toda outra recusa, como a do chamado que mudou, no alto, com o diálogo aberto e o texto escrito. No resolver, a do campo só da TI vazio, como "Preencha Contador de páginas antes de resolver.", SHALL levar também "Abrir no Chamados", onde o campo se preenche. O chamado na tela e as listas SHALL mostrar como o chamado ficou logo depois da ação, aceita ou recusada, e do "Desfazer", sem esperar o evento.

Quem não atende pelo chat SHALL NOT ver o menu.

Na lista do Chat e na vista Chamados, o chamado que aguarda a pessoa, a quem participa pela TI, SHALL ficar com os outros abertos, e não com os que aguardam a conta: em CHAMADOS, pelo aberto mais novo, e na vista Chamados, em EM ANDAMENTO.

#### Scenario: Assumir pelo menu
- **WHEN** Ana Souza abre no chat o #1050, que está na triagem, e escolhe "Assumir" no "Andamento"
- **THEN** o aviso diz "Você assumiu o #1050.", com "Desfazer", e o chamado passa a dizer que Ana atende

#### Scenario: Passar pelo submenu
- **WHEN** Ana Souza escolhe Diego em "Passar para…" no #1050
- **THEN** o aviso diz "Você passou o #1050 a Diego.", e o "Passar para…" deixa de ter Diego

#### Scenario: Aguardar a pessoa
- **WHEN** Ana Souza escolhe "Aguardar Paulo…" no #1050, escreve "Qual é o número da sala?" e escolhe "Enviar e aguardar"
- **THEN** a mensagem entra na conversa, Ana lê "Aguardando o colaborador", e Paulo lê "Aguardando você"

#### Scenario: Resolver sem o que foi feito
- **WHEN** Ana Souza escolhe "Resolver" no diálogo do #1050 sem escrever
- **THEN** o campo diz "Escreva o que foi feito.", e o diálogo fica aberto

#### Scenario: Resolver com o campo da TI vazio
- **WHEN** Ana Souza escreve o que foi feito e escolhe "Resolver" no diálogo de um chamado de Impressora que ela abriu pelo chat no nome de Paulo Nunes, com o campo só da TI obrigatório "Contador de páginas" vazio
- **THEN** o alto do diálogo diz "Preencha Contador de páginas antes de resolver.", com "Abrir no Chamados", e o diálogo fica aberto com o texto

#### Scenario: Chamado que mudou
- **WHEN** Diego assume o #1050 pelo Chamados, e Ana Souza, com o #1050 aberto no chat antes disso, escolhe "Assumir"
- **THEN** o aviso diz "O chamado #1050 mudou. Confira antes de assumir.", e o chamado no chat passa a dizer que Diego atende

#### Scenario: Sem o menu
- **WHEN** Fernanda Rocha, sem `chamados.atender`, abre o #1045 no chat
- **THEN** o cabeçalho do #1045 não tem "Andamento"

### Requirement: Mensagens selecionadas

A quem pode abrir pelo chat (spec chamados, "Abrir um chamado pelo chat"), o menu da mensagem SHALL ter "Selecionar", que começa a seleção da conversa com a mensagem marcada, ou sem nenhuma, na mensagem que já virou chamado. Na seleção:
- cada mensagem SHALL ter a caixa de marcar à esquerda, com o rótulo "Selecionar a mensagem de Paulo Nunes das 10:19";
- escolher qualquer ponto da mensagem, também um link, um anexo ou a miniatura, SHALL marcá-la ou desmarcá-la, sem abrir o que foi escolhido, e a marcada SHALL ter o fundo de seleção;
- a mensagem que já virou chamado SHALL ter a caixa sem ação, com "Já virou o #1045". Os eventos e o dia SHALL ficar sem a caixa;
- a barra da mensagem e o menu SHALL sair, e as reações SHALL ficar à vista, sem ação, para a conversa não mudar de altura;
- a caixa de escrever SHALL dar lugar à barra da seleção, com "3 mensagens selecionadas" ("1 mensagem selecionada" e, sem nenhuma, "Nenhuma mensagem selecionada"), "Transformar em chamado", no azul do chamado, e "Cancelar". No canal ou na equipe em que a conta não escreve, a barra SHALL ficar no lugar do aviso, como "Só TI escreve neste canal.". A caixa SHALL voltar como estava, com o texto, o "Respondendo a…" e os anexos na fila;
- com 20 marcadas, as outras caixas SHALL ficar sem ação, e a barra SHALL dizer "20 mensagens selecionadas, o máximo";
- "Transformar em chamado" e o Ctrl+Shift+T SHALL abrir o transformar com as marcadas, na ordem da conversa (requisito "Transformar em chamado na tela"). "Cancelar" e o Esc no transformar SHALL fechar só ele, com a seleção como estava;
- "Cancelar", o Esc e sair da conversa SHALL desfazer a seleção;
- a mensagem que chega SHALL NOT mudar a seleção. A marcada que vira chamado, por outra conta ou na recusa das mensagens do transformar, SHALL sair da seleção, com "Já virou o #1045", e a contagem SHALL cair.

Sem nenhuma mensagem marcada, a seleção SHALL continuar, com "Transformar em chamado" sem ação, até "Cancelar".

#### Scenario: Selecionar três mensagens
- **WHEN** Fernanda Rocha escolhe "Selecionar" na mensagem das 10:19 de Paulo Nunes e marca as das 10:20 e das 10:21
- **THEN** a barra diz "3 mensagens selecionadas", e "Transformar em chamado" abre o formulário com as três, na ordem

#### Scenario: Mensagem que já virou chamado na seleção
- **WHEN** Fernanda Rocha seleciona mensagens da Equipe Financeiro, onde a das 10:19 virou o #1045
- **THEN** a caixa de marcar da mensagem das 10:19 fica sem ação, com "Já virou o #1045"

#### Scenario: O máximo
- **WHEN** Fernanda Rocha marca a vigésima mensagem
- **THEN** a barra diz "20 mensagens selecionadas, o máximo", e as caixas das outras mensagens ficam sem ação

#### Scenario: Esc desfaz
- **WHEN** Fernanda Rocha, com 3 mensagens marcadas e "Já vou ver" escrito na caixa, aperta Esc
- **THEN** a seleção sai, e a caixa de escrever volta com "Já vou ver"

#### Scenario: Mensagem marcada que vira chamado
- **WHEN** Fernanda Rocha marca as mensagens das 10:19 e das 10:20, e Tatiana Ramos transforma a das 10:19 no #1045
- **THEN** a das 10:19 sai da seleção, com "Já virou o #1045", e a barra passa a dizer "1 mensagem selecionada"

#### Scenario: Cancelar o transformar
- **WHEN** Fernanda Rocha, com 3 mensagens marcadas, abre o transformar e escolhe "Cancelar"
- **THEN** o diálogo fecha, e a barra segue com "3 mensagens selecionadas"

#### Scenario: Selecionar na mensagem que já virou chamado
- **WHEN** Fernanda Rocha escolhe "Selecionar" no menu da mensagem das 10:19, que já virou o #1045
- **THEN** a seleção começa sem nenhuma mensagem marcada, e a barra diz "Nenhuma mensagem selecionada"

#### Scenario: Seleção no canal em que a conta não escreve
- **WHEN** Tatiana Ramos, que não escreve no canal Avisos da TI, escolhe "Selecionar" numa mensagem de Ana Souza
- **THEN** a barra da seleção fica no lugar de "Só TI escreve neste canal.", e o aviso volta quando a seleção sai
