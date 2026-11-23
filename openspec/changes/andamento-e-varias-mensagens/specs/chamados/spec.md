## ADDED Requirements

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

## MODIFIED Requirements

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
