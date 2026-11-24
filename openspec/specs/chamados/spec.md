# chamados Specification

## Purpose
Registrar os pedidos das pessoas à TI como chamados: quem pediu, sobre o quê, quem está com ele, a conversa, o prazo e o que ele virou, para a TI saber quem está com o quê e o que vai vencer.

## Requirements

### Requirement: Chamado

O chamado SHALL ser o pedido de uma pessoa à TI. A TI o abre em nome da pessoa (requisito "Abrir um chamado pela TI"), e quem tem `chamados.pedir` o abre pelo chat, a partir de uma mensagem ou de até 20 mensagens da mesma conversa (requisito "Abrir um chamado pelo chat"). A aba dos colaboradores vem nas changes do S8.

Cada chamado SHALL ter:
- o número, sequencial na organização e separado do das solicitações e do das OS, mostrado como "#1042", que SHALL NOT se repetir nem mudar;
- o tipo, entre os tipos em uso (spec tipos-de-chamado);
- o título, de 1 a 120 caracteres;
- a pessoa que pediu, entre as pessoas ativas, e nunca um texto livre no lugar dela;
- as respostas do formulário do tipo, guardadas com o formulário como ele estava na abertura;
- o ativo ligado, opcional (requisito "Ativo ligado e campos da TI");
- os locais (requisito "Quem vê e quem atende os chamados");
- a situação e quem atende (requisito "Situação e quem atende");
- o prazo do tipo como ele estava na abertura (requisito "Prazo do chamado");
- a origem: a TI, ou o chat, com a conversa e as mensagens de onde ele foi aberto;
- quem abriu e quando: a conta da TI, ou, pelo chat, a conta e a pessoa dela.

Um chamado SHALL NOT ser apagado, nem pela API nem pelo banco com o papel da aplicação: o que não vai ser atendido é resolvido, com o que foi feito.

#### Scenario: Número seguinte
- **WHEN** o último chamado da organização é o #1042, e Ana abre outro
- **THEN** o chamado novo é o #1043, e o número não muda depois

#### Scenario: Chamado não se apaga
- **WHEN** alguém tenta apagar o #1042, pela API ou pelo banco com o papel da aplicação
- **THEN** a exclusão é recusada, e o chamado continua como estava

#### Scenario: Aberto pelo chat
- **WHEN** Fernanda Rocha transforma a mensagem das 10:19 de Paulo Nunes, na Equipe Financeiro, no #1045
- **THEN** o #1045 tem a origem no chat, com a Equipe Financeiro e a mensagem das 10:19, e Fernanda como quem abriu

#### Scenario: Aberto por várias mensagens
- **WHEN** Fernanda Rocha transforma no #1046 as mensagens das 10:19 e das 10:20 de Paulo Nunes, na Equipe Financeiro
- **THEN** o #1046 tem a origem no chat, com a Equipe Financeiro e as duas mensagens, e Fernanda como quem abriu

### Requirement: Abrir um chamado pela TI

Quem tem `chamados.atender` SHALL abrir um chamado em nome de uma pessoa ativa, com o tipo e as respostas do formulário dele (spec tipos-de-chamado, requisito "Respostas do formulário"). O chamado SHALL ser aberto só se quem abre atende os locais dele.

O título SHALL ser o montado das respostas (spec tipos-de-chamado, requisito "Título montado das respostas"), e quem abre SHALL poder trocá-lo antes de abrir.

"Fica comigo" SHALL vir ligado:
- ligado, o chamado nasce Em atendimento, com quem abriu;
- desligado, o chamado segue o atendimento do tipo (requisito "Situação e quem atende").

O chamado aberto pela TI SHALL nascer com a primeira resposta dada, porque a pessoa já falou com a TI. A abertura SHALL gravar o evento de abertura na conversa, que mostra o resumo das respostas (requisito "Conversa do chamado"). Quando o tipo gera uma solicitação, ela SHALL ser registrada na mesma transação (spec solicitacoes, requisito "Solicitação pelo chamado").

As recusas SHALL ficar no campo:
- "Escolha quem pediu." e "A pessoa escolhida está inativa. Escolha uma pessoa ativa.", na pessoa;
- "Escolha o tipo." e "O tipo escolhido não está em uso.", no tipo;
- "Escreva o título." e "Use até 120 caracteres.", no título;
- as recusas das respostas, em cada campo.

A recusa pelos locais SHALL ser "Você não atende os chamados de <local>.".

A pessoa SHALL ser buscada pelas palavras do nome, sem diferenciar os acentos e as maiúsculas, entre as pessoas ativas da organização, até 10, pela ordem do nome, com o total das que casam, para quem busca saber que há mais e afinar o termo. Cada uma SHALL vir com o nome e o local de trabalho, como o chamado a mostra a quem o vê, sem os contatos. A busca SHALL servir também a quem não tem `pessoas.ver`, e a prévia do colaborador SHALL buscar a pessoa do "Ver como" do mesmo jeito.

Os tipos que a abertura oferece SHALL ser lidos por quem tem `chamados.atender`, também sem `chamados.configurar`: os tipos Em uso, na ordem dos tipos, também os que só a TI abre, cada um com o ícone, o nome, a frase e o formulário de agora, sem o que só quem configura vê, como o prazo, quem atende por padrão e os chamados abertos do tipo.

#### Scenario: Busca da pessoa sem acesso às pessoas
- **WHEN** Diego, com `chamados.atender` e sem `pessoas.ver`, busca "marina" ao abrir um chamado
- **THEN** a busca acha Marina Rocha, com "Jundiaí › Recepção", sem os contatos, e deixa de fora as pessoas inativas e as anonimizadas

#### Scenario: Busca só pelo nome
- **WHEN** quem abre busca pela matrícula ou por uma parte do e-mail de uma pessoa
- **THEN** a busca não acha a pessoa, porque os contatos só aparecem a quem tem `pessoas.ver`

#### Scenario: Tipos da abertura sem configurar os tipos
- **WHEN** Diego, com `chamados.atender` e sem `chamados.configurar`, abre a gaveta da abertura
- **THEN** ele lê os tipos Em uso, na ordem, com o formulário de cada um, sem os rascunhos e sem os inativos

#### Scenario: Chamado pelo telefone
- **WHEN** Ana abre, em nome de Marina Lopes, um chamado de Impressora com a PAT-00139 e "Manchando, na borda", com "Fica comigo" ligado
- **THEN** o chamado nasce Em atendimento com Ana, com o título "Impressora manchando" e a primeira resposta dada, e a conversa começa pelo evento de abertura e por "Problema: Manchando, na borda · Ativo: PAT-00139"

#### Scenario: Chamado para a triagem
- **WHEN** Ana abre um chamado de um tipo sem quem atende por padrão, com "Fica comigo" desligado
- **THEN** o chamado nasce Na triagem, sem ninguém atendendo

#### Scenario: Título trocado
- **WHEN** Ana troca o título montado "Computador não liga" por "Notebook da recepção não liga" antes de abrir
- **THEN** o chamado nasce com o título que ela escreveu

#### Scenario: Pessoa de outro local
- **WHEN** Bruno, que atende só os chamados de Campinas, abre um chamado para uma pessoa que trabalha em Jundiaí
- **THEN** a abertura é recusada com "Você não atende os chamados de Jundiaí.", e nada é gravado

### Requirement: Situação e quem atende

A situação do chamado SHALL ser uma destas, sempre em texto:
- **Na triagem:** sem ninguém atendendo;
- **Em atendimento:** com alguém atendendo;
- **Aguardando o colaborador:** com alguém atendendo; a TI pediu algo à pessoa, e o relógio está parado;
- **Resolvido:** até fechar, quem participa o reabre escrevendo (requisito "Resposta da pessoa");
- **Fechado:** resolvido há 7 dias, sem reabrir; nada muda mais no chamado (requisito "Fechamento do chamado").

Com o "Fica comigo" desligado, o chamado SHALL nascer com quem atende o tipo por padrão (spec tipos-de-chamado). Ele SHALL nascer Na triagem quando:
- o tipo não tem quem atende por padrão;
- quem atende por padrão não atende os locais do chamado, ou está inativo;
- a abertura é fora do horário da TI, e o tipo diz "Se não houver ninguém: Cai na triagem".

Com "Fica com <pessoa> mesmo assim", o chamado SHALL nascer com essa pessoa, fora do horário, se ela atende os locais.

Só uma conta ativa com `chamados.atender` em todos os locais do chamado SHALL receber o chamado: ao assumir, ao ser escolhida em "Passar para" e na abertura.

A conta que deixa de atender os locais de um chamado que está com ela, porque foi desativada ou perdeu a permissão, SHALL continuar com ele até alguém o assumir ou passar. As telas SHALL dizer, junto do nome dela, "não atende mais os chamados".

#### Scenario: Aberto antes do horário
- **WHEN** um chamado de Impressora, que Diego atende por padrão, é aberto às 07:40, e o horário da TI começa às 08:00
- **THEN** o chamado nasce Na triagem, porque o tipo diz "Se não houver ninguém: Cai na triagem"

#### Scenario: Atendente padrão no horário
- **WHEN** o mesmo chamado é aberto às 10:00, com "Fica comigo" desligado
- **THEN** o chamado nasce Em atendimento com Diego, e Diego é avisado

#### Scenario: Conta desativada com chamados
- **WHEN** a conta de Renato é desativada com o #1033 Em atendimento com ele
- **THEN** o #1033 continua com Renato, as telas dizem "Renato Alves · não atende mais os chamados", e quem atende os locais dele pode assumi-lo

#### Scenario: Aberto pelo chat sem o Fica comigo
- **WHEN** Fernanda Rocha abre pelo chat um chamado de Impressora às 10:32, e o tipo não tem quem atende por padrão
- **THEN** o chamado nasce Na triagem

### Requirement: Ações do atendimento

Quem atende os locais do chamado SHALL agir nele pelas ações da tabela. Cada linha diz, para cada situação de partida, a situação de chegada, com quem o chamado fica e o relógio:

