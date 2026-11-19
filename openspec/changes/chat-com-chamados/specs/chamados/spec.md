## MODIFIED Requirements

### Requirement: Chamado

O chamado SHALL ser o pedido de uma pessoa à TI. A TI o abre em nome da pessoa (requisito "Abrir um chamado pela TI"), e quem tem `chamados.pedir` o abre pelo chat, a partir de uma mensagem (requisito "Abrir um chamado pelo chat"). A aba dos colaboradores vem nas changes do S8.

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
- a origem: a TI, ou o chat, com a conversa e a mensagem de onde ele foi aberto;
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

### Requirement: Conversa do chamado

A conversa SHALL ter, na ordem em que aconteceram:
- **as mensagens da TI para a pessoa,** de 1 a 4.000 caracteres, com até 5 anexos (spec arquivos-e-imagens, requisitos "Arquivos aceitos" e "Anexos dos chamados"), com as opções de resposta (requisito "Pergunta com opções") e o cartão do ativo (requisito "Cartão do ativo na mensagem");
- **as mensagens de quem participa,** a pessoa do chamado e quem o abriu pelo chat, do mesmo tamanho e com os anexos (requisito "Resposta da pessoa");
- **as notas internas,** do mesmo tamanho e com os anexos e o cartão do ativo, marcadas "Só a TI vê" (requisito "Quem vê e quem atende os chamados");
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

#### Scenario: Origem pelo chat
- **WHEN** Bruno Lima, que não é da Equipe Financeiro, abre o #1045, aberto pela mensagem das 10:19 de Paulo Nunes
- **THEN** a conversa começa com "Aberto a partir da conversa Equipe Financeiro" e a mensagem de Paulo, com a hora

#### Scenario: Mensagem que chega ao chat
- **WHEN** Ana manda uma mensagem para Fernanda Rocha no #1041, e a conta de Fernanda usa o chat
- **THEN** a mensagem aparece na conversa do #1041 no chat de Fernanda

#### Scenario: Pessoa sem o chat
- **WHEN** Ana manda uma mensagem no #1050, de Marina Lopes, que não tem conta
- **THEN** a mensagem fica no chamado, e ninguém a recebe no chat

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

### Requirement: Notificações dos chamados

Os chamados SHALL notificar pela notificação da plataforma (spec notificacoes), com a origem "Chamados" e o endereço do chamado:
- **o chamado passado a uma conta,** por outra pessoa ou pelo atendimento do tipo, e o reaberto por outra pessoa, também pela pessoa do chamado, que volta a quem o resolveu, a essa conta, na severidade Informação: "Chamado #1043 com você: Impressora manchando";
- **o chamado que cai na triagem,** a cada conta que atende os locais dele, fora quem abriu, devolveu ou reabriu, na severidade Informação: "Chamado #1043 na triagem: Impressora manchando";
- **o prazo estourado** (requisito "Prazo estourado"), na severidade Atenção;
- **a resposta da pessoa,** a mensagem ou a escolha de quem participa do chamado (requisito "Resposta da pessoa"), a quem atende o chamado, na severidade Informação: "Fernanda Rocha respondeu o #1041", com o começo da mensagem ou a opção escolhida. O chamado na triagem SHALL NOT notificar a resposta: ele já está na lista da triagem.

No chat (spec chat), os chamados SHALL notificar como mensagem, na severidade Informação, com a origem "Chamados" e o endereço do chamado no app do chat, a conta da pessoa e a de quem abriu o chamado pelo chat, quando usam o chat:
- **a mensagem da TI para a pessoa:** "Ana Souza respondeu o #1041", com o começo da mensagem;
- **o resolvido:** "#1045 resolvido: Impressora manchando", com o começo do "O que foi feito".

O começo SHALL ter até 120 caracteres, cortado no fim de uma palavra, com reticências quando foi cortado. As outras ações SHALL NOT notificar a pessoa: ela as vê na conversa. A nota interna SHALL NOT notificar ninguém.

Quem assume, reabre ou abre o chamado com "Fica comigo" SHALL NOT ser notificado do próprio ato, e quem participa SHALL NOT ser notificado da própria mensagem. O desfazer SHALL NOT notificar: ele devolve o chamado a quem estava com ele, ou à triagem, e o assumir não avisou ninguém de que ele saiu. Retomar e resolver SHALL NOT notificar a TI: quem atende não muda, e nada cai na triagem. Pelo mesmo motivo, a troca do ativo, do título e dos campos da TI SHALL NOT notificar.

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

