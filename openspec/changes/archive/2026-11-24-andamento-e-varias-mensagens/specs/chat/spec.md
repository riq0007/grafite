## MODIFIED Requirements

### Requirement: Chamado citado numa mensagem

Na mensagem de uma conversa direta, de uma equipe ou de um canal, "#" seguido do número de um chamado, separado das outras palavras, SHALL citar o chamado, como "a impressora já está no #1045".

Quem vê o resumo do chamado SHALL ver a citação como o chip "#1045 · EM ANDAMENTO · Bruno Lima": o número, a situação nas palavras do colaborador (spec chamados, "Leitura do chamado pela pessoa") e quem atende, se há alguém. A quem não participa do chamado e a quem participa dele pela TI (spec chamados, "Quem atende pelo chat"), a espera SHALL ser "Aguardando o colaborador", e não "Aguardando você": a resposta não é dela. O chip SHALL seguir o chamado: quando a situação ou quem atende muda, o chip muda.

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

#### Scenario: Chip para quem participa pela TI
- **WHEN** Ana Souza, que abriu o #1050 no nome de Paulo Nunes e o atende, vê na Equipe Financeiro o chip do #1050, que aguarda Paulo
- **THEN** Ana vê "#1050 · AGUARDANDO O COLABORADOR · Ana Souza", e Paulo, "#1050 · AGUARDANDO VOCÊ · Ana Souza"

### Requirement: Chamados da conversa

O chamado aberto a partir de uma ou mais mensagens (spec chamados, "Abrir um chamado pelo chat") SHALL ser da conversa delas:
- cada mensagem SHALL ganhar a marca de que virou o chamado, e SHALL NOT virar outro;
- a conversa SHALL ganhar, na hora da abertura, na ordem das mensagens, o evento "Fernanda Rocha transformou esta mensagem no chamado #1045 · 10:32", ou, com várias, "Fernanda Rocha transformou 3 mensagens no chamado #1045 · 10:32". O evento leva à mensagem de origem, a primeira na ordem da conversa, e tem "Abrir chamado" a quem participa do chamado e a quem o vê com `chamados.ver`;
- quem participa da conversa SHALL ver o resumo do chamado (requisito "Chamado citado numa mensagem").

A equipe e o canal SHALL ter "Chamados da equipe" (no canal, "Chamados do canal"): os chamados abertos das mensagens dela, o mais novo primeiro, com o número, o título, a situação nas palavras do colaborador, com a espera como no chip (requisito "Chamado citado numa mensagem"), quem atende, quem abriu e quando.

#### Scenario: Evento na equipe
- **WHEN** Fernanda Rocha transforma a mensagem das 10:19 de Paulo Nunes no #1045
- **THEN** a Equipe Financeiro mostra a mensagem com a marca, o evento "Fernanda Rocha transformou esta mensagem no chamado #1045 · 10:32", e o #1045 em "Chamados da equipe"

#### Scenario: Mensagem que já virou chamado
- **WHEN** Tatiana Ramos tenta transformar a mesma mensagem de Paulo Nunes
- **THEN** o pedido é recusado com "Esta mensagem já virou o chamado #1045.", e nada é gravado

#### Scenario: Evento de três mensagens
- **WHEN** Fernanda Rocha transforma no #1046 as mensagens das 10:19, 10:20 e 10:21 da Equipe Financeiro
- **THEN** as três mostram a marca do #1046, a conversa ganha "Fernanda Rocha transformou 3 mensagens no chamado #1046 · 10:32", e escolher "3 mensagens" leva à das 10:19