| Ação | Na triagem | Em atendimento | Aguardando o colaborador | Resolvido |
|---|---|---|---|---|
| Assumir | Em atendimento, com quem assumiu; o relógio conta | Em atendimento, com quem assumiu; o relógio conta | Aguardando, com quem assumiu; o relógio segue parado | Recusado |
| Passar para | Em atendimento, com a pessoa escolhida; o relógio conta | Em atendimento, com a pessoa escolhida; o relógio conta | Aguardando, com a pessoa escolhida; o relógio segue parado | Recusado |
| Devolver à triagem | Recusado | Na triagem, sem ninguém; o relógio conta | Recusado | Recusado |
| Enviar a mensagem | Na triagem; o relógio conta | Em atendimento; o relógio conta | Aguardando; o relógio segue parado | Recusado |
| Enviar e esperar a resposta | Aguardando, com quem enviou; o relógio para | Aguardando, com quem atendia; o relógio para | Aguardando; o relógio segue parado | Recusado |
| Nota interna | Na triagem | Em atendimento | Aguardando | Recusado |
| Retomar | Recusado | Recusado | Em atendimento, com quem atendia; o relógio volta a contar | Recusado |
| Resolver | Resolvido; o relógio para | Resolvido; o relógio para | Resolvido; o relógio segue parado | Recusado |
| Reabrir | Recusado | Recusado | Recusado | Em atendimento, com quem resolveu, se essa pessoa atende os locais; senão, Na triagem; o relógio volta a contar de onde parou |

O chamado aguardando SHALL ter sempre alguém atendendo. Por isso:
- "Enviar e esperar a resposta" num chamado Na triagem SHALL passá-lo a quem enviou, com os dois eventos na conversa;
- devolver à triagem um chamado aguardando SHALL ser recusado. Quem sai o passa a outra pessoa, que continua esperando a resposta.

A resposta pronta que espera a resposta (requisito "Respostas prontas") SHALL valer como "Enviar e esperar a resposta".

**Assumir** SHALL dar o retorno "Você assumiu o #1042." com "Desfazer". **Desfazer** SHALL voltar o chamado à situação e a quem estava com ele antes, se nenhuma ação que mude a situação ou quem atende, nem a troca do ativo, aconteceu depois do assumir. A mensagem, a nota, o título e os campos da TI SHALL NOT impedir o desfazer.

**Resolver** SHALL pedir "O que foi feito", de 1 a 2.000 caracteres, que vai à conversa como mensagem para a pessoa, e guardar quem resolveu e quando. Quem resolveu SHALL ser quem age, mesmo no chamado que está com outra pessoa: é a ela que o chamado volta ao ser reaberto. **Reabrir** SHALL limpar quem resolveu e quando.

A primeira mensagem para a pessoa SHALL cumprir o prazo da primeira resposta (requisito "Prazo do chamado"): a mensagem, com ou sem esperar a resposta, e o "O que foi feito" da resolução. A nota SHALL NOT cumpri-lo.

Cada ação SHALL gravar um evento na conversa, com quem fez e quando, como "Ana assumiu · 09:40" e "Aguardando Fernanda · 09:21 · o relógio parou". O evento do assumir SHALL dizer há quanto tempo o chamado estava na triagem, ou com quem estava, como "Ana Souza assumiu o chamado · 09:40 · estava há 2 h na triagem". O desfazer SHALL devolver também esse tempo: o chamado volta à triagem, ou a quem estava com ele, desde quando estava antes do assumir. No chamado reaberto, esse tempo SHALL contar da reabertura, e não de antes da resolução. A mensagem e a nota SHALL entrar na conversa como elas mesmas, sem evento. No chamado que já aguarda, "Enviar e esperar a resposta" SHALL valer como a mensagem, sem evento, porque nem a situação nem quem atende mudam, e o relógio segue parado desde a espera.

A ação que grava mais de uma entrada SHALL gravá-las nesta ordem:
- "Enviar e esperar a resposta" na triagem: o assumir, a mensagem e a espera;
- Resolver: o "O que foi feito" e a resolução.

As recusas SHALL ser:
- "O chamado #1042 está resolvido.", em toda ação num chamado resolvido, fora reabrir, também na mensagem e na nota;
- "O chamado #1042 já está com você.", ao assumir o chamado que já está com quem assume;
- "O chamado #1042 já está com <Nome>.", ao passar a quem já atende o chamado;
- "<Nome> não atende os chamados de <local>.", ao passar a quem não atende os locais e no desfazer para quem deixou de atendê-los;
- "Você não atende os chamados de <local>.", a quem age sem atender os locais do chamado, como na abertura;
- "O chamado #1042 já está na triagem.", ao devolver um chamado da triagem;
- "O chamado #1041 está aguardando Fernanda. Passe a outra pessoa ou retome antes de devolver.", ao devolver um chamado aguardando;
- "O chamado #1042 não está aguardando.", ao retomar;
- "O chamado #1042 não está resolvido.", ao reabrir;
- "O chamado mudou depois. Confira antes de desfazer.", no desfazer depois de outra ação;
- "O chamado #1042 mudou. Confira antes de assumir.", e o mesmo com "passar", "devolver", "retomar", "resolver" e "reabrir", na ação feita pela tela que mostrava o chamado de antes de outra ação que mudou a situação ou quem atende, ou da troca do ativo. Assim, duas pessoas não agem no mesmo chamado ao mesmo tempo sem saber, como ao passar o mesmo chamado ou ao resolver o que a outra acabou de assumir;
- "Preencha <campo> antes de resolver.", no campo só da TI obrigatório e vazio que a condição dele mostra, o primeiro na ordem do formulário, com o nome no resumo dele ou, sem ele, o rótulo sem o "?";
- "Escreva o que foi feito." e "Use até 2.000 caracteres.", na resolução.

Na recusa pelos locais, o local SHALL ser o primeiro do chamado que a conta não atende. No chamado da organização inteira, a frase SHALL dizer "os chamados da organização inteira". Nas frases, a pessoa e as contas SHALL aparecer pelo primeiro nome, como "Fernanda" e "Bruno"; a pessoa anonimizada, pelo nome inteiro, que tem o código.

#### Scenario: Assumir o estourado de outra pessoa
- **WHEN** Ana assume o #1033, que está com Renato
- **THEN** o #1033 passa a Ana, o relógio continua contando, e a conversa ganha "Ana assumiu"

#### Scenario: Desfazer logo depois
- **WHEN** Ana assume o #1042, que estava na triagem, e usa "Desfazer" no aviso
- **THEN** o #1042 volta à triagem, sem ninguém atendendo

#### Scenario: Desfazer depois de uma nota
- **WHEN** Ana assume o #1042, Diego grava uma nota nele, e Ana usa "Desfazer"
- **THEN** o #1042 volta à triagem, e a nota de Diego continua na conversa

#### Scenario: Desfazer para quem não atende mais
- **WHEN** Ana assume o #1033, que estava com Renato, a conta de Renato é desativada, e Ana usa "Desfazer"
- **THEN** o desfazer é recusado com "Renato não atende os chamados de Jundiaí.", e o #1033 continua com Ana

#### Scenario: Assumir pela tela de antes
- **WHEN** Diego passa o #1038 a Renato, e Ana, com o quadro aberto antes da mudança, assume o #1038
- **THEN** o assumir é recusado com "O chamado #1038 mudou. Confira antes de assumir.", e o #1038 fica com Renato

#### Scenario: Passar a quem não atende o local
- **WHEN** Ana tenta passar o #1038, da Sala Atlântico de Jundiaí, a Bruno, que atende só Campinas
- **THEN** a mudança é recusada com "Bruno não atende os chamados de Jundiaí.", e o chamado fica como estava

#### Scenario: Esperar a resposta na triagem
- **WHEN** Ana usa "Enviar e esperar a resposta" no #1040, de Paulo Nunes, que está na triagem
- **THEN** o #1040 passa a Aguardando o colaborador com Ana, o relógio para, e a conversa ganha "Ana assumiu", a mensagem e "Aguardando Paulo"

#### Scenario: Esperar de novo
- **WHEN** Ana usa "Enviar e esperar a resposta" no #1041, que aguarda Fernanda desde 09:21
- **THEN** a mensagem entra na conversa sem evento, e o quadro do prazo continua dizendo "Parou às 09:21"

#### Scenario: Passar o chamado que aguarda
- **WHEN** Ana passa a Diego o #1041, que aguarda Fernanda desde 09:21
- **THEN** o #1041 fica Aguardando o colaborador com Diego, e o relógio continua parado

#### Scenario: Devolver o chamado que aguarda
- **WHEN** Ana tenta devolver à triagem o #1041, que aguarda Fernanda
- **THEN** a mudança é recusada com "O chamado #1041 está aguardando Fernanda. Passe a outra pessoa ou retome antes de devolver."

#### Scenario: Resolver sem o campo da TI
- **WHEN** Diego resolve um chamado de Impressora, e o campo só da TI obrigatório "Contador de páginas" está vazio
- **THEN** a resolução é recusada com "Preencha Contador de páginas antes de resolver."

#### Scenario: Reabrir
- **WHEN** Ana reabre o #1035, que ela resolveu com 3 h contadas de 8 h
- **THEN** o #1035 volta a Em atendimento com Ana, e o relógio volta a contar das 3 h

#### Scenario: Reabrir o que foi resolvido por quem não atende mais
- **WHEN** Ana reabre o #1035, que Renato resolveu, e a conta de Renato foi desativada
- **THEN** o #1035 volta Na triagem, sem ninguém, e o relógio volta a contar

### Requirement: Conversa do chamado

A conversa SHALL ter, na ordem em que aconteceram:
- **as mensagens da TI para a pessoa,** com o texto, de 1 a 4.000 caracteres, ou só os anexos, até 5 (spec arquivos-e-imagens, requisitos "Arquivos aceitos" e "Anexos dos chamados"), com as opções de resposta (requisito "Pergunta com opções") e o cartão do ativo (requisito "Cartão do ativo na mensagem");
- **as mensagens de quem participa,** a pessoa do chamado e quem o abriu pelo chat, como as da TI, com o texto ou só os anexos (requisito "Resposta da pessoa");
- **as notas internas,** como as mensagens, com o texto ou só os anexos e com o cartão do ativo, marcadas "Só a TI vê" (requisito "Quem vê e quem atende os chamados");
- **os eventos:**
  - a abertura, com o resumo das respostas e, pelo chat, a origem;
  - as ações do atendimento, também as da pessoa;
  - a OS e a solicitação;
  - a troca do ativo;
  - a avaliação (requisito "Avaliação do atendimento");
  - o fechamento (requisito "Fechamento do chamado").

As mensagens e as notas SHALL NOT ser editadas nem apagadas. Cada uma SHALL guardar quem escreveu e quando.

A origem pelo chat SHALL mostrar a conversa de onde o chamado foi aberto, como "Aberto a partir da conversa Equipe Financeiro", e a mensagem citada, copiada na abertura, com quem a escreveu, a hora e os anexos dela. A cópia SHALL ficar no chamado, e quem vê o chamado SHALL lê-la sem participar da conversa.

