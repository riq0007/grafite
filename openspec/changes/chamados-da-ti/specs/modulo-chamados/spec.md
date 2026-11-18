## Purpose

Dar aos chamados um módulo na casca, que é a primeira tela da TI: quem está com o quê, a triagem, os prazos, o chamado aberto com a conversa, a abertura em nome da pessoa e a configuração dos tipos, do formulário, das respostas prontas e do horário da TI.

## ADDED Requirements

### Requirement: Chamados no dock

A casca SHALL ter o módulo Chamados, com o ícone da boia, primeiro na ordem de fábrica do dock, antes do Início (spec dock). Ele SHALL ser visível para quem tem `chamados.ver`, `chamados.atender` ou `chamados.configurar`, e só com o módulo ligado na organização. No celular, o módulo SHALL ficar na barra de abas, antes do Início.

O menu SHALL ter:
- "Início", "Quem está com o quê" e "Prazos", para quem vê os chamados;
- "Tipos de chamado", "Respostas prontas" e "Horário da TI", para quem configura os chamados.

O item do dock SHALL levar ao Início dos chamados ou, para quem só configura, aos Tipos de chamado. A busca SHALL oferecer, no caminho "Chamados":
- "Abrir um chamado", a quem atende;
- as telas do menu, a quem as vê.

Sem a permissão, o endereço do módulo SHALL dizer "Você não tem acesso aos chamados.", com a quem pedir acesso.

#### Scenario: Conta que nunca arrumou o dock
- **WHEN** Ana, que atende os chamados e nunca arrumou o dock, entra
- **THEN** o dock dela começa por Chamados, seguido do Início

#### Scenario: Conta que já arrumou o dock
- **WHEN** Bruno arrumou o dock antes dos chamados
- **THEN** o Chamados aparece depois dos módulos que ele arrumou, antes dos Ajustes, e ele o sobe quando quiser

#### Scenario: Quem só configura
- **WHEN** uma conta com só `chamados.configurar` abre o Chamados
- **THEN** o módulo abre nos Tipos de chamado, e o menu mostra só "Tipos de chamado", "Respostas prontas" e "Horário da TI"

### Requirement: Primeira tela ao entrar

Abrir a aplicação no endereço da organização, sem caminho nem parâmetros, SHALL levar ao Início dos chamados a conta que vê os chamados, com o módulo ligado. As outras contas SHALL ver o Início. Escolher o Início no dock SHALL abrir o Início, sem levar aos chamados.

A troca SHALL acontecer só na primeira carga de cada aba do navegador, e de novo quando outra conta entra na mesma aba. Recarregar a página SHALL manter a tela em que a conta estava, também o Início.

Com a sessão desconhecida na primeira carga, porque o servidor não respondeu, a casca SHALL ficar no Início, também quando o servidor volta.

#### Scenario: Ana entra
- **WHEN** Ana, que atende os chamados, entra pelo endereço da organização
- **THEN** a primeira tela é o Início dos chamados, com "Bom dia, Ana"

#### Scenario: Início pelo dock
- **WHEN** Ana escolhe o Início no dock
- **THEN** a casca mostra o Início, e não volta aos chamados

#### Scenario: Recarregar no Início
- **WHEN** Ana, no Início que ela escolheu no dock, recarrega a página
- **THEN** a casca continua no Início

#### Scenario: Aba nova
- **WHEN** Ana, já com uma aba no Início, abre o endereço da organização numa aba nova
- **THEN** a aba nova abre no Início dos chamados

#### Scenario: Conta sem os chamados
- **WHEN** Paula, sem nenhuma permissão dos chamados, entra
- **THEN** a primeira tela é o Início

#### Scenario: Outra conta na mesma aba
- **WHEN** Ana sai, e Bruno, que também atende os chamados, entra na mesma aba, no endereço da organização
- **THEN** a primeira tela de Bruno é o Início dos chamados

#### Scenario: O servidor volta
- **WHEN** Ana abre o endereço da organização sem resposta do servidor, e o servidor volta
- **THEN** a casca continua no Início, e recarregar a página mantém o Início

### Requirement: Início dos chamados

O Início dos chamados SHALL ter, no alto:
- a saudação ao primeiro nome da conta: "Bom dia" das 05:00 às 11:59, "Boa tarde" das 12:00 às 17:59 e "Boa noite" no resto, no fuso da conta;
- a contagem: os que esperam na triagem, os que já passaram do prazo, os abertos e os resolvidos hoje, como "3 esperam na triagem, 1 já passou do prazo, 12 abertos, 1 resolvido hoje", com "Contando só os chamados dos locais que você vê." a quem não vê os da organização inteira (spec chamados, requisito "Carga de cada pessoa").

Abaixo:
- **à esquerda,** as colunas por pessoa, como em "Quem está com o quê", sem a coluna da triagem;
- **à direita, a triagem:** uma linha por chamado, com "Assumir" e "Passar para…";
- **à direita, os prazos:** compactos e sem os parados, com a frase dos parados, como "3 com o relógio parado".

Sem chamados abertos, a tela SHALL dizer "Nenhum chamado aberto.".

