## Purpose

Registrar os pedidos das pessoas à TI como chamados: quem pediu, sobre o quê, quem está com ele, a conversa, o prazo e o que ele virou, para a TI saber quem está com o quê e o que vai vencer.

## ADDED Requirements

### Requirement: Chamado

O chamado SHALL ser o pedido de uma pessoa à TI. Nesta versão, só a TI o abre, em nome da pessoa. O chat e a aba dos colaboradores vêm nas changes seguintes do S7 e do S8.

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
- a origem: a TI, nesta versão;
- quem abriu e quando.

Um chamado SHALL NOT ser apagado, nem pela API nem pelo banco com o papel da aplicação: o que não vai ser atendido é resolvido, com o que foi feito.

#### Scenario: Número seguinte
- **WHEN** o último chamado da organização é o #1042, e Ana abre outro
- **THEN** o chamado novo é o #1043, e o número não muda depois

#### Scenario: Chamado não se apaga
- **WHEN** alguém tenta apagar o #1042, pela API ou pelo banco com o papel da aplicação
- **THEN** a exclusão é recusada, e o chamado continua como estava

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
- **Resolvido.**

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

**Resolver** SHALL pedir "O que foi feito", de 1 a 2.000 caracteres, que vai à conversa como mensagem para a pessoa, e guardar quem resolveu e quando.

A primeira mensagem para a pessoa SHALL cumprir o prazo da primeira resposta (requisito "Prazo do chamado"): a mensagem, com ou sem esperar a resposta, e o "O que foi feito" da resolução. A nota SHALL NOT cumpri-lo.

Cada ação SHALL gravar um evento na conversa, com quem fez e quando, como "Ana assumiu · 09:40" e "Aguardando Fernanda · 09:21 · o relógio parou". O evento do assumir SHALL dizer há quanto tempo o chamado estava na triagem, ou com quem estava, como "Ana Souza assumiu o chamado · 09:40 · estava há 2 h na triagem". O desfazer SHALL devolver também esse tempo: o chamado volta à triagem, ou a quem estava com ele, desde quando estava antes do assumir. A mensagem e a nota SHALL entrar na conversa como elas mesmas, sem evento. No chamado que já aguarda, "Enviar e esperar a resposta" SHALL valer como a mensagem, sem evento, porque nem a situação nem quem atende mudam, e o relógio segue parado desde a espera.

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
- "O chamado #1042 mudou. Confira antes de assumir.", e o mesmo com "passar" e "devolver", na ação feita pela tela que mostrava o chamado de antes de outra ação que mudou a situação ou quem atende, ou da troca do ativo. Assim, duas pessoas não passam o mesmo chamado ao mesmo tempo sem saber;
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
- **as mensagens para a pessoa,** de 1 a 4.000 caracteres, com até 5 anexos (spec arquivos-e-imagens, requisitos "Arquivos aceitos" e "Anexos dos chamados");
- **as notas internas,** do mesmo tamanho e com os anexos, marcadas "Só a TI vê" (requisito "Quem vê e quem atende os chamados");
- **os eventos:**
  - a abertura, com o resumo das respostas;
  - as ações do atendimento;
  - a OS e a solicitação;
  - a troca do ativo.

As mensagens e as notas SHALL NOT ser editadas nem apagadas. Cada uma SHALL guardar quem escreveu e quando.

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

O resumo SHALL ser montado na leitura do chamado, da cópia do formulário e das respostas guardadas na abertura, com os nomes de agora dos ativos, dos locais e das pessoas. As respostas do Ativo, do Local e da Pessoa guardam a referência, e não o nome.

Os alertas do ativo ligado abertos depois da abertura do chamado SHALL aparecer na conversa, na hora em que abriram, a quem vê os alertas do ativo, como "Toner preto abaixo de 10% · 09:36".

Nesta versão, a mensagem para a pessoa SHALL ficar no chamado. O chat e a aba dos colaboradores a entregam nas changes seguintes.