O resumo das respostas SHALL juntar as respostas que a pessoa vê, na ordem do formulário, cada uma como "<nome no resumo>: <resposta>", separadas por " · ". O nome no resumo vazio vale o rótulo sem o "?" (spec tipos-de-chamado, "Formulário do tipo"). A resposta SHALL aparecer:
- no texto, numa linha só, como no título (spec tipos-de-chamado, "Título montado das respostas");
- na opção, com o texto dela;
- nas Várias opções, com os textos na ordem do campo, separados por vírgula, e a primeira letra minúscula a partir do segundo, fora quando a primeira palavra tem outra letra maiúscula, como "VPN" e "Wi-Fi";
- no local e na pessoa, com o nome;
- na data, como "12/11/2026";
- no número, com o ponto dos milhares, como "18.450";
- no anexo, como "1 arquivo" e "2 arquivos";
- no Sim ou não, com "Sim" ou "Não".

As respostas de Ativo SHALL vir por último, na ordem do formulário, com o patrimônio do ativo ou, sem ele, com o nome que as telas mostram (spec cadastro-de-ativos), também quando o campo aparece por uma condição.

A opção e o texto que aparecem por uma condição SHALL ir junto da resposta do campo da primeira cláusula da condição que vale, depois de uma vírgula e sem o nome no resumo, como "Problema: Manchando, na borda · Ativo: PAT-00139". Quando a resposta desse campo já foi junto de outra, a deles SHALL ir junto da mesma. Na opção, a primeira letra SHALL ficar minúscula, com a mesma exceção da sigla, e o texto SHALL ficar como foi escrito. O Sim ou não, o número, a data, o local, a pessoa e o anexo que aparecem por uma condição SHALL ficar na posição deles, com o nome no resumo, como "Problema: Sem acesso a um sistema · Já reiniciou: Sim", porque sem o nome não se sabe a que respondem.

O resumo SHALL ser montado na leitura do chamado, da cópia do formulário e das respostas guardadas na abertura, com os nomes de agora dos ativos, dos locais e das pessoas. As respostas do Ativo, do Local e da Pessoa guardam a referência, e não o nome. O chamado aberto pelo chat, que não pede o formulário, SHALL ter no resumo só o ativo, quando o tipo pede o ativo.

Os alertas do ativo ligado abertos depois da abertura do chamado SHALL aparecer na conversa, na hora em que abriram, a quem vê os alertas do ativo, como "Toner preto abaixo de 10% · 09:36".

A mensagem para a pessoa SHALL chegar a ela no chat (spec chat), à conta da pessoa e à de quem abriu o chamado pelo chat, quando elas usam o chat. Sem isso, a mensagem SHALL ficar no chamado, e a aba dos colaboradores a entrega nas changes do S8.

A pergunta com opções SHALL ter o texto, e o "O que foi feito" também (requisito "Ações do atendimento"). O começo da mensagem só com os anexos, nas notificações e nas listas, SHALL ser o nome do anexo, como no chat (spec chat, "Mensagem").

As recusas SHALL ser "Escreva a mensagem." (na nota, "Escreva a nota."), sem o texto e sem anexo e na pergunta com opções sem o texto, "Use até 4.000 caracteres." e "Anexe até 5 arquivos.", além das recusas dos arquivos e dos anexos. A mensagem, a nota e o "O que foi feito" SHALL perder os espaços das pontas e ser contados em caracteres, como os textos dos campos.

#### Scenario: Nota interna
- **WHEN** Ana grava a nota "A pasta é do Comercial, e não do Financeiro" no #1041
- **THEN** a conversa mostra a nota no quadro "Só a TI vê", com Ana e a hora

#### Scenario: Nota só com o print
- **WHEN** Ana grava no #1041 uma nota só com o print "erro-vpn.png", sem texto
- **THEN** a conversa mostra a nota no quadro "Só a TI vê", com o print, Ana e a hora

#### Scenario: Pergunta sem o texto
- **WHEN** Bruno manda pela API, no #1045, as opções "Pode ser" e "Daqui a meia hora" com um anexo e sem o texto
- **THEN** a mensagem é recusada com "Escreva a mensagem.", e nada é gravado

#### Scenario: Alerta do ativo na conversa
- **WHEN** o alerta "Toner preto abaixo de 10%" da PAT-00139 abre às 09:36, e o #1042, ligado a ela, foi aberto às 07:40
- **THEN** a conversa do #1042 mostra o alerta às 09:36 a quem vê os alertas da PAT-00139, e quem não os vê não o vê

#### Scenario: Sigla na resposta condicional
- **WHEN** a resposta de um campo que aparece por uma condição é a opção "VPN não conecta"
- **THEN** o resumo a junta depois da vírgula como "VPN não conecta", com a maiúscula

#### Scenario: Texto na resposta condicional
- **WHEN** a resposta de um campo que aparece por uma condição é o texto "Fernanda pediu a troca"
- **THEN** o resumo a junta depois da vírgula como "Fernanda pediu a troca", como foi escrito

#### Scenario: Sim ou não na resposta condicional
- **WHEN** o "Já reiniciou?" aparece quando o problema é "Sem acesso a um sistema", e a pessoa responde "Sim"
- **THEN** o resumo é "Problema: Sem acesso a um sistema · Já reiniciou: Sim"

#### Scenario: Origem pelo chat
- **WHEN** Bruno Lima, que não é da Equipe Financeiro, abre o #1045, aberto pela mensagem das 10:19 de Paulo Nunes
- **THEN** a conversa começa com "Aberto a partir da conversa Equipe Financeiro" e a mensagem de Paulo, com a hora

#### Scenario: Mensagem que chega ao chat
- **WHEN** Ana manda uma mensagem para Fernanda Rocha no #1041, e a conta de Fernanda usa o chat
- **THEN** a mensagem aparece na conversa do #1041 no chat de Fernanda

#### Scenario: Pessoa sem o chat
- **WHEN** Ana manda uma mensagem no #1050, de Marina Lopes, que não tem conta
- **THEN** a mensagem fica no chamado, e ninguém a recebe no chat

### Requirement: Prazo do chamado

Cada chamado SHALL ter dois prazos, copiados do tipo na abertura, em minutos:
- a primeira resposta;
- a resolução.

A cópia SHALL converter a unidade do tipo:
- a hora vale 60 min;
- o dia vale 24 h em horas corridas;
- no horário da TI, o dia útil vale o comprimento de um dia do horário na abertura, como 10 h das 8h às 18h.

O valor e a unidade do tipo SHALL ficar na cópia só para o texto, como "Prazo do tipo, 3 dias úteis, no horário da TI".

Cada prazo SHALL contar de um destes modos:
- **em horas corridas:** todo o tempo conta;
- **no horário da TI:** só o tempo dentro dos dias e das horas do horário da TI, no fuso dele (requisito "Horário da TI").

O relógio SHALL:
- começar na abertura;
- parar enquanto o chamado está Aguardando o colaborador;
- parar com o chamado Resolvido;
- voltar a contar de onde parou ao retomar e ao reabrir.

O prazo da primeira resposta SHALL valer até a primeira mensagem da TI para a pessoa. O chamado aberto pela TI SHALL nascer com ele cumprido.

O tempo contado SHALL ser o do relógio, e não a idade do chamado, contado ao segundo. O vencimento SHALL ser o momento em que o tempo contado alcança o prazo. Com o relógio parado, o chamado SHALL NOT ter vencimento e SHALL mostrar o que resta do prazo ou, se já passou dele, quanto passou, no tempo do relógio.

Uma mudança no prazo do tipo SHALL valer só para os chamados abertos depois dela. Uma mudança no horário da TI SHALL valer daí em diante: o tempo já contado e o prazo em minutos dos chamados abertos SHALL NOT mudar.

O prazo de um chamado em aberto SHALL ser dito em texto:
- "vence em 2 h";
- "estourado há 20 min";
- "relógio parado".

O texto SHALL arredondar para baixo:
- a partir de 48 h, em dias inteiros, como "vence em 2 dias";
- de 1 h a 48 h, em horas inteiras;
- de 1 min a 1 h, em minutos inteiros;
- abaixo de 1 min, "menos de 1 min", como em "vence em menos de 1 min".

O texto SHALL dizer a distância no relógio comum, de agora até o vencimento, e não o tempo do prazo que resta. No horário da TI, o chamado que vence no dia seguinte diz quanto falta até lá. O chamado SHALL estar estourado a partir do vencimento.

O chamado reaberto ou retomado que já tinha passado do prazo SHALL vencer quando o relógio volta a contar.

Enquanto a primeira resposta não for dada, o chamado SHALL ter também o momento em que o tempo contado alcança o prazo dela, e se esse momento já passou.

#### Scenario: Horas corridas
- **WHEN** o #1033, de Rede e internet, com 8 h corridas, abriu às 01:20, e são 09:40
- **THEN** o prazo diz "estourado há 20 min"

#### Scenario: Horário da TI
- **WHEN** o #1042, de Impressora, com 8 h no horário da TI das 8h às 18h, abriu às 07:40, e são 09:40
- **THEN** o tempo contado é 1 h 40 min, das 08:00, o vencimento é às 16:00, e o prazo diz "vence em 6 h"

#### Scenario: Parado depois do prazo
- **WHEN** o #1033, estourado há 20 min, passa a Aguardando Sandra às 09:40
- **THEN** o chamado fica sem vencimento, e o quadro do prazo diz "Relógio parado · Parou às 09:40 · passou 20 min do prazo"

#### Scenario: Relógio parado
- **WHEN** o #1041, de Acesso e senha, com 4 h no horário da TI, tem 2 h 16 min contadas e passou a Aguardando o colaborador às 09:21
- **THEN** o chamado não tem vencimento, e o quadro do prazo diz "Relógio parado · Parou às 09:21 · restam 1 h 44 min"

#### Scenario: Vencimento no dia seguinte
- **WHEN** um chamado de Impressora, com 8 h no horário da TI das 8h às 18h, tem 1 h de prazo restante às 17:30
- **THEN** o vencimento é no dia seguinte às 08:30, e o prazo diz "vence em 15 h"

#### Scenario: Primeira resposta atrasada
- **WHEN** o #1042, de Impressora, com 30 min para a primeira resposta no horário da TI, abriu às 07:40, ninguém da TI escreveu a Marina, e são 09:40
- **THEN** a primeira resposta está atrasada desde as 08:30

#### Scenario: Dia útil
- **WHEN** um tipo resolve em 3 dias úteis, no horário da TI das 8h às 18h de segunda a sexta, e o chamado abre na sexta às 17:00
- **THEN** o prazo do chamado é de 30 h, e o vencimento é na quarta às 17:00, sem o sábado e o domingo