#### Scenario: Triagem no Início
- **WHEN** Ana assume o #1040 na triagem do Início
- **THEN** o #1040 sai da triagem e entra na coluna de Ana, e a contagem passa a "2 esperam na triagem"

### Requirement: Quem está com o quê

A tela SHALL ter:
- **no alto, os abertos que a conta vê,** como "12 abertos";
- **a coluna "Sem responsável",** tracejada, com os chamados da triagem e "3 na triagem · mais antigo #1038, há 6 h", ou só "0 na triagem";
- **uma coluna por pessoa da TI** (spec chamados, requisito "Carga de cada pessoa"), com:
  - a sigla num círculo;
  - o nome em peso forte;
  - "2 abertos · mais antigo #1041, há 17 h", ou só "0 abertos";
  - a barra de carga em pedaços;
  - no pé, "Resolveu hoje: #1035" ou "Nada resolvido hoje";
- **a coluna de quem não atende mais os chamados** e ainda tem chamados abertos, depois das outras, com "não atende mais os chamados" junto do nome;
- **"Contando só os chamados dos locais que você vê.",** acima das colunas, a quem não vê os chamados da organização inteira.

A idade do mais antigo SHALL arredondar para o mais perto, e não para baixo, como "há 17 h" para 16 h 35 min: em minutos até 59 min, em horas até 23 h e em dias daí em diante, com "há menos de 1 min" abaixo de meio minuto.

Cada chamado SHALL ser um quadrado com:
- o ícone do tipo;
- o número, em mono;
- uma linha só de título, cortada em reticências;
- o prazo, em mono, com o ícone e a palavra.

Na coluna, os quadrados SHALL seguir o vencimento, e o empate, o número:
1. os estourados;
2. os que vencem antes;
3. os de relógio parado;
4. os de prazo ilegível, por último.

Parar o ponteiro do mouse num quadrado por 200 ms, ou levar a ele o foco do teclado, SHALL abrir a prévia, opaca, sobre a área vazia das colunas. A prévia SHALL ter:
- a situação do prazo, como "Estourado há 20 min";
- o título inteiro;
- quem pediu, o ativo e quem atende;
- a última mensagem, com quem a escreveu e a hora;
- "Assumir", a ação principal;
- "Passar para…", com a carga de cada pessoa, como "Ana · 2 abertos".

"Passar para…" SHALL listar as pessoas que atendem os locais do chamado, na ordem das colunas, fora quem está com o chamado: as das colunas que recebem o quadrado no arraste.

Esc SHALL fechar a prévia. Enter e o clique SHALL abrir o chamado.

O menu do botão direito e o do teclado SHALL ter "Abrir o chamado", "Assumir", "Passar para…" e "Devolver à triagem", conforme as ações que o chamado aceita (spec chamados, requisito "Ações do atendimento"): sem "Assumir" no chamado que já está com a conta e sem "Devolver à triagem" no da triagem e no aguardando.

Quem só vê os chamados SHALL ter a prévia e o menu sem "Assumir", "Passar para…" e "Devolver à triagem".

As ações da prévia e do menu SHALL mandar a versão do chamado que a tela mostra (spec chamados, requisito "Ações do atendimento"), e o retorno SHALL vir num aviso:
- assumir: "Você assumiu o #1033.", com "Desfazer";
- passar: "Você passou o #1033 a Bruno.";
- devolver: "Você devolveu o #1033 à triagem.";
- o "Desfazer": "O #1033 voltou a Renato." ou "O #1042 voltou à triagem.";
- a recusa: a frase dela, como "O chamado #1038 mudou. Confira antes de assumir.". Depois dela, a tela SHALL reler o quadro e os prazos.

#### Scenario: Idade do mais antigo
- **WHEN** o #1041, o aberto mais antigo de Ana, foi aberto há 16 h 35 min
- **THEN** a coluna de Ana diz "2 abertos · mais antigo #1041, há 17 h", e, 1 h depois, "há 18 h", sem recarregar

#### Scenario: Prévia do estourado
- **WHEN** Ana para o ponteiro no #1033, com Renato
- **THEN** a prévia mostra "Estourado há 20 min", o título inteiro, Sandra Vieira, o ativo, Renato, a última mensagem de Sandra às 09:12, "Assumir" e "Passar para…" com Ana 2, Bruno 2 e Diego 3 abertos

#### Scenario: Assumir pela prévia
- **WHEN** Ana para o ponteiro no #1038, da triagem, e usa "Assumir"
- **THEN** o #1038 vai para a coluna de Ana, e o aviso diz "Você assumiu o #1038." com "Desfazer"

#### Scenario: Menu do chamado aguardando
- **WHEN** Ana abre o menu do #1041, que está com ela e aguarda Fernanda
- **THEN** o menu tem "Abrir o chamado" e "Passar para…", sem "Assumir" e sem "Devolver à triagem"

### Requirement: Arrastar para passar

Arrastar um quadrado com o mouse para a coluna de uma pessoa SHALL passar o chamado a ela. Arrastá-lo para "Sem responsável" SHALL devolvê-lo à triagem. No toque e na caneta, o quadrado SHALL NOT se arrastar: as colunas rolam, e o chamado passa pelo "Passar para…".