As recusas SHALL ser "Escreva a mensagem." (na nota, "Escreva a nota."), "Use até 4.000 caracteres." e "Anexe até 5 arquivos.", além das recusas dos arquivos e dos anexos. A mensagem, a nota e o "O que foi feito" SHALL perder os espaços das pontas e ser contados em caracteres, como os textos dos campos.

#### Scenario: Nota interna
- **WHEN** Ana grava a nota "A pasta é do Comercial, e não do Financeiro" no #1041
- **THEN** a conversa mostra a nota no quadro "Só a TI vê", com Ana e a hora

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

O aviso SHALL voltar a valer para o chamado reaberto.

#### Scenario: Estourado avisado uma vez
- **WHEN** o #1033, com Renato, passa do vencimento às 09:20, e a verificação roda às 09:20 e às 09:21
- **THEN** Renato recebe um aviso só, "Chamado #1033 passou do prazo: Wi-Fi cai na Sala Atlântico"

### Requirement: Ativo ligado e campos da TI

O ativo ligado SHALL ser a resposta do primeiro campo Ativo do formulário, quando há. Quem atende os locais do chamado SHALL poder ligar um ativo, trocá-lo ou tirá-lo, entre os ativos ativos que vê. A mudança SHALL recalcular os locais do chamado e gravar o evento na conversa.

Quem muda o ativo SHALL atender também os locais novos. Se quem está com o chamado não atende os locais novos, a mudança SHALL ser recusada com "<Nome> não atende os chamados de <local>. Passe o chamado antes de trocar o ativo.".

Quem atende SHALL poder:
- preencher e mudar os campos só da TI do formulário do chamado;
- trocar o título, de 1 a 120 caracteres.

As recusas dos campos SHALL ser as das respostas do formulário (spec tipos-de-chamado). Num chamado resolvido, a troca do ativo, do título e dos campos da TI SHALL ser recusada com "O chamado #1042 está resolvido.".

#### Scenario: Ativo de outro local
- **WHEN** Ana liga ao #1040, de uma pessoa de Jundiaí, uma impressora de Campinas
- **THEN** os locais do #1040 passam a ser Jundiaí e Campinas, e só quem atende os dois pode atendê-lo

#### Scenario: Ativo que tira o chamado de quem atende
- **WHEN** Ana tenta ligar uma impressora de Campinas ao #1038, que está com Renato, que atende só Jundiaí
- **THEN** a mudança é recusada com "Renato não atende os chamados de Campinas. Passe o chamado antes de trocar o ativo."

#### Scenario: Campo da TI preenchido
- **WHEN** Diego preenche o Contador de páginas do #1042 com 48210
- **THEN** o campo fica com 48210, e a auditoria guarda o antes e o depois

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
- os tipos em que ela aparece, entre os Em uso e os Inativos, ou todos;
- a ordem.

Quem atende SHALL usar uma resposta pronta no campo de escrever, e mudar o texto antes de mandar.

As recusas SHALL ser:
- "Escreva o rótulo.", "Use até 60 caracteres." e "Já existe uma resposta pronta com esse rótulo.", no rótulo;
- "Escreva o texto." e "Use até 2.000 caracteres.", no texto;
- "Escolha os tipos da lista.", nos tipos;
- "A organização já tem 100 respostas prontas.".

#### Scenario: Pedir o print
- **WHEN** Ana usa "Pedir o print do erro", que espera a resposta, no #1041 de Fernanda Rocha, e manda
- **THEN** a mensagem chega à conversa com "Fernanda" no lugar de `{nome}`, e o #1041 passa a Aguardando o colaborador

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

Virar OS e pedir toner SHALL NOT mudar a situação do chamado. Num chamado resolvido, os dois SHALL ser recusados com "O chamado #1042 está resolvido.".