#### Scenario: Dia útil mudado depois da abertura
- **WHEN** o chamado de 3 dias úteis abriu no horário das 8h às 18h, com 30 h de prazo, e o horário passa a ser das 8h às 17h
- **THEN** o chamado continua com 30 h, agora contadas até as 17:00 de cada dia, e o de 3 dias úteis aberto depois tem 27 h

#### Scenario: Prazo do tipo mudado
- **WHEN** o prazo da Impressora passa de 8 h para 6 h, e o #1042 já estava aberto
- **THEN** o #1042 continua com 8 h, e o chamado de Impressora aberto depois tem 6 h

### Requirement: Horário da TI

A organização SHALL ter um horário da TI, com:
- os dias da semana, ao menos um;
- a hora de início e a de fim, das 00:00 às 23:59, as mesmas em todos os dias;
- o fuso;
- a carga cheia: o número de chamados abertos que enche a barra de carga de uma pessoa, um inteiro de 1 a 20.

O padrão SHALL ser de segunda a sexta, das 08:00 às 18:00, no fuso de São Paulo, com a carga cheia de 5. Quem tem `chamados.configurar` SHALL mudá-lo.

As recusas SHALL ser:
- "Escolha ao menos um dia.";
- "O fim vem depois do início.";
- "Escolha um fuso da lista.";
- "Use um número inteiro de 1 a 20.".

#### Scenario: Horário mudado com chamados abertos
- **WHEN** quem configura muda o fim do horário das 18:00 para as 17:00, às 11:00, com o #1042 contando no horário da TI
- **THEN** o tempo contado do #1042 até as 11:00 fica como estava, e o vencimento passa a contar até as 17:00 de cada dia

### Requirement: Prazo estourado

Uma verificação a cada minuto SHALL achar os chamados em aberto, com o relógio contando, que passaram do vencimento da resolução. Cada um SHALL ser avisado uma vez:
- a quem atende o chamado, se essa conta ainda atende os locais dele;
- na triagem, ou com uma conta que não atende mais os locais, a cada conta que atende os locais dele.

O aviso SHALL voltar a valer para o chamado reaberto. O chamado com o relógio parado SHALL NOT ser avisado enquanto parado. Com o módulo Chamados desligado, a verificação SHALL pular a organização; ao religar, o chamado que passou do prazo nesse tempo SHALL ser avisado.

#### Scenario: Estourado avisado uma vez
- **WHEN** o #1033, com Renato, passa do vencimento às 09:20, e a verificação roda às 09:20 e às 09:21
- **THEN** Renato recebe um aviso só, "Chamado #1033 passou do prazo: Wi-Fi cai na Sala Atlântico"

#### Scenario: Estourado na triagem
- **WHEN** o #1040, na triagem, de Campinas, passa do vencimento
- **THEN** cada conta que atende os chamados de Campinas recebe "Chamado #1040 passou do prazo", com o título dele, e quem atende só Jundiaí não recebe nada

#### Scenario: Reaberto depois do aviso
- **WHEN** o #1033, já avisado do estouro, é resolvido e depois reaberto por Renato
- **THEN** o #1033 volta a contar já vencido, e a verificação seguinte avisa Renato de novo

### Requirement: Ativo ligado e campos da TI

O ativo ligado SHALL nascer da resposta do primeiro campo Ativo do formulário, quando há, e depois SHALL mudar só pela troca do ativo: as respostas guardam o que foi dito na abertura. Quem atende os locais do chamado SHALL poder ligar um ativo, trocá-lo ou tirá-lo, entre os ativos ativos que vê. A mudança SHALL recalcular os locais do chamado, com o local de trabalho da pessoa na abertura e o do ativo novo, subir a versão e gravar o evento na conversa.

Quem muda o ativo SHALL atender também os locais novos. Se quem está com o chamado não atende os locais novos, ou está inativo, a mudança SHALL ser recusada com "<Nome> não atende os chamados de <local>. Passe o chamado antes de trocar o ativo.". A troca pela tela de antes de outra ação SHALL ser recusada com "O chamado #1042 mudou. Confira antes de trocar o ativo.".

Quem atende SHALL poder:
- preencher e mudar os campos só da TI do formulário do chamado. Os campos que a pessoa vê SHALL NOT mudar depois da abertura. O campo que some pela condição SHALL perder a resposta, como na abertura;
- trocar o título, de 1 a 120 caracteres, com as recusas da abertura.

As recusas dos campos SHALL ser as das respostas do formulário (spec tipos-de-chamado). Num chamado resolvido, a troca do ativo, do título e dos campos da TI SHALL ser recusada com "O chamado #1042 está resolvido.". Escolher o ativo que já está ligado, tirar o ativo do chamado que não tem e gravar o mesmo título ou as mesmas respostas SHALL NOT mudar nada.

A troca do título e dos campos da TI SHALL NOT subir a versão nem ir à conversa; a auditoria a registra.

O chamado SHALL trazer a quem o vê, com o módulo Ativos ligado, o resumo do ativo ligado, também sem `ativos.ver`:
- a disponibilidade e os suprimentos, cada um com o nível, como a ficha do ativo os mostra, com o que é restrito, como o IP no motivo, só a quem vê os campos restritos no local do ativo;
- o total de páginas e, com pelo menos 7 dias de leituras do contador nos últimos 90, a média de páginas por mês;
- a quem vê os alertas no local do ativo, se ele tem um alerta do toner aberto na severidade Crítico, que a tela mostra como "Toner crítico", com o limite da regra de alerta da organização;
- a quem vê as OS no local do ativo, quantas OS do ativo estão em aberto e quantas foram concluídas no ano, no fuso do horário da TI;
- a quem vê o estoque, os consumíveis compatíveis com o modelo, cada um com o saldo e o mínimo somados nos locais em que a conta vê o estoque e se algum desses locais está abaixo do mínimo;
- a quem a vê, a solicitação de Toner pendente da impressora, a que o "Pedir toner" juntaria o chamado.

Com o módulo Operação desligado, as OS, o saldo e a solicitação SHALL ficar de fora, como a quem não os vê; com o módulo Alertas desligado, o alerta do toner.

#### Scenario: Resumo do ativo sem acesso aos ativos
- **WHEN** Diego, sem `ativos.ver`, abre o #1042, da PAT-00139, com o toner preto em 8% e 12.500 páginas
- **THEN** o resumo traz o toner preto em 8% e as 12.500 páginas, e não traz as OS, o saldo nem a solicitação, que ele não vê

#### Scenario: Toner crítico pelo alerta do toner
- **WHEN** Ana abre o #1042, da PAT-00139, com o alerta "Toner em 10% ou menos", Crítico, aberto às 09:36
- **THEN** o resumo diz que o toner está crítico, o que não diria com o alerta já resolvido ou só na Atenção

#### Scenario: Resumo do ativo com o estoque e a solicitação
- **WHEN** quem vê o estoque e as solicitações abre o #1042, com o CF258A em 3 de 6 e a solicitação 4 de Toner pendente na PAT-00139
- **THEN** o resumo traz o CF258A com o saldo 3 e o mínimo 6, e a solicitação 4 com a situação dela

#### Scenario: Ativo de outro local
- **WHEN** Ana liga ao #1040, de uma pessoa de Jundiaí, uma impressora de Campinas
- **THEN** os locais do #1040 passam a ser Jundiaí e Campinas, e só quem atende os dois pode atendê-lo

#### Scenario: Ativo que tira o chamado de quem atende
- **WHEN** Ana tenta ligar uma impressora de Campinas ao #1038, que está com Renato, que atende só Jundiaí
- **THEN** a mudança é recusada com "Renato não atende os chamados de Campinas. Passe o chamado antes de trocar o ativo."

#### Scenario: Ativo tirado depois de a pessoa mudar de local
- **WHEN** Ana tira a impressora de Campinas do #1040, aberto quando a pessoa trabalhava em Jundiaí, que depois passou a trabalhar em Itu
- **THEN** o #1040 volta a ser só de Jundiaí, o local da pessoa na abertura

#### Scenario: Campo da TI preenchido
- **WHEN** Diego preenche o Contador de páginas do #1042 com 48210
- **THEN** o campo fica com 48210, e a auditoria guarda o antes e o depois

#### Scenario: Anexo tirado de um campo da TI
- **WHEN** Diego tira a foto do campo "Foto da peça" do #1042
- **THEN** a foto é removida na hora, e a auditoria guarda "1 arquivo" antes e nada depois

### Requirement: Quem vê e quem atende os chamados

Os locais do chamado SHALL ser:
- o local de trabalho da pessoa na abertura, que SHALL NOT mudar com a pessoa;
- o local do ativo ligado, quando há.

A pessoa sem local de trabalho, ou o ativo ligado sem local, SHALL dar ao chamado o alcance da organização inteira.

Quem tem `chamados.ver` num dos locais do chamado SHALL vê-lo. Quem tem `chamados.atender` em todos os locais SHALL atendê-lo. O chamado da organização inteira SHALL pedir a permissão na organização inteira.

A API SHALL repetir essas verificações em cada rota. O chamado que a conta não vê SHALL responder como inexistente.

O chamado SHALL mostrar a quem o vê o nome e o local de trabalho da pessoa que pediu, porque o pedido é dela. Os contatos da pessoa e o atalho para a ficha dela SHALL aparecer só a quem tem `pessoas.ver` no local dela. A pessoa anonimizada SHALL aparecer como "Pessoa anonimizada" com o código (spec administracao-de-pessoas), sem os contatos e sem o atalho, e o chamado SHALL continuar como estava. O título, as respostas de texto, as mensagens e o motivo da solicitação SHALL ficar como foram escritos, mesmo com o nome da pessoa: a anonimização troca a referência à pessoa, e não o texto livre. A resposta de um campo Pessoa é uma referência: no resumo das respostas, a pessoa anonimizada SHALL aparecer com o nome anonimizado, como no chamado.

A nota interna, o campo só da TI e os anexos dos dois SHALL ir só a quem vê o chamado com `chamados.ver`, e nunca pela leitura que a pessoa terá do próprio chamado, no chat e na aba.

#### Scenario: Ver sem atender
- **WHEN** Carla tem `chamados.ver` em Jundiaí e abre o #1042, de Jundiaí
- **THEN** ela vê o chamado e a conversa, com as notas, sem os botões de atender

#### Scenario: Chamado de outra unidade
- **WHEN** Bruno, que vê só os chamados de Campinas, abre o endereço do #1042, de Jundiaí
- **THEN** a tela diz que o chamado não foi encontrado