No alto, a dica SHALL dizer "Arraste um quadrado para passar adiante. Passe o mouse para ler." e, durante o arraste, "Arrastando #1038 Wi-Fi cai na Sala Atlântico". Quem só vê os chamados não arrasta, e a dica dele SHALL dizer só "Passe o mouse para ler.".

Durante o arraste:
- o lugar de origem SHALL ficar com o contorno tracejado e o aviso "O #1038 está sendo movido. O prazo dele vence em 2 h.";
- a coluna sob o ponteiro SHALL ganhar a borda forte, o pedaço seguinte da barra tracejado e a frase "Soltar para passar a Renato · o prazo continua contando", ou, no chamado aguardando, "Soltar para passar a Renato · o relógio continua parado"; a "Sem responsável", "Soltar para devolver à triagem · o prazo continua contando";
- a coluna de quem não atende os locais do chamado SHALL dizer "Renato não atende Jundiaí", com o caminho do local, ou, no chamado sem local, "Renato não atende os chamados sem local", e SHALL NOT receber o quadrado;
- a coluna de quem não atende mais os chamados SHALL dizer "Renato não atende mais os chamados" e SHALL NOT receber o quadrado;
- a coluna "Sem responsável" SHALL dizer, no chamado aguardando, "O #1041 está aguardando Fernanda" e SHALL NOT recebê-lo.

Esc SHALL cancelar o arraste. Soltar fora de uma coluna, ou na de origem, SHALL deixar o chamado como estava.

#### Scenario: Passar arrastando
- **WHEN** Ana arrasta o #1038 da triagem para a coluna de Renato e solta
- **THEN** o #1038 entra na coluna de Renato, que passa de 2 para 3 abertos, e Renato é avisado

#### Scenario: Coluna que não recebe
- **WHEN** Ana arrasta o #1041, que aguarda Fernanda, sobre "Sem responsável" e solta
- **THEN** a coluna diz "O #1041 está aguardando Fernanda", e o #1041 continua com Ana

### Requirement: Chamado aberto

O chamado aberto SHALL ter, no cabeçalho:
- a trilha;
- o número, em mono, e o título;
- a situação, num selo em texto;
- o tipo, quem pediu, e quem atende desde quando, com "não atende mais os chamados" quando for o caso;
- as ações:
  - "Transferir", que é o "Passar para…";
  - "Virar OS";
  - "Resolver";
  - "Responder", a ação principal, que leva ao campo de escrever;
  - "Assumir", no chamado que não está com a conta;
  - "Reabrir", no resolvido;
- à direita, o quadro do prazo:
  - "Prazo do tipo, 8 h, no horário da TI";
  - a situação em destaque, em mono;
  - o detalhe: "Abriu às 07:40 · conta das 08:00 · vence às 16:00" (depois do prazo, "venceu às 16:00"), "Parou às 09:21 · restam 1 h 44 min" ou, parado depois do prazo, "Parou às 09:40 · passou 20 min do prazo", no tempo do relógio;
  - com a primeira resposta pendente, "Responder até 08:30", ou "Resposta atrasada desde 08:30".

O chamado aberto SHALL responder no endereço `/chamados/<número>`, que as notificações dos chamados, os quadrados de "Quem está com o quê" e a busca abrem. O número que não é de um chamado que a conta vê SHALL dizer "Chamado não encontrado.".

As ações SHALL ficar só com quem atende os locais do chamado:
- "Transferir" SHALL listar as pessoas do "Passar para…", com os abertos de cada uma;
- "Virar OS" SHALL ficar só no chamado com o ativo ligado e sem OS, e SHALL mostrar o problema da OS, que começa com o título do chamado, para corrigir antes de abrir;
- "Pedir toner" SHALL ficar só no chamado com uma impressora ligada, que usa consumíveis, e sem solicitação, e, sem a solicitação pendente, SHALL abrir o registro do Toner que a solicitação pelo chamado dá, para mudar antes de registrar (spec solicitacoes, "Solicitação pelo chamado");
- "Resolver" SHALL pedir "O que foi feito";
- o retorno SHALL vir num aviso, como "Você resolveu o #1042.", "Você reabriu o #1042.", "OS 13 aberta." e "Solicitação 5 registrada.", com "Abrir", e a recusa SHALL ficar com a frase dela.

A conversa SHALL ficar na forma que a conta escolheu (spec preferencias-da-interface, "Forma das conversas nas preferências"):
- **no meio:** numa coluna central, sem balão;
- **nos cantos:** na largura da área, com cada mensagem e cada nota num balão, a de quem pede à esquerda e as da TI à direita, e os eventos e os alertas no meio.

Nas duas formas, a conversa SHALL ter:
- cada mensagem com quem escreveu e a hora;
- cada nota interna num quadro tracejado, com o cadeado e "Só a TI vê";
- cada evento numa linha, como "Aguardando Fernanda · 09:21 · o relógio parou";
- a abertura com o resumo das respostas, como "Problema: Manchando, na borda · Ativo: PAT-00139";
- cada alerta do ativo ligado numa linha, a quem vê os alertas, como "Alerta no ativo PAT-00139: toner preto abaixo de 10% · hoje, 09:36";
- os anexos de cada mensagem e de cada nota, com o nome, o tamanho e "Baixar".