### Requirement: Permissões, auditoria e eventos dos chamados

O catálogo SHALL ter, na área "Chamados":
- `chamados.ver`: "Ver os chamados, com as notas internas", por local, pelos locais do chamado;
- `chamados.atender`: "Abrir, assumir, passar, responder e resolver os chamados", por local, incluindo `chamados.ver`;
- `chamados.configurar`: "Configurar os tipos de chamado, o formulário, as respostas prontas e o horário da TI", na organização;
- `chamados.pedir`: "Pedir chamados pelo chat, em nome de si ou de outra pessoa", na organização.

O perfil Administrador SHALL ter as quatro.

A pessoa do chamado e quem o abriu pelo chat SHALL ler, responder, reabrir e avaliar o próprio chamado sem nenhuma dessas permissões, enquanto usam o chat (requisito "Leitura do chamado pela pessoa").

A auditoria SHALL registrar:
- **nos chamados:**
  - a abertura, pela TI e pelo chat;
  - assumir, desfazer, passar, devolver à triagem, aguardar, retomar, resolver e reabrir, também o retomar e o reabrir pela pessoa;
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

## ADDED Requirements

### Requirement: Abrir um chamado pelo chat

Quem tem `chamados.pedir` e usa o chat, com os módulos Chat e Chamados ligados, SHALL abrir um chamado a partir de uma mensagem de uma conversa direta, de uma equipe ou de um canal de que participa, de quem quer que a tenha escrito, também a própria. A mensagem que já virou chamado SHALL NOT virar outro (spec chat, "Chamados da conversa").

A abertura SHALL pedir:
- **o tipo,** entre os Em uso com "Aparece para o colaborador" e sem "Só a TI abre" (spec tipos-de-chamado, "Quem vê o tipo"), na ordem dos tipos;
- **o título,** de 1 a 120 caracteres;
- **o ativo,** só no tipo que pede o ativo (spec tipos-de-chamado, "O que acontece depois"), entre os sugeridos pelo primeiro campo Ativo do formulário, com os tipos de ativo dele: os sob a responsabilidade da pessoa e os do local de trabalho dela. O primeiro sugerido SHALL vir escolhido;
- **"No nome de":** a pessoa da conta que abre, que se troca por outra pessoa ativa (spec administracao-de-pessoas, "Nomes das pessoas para a escolha"). Os ativos sugeridos SHALL seguir a pessoa escolhida.

Para a escolha, quem abre SHALL ler só o identificador, o nome e o patrimônio dos ativos sugeridos, sem `ativos.ver`.

O formulário do tipo SHALL NOT ser pedido: a mensagem citada descreve o pedido. As respostas SHALL ficar vazias, fora a do primeiro campo Ativo, que é o ativo escolhido, e os campos obrigatórios SHALL NOT barrar a abertura.

O chamado SHALL nascer como na abertura pela TI, sem o "Fica comigo": com o número, os locais, a situação e quem atende pelo tipo, o prazo e a solicitação do tipo que gera uma. A pessoa escolhida em "No nome de" é a pessoa do chamado, e a conta que abre é quem abriu.

As recusas SHALL ser:
- "Escolha o tipo." e "Esse tipo não está disponível para abrir pelo chat.", no tipo;
- "Escreva o título." e "Use até 120 caracteres.", no título;
- "Escolha o ativo.", "Escolha um ativo da lista." e, sem nenhum sugerido, "Nenhum ativo desse tipo está com <pessoa> ou no local dela. Escolha outro tipo ou escreva à TI.", no ativo;
- "Escolha a pessoa.", em "No nome de";
- "Esta mensagem já virou o chamado #1045.";
- "A mensagem não foi encontrada.", na mensagem de uma conversa de que a conta não participa.

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

- as etapas, nesta ordem: Aberto, Em andamento, Aguardando você e Resolvido, com a de agora marcada;
- a previsão da resposta, pelo prazo de resposta do tipo, como "responde em ~1 h";
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

#### Scenario: A pessoa lê sem as notas
- **WHEN** Fernanda Rocha abre o #1041 no chat
- **THEN** ela vê "Aguardando você", as mensagens dela e as de Ana, e não vê as notas das 17:24 e das 09:25

#### Scenario: Chamado de outra pessoa
- **WHEN** Paulo Nunes pede o #1041, de Fernanda Rocha, pela API do chat
- **THEN** a API responde que o chamado não existe

### Requirement: Resposta nova