#### Scenario: Técnico sem acesso às pessoas
- **WHEN** Diego, com `chamados.atender` e sem `pessoas.ver`, abre o #1042, de Marina Lopes
- **THEN** o chamado mostra "Marina Lopes" e o local dela, sem os contatos e sem o atalho da ficha

#### Scenario: Pessoa anonimizada
- **WHEN** Marina Lopes, já inativa, é anonimizada depois de resolvido o #1042
- **THEN** o #1042 mostra "Pessoa anonimizada" com o código, sem os contatos, também a quem tem `pessoas.ver`, e o título, as respostas de texto e as mensagens ficam como foram escritos

#### Scenario: Pessoa anonimizada no resumo
- **WHEN** Marina Lopes, a resposta do "Quem vai usar?" do #1050, é anonimizada
- **THEN** o resumo das respostas do #1050 mostra o nome anonimizado dela, com o código, no "Quem vai usar"

### Requirement: Respostas prontas

Quem tem `chamados.configurar` SHALL cadastrar as respostas prontas, até 100 na organização. Cada uma SHALL ter:
- o rótulo, de 1 a 60 caracteres, único na organização;
- o texto, de 1 a 2.000 caracteres, em que `{nome}` vira o primeiro nome da pessoa do chamado;
- "Espera a resposta": ligado, mandar a resposta põe o chamado em Aguardando o colaborador;
- as opções de resposta, opcionais, de 2 a 3, cada uma de 1 a 40 caracteres e única na resposta (requisito "Pergunta com opções");
- os tipos em que ela aparece, entre os Em uso e os Inativos, ou todos;
- a ordem.

Quem atende SHALL usar uma resposta pronta no campo de escrever, e mudar o texto e as opções antes de mandar.

As recusas SHALL ser:
- "Escreva o rótulo.", "Use até 60 caracteres." e "Já existe uma resposta pronta com esse rótulo.", no rótulo;
- "Escreva o texto." e "Use até 2.000 caracteres.", no texto;
- "Use de 2 a 3 opções.", "Escreva a opção.", "Use até 40 caracteres." e "As opções precisam ser diferentes.", nas opções;
- "Escolha os tipos da lista.", nos tipos;
- "A organização já tem 100 respostas prontas.".

#### Scenario: Pedir o print
- **WHEN** Ana usa "Pedir o print do erro", que espera a resposta, no #1041 de Fernanda Rocha, e manda
- **THEN** a mensagem chega à conversa com "Fernanda" no lugar de `{nome}`, e o #1041 passa a Aguardando o colaborador

#### Scenario: Resposta pronta com opções
- **WHEN** Bruno usa "Passo aí", com o texto "Passo aí em 10 minutos. Pode ser?" e as opções "Pode ser", "Daqui a meia hora, por favor" e "Estou em reunião, volte às 14h", no #1045
- **THEN** a mensagem chega à conversa com as três opções em botões

### Requirement: Carga de cada pessoa

As pessoas da TI SHALL ser:
- as contas ativas com `chamados.atender` em algum local;
- as contas com chamados abertos que não atendem mais os chamados (requisito "Situação e quem atende"), com "não atende mais os chamados".

A carga de cada pessoa SHALL contar só os chamados que a conta que olha vê:
- os chamados Em atendimento e Aguardando o colaborador com ela, como "2 abertos", "1 aberto" e "0 abertos";
- o mais antigo deles, pela abertura, como "mais antigo #1041, há 17 h";
- a barra em tantos pedaços quanto a carga cheia, um por chamado, cheia a partir dela;
- os chamados que ela resolveu hoje, como "Resolveu hoje: #1035", ou "Nada resolvido hoje". Com mais de três, SHALL listar os três primeiros pelo número, como "Resolveu hoje: #1031, #1033, #1035 e mais 2".

As colunas das pessoas SHALL seguir os nomes em ordem alfabética, e as de quem não atende mais os chamados SHALL vir depois das outras, também pelo nome.

O chamado aberto que está com uma conta que não o atende mais, porque ela foi desativada ou perdeu a permissão nos locais dele, SHALL ficar na coluna dela de quem não atende mais os chamados, mesmo quando ela ainda atende outros locais. O resolvido hoje SHALL ficar na coluna de pessoa da TI da conta que resolveu ou, sem ela, na de quem não atende mais; sem nenhuma das duas, SHALL contar só na contagem do Início.

Quem não vê os chamados da organização inteira SHALL ler "Contando só os chamados dos locais que você vê." junto das contagens.

O hoje SHALL ser o dia do fuso da conta que olha.

#### Scenario: Carga acima da cheia
- **WHEN** Diego tem 7 chamados abertos, e a carga cheia é 5
- **THEN** a barra de Diego fica cheia, e o texto diz "7 abertos"

#### Scenario: Carga de quem vê um local só
- **WHEN** Bruno, que vê só os chamados de Campinas, abre "Quem está com o quê", e Diego tem 2 chamados de Campinas e 5 de Jundiaí
- **THEN** a coluna de Diego diz "2 abertos", e a tela diz "Contando só os chamados dos locais que você vê."

#### Scenario: Quem perdeu um dos locais
- **WHEN** Renato, que atendia Campinas e Jundiaí, perde Jundiaí, com o #1033, de Jundiaí, e o #1036, de Campinas, com ele
- **THEN** a coluna de Renato tem o #1036, e a coluna "Renato Alves · não atende mais os chamados", depois das outras, tem o #1033

### Requirement: OS e solicitação pelo chamado

Quem atende o chamado SHALL poder:
- **virar OS:** com o ativo ligado, no tipo que pode virar OS (spec ordens-de-servico, requisito "OS pelo chamado");
- **pedir toner:** com uma impressora ligada (spec solicitacoes, requisito "Solicitação pelo chamado").

O chamado SHALL mostrar a OS e a solicitação ligadas, com a situação de cada uma, a quem as vê. Cada uma SHALL gravar o evento na conversa, como "Virou a OS 12" e "Juntou-se à solicitação 4".

Virar OS e pedir toner SHALL NOT mudar a situação do chamado, quem atende nem os locais, e o evento deles SHALL NOT subir a versão. Num chamado resolvido, os dois SHALL ser recusados com "O chamado #1042 está resolvido.". Com o módulo Operação desligado, os dois SHALL ser recusados como as rotas do módulo desligado.

A troca do ativo SHALL NOT mudar a OS nem a solicitação ligadas: elas seguem no ativo em que nasceram, e o chamado continua ligado a elas.

#### Scenario: Desfazer depois de virar OS
- **WHEN** Ana assume o #1042, usa "Virar OS" e desfaz o assumir
- **THEN** o #1042 volta à triagem, continua ligado à OS, e a conversa guarda "Virou a OS 13"

#### Scenario: Troca do ativo depois da OS
- **WHEN** Ana troca o ativo do #1042, que virou a OS 13 na PAT-00139, pela PAT-00200
- **THEN** o #1042 fica com a PAT-00200 e ligado à OS 13, que continua na PAT-00139

#### Scenario: Pedir toner com uma solicitação pendente
- **WHEN** Ana usa "Pedir toner" no #1042, com a PAT-00139, que já está na solicitação 4, Aberta
- **THEN** o #1042 fica ligado à solicitação 4, nenhuma solicitação nova é registrada, e a conversa ganha "Juntou-se à solicitação 4"

### Requirement: Notificações dos chamados

Os chamados SHALL notificar pela notificação da plataforma (spec notificacoes), com a origem "Chamados" e o endereço do chamado:
- **o chamado passado a uma conta,** por outra pessoa ou pelo atendimento do tipo, e o reaberto por outra pessoa, também pela pessoa do chamado, que volta a quem o resolveu, a essa conta, na severidade Informação: "Chamado #1043 com você: Impressora manchando";
- **o chamado que cai na triagem,** a cada conta que atende os locais dele, fora quem abriu, devolveu ou reabriu, na severidade Informação: "Chamado #1043 na triagem: Impressora manchando";
- **o prazo estourado** (requisito "Prazo estourado"), na severidade Atenção;
- **a resposta da pessoa,** a mensagem ou a escolha de quem participa do chamado (requisito "Resposta da pessoa"), a quem atende o chamado, na severidade Informação: "Fernanda Rocha respondeu o #1041", com o começo da mensagem ou a opção escolhida. O chamado na triagem SHALL NOT notificar a resposta: ele já está na lista da triagem.

No chat (spec chat), os chamados SHALL notificar como mensagem, na severidade Informação, com a origem "Chamados" e o endereço do chamado no app do chat, a conta da pessoa e a de quem abriu o chamado pelo chat, quando usam o chat, fora quem participa pela TI (requisito "Quem atende pelo chat"), que recebe só as da TI:
- **a mensagem da TI para a pessoa:** "Ana Souza respondeu o #1041", com o começo da mensagem;
- **o resolvido:** "#1045 resolvido: Impressora manchando", com o começo do "O que foi feito".

O começo SHALL ter até 120 caracteres, cortado no fim de uma palavra, com reticências quando foi cortado. Na mensagem só com os anexos, ele SHALL ser o nome do anexo (requisito "Conversa do chamado"). As outras ações SHALL NOT notificar a pessoa: ela as vê na conversa. A nota interna SHALL NOT notificar ninguém.

Quem assume, reabre ou abre o chamado com "Fica comigo" SHALL NOT ser notificado do próprio ato, e quem escreve SHALL NOT ser notificado da própria mensagem, também a conta da TI que é a pessoa do chamado. O desfazer SHALL NOT notificar: ele devolve o chamado a quem estava com ele, ou à triagem, e o assumir não avisou ninguém de que ele saiu. Retomar e resolver SHALL NOT notificar a TI: quem atende não muda, e nada cai na triagem. Pelo mesmo motivo, a troca do ativo, do título e dos campos da TI SHALL NOT notificar.

#### Scenario: Passado a Renato
- **WHEN** Ana passa o #1038 a Renato
- **THEN** Renato recebe "Chamado #1038 com você: Wi-Fi cai na Sala Atlântico", e Ana não recebe nada

#### Scenario: Desfazer sem aviso
- **WHEN** Ana assume o #1033, que estava com Renato, e desfaz
- **THEN** o #1033 volta a Renato, e nem Renato nem Ana recebem a notificação

#### Scenario: Reaberto por outra pessoa
- **WHEN** Diego reabre o #1035, que Ana resolveu
- **THEN** o #1035 volta a Ana, que recebe "Chamado #1035 com você", com o título dele, e Diego não recebe nada

#### Scenario: Resposta da TI no chat
- **WHEN** Ana manda a Fernanda Rocha, no #1041, "Não achei uma pasta com esse nome na sua conta. Confirme o nome exato, por favor."
- **THEN** Fernanda recebe "Ana Souza respondeu o #1041", com o começo da mensagem, e o endereço abre o #1041 no chat