A coluna da direita SHALL ter as seções que recolhem:
- **"Pessoa":** o nome e o local de trabalho e, a quem vê a pessoa, os contatos e "Abrir a ficha" (spec chamados, requisito "Quem vê e quem atende os chamados");
- **"Ativo ligado":** o resumo do ativo, com a situação em texto, os suprimentos, como "Toner crítico", o total de páginas e "Trocar o ativo", e, sem o ativo, "Ligar um ativo". A quem vê o estoque e as solicitações, mostra também o saldo do toner e a solicitação pendente, como "CF258A: 3 de 6, abaixo do mínimo; a solicitação 4 está aberta; “Pedir toner” se junta a ela", sem repetir a solicitação que já é a do chamado;
- **"Linha do tempo":** o caminho do chamado pelas situações, do primeiro passo ao de agora, cada passo com a situação, a hora, quem fez e o que houve com o relógio, como "Em atendimento · hoje, 09:40 · assumido por Ana Souza". O assumir desfeito sai da linha, e os outros eventos ficam só na conversa;
- **"Campos do tipo":** as respostas e os campos só da TI, para preencher, com a contagem, como "3 respondidos, 1 pendente". O pendente é o campo só da TI obrigatório e vazio, que o resolver exige. A escolha grava na hora, e o texto, o número e a data gravam ao sair do campo. O tipo sem campos não tem a seção.

As seções SHALL começar com o Ativo ligado e a Linha do tempo abertos, e a escolha SHALL ficar guardada neste navegador.

A mudança de um campo só da TI que esconde, pela condição, um campo com anexo SHALL pedir a confirmação antes de gravar, com o nome do campo e quantos arquivos saem, porque o anexo é removido na hora (spec chamados, requisito "Ativo ligado e campos da TI").

Assumir SHALL mostrar o aviso "Você assumiu o #1042." com "Desfazer".

#### Scenario: Chamado aguardando
- **WHEN** Ana abre o #1041, que aguarda Fernanda desde 09:21
- **THEN** o cabeçalho mostra "Aguardando o colaborador", e o quadro do prazo diz "Relógio parado · Parou às 09:21 · restam 1 h 44 min"

#### Scenario: Conversa nos cantos
- **WHEN** Ana, com as conversas "Nos cantos", abre o #1041
- **THEN** as mensagens de Fernanda ficam à esquerda, as de Ana e as notas internas à direita, cada uma num balão com o nome e a hora, e "Aguardando Fernanda · 09:21 · o relógio parou" continua no meio

#### Scenario: Mudança que esconde um anexo
- **WHEN** Ana muda o "Contrato de manutenção" do #1042 para "Sim", e a "Foto da peça", que só aparece com "Não", tem 1 arquivo
- **THEN** a tela pergunta "Mudar o campo “Contrato de manutenção”?", com "O campo “Foto da peça” some, e 1 arquivo é apagado.", "Mudar" e "Cancelar", e só grava depois de "Mudar"; com "Cancelar", o campo continua com "Não"

#### Scenario: Linha do tempo
- **WHEN** Ana abre o #1041, que Fernanda Rocha abriu ontem às 17:05, Ana Souza assumiu às 17:20 e aguarda Fernanda desde hoje, 09:21
- **THEN** a Linha do tempo mostra "Na triagem · ontem, 17:05 · aberto por Fernanda Rocha", "Em atendimento · ontem, 17:20 · assumido por Ana Souza" e "Aguardando o colaborador · hoje, 09:21 · o relógio parou", com o último como o passo de agora

#### Scenario: Seções guardadas neste navegador
- **WHEN** Ana fecha a Linha do tempo no #1042 e depois abre o #1041
- **THEN** a Linha do tempo do #1041 começa fechada, e o Ativo ligado, aberto

#### Scenario: Pedir toner sem a pendente
- **WHEN** Ana usa "Pedir toner" no #1042, e a PAT-00139 não está numa solicitação pendente
- **THEN** a gaveta "Pedir toner para o #1042" abre com Marina Rocha, a PAT-00139 e 1 preto, e "Registrar" grava a solicitação ligada ao #1042, com o aviso "Solicitação 5 registrada."

#### Scenario: Ver sem atender
- **WHEN** Carla, que só vê os chamados, abre o #1042
- **THEN** a tela mostra o chamado e a conversa, sem as ações e sem o campo de escrever

#### Scenario: Chamado que a conta não vê
- **WHEN** Bruno, que atende só Jundiaí, abre a notificação antiga do #1040, que passou para São Paulo
- **THEN** a tela diz "Chamado não encontrado."

### Requirement: Campo de escrever

O campo de escrever SHALL ficar no pé do chamado aberto, só para quem atende os locais do chamado, com:
- a chave "Mensagem para Fernanda | Nota interna" e, na mensagem, "Esperar a resposta", que troca "Enviar" por "Enviar e esperar a resposta";
- a caixa do texto, que cresce com ele, e embaixo dela os anexos, cada um com o nome, o tamanho e "Tirar", até 5;
- "Respostas prontas", o menu com todas as do tipo do chamado, e as duas primeiras ao lado, em botões, como "Pedir o print do erro";
- o clipe, para os anexos, e "Enviar". Ctrl+Enter manda.