#### Scenario: Pedir toner com uma solicitação pendente
- **WHEN** Ana usa "Pedir toner" no #1042, com a PAT-00139, que já está na solicitação 4, Aberta
- **THEN** o #1042 fica ligado à solicitação 4, nenhuma solicitação nova é registrada, e a conversa ganha "Juntou-se à solicitação 4"

### Requirement: Notificações dos chamados

Os chamados SHALL notificar pela notificação da plataforma (spec notificacoes), com a origem "Chamados" e o endereço do chamado:
- **o chamado passado a uma conta,** por outra pessoa ou pelo atendimento do tipo, a essa conta, na severidade Informação: "Chamado #1043 com você: Impressora manchando";
- **o chamado que cai na triagem,** a cada conta que atende os locais dele, fora quem abriu ou devolveu, na severidade Informação: "Chamado #1043 na triagem: Impressora manchando";
- **o prazo estourado** (requisito "Prazo estourado"), na severidade Atenção.

Quem assume ou abre o chamado com "Fica comigo" SHALL NOT ser notificado do próprio ato. O desfazer SHALL NOT notificar: ele devolve o chamado a quem estava com ele, ou à triagem, e o assumir não avisou ninguém de que ele saiu.

#### Scenario: Passado a Renato
- **WHEN** Ana passa o #1038 a Renato
- **THEN** Renato recebe "Chamado #1038 com você: Wi-Fi cai na Sala Atlântico", e Ana não recebe nada

#### Scenario: Desfazer sem aviso
- **WHEN** Ana assume o #1033, que estava com Renato, e desfaz
- **THEN** o #1033 volta a Renato, e nem Renato nem Ana recebem a notificação

### Requirement: Permissões, auditoria e eventos dos chamados

O catálogo SHALL ter, na área "Chamados":
- `chamados.ver`: "Ver os chamados, com as notas internas", por local, pelos locais do chamado;
- `chamados.atender`: "Abrir, assumir, passar, responder e resolver os chamados", por local, incluindo `chamados.ver`;
- `chamados.configurar`: "Configurar os tipos de chamado, o formulário, as respostas prontas e o horário da TI", na organização.

O perfil Administrador SHALL ter as três.

A auditoria SHALL registrar:
- **nos chamados:**
  - a abertura;
  - assumir, desfazer, passar, devolver à triagem, aguardar, retomar, resolver e reabrir;
  - a troca do título, dos campos da TI e do ativo;
  - a OS e a solicitação;
- **nos ajustes:**
  - os tipos: criados, alterados, reordenados, inativados, reativados e descartados;
  - o formulário salvo;
  - as respostas prontas;
  - o horário da TI.

Cada registro SHALL ter o "antes → depois" do que mudou. O alvo SHALL ser o chamado com o número e o título como estão agora, como "#1042 · Impressora manchando". As mensagens e as notas SHALL NOT ir para a auditoria: a conversa as guarda, com quem escreveu e quando.

Os eventos em tempo real (spec eventos-em-tempo-real) SHALL ser:
- `chamados.mudaram`, quando um chamado abre, muda ou ganha uma mensagem, a quem vê os chamados nos locais dele, os de antes e os de depois;
- `ajustes-dos-chamados.mudaram`, quando um tipo, o formulário, uma resposta pronta ou o horário da TI muda, a quem tem uma das permissões dos chamados. Como o horário muda os relógios dos chamados abertos, as telas dos chamados SHALL se atualizar também com ele.

Os eventos SHALL NOT levar o título, o texto nem o nome da pessoa.

#### Scenario: Conta sem a permissão
- **WHEN** uma conta sem `chamados.atender` tenta assumir o #1042 pela API
- **THEN** a API responde 403, e nada é gravado

#### Scenario: Passar na auditoria
- **WHEN** Ana passa o #1038 a Renato
- **THEN** a auditoria registra "#1038 · Wi-Fi cai na Sala Atlântico", com quem atendia antes e depois, Ana e o momento