#### Scenario: Resposta da pessoa
- **WHEN** Fernanda Rocha escolhe "Pode ser" na pergunta de Bruno no #1045, que está com ele
- **THEN** Bruno recebe "Fernanda Rocha respondeu o #1045", com "Pode ser"

#### Scenario: Quem participa pela TI não é avisada como quem pediu
- **WHEN** Ana Souza passa a Diego o #1050, que ela abriu no nome de Paulo Nunes, e Diego escreve a Paulo e depois o resolve
- **THEN** Paulo recebe "Diego Martins respondeu o #1050" e "#1050 resolvido: Sala sem rede", e Ana não recebe nenhuma das duas

### Requirement: Permissões, auditoria e eventos dos chamados

O catálogo SHALL ter, na área "Chamados":
- `chamados.ver`: "Ver os chamados, com as notas internas", por local, pelos locais do chamado;
- `chamados.atender`: "Abrir, assumir, passar, responder e resolver os chamados", por local, incluindo `chamados.ver`;
- `chamados.configurar`: "Configurar os tipos de chamado, o formulário, as respostas prontas e o horário da TI", na organização;
- `chamados.pedir`: "Pedir chamados pelo chat, em nome de si ou de outra pessoa", na organização.

O perfil Administrador SHALL ter as quatro.

A pessoa do chamado e quem o abriu pelo chat SHALL ler, responder, reabrir e avaliar o próprio chamado sem nenhuma dessas permissões, enquanto usam o chat (requisito "Leitura do chamado pela pessoa"). Quem participa pela TI SHALL ler o chamado pelo chat e responder, reabrir e agir nele como a TI, com `chamados.atender` (requisito "Quem atende pelo chat").

A auditoria SHALL registrar:
- **nos chamados:**
  - a abertura, pela TI e pelo chat, com quantas mensagens a abertura pelo chat cita;
  - assumir, desfazer, passar, devolver à triagem, aguardar, retomar, resolver e reabrir, também pelo chat, e o retomar e o reabrir pela pessoa;
  - a troca do título, dos campos da TI e do ativo;
  - a OS e a solicitação;
- **nos ajustes:**
  - os tipos: criados, alterados, reordenados, inativados, reativados e descartados;
  - o formulário salvo;
  - as respostas prontas;
  - o horário da TI.

Cada registro SHALL ter o "antes → depois" do que mudou. O "Enviar e esperar a resposta" na triagem, que assume o chamado e o põe em Aguardando, SHALL ser um registro só, o do aguardar, com quem passou a atender no "antes → depois"; no chamado que já aguarda, ele é só a mensagem. O alvo SHALL ser o chamado com o número e o título como estão agora, como "#1042 · Impressora manchando". Nos ajustes, o alvo SHALL ser o tipo pelo nome de agora e a resposta pronta pelo rótulo de agora. O Rascunho descartado e a resposta pronta removida SHALL ficar sem o nome no alvo, e o registro do descarte e o da remoção guardam o nome e o rótulo no antes. As mensagens, as notas, as escolhas e as avaliações SHALL NOT ir para a auditoria: a conversa as guarda, com quem escreveu e quando. O fechamento SHALL NOT ir para a auditoria: ninguém o faz, e a conversa o mostra.

Os eventos em tempo real (spec eventos-em-tempo-real) SHALL ser:
- `chamados.mudaram`, quando um chamado abre, muda, ganha uma mensagem, uma escolha ou uma avaliação, ou fecha, a quem vê os chamados nos locais dele, os de antes e os de depois, e às sessões da pessoa do chamado e de quem o abriu pelo chat;
- `ajustes-dos-chamados.mudaram`, quando um tipo, o formulário, uma resposta pronta ou o horário da TI muda, a quem tem uma das permissões dos chamados. Como o horário muda os relógios dos chamados abertos, as telas dos chamados SHALL se atualizar também com ele.

Os eventos SHALL NOT levar o título, o texto nem o nome da pessoa.

#### Scenario: Conta sem a permissão
- **WHEN** uma conta sem `chamados.atender` tenta assumir o #1042 pela API
- **THEN** a API responde 403, e nada é gravado

#### Scenario: Passar na auditoria
- **WHEN** Ana passa o #1038 a Renato
- **THEN** a auditoria registra "#1038 · Wi-Fi cai na Sala Atlântico", com quem atendia antes e depois, Ana e o momento

#### Scenario: Título trocado na auditoria
- **WHEN** Ana troca o título do #1042 de "Impressora manchando na borda" para "Impressora manchando"
- **THEN** a abertura e a troca do título aparecem na auditoria com o alvo "#1042 · Impressora manchando"

#### Scenario: Rascunho descartado na auditoria
- **WHEN** quem configura cria um Rascunho, o salva com o nome "Scanner" e o descarta
- **THEN** os três registros dele ficam sem o nome no alvo, e o do descarte guarda "Scanner" no antes

#### Scenario: Reaberto pela pessoa na auditoria
- **WHEN** Fernanda Rocha escreve no #1045 resolvido, e ele volta a Bruno
- **THEN** a auditoria registra o reabrir do "#1045 · Impressora manchando", com Fernanda, a situação e quem atende antes e depois

#### Scenario: Evento à pessoa
- **WHEN** Ana manda uma mensagem no #1041 de Fernanda Rocha
- **THEN** as sessões de Fernanda recebem `chamados.mudaram`, sem o texto, e o chat dela relê o #1041

#### Scenario: Assumir pelo chat na auditoria
- **WHEN** Ana Souza assume pelo chat o #1050, que ela abriu no nome de Paulo Nunes
- **THEN** a auditoria registra o assumir do "#1050 · Sala sem rede", com Ana, a situação e quem atende antes e depois, como pelo Chamados

### Requirement: Abrir um chamado pelo chat

Quem tem `chamados.pedir` e usa o chat, com os módulos Chat e Chamados ligados, SHALL abrir um chamado a partir de uma mensagem, ou de até 20 mensagens da mesma conversa, de uma conversa direta, de uma equipe ou de um canal de que participa, de quem quer que as tenha escrito, também a própria. A mensagem que já virou chamado SHALL NOT virar outro, nem junto com outras mensagens (spec chat, "Chamados da conversa").

O chamado SHALL guardar a cópia de cada mensagem citada, na ordem da conversa, com quem a escreveu, a hora, o texto e os anexos, como estavam na abertura.

A abertura SHALL pedir:
- **o tipo,** entre os Em uso com "Aparece para o colaborador" e sem "Só a TI abre" (spec tipos-de-chamado, "Quem vê o tipo"), na ordem dos tipos;
- **o título,** de 1 a 120 caracteres;
- **o ativo,** só no tipo que pede o ativo (spec tipos-de-chamado, "O que acontece depois"), entre os sugeridos pelo primeiro campo Ativo do formulário, com os tipos de ativo dele: os sob a responsabilidade da pessoa e os do local de trabalho dela. O primeiro sugerido SHALL vir escolhido;
- **"No nome de":** a pessoa da conta que abre, que se troca por outra pessoa ativa (spec administracao-de-pessoas, "Nomes das pessoas para a escolha"). Os ativos sugeridos SHALL seguir a pessoa escolhida.

Para a escolha, quem abre SHALL ler só o identificador, o nome e o patrimônio dos ativos sugeridos, sem `ativos.ver`.

O formulário do tipo SHALL NOT ser pedido: as mensagens citadas descrevem o pedido. As respostas SHALL ficar vazias, fora a do primeiro campo Ativo, que é o ativo escolhido, e os campos obrigatórios SHALL NOT barrar a abertura.

O chamado SHALL nascer como na abertura pela TI, sem o "Fica comigo": com o número, os locais, a situação e quem atende pelo tipo, o prazo e a solicitação do tipo que gera uma. A pessoa escolhida em "No nome de" é a pessoa do chamado, e a conta que abre é quem abriu.

As recusas SHALL ser:
- "Escolha o tipo." e "Esse tipo não está disponível para abrir pelo chat.", no tipo;
- "Escreva o título." e "Use até 120 caracteres.", no título;
- "Escolha o ativo.", "Escolha um ativo da lista." e, sem nenhum sugerido, "Nenhum ativo desse tipo está com <pessoa> ou no local dela. Escolha outro tipo ou escreva à TI.", no ativo;
- "Escolha a pessoa.", em "No nome de";
- "Escolha as mensagens.", sem nenhuma mensagem, e "Escolha até 20 mensagens.", com mais de 20;
- "Esta mensagem já virou o chamado #1045." e, com várias mensagens, "Uma das mensagens já virou o chamado #1045.";
- "A mensagem não foi encontrada.", na mensagem de uma conversa de que a conta não participa e na de outra conversa.

#### Scenario: Transformar a mensagem do Paulo
- **WHEN** Fernanda Rocha transforma a mensagem das 10:19 de Paulo Nunes, escolhe Impressora, escreve "Impressora manchando" e fica com a PAT-00137 sugerida, no nome dela
- **THEN** o #1045 nasce com Fernanda como pessoa e como quem abriu, a PAT-00137 ligada e a mensagem de Paulo na origem

#### Scenario: No nome de outra pessoa
- **WHEN** Fernanda Rocha abre pelo chat um chamado de Computador no nome de Carla Dias
- **THEN** a pessoa do chamado é Carla, quem abriu é Fernanda, os ativos sugeridos são os de Carla, e as duas leem o chamado no chat

#### Scenario: Tipo que pede o ativo sem nenhum sugerido
- **WHEN** Fernanda Rocha escolhe Telefone, que pede o ativo, e nenhum telefone está com ela ou no local dela
- **THEN** a abertura é recusada com "Nenhum ativo desse tipo está com Fernanda Rocha ou no local dela. Escolha outro tipo ou escreva à TI."

#### Scenario: Tipo só da TI
- **WHEN** Fernanda Rocha pede pela API um chamado de Troca de equipamento, que só a TI abre
- **THEN** a abertura é recusada com "Esse tipo não está disponível para abrir pelo chat.", e nada é gravado

#### Scenario: Três mensagens num chamado
- **WHEN** Fernanda Rocha transforma no #1046 a mensagem dela das 10:21 e as de Paulo Nunes das 10:19 e das 10:20, da Equipe Financeiro, marcadas nessa ordem
- **THEN** o #1046 cita as três na ordem da conversa, 10:19, 10:20 e 10:21, cada uma com quem escreveu, a hora, o texto e os anexos