A nota interna SHALL mudar o campo para o quadro tracejado da nota, sem as respostas prontas e sem "Esperar a resposta", e o botão SHALL dizer "Salvar a nota".

A resposta pronta SHALL entrar no campo onde está o cursor, numa linha dela quando o cursor está colado no texto, com o primeiro nome da pessoa, e ser mandada só pela ação de quem atende. A que espera a resposta SHALL ligar "Esperar a resposta".

Nesta versão, a ajuda do campo SHALL dizer "Escreva a resposta para Fernanda.".

O que se escreve SHALL continuar no campo quando a conversa se atualiza. Mandado, o campo SHALL esvaziar, e a conversa SHALL ir à última mensagem. A recusa SHALL ficar embaixo do campo, com a frase dela.

No chamado resolvido, o campo SHALL dar lugar a "Reabra o chamado para escrever.", com "Reabrir".

#### Scenario: Nota pelo atalho
- **WHEN** Ana escolhe "Nota interna", escreve e aperta Ctrl+Enter
- **THEN** a nota entra na conversa com "Só a TI vê", e o chamado continua na situação em que estava

#### Scenario: Resposta pronta que espera a resposta
- **WHEN** Ana escolhe "Pedir o print do erro", que espera a resposta, no #1041 de Fernanda Rocha
- **THEN** o texto entra no campo com "Fernanda", "Esperar a resposta" fica ligado, e o botão diz "Enviar e esperar a resposta"

#### Scenario: Conversa que se atualiza enquanto se escreve
- **WHEN** chega uma mensagem de Fernanda enquanto Ana escreve no #1041
- **THEN** a mensagem entra na conversa, e o que Ana escrevia continua no campo

#### Scenario: Escrever no resolvido
- **WHEN** Ana abre o #1040, resolvido
- **THEN** no lugar do campo fica "Reabra o chamado para escrever.", com "Reabrir"

### Requirement: Prazos

A tela dos prazos SHALL ter, no alto, três selos em texto, como "1 estourado", "3 vencem em até 2 h" e "3 com o relógio parado", e a legenda escrita:
- o tempo já gasto;
- o tempo que resta;
- o prazo do tipo;
- o tempo além do prazo, hachurado.

O selo de um grupo sem chamados SHALL sair.

Os chamados abertos SHALL ficar em grupos, cada um numa faixa, só os grupos com chamados:
- "Estourado";
- "Vence em até 2 horas · até as 11:40";
- "Vence hoje · depois das 11:40";
- "Vence depois de hoje";
- "Relógio parado";
- "Prazo ilegível", por último, com o chamado cujo prazo guardado não se lê.

No grupo, os chamados SHALL seguir o vencimento, e o empate, o número; os de relógio parado, o que resta do prazo, e os de prazo ilegível, o número.

Cada chamado SHALL ter:
- a barra até o prazo, com a linha do "agora";
- o prazo à direita, em mono, com o ícone e a palavra.

O de relógio parado e o de prazo ilegível SHALL ficar sem a barra, com "sem contagem de prazo".

A cor SHALL entrar só no estourado, a de perigo, e nos que vencem em até 2 h, a de atenção. Nos outros, a barra SHALL ficar em cinza, e o prazo, na cor do texto.

Sem chamados abertos, a tela SHALL dizer "Nenhum chamado aberto.".

#### Scenario: Prazo ilegível na lista
- **WHEN** o prazo guardado do #1045 não se lê
- **THEN** o #1045 fica no grupo "Prazo ilegível", depois do "Relógio parado", sem a barra e com "prazo ilegível" à direita, e nenhum selo o conta

Escolher um chamado SHALL abrir o painel ao lado, sem cobrir a lista. O painel SHALL ter:
- o prazo do tipo, como "Prazo do tipo, 8 h corridas", e a barra dele;
- quem pediu, quem atende e o ativo;
- a última mensagem;
- "Passar para…", com a carga de cada pessoa;
- a mensagem pronta para quem pediu, que quem atende pode mudar;
- "Avisar Sandra", a ação principal, que manda a mensagem;
- "Abrir o chamado".

#### Scenario: Avisar quem pediu
- **WHEN** Ana escolhe o #1033 nos prazos e usa "Avisar Sandra"
- **THEN** a mensagem entra na conversa do #1033 como mensagem para Sandra, e o painel continua aberto

### Requirement: Abrir um chamado

"Abrir um chamado" SHALL abrir uma gaveta, com:
- a pessoa, buscada pelo nome;
- o tipo, numa grade com o ícone, o nome e a frase, na ordem dos tipos, com os que só a TI abre;
- o formulário do tipo, com os campos só da TI;
- o título montado das respostas, que quem abre pode trocar;
- "Fica comigo", ligado.

A ação principal SHALL ser "Abrir o chamado". O retorno SHALL ser "Chamado #1043 aberto." com "Abrir". A recusa SHALL ficar no campo.

#### Scenario: Abertura pela gaveta
- **WHEN** Ana busca "Marina", escolhe Impressora, responde e usa "Abrir o chamado"
- **THEN** a gaveta fecha com "Chamado #1043 aberto.", e o #1043 aparece na coluna de Ana

### Requirement: Formulário que se preenche

