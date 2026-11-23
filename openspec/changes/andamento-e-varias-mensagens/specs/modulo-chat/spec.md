## ADDED Requirements

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

## MODIFIED Requirements

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
- a mensagem citada como ela é, com quem escreveu e a hora, como "Paulo Nunes · 10:19", ou, com várias, as mensagens citadas, na ordem da conversa, cada uma com quem escreveu e a hora, com o título "3 mensagens" em cima e a lista que rola dentro do diálogo;
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