#### Scenario: Mais de 20 mensagens
- **WHEN** Fernanda Rocha pede pela API um chamado com 21 mensagens da Equipe Financeiro
- **THEN** a abertura é recusada com "Escolha até 20 mensagens.", e nada é gravado

#### Scenario: Uma das mensagens já virou chamado
- **WHEN** Tatiana Ramos pede pela API um chamado com a mensagem das 10:19, que já virou o #1045, e outras duas
- **THEN** a abertura é recusada com "Uma das mensagens já virou o chamado #1045.", e nada é gravado

#### Scenario: Mensagem de outra conversa
- **WHEN** Fernanda Rocha pede pela API um chamado da Equipe Financeiro com uma mensagem da conversa direta dela com Paulo Nunes
- **THEN** a abertura é recusada com "A mensagem não foi encontrada.", e nada é gravado

### Requirement: Leitura do chamado pela pessoa

Participam do chamado, além da TI, a pessoa do chamado e quem o abriu pelo chat, quando usam o chat (spec chat, "Quem usa o chat"). Elas SHALL ler o chamado sem `chamados.ver`, e a API SHALL responder como inexistente o chamado de que a conta não participa nem vê.

Elas SHALL ler:
- o número, o título, o tipo, com o ícone, e quem atende, desde quando;
- a situação, nas palavras do colaborador:

  | A TI vê | Quem participa vê |
  |---|---|
  | Na triagem | Aberto |
  | Em atendimento | Em andamento |
  | Aguardando o colaborador | Aguardando você |
  | Resolvido | Resolvido |
  | Fechado | Fechado |

- as etapas, nesta ordem: Aberto, Em andamento, Aguardando você e Resolvido, com a de agora marcada. Cada etapa até a de agora SHALL ter a hora da última vez em que o chamado chegou a ela, como "ontem 17:05", e a que o chamado pulou SHALL ficar sem hora; as depois da de agora SHALL dizer "ainda não". As horas saem dos eventos, também dos que a pessoa não lê, como o desfazer;
- a previsão da resposta, pelo prazo de resposta do tipo, como "responde em ~1 h";
- as mensagens do chat de onde o chamado foi aberto, na ordem, cada uma com quem a escreveu, a hora, o texto e os anexos;
- as mensagens da TI para a pessoa e as de quem participa, com as opções, as escolhas, os cartões dos ativos e os anexos;
- o resumo das respostas que a pessoa vê e os anexos dos campos que ela vê;
- o ativo ligado, pelo nome e pelo patrimônio;
- os eventos, nas palavras do colaborador:

  | Na conversa da TI | Quem participa vê |
  |---|---|
  | a abertura pela própria conta | "Recebemos o seu chamado" |
  | a abertura pela TI ou por outra pessoa | "Ana Souza abriu este chamado para você" |
  | assumir e passar | "Bruno Lima está atendendo o chamado" |
  | devolver à triagem | "O chamado voltou para a fila da TI" |
  | aguardar | "Aguardando você" |
  | retomar | "O atendimento continua" |
  | resolver | "Bruno Lima resolveu o chamado", com o resumo dos tempos (requisito "Resumo dos tempos") |
  | reabrir | "Bruno Lima reabriu o chamado" e, pela própria conta, "Você reabriu o chamado" |
  | a avaliação | "Você avaliou: Ótimo · Resolveu muito bem" |
  | o fechamento | "O chamado fechou" |

Elas SHALL NOT ler as notas internas, os campos só da TI e os anexos dos dois, os alertas do ativo, o prazo da resolução, o desfazer, a OS, a solicitação, a troca do ativo e a dos campos.

A quem participa pela TI (requisito "Quem atende pelo chat"), a espera SHALL ser "Aguardando o colaborador", na situação, no nome da etapa e no evento do aguardar, porque a resposta não é dela, e a abertura SHALL ser "Você abriu este chamado para Paulo Nunes", com o nome da pessoa. A quem atende pelo chat, a leitura SHALL ter também as ações que o chamado aceita agora.

#### Scenario: A pessoa lê sem as notas
- **WHEN** Fernanda Rocha abre o #1041 no chat
- **THEN** ela vê "Aguardando você", as mensagens dela e as de Ana, e não vê as notas das 17:24 e das 09:25

#### Scenario: Etapas com as horas
- **WHEN** Fernanda Rocha abre hoje o #1041, que ela abriu ontem às 17:05, Ana assumiu às 17:20 e que aguarda ela desde as 09:21
- **THEN** as etapas dizem "Aberto · ontem 17:05", "Em andamento · ontem 17:20", "Aguardando você · hoje 09:21", marcada, e "Resolvido · ainda não"

#### Scenario: Chamado de outra pessoa
- **WHEN** Paulo Nunes pede o #1041, de Fernanda Rocha, pela API do chat
- **THEN** a API responde que o chamado não existe

#### Scenario: Espera de quem participa pela TI
- **WHEN** Ana Souza abre no chat o #1050, que ela abriu no nome de Paulo Nunes e que aguarda Paulo desde as 09:21
- **THEN** ela lê "Aguardando o colaborador" na situação, na etapa e no evento das 09:21, e Paulo lê "Aguardando você"

#### Scenario: Abertura para quem participa pela TI
- **WHEN** Ana Souza abre no chat o #1050, que ela abriu no nome de Paulo Nunes e atende
- **THEN** a conversa começa com "Você abriu este chamado para Paulo Nunes", e Paulo lê "Ana Souza abriu este chamado para você"

### Requirement: Resposta nova

Cada participante, fora quem participa pela TI (requisito "Quem atende pelo chat"), SHALL ter, em cada chamado aberto (Na triagem, Em atendimento e Aguardando o colaborador), a resposta nova: as mensagens da TI para a pessoa escritas por outra conta depois da última mensagem, escolha, reabertura ou avaliação dele, ou do último "Marcar como vista" dele. A resposta nova SHALL ficar até ele responder, escolher uma opção ou marcar como vista. Abrir a conversa SHALL NOT tirá-la. O chamado resolvido e o fechado SHALL NOT ter resposta nova: o "O que foi feito" do resolver entra na conversa como mensagem da TI, e a pessoa o recebe pela notificação do resolvido.

Responder, escolher, reabrir, avaliar e marcar como vista SHALL marcar como lidas as notificações desse chamado na conta.

#### Scenario: Resposta que fica
- **WHEN** Ana responde o #1041 às 09:21, e Fernanda Rocha abre a conversa às 10:12 sem responder
- **THEN** o #1041 continua com a resposta nova

#### Scenario: Marcar como vista
- **WHEN** Fernanda Rocha escolhe "Marcar como vista" no #1044
- **THEN** a resposta nova do #1044 sai, e a mensagem seguinte de Bruno a traz de volta

#### Scenario: Resolvido sem resposta nova
- **WHEN** Bruno resolve o #1044 com "Troquei o teclado.", e Fernanda Rocha não respondeu desde a última mensagem dele
- **THEN** o #1044 sai dos chamados com resposta nova de Fernanda, e o "Troquei o teclado." fica na conversa

#### Scenario: A própria mensagem
- **WHEN** Ana Souza, que atende os chamados, responde pelo módulo Chamados o #1050, aberto para ela mesma
- **THEN** o #1050 não ganha resposta nova para Ana, e ela não é notificada da própria mensagem

#### Scenario: Quem participa pela TI
- **WHEN** Diego manda uma mensagem a Paulo Nunes no #1050, que Ana Souza abriu no nome de Paulo e atende pelo chat
- **THEN** o #1050 ganha a resposta nova para Paulo, e não para Ana, que também não o conta nos chamados com resposta nova

### Requirement: Resposta da pessoa

Quem participa SHALL mandar mensagens no chamado, com o texto, de 1 a 4.000 caracteres, ou só os anexos, até 5, e escolher as opções das perguntas (requisito "Pergunta com opções"). A mensagem e a escolha SHALL ter, pela situação:
- **Na triagem e Em atendimento:** a mensagem entra na conversa, e a situação não muda;
- **Aguardando o colaborador:** o chamado SHALL ser retomado, Em atendimento com quem atende, e o relógio volta a contar de onde parou;
- **Resolvido:** a mensagem SHALL reabrir o chamado, como o "Reabrir" (requisito "Ações do atendimento"), e "Reabrir", sem escrever, faz o mesmo. A escolha SHALL ser recusada;
- **Fechado:** a mensagem e a escolha SHALL ser recusadas.

Quem participa pela TI (requisito "Quem atende pelo chat") SHALL NOT mandar a mensagem, escolher nem reabrir como quem participa: a mensagem dela é a da TI, a escolha é da pessoa, e ela reabre pela ação da TI.

As recusas SHALL ser as das mensagens (requisito "Conversa do chamado") e:
- "O chamado #1045 está resolvido. Escreva para reabrir.", na escolha do resolvido;
- "O chamado #1045 está fechado. Para o mesmo problema, abra outro chamado.", no fechado;
- "Você atende o chamado #1045. Responda pela TI.", na mensagem, na escolha e no "Reabrir" de quem participa pela TI.

#### Scenario: Resposta que retoma
- **WHEN** Fernanda Rocha responde "A pasta se chama Financeiro-2026" no #1041, que aguarda ela desde as 09:21
- **THEN** o #1041 volta a Em atendimento com Ana, e o relógio volta a contar com 1 h 44 min restando

#### Scenario: Escrever no resolvido
- **WHEN** Fernanda Rocha escreve "Voltou a manchar" no #1045, resolvido por Bruno
- **THEN** o #1045 é reaberto, Em atendimento com Bruno, que recebe "Chamado #1045 com você", e a conversa mostra "Você reabriu o chamado" a ela

#### Scenario: Quem participa pela TI pela rota de quem participa
- **WHEN** Ana Souza manda pela rota de quem participa uma mensagem no #1050, que ela abriu no nome de Paulo Nunes e atende
- **THEN** a mensagem é recusada com "Você atende o chamado #1050. Responda pela TI.", e nada é gravado

### Requirement: Pergunta com opções

A mensagem da TI para a pessoa SHALL poder levar de 2 a 3 opções de resposta, cada uma de 1 a 40 caracteres, sem os espaços das pontas e única na mensagem.

Quem participa, fora quem participa pela TI (requisito "Resposta da pessoa"), SHALL escolher uma das opções. A escolha SHALL guardar quem escolheu e quando, SHALL NOT virar uma mensagem e SHALL NOT mudar depois. Cada pergunta SHALL ter uma escolha só, de quem escolher primeiro. A escolha conta como a resposta da pessoa (requisito "Resposta da pessoa").