O formulário do tipo SHALL se preencher do mesmo jeito na gaveta da abertura, nos "Campos do tipo" do chamado aberto e na prévia do colaborador, com:
- **os campos** que a condição mostra, na ordem do formulário (spec tipos-de-chamado, requisito "Condição de um campo"); na prévia, sem os campos só da TI;
- **o campo só da TI** com "Só a TI vê." e, quando obrigatório, "A resposta é exigida para resolver.", porque ele é opcional na abertura;
- **no chamado aberto,** os campos só da TI para preencher e as respostas da pessoa só para ler, com "Sem resposta" no campo que ficou vazio;
- **o campo Ativo** com as sugestões da pessoa antes de digitar, sob "Sugerido: de <nome>", "Sugerido: do local de trabalho de <nome>" ou "Sugerido: de <nome> e do local de trabalho", e com a busca pelo texto entre os ativos que a conta vê, só dos tipos do campo. A quem não vê os ativos, o campo SHALL mostrar só para ler a resposta que já tem, com "Você não vê os ativos."; sem resposta, o campo exigido SHALL dizer também quem pode respondê-lo: "Quem vê os ativos pode abrir este chamado." na abertura e "Quem vê os ativos pode responder este campo." no chamado aberto;
- **o campo Local** com o local de trabalho da pessoa sugerido;
- **o campo Número** só com os algarismos: os pontos de milhar e os espaços saem, e outro caractere não entra;
- **o campo Anexo** com cada arquivo enviado na hora, antes da gravação, até 5, cada um com o nome, o tamanho e "Tirar". Na prévia, o arquivo SHALL NOT ser enviado, e o campo SHALL dizer "Na prévia, o arquivo não é enviado.";
- **na prévia do colaborador, o visual da aba:** as perguntas numeradas na ordem em que aparecem, sem número no campo que aparece pela condição, que se cola à pergunta de que depende quando vem logo depois dela, com as escolhas em chips na linha do rótulo; fora disso, a Escolha única e o Sim ou não em cartões, com o "Nenhum" por último no campo que não é exigido; e as Várias opções em chips.

As recusas SHALL ficar no campo, e a recusa geral do formulário, no alto dele. A recusa do envio de um anexo SHALL dizer o nome do arquivo.

#### Scenario: Campo que aparece pela resposta
- **WHEN** Ana, na gaveta, escolhe "Manchando" em "O que está acontecendo?" e depois troca por "Atolando"
- **THEN** "Onde as manchas aparecem?" aparece logo depois dele e some com a troca, sem a resposta que tinha

#### Scenario: Ativos da pessoa primeiro
- **WHEN** Ana abre um chamado de Impressora em nome de Marina Lopes, responsável pela PAT-00139, que trabalha em Jundiaí › Recepção
- **THEN** "Qual impressora?" sugere a PAT-00139 e depois as impressoras da Recepção, sob "Sugerido: de Marina Lopes e do local de trabalho"

#### Scenario: Print anexado antes de abrir
- **WHEN** Ana anexa "erro-vpn.png" a "Uma foto ajuda" antes de abrir o chamado
- **THEN** o arquivo já foi enviado e aparece com o nome e o tamanho, e o chamado o toma ao ser aberto

#### Scenario: Respostas da pessoa no chamado aberto
- **WHEN** Diego abre os "Campos do tipo" do #1042
- **THEN** "O que está acontecendo?" aparece com "Manchando", só para ler, e o "Contador de páginas" aparece para preencher, com "Só a TI vê."

#### Scenario: Ativo a quem não vê os ativos
- **WHEN** Bruno, que atende os chamados sem ver os ativos, abre os "Campos do tipo" do #1042
- **THEN** "Qual impressora?" mostra a impressora da resposta, só para ler, com "Você não vê os ativos."

### Requirement: Tipos de chamado na tela

A tela dos tipos SHALL ter, à esquerda, a tabela dos tipos, com:
- a alça de arrastar;
- o ícone e o nome;
- o prazo de resolução, em mono;
- quem atende, ou "Triagem";
- os abertos.

A tabela SHALL ter também:
- só a exceção marcada com selo, como "Só a TI abre" e "Rascunho";
- a contagem, como "9 tipos";
- "Novo tipo" e "Duplicar".

À direita, o editor do tipo escolhido SHALL ter:
- o cabeçalho: o ícone grande, o nome, a situação em texto, a frase e "1 aberto · 38 no último ano";
- as seções "Identificação", "Prazo e atendimento", "O que acontece depois" e "Quem vê", com as chaves e o "Ligado" ou "Desligado" escrito;
- "Formulário: 6 campos", com "Editar os campos";
- no pé, "Descartar" e "Salvar o tipo", a ação principal.

Ao lado, "Como o colaborador vê" SHALL mostrar a prévia da aba:
- a faixa no alto, na cor da aba;
- o corpo neutro;
- os tipos que aparecem ao colaborador, em 4 colunas, com o ícone, o nome, a frase e o atalho de 1 a 9, sob "Aperte 1 a 8 ou clique", que vai até o atalho do último tipo; sem nenhum, "Nenhum tipo aparece para o colaborador.";
- o tipo editado marcado "editando", com a frase que se escreve.