Cada participante SHALL ter, em cada chamado, a resposta nova: as mensagens da TI para a pessoa depois da última mensagem ou escolha dele, ou do último "Marcar como vista" dele. A resposta nova SHALL ficar até ele responder, escolher uma opção ou marcar como vista. Abrir a conversa SHALL NOT tirá-la.

Responder, escolher e marcar como vista SHALL marcar como lidas as notificações desse chamado na conta.

#### Scenario: Resposta que fica
- **WHEN** Ana responde o #1041 às 09:21, e Fernanda Rocha abre a conversa às 10:12 sem responder
- **THEN** o #1041 continua com a resposta nova

#### Scenario: Marcar como vista
- **WHEN** Fernanda Rocha escolhe "Marcar como vista" no #1044
- **THEN** a resposta nova do #1044 sai, e a mensagem seguinte de Bruno a traz de volta

### Requirement: Resposta da pessoa

Quem participa SHALL mandar mensagens no chamado, de 1 a 4.000 caracteres, com até 5 anexos, e escolher as opções das perguntas (requisito "Pergunta com opções"). A mensagem e a escolha SHALL ter, pela situação:
- **Na triagem e Em atendimento:** a mensagem entra na conversa, e a situação não muda;
- **Aguardando o colaborador:** o chamado SHALL ser retomado, Em atendimento com quem atende, e o relógio volta a contar de onde parou;
- **Resolvido:** a mensagem SHALL reabrir o chamado, como o "Reabrir" (requisito "Ações do atendimento"), e "Reabrir", sem escrever, faz o mesmo. A escolha SHALL ser recusada;
- **Fechado:** a mensagem e a escolha SHALL ser recusadas.

As recusas SHALL ser as das mensagens (requisito "Conversa do chamado") e:
- "O chamado #1045 está resolvido. Escreva para reabrir.", na escolha do resolvido;
- "O chamado #1045 está fechado. Para o mesmo problema, abra outro chamado.", no fechado.

#### Scenario: Resposta que retoma
- **WHEN** Fernanda Rocha responde "A pasta se chama Financeiro-2026" no #1041, que aguarda ela desde as 09:21
- **THEN** o #1041 volta a Em atendimento com Ana, e o relógio volta a contar com 1 h 44 min restando

#### Scenario: Escrever no resolvido
- **WHEN** Fernanda Rocha escreve "Voltou a manchar" no #1045, resolvido por Bruno
- **THEN** o #1045 é reaberto, Em atendimento com Bruno, que recebe "Chamado #1045 com você", e a conversa mostra "Você reabriu o chamado" a ela

### Requirement: Pergunta com opções

A mensagem da TI para a pessoa SHALL poder levar de 2 a 3 opções de resposta, cada uma de 1 a 40 caracteres, sem os espaços das pontas e única na mensagem.

Quem participa SHALL escolher uma das opções. A escolha SHALL guardar quem escolheu e quando, SHALL NOT virar uma mensagem e SHALL NOT mudar depois. Cada pergunta SHALL ter uma escolha só, de quem escolher primeiro. A escolha conta como a resposta da pessoa (requisito "Resposta da pessoa").

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

No chamado resolvido, quem participa SHALL avaliar o atendimento uma vez por resolução, com:
- o nível, entre "Ruim · Não resolveu", "Regular · Resolveu em parte", "Bom · Resolveu" e "Ótimo · Resolveu muito bem";
- o comentário, opcional, de até 500 caracteres.

A avaliação SHALL NOT mudar depois. Reaberto e resolvido de novo, o chamado SHALL pedir outra avaliação, e a de antes fica na conversa. A TI SHALL ver a avaliação na conversa, como "Fernanda Rocha avaliou: Ótimo · Resolveu muito bem", com o comentário.

As recusas SHALL ser "Escolha um nível.", "Use até 500 caracteres.", "O atendimento já foi avaliado." e "O chamado não está resolvido.".

#### Scenario: Avaliar
- **WHEN** Fernanda Rocha marca "Ótimo · Resolveu muito bem" no #1045 e envia
- **THEN** a conversa dela diz "Você marcou: Ótimo. Obrigado!", e Bruno vê "Fernanda Rocha avaliou: Ótimo · Resolveu muito bem"

#### Scenario: Avaliar de novo
- **WHEN** Fernanda Rocha tenta avaliar outra vez o #1045 na mesma resolução
- **THEN** a avaliação é recusada com "O atendimento já foi avaliado."

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