A conversa SHALL mostrar a pergunta com as opções, e a respondida com a escolhida marcada, com o ✓ e quem escolheu, e as outras sem ação.

As recusas SHALL ser:
- "Use de 2 a 3 opções.", "Escreva a opção.", "Use até 40 caracteres." e "As opções precisam ser diferentes.", ao mandar;
- "Esta pergunta já foi respondida." e "Escolha uma opção da pergunta.", ao escolher.

#### Scenario: Escolher uma opção
- **WHEN** Fernanda Rocha escolhe "Pode ser" na pergunta das 10:52 de Bruno no #1045
- **THEN** a pergunta mostra "Pode ser" marcado, com Fernanda e a hora, as outras duas opções sem ação, e nenhuma mensagem nova entra

#### Scenario: Escolha que chega tarde
- **WHEN** Carla Dias escolhe uma opção numa pergunta que Fernanda Rocha já respondeu
- **THEN** a escolha é recusada com "Esta pergunta já foi respondida."

### Requirement: Cartão do ativo na mensagem

A mensagem da TI e a nota SHALL poder levar o cartão de um ativo que quem escreve vê. O cartão SHALL copiar, na hora em que a mensagem é mandada:
- o ícone do tipo, o nome, o modelo e o patrimônio;
- o endereço IP e a situação da disponibilidade, em texto, quando há;
- o suprimento mais baixo, como "Toner crítico · 6%", quando há;
- a hora dos dados.

Quem participa SHALL ler o cartão como foi mandado, sem `ativos.ver`. A quem vê o ativo, o cartão SHALL ter "Abrir a ficha". Cada mensagem SHALL ter no máximo um cartão.

As recusas SHALL ser "O ativo não foi encontrado." e "A mensagem leva um cartão só.".

#### Scenario: Cartão da impressora
- **WHEN** Bruno manda a Fernanda Rocha, no #1045, a mensagem com o cartão da PAT-00137 às 10:50
- **THEN** Fernanda vê o cartão com a Impressora Financeiro, o modelo, a PAT-00137, o IP, a situação e "Toner crítico · 6%", como estavam às 10:50

### Requirement: Avaliação do atendimento

No chamado resolvido, quem participa, fora quem participa pela TI (requisito "Quem atende pelo chat"), SHALL avaliar o atendimento uma vez por resolução, com:
- o nível, entre "Ruim · Não resolveu", "Regular · Resolveu em parte", "Bom · Resolveu" e "Ótimo · Resolveu muito bem";
- o comentário, opcional, de até 500 caracteres.

A avaliação SHALL NOT mudar depois. Reaberto e resolvido de novo, o chamado SHALL pedir outra avaliação, e a de antes fica na conversa. A TI SHALL ver a avaliação na conversa, como "Fernanda Rocha avaliou: Ótimo · Resolveu muito bem", com o comentário.

As recusas SHALL ser "Escolha um nível.", "Use até 500 caracteres.", "O atendimento já foi avaliado.", "O chamado não está resolvido." e, a quem participa pela TI, "Quem atende o chamado #1045 não o avalia.".

#### Scenario: Avaliar
- **WHEN** Fernanda Rocha marca "Ótimo · Resolveu muito bem" no #1045 e envia
- **THEN** a conversa dela diz "Você marcou: Ótimo. Obrigado!", e Bruno vê "Fernanda Rocha avaliou: Ótimo · Resolveu muito bem"

#### Scenario: Avaliar de novo
- **WHEN** Fernanda Rocha tenta avaliar outra vez o #1045 na mesma resolução
- **THEN** a avaliação é recusada com "O atendimento já foi avaliado."

#### Scenario: Quem atende não avalia
- **WHEN** Ana Souza tenta avaliar pela API o #1050 resolvido, que ela abriu no nome de Paulo Nunes e atende
- **THEN** a avaliação é recusada com "Quem atende o chamado #1050 não o avalia.", e Paulo segue podendo avaliar

### Requirement: Resumo dos tempos

O evento do resolvido SHALL ter o resumo dos tempos, em horas corridas:
- a abertura, com a hora;
- a primeira resposta da TI, a primeira mensagem dela para a pessoa, com a hora e o tempo desde a abertura, ou "sem resposta" sem nenhuma;
- a resolução, com a hora e o tempo desde a abertura;
- quem atendeu: quem resolveu.

#### Scenario: Resumo do #1045
- **WHEN** Bruno resolve às 11:20 o #1045, aberto às 10:32 e respondido por ele às 10:50
- **THEN** o resumo diz "Aberto 10:32", "Primeira resposta da TI 10:50 · 18 min", "Resolvido 11:20 · 48 min" e "Atendeu Bruno Lima"

### Requirement: Fechamento do chamado

O chamado resolvido SHALL fechar sozinho no fim do sétimo dia depois do dia da resolução, no fuso do horário da TI (requisito "Horário da TI"). Até lá, a conversa de quem participa SHALL dizer até quando ele se reabre, como "Reabrir até 18/11". Reaberto antes disso, o chamado SHALL contar os 7 dias de novo na resolução seguinte.

O fechamento SHALL entrar na conversa como o evento "O chamado fechou", com a hora, e SHALL NOT notificar. No chamado Fechado, as ações do atendimento, a mensagem, a nota, a escolha e a avaliação SHALL ser recusadas com "O chamado #1045 está fechado.", e, a quem participa, com a frase do requisito "Resposta da pessoa".

Os chamados resolvidos antes desta versão SHALL fechar pela data da resolução deles.

#### Scenario: Fecha no dia 18
- **WHEN** o #1045 é resolvido em 11/11 às 11:20, e ninguém o reabre
- **THEN** a conversa de Fernanda Rocha diz "Reabrir até 18/11", e o #1045 fecha à meia-noite do fim de 18/11

#### Scenario: Reabrir o fechado
- **WHEN** Ana tenta reabrir o #1030, fechado
- **THEN** o pedido é recusado com "O chamado #1030 está fechado.", e nada muda

### Requirement: Quem atende pelo chat

Quem participa do chamado (requisito "Leitura do chamado pela pessoa") e atende todos os locais dele, com `chamados.atender`, SHALL agir nele pelo chat com as ações do atendimento (requisito "Ações do atendimento"), com as mesmas regras, a versão do chamado e as mesmas recusas. A leitura do chamado pelo chat SHALL dizer a ela as ações que o chamado aceita agora, nesta ordem:
- Assumir, fora no chamado que já está com ela;
- Passar para;
- Devolver à triagem, em atendimento;
- Enviar e esperar a resposta, na triagem e em atendimento, fora à pessoa do chamado;
- Retomar, no aguardando;
- Resolver, no chamado aberto;
- Reabrir, no resolvido, só a quem participa pela TI.

No fechado, a leitura SHALL NOT ter nenhuma ação. Quem participa sem atender os locais SHALL NOT ter nenhuma ação, e quem atende sem participar SHALL agir pelo módulo Chamados (spec modulo-chamados).

**Quem participa pela TI** SHALL ser quem abriu o chamado pelo chat no nome de outra pessoa e atende todos os locais dele. Ela SHALL falar e ler o chamado como a TI:
- a mensagem dela pelo chat SHALL ser a mensagem da TI para a pessoa (requisito "Conversa do chamado"): ela cumpre a primeira resposta, avisa a pessoa e, no aguardando, deixa o chamado esperando;
- a espera SHALL ser, para ela, "Aguardando o colaborador", e não "Aguardando você" (requisito "Leitura do chamado pela pessoa");
- ela SHALL NOT ter a resposta nova (requisito "Resposta nova");
- ela SHALL NOT responder, escolher, reabrir nem avaliar como quem pediu (requisitos "Resposta da pessoa", "Pergunta com opções" e "Avaliação do atendimento"). O "Marcar como vista" SHALL seguir valendo;
- ela SHALL NOT receber as notificações de quem participa, a mensagem da TI e o resolvido: recebe as da TI, como quem atende (requisito "Notificações dos chamados");
- a leitura SHALL dizer a ela se a pessoa do chamado usa o chat, porque a mensagem a quem não o usa fica só no chamado.

A pessoa do chamado SHALL participar sempre como quem pediu, também quando atende os locais dele, como quem é da TI e pede um chamado para si. Ela escreve como a pessoa e tem as ações, fora o "Enviar e esperar a resposta" e o "Reabrir": este ela faz como quem pediu.

Quem participa pela TI SHALL ser decidido em cada mensagem e em cada leitura: quem deixa de atender os locais volta a participar como quem pediu, e as mensagens de antes ficam como foram gravadas.

A lista de quem recebe o chamado, para o "Passar para", SHALL pedir `chamados.atender` nos locais do chamado. Ela SHALL ter as contas ativas que atendem todos os locais dele, fora quem está com ele, pelo nome, cada uma com quantos chamados abertos tem nos locais que quem pede vê com `chamados.ver`, como a coluna dela no quadro.

#### Scenario: A TI assume pelo chat
- **WHEN** Ana Souza, que atende Jundiaí, transforma no #1050 a mensagem de Paulo Nunes, no nome dele, e escolhe "Assumir" no #1050 aberto no chat
- **THEN** o #1050 fica Em atendimento com Ana, e a conversa ganha "Ana assumiu", como pelo Chamados

#### Scenario: Quem só pediu
- **WHEN** Fernanda Rocha, sem `chamados.atender`, abre no chat o #1045, que ela pediu
- **THEN** a leitura não traz nenhuma ação do atendimento, e assumir o #1045 pela API responde 403

#### Scenario: Mensagem pela TI
- **WHEN** Ana Souza escreve no chat "Passo aí às 14h" no #1050, aberto por ela no nome de Paulo Nunes
- **THEN** a mensagem entra como a da TI para Paulo, que recebe a notificação dela, e o #1050 ganha a primeira resposta

#### Scenario: Mensagem pela TI no aguardando
- **WHEN** Ana Souza põe o #1050 aguardando Paulo Nunes e escreve a ele outra mensagem pelo chat
- **THEN** o #1050 continua Aguardando o colaborador, e o relógio segue parado

#### Scenario: A pessoa da TI
- **WHEN** Ana Souza, que atende os chamados, transforma a própria mensagem no #1051, no nome dela, e responde nele pelo chat
- **THEN** a mensagem entra como a da pessoa, e as ações do #1051 no chat não têm "Enviar e esperar a resposta" nem "Reabrir"

#### Scenario: Quem recebe o chamado
- **WHEN** Ana Souza pede quem recebe o #1050, de Jundiaí, que está com ela
- **THEN** a lista tem Diego e Renato, que atendem Jundiaí, com os abertos de cada um, e não tem Ana nem Bruno, que atende só Campinas