"Duplicar" e "Novo tipo" SHALL abrir o Rascunho numa gaveta, sobre a lista escurecida, com:
- o aviso "Duplicado de Computador.", ao duplicar;
- o editor;
- a prévia com o tipo novo marcado "novo" e "Depois de escolher Equipamento novo:", com os campos que a pessoa vê, numerados, e o tipo de cada um;
- "Criar o tipo", a ação principal, e "Descartar rascunho".

Sair com mudanças sem salvar SHALL pedir confirmação.

#### Scenario: Frase na prévia
- **WHEN** quem configura muda a frase da Impressora para "Mancha, atola, faz barulho ou não imprime"
- **THEN** a prévia mostra a frase nova no cartão da Impressora, marcado "editando", antes de salvar

### Requirement: Construtor do formulário

"Editar os campos" SHALL abrir o construtor do formulário do tipo, com:
- **à esquerda, "Campos":** os 11 tipos de campo em botões com ícone. O clique acrescenta o campo no fim, e o arraste o põe na linha de encaixe, como "Solte o campo 'Número' aqui";
- **no meio, os campos:**
  - cada um com a alça, o ícone, o rótulo em peso forte e os selos;
  - o "Título do chamado" fixo no alto, com o exemplo das respostas e o seletor da resposta que dá o título, só com os campos de Escolha única, de Texto curto e de Ativo que a pessoa vê;
  - o campo escolhido aberto no lugar, com o rótulo, o nome no resumo, as opções, com "Acrescentar", os tipos de ativo, "Obrigatório", "Só a TI vê", a condição, "Apagar a resposta se o campo sumir" e "Remover o campo";
- **à direita, a prévia do colaborador,** menor que a real, com a nota "menor que a real; a marca tracejada é só do editor" e a marca do campo condicional, como "aparece só quando for Manchando".

A condição SHALL ser escrita como frase, com cada parte num seletor: "Mostrar 'Onde as manchas aparecem?' quando 'O que está acontecendo?' for 'Manchando'", com "e quando…" e "ou quando…" e o que cada resposta faz. O seletor do campo SHALL listar só o que a condição aceita (spec tipos-de-chamado, requisito "Condição de um campo"): os campos anteriores que servem, e, no campo que a pessoa vê, só os que ela também vê.

Cada recusa do formulário SHALL aparecer junto do que ela recusa, e a do "Pede o ativo", junto do primeiro campo Ativo.

O teclado SHALL mover um campo pelo menu dele, com "Subir" e "Descer".

A chave "Prévia do colaborador" SHALL mostrar a prévia em tamanho real, sem nenhuma marca do editor, com:
- "Ver como": uma pessoa, com o nome, o local e os ativos dela nas sugestões;
- o que ela vê, campo a campo, com o obrigatório, a condição, o opcional e os campos só da TI;
- o aviso dos campos escondidos, como "Só a TI vê o Contador de páginas e o Contrato de manutenção.";
- "O que chegaria para a TI":
  - o título montado;
  - o tipo e o ativo;
  - as respostas;
  - "Campos da TI: a TI preenche depois".

No pé, "Descartar" e "Salvar o formulário", a ação principal, SHALL vir com a frase de quantos chamados abertos mantêm o formulário anterior.

#### Scenario: Campo condicional na prévia
- **WHEN** quem configura escolhe "Atolando" em "O que está acontecendo?" na prévia em tamanho real
- **THEN** "Onde as manchas aparecem?" some da prévia, e "O que chegaria para a TI" passa a "Impressora atolando"

### Requirement: Respostas prontas e horário da TI na tela

A tela "Respostas prontas" SHALL listar as respostas na ordem, com a alça de arrastar, o rótulo, o começo do texto, "Espera a resposta" escrito e os tipos. "Nova resposta" e a escolha de uma resposta SHALL abri-la numa gaveta, com "Salvar" e "Remover".

A tela "Horário da TI" SHALL ter:
- os dias da semana, para marcar;
- o início e o fim;
- o fuso, numa lista;
- a carga cheia;
- "Salvar", com o retorno "Horário salvo.".

#### Scenario: Resposta pronta nova
- **WHEN** quem configura cria "Pedir o caminho da pasta", com "Espera a resposta" ligado, só no Acesso e senha
- **THEN** o campo de escrever dos chamados de Acesso e senha mostra o botão "Pedir o caminho da pasta"

### Requirement: Busca dos chamados

O provedor de busca dos chamados SHALL achar, no grupo "Chamados", até 8 chamados que a conta vê:
- pelo número, com ou sem o "#"; só com os algarismos, sem o "#", SHALL achar também os títulos que os têm, depois do chamado do número;
- pelas palavras do título, sem acento e em qualquer ordem.

O chamado do número SHALL vir primeiro, os abertos antes dos resolvidos e, em cada grupo, o mais novo primeiro. Cada resultado SHALL mostrar o número, o título, quem pediu e a situação em texto, e Enter SHALL abrir o chamado. Com o módulo Chamados desligado, a busca SHALL NOT achar chamados.

Os cabeçalhos do Início dos chamados, de "Quem está com o quê" e dos Prazos SHALL ter o campo "Buscar nos chamados", com a mesma busca: a partir de 2 caracteres, os mesmos resultados SHALL aparecer embaixo do campo, e Enter ou o clique SHALL abrir o chamado.

#### Scenario: Busca no cabeçalho
- **WHEN** Ana digita "1042" no "Buscar nos chamados" de "Quem está com o quê" e tecla Enter
- **THEN** o #1042 abre, e o campo fica vazio

#### Scenario: Pelo número
- **WHEN** Ana digita "1042" na busca
- **THEN** a busca mostra "#1042 Impressora manchando", com Marina Lopes e "Em atendimento", e Enter abre o chamado

#### Scenario: Pelas palavras, os abertos primeiro
- **WHEN** Ana digita "impressora" na busca, com o #1046 da impressora resolvido
- **THEN** a busca mostra os chamados abertos com "Impressora" no título, do mais novo ao mais velho, e o #1046 depois deles

#### Scenario: Os algarismos no título
- **WHEN** Ana digita "404"
- **THEN** a busca mostra o "Impressora M404 travando"; com "#404", só o chamado 404, se ele existir

#### Scenario: Fora do alcance
- **WHEN** Bruno, que vê os chamados de Campinas, digita "impressora"
- **THEN** a busca mostra só os chamados de Campinas, sem os de Jundiaí e sem os chamados sem local

### Requirement: Selos, prazo em texto e movimento

Toda situação SHALL vir em texto, num selo com borda, maiúsculas e ícone, e a mesma palavra SHALL ter sempre a mesma marca:

| Selo | Marca | Ícone |
|---|---|---|
| Estourado | perigo | o círculo com a exclamação |
| Vencem em até 2 h | atenção | o relógio |
| Relógio parado | neutro | a ampulheta |
| Na triagem | neutro | a bandeja |
| Em atendimento | informação | o fone |
| Aguardando o colaborador | informação | a ampulheta |
| Resolvido | sucesso | o visto |
| Em uso | sucesso | o visto |
| Inativo | neutro | o círculo |
| Só a TI abre | informação | o cadeado |
| Rascunho e Ainda não criado | atenção | o lápis |
| Toner crítico | perigo | o círculo com a exclamação |

O selo de uma contagem SHALL levar a marca da palavra, como "1 estourado" e "3 com o relógio parado".

O prazo de um quadrado e de uma linha SHALL ir em mono, com o ícone e a cor do estado, e a palavra ao lado:
- no quadrado, curto: "estourado", "parado" ou "vence em 2 h";
- na linha, inteiro: "estourado há 20 min", "relógio parado" ou "vence em 2 h".

O chamado de prazo ilegível, que não tem o relógio, SHALL dizer "prazo ilegível", no quadrado e na linha.

O ícone SHALL ser o do selo do estado: o círculo com a exclamação no estourado, a ampulheta no parado e o relógio nos outros. A cor SHALL entrar só no estourado, a de perigo, em peso forte, e no que vence em até 2 h, a de atenção; os outros SHALL ficar na cor do texto. O tempo do prazo SHALL avançar sozinho a cada minuto, sem recarregar.

O movimento SHALL ser só de mudança de estado:
- o fundo ao passar o ponteiro, em 120 ms;
- a prévia, 200 ms depois de o ponteiro parar;
- o quadrado que entra na coluna, em 200 ms;
- a gaveta, em 240 ms, com o véu em 200 ms;
- o campo condicional que some ou aparece, em 200 ms de opacidade;
- o aviso, com a mola dos avisos.

Com o movimento reduzido, nada SHALL se mover.

#### Scenario: Estado sem cor
- **WHEN** alguém que não distingue cores olha a coluna de Renato
- **THEN** o quadrado do #1033 diz "estourado" em texto, além da cor, e a linha dele nos prazos, "estourado há 20 min"

#### Scenario: Prazo que anda sozinho
- **WHEN** o #1039 vence às 10:40:30, e a lista dos prazos fica aberta sem recarregar
- **THEN** às 10:39 a linha dele diz "vence em 1 min", às 10:40, "vence em menos de 1 min", e às 10:41, "estourado há menos de 1 min", com o círculo com a exclamação e a cor de perigo

### Requirement: Telas atualizadas e módulo desligado

As telas dos chamados SHALL se atualizar sozinhas quando chegam os eventos `chamados.mudaram` e `ajustes-dos-chamados.mudaram`, sem uma ação do usuário e sem perder o que se escreve no campo de escrever. O `ajustes-dos-chamados.mudaram` SHALL atualizar também os chamados abertos na tela, porque o horário da TI muda os prazos deles.

Com o módulo desligado, o endereço de uma tela dos chamados SHALL dizer "O módulo Chamados está desligado nesta organização.", e a primeira tela ao entrar SHALL ser o Início.

#### Scenario: Chamado passado com a tela aberta
- **WHEN** Ana passa o #1038 a Renato, e Bruno está com "Quem está com o quê" aberto
- **THEN** o quadrado do #1038 passa para a coluna de Renato na tela de Bruno, sem recarregar

#### Scenario: Escrevendo durante a atualização
- **WHEN** Ana escreve uma mensagem no #1041, e chega uma nota de Bruno no mesmo chamado
- **THEN** a nota aparece na conversa, e o texto de Ana continua no campo
