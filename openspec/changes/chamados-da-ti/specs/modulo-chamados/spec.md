## Purpose

Dar aos chamados um módulo na casca, que é a primeira tela da TI: quem está com o quê, a triagem, os prazos, o chamado aberto com a conversa, a abertura em nome da pessoa e a configuração dos tipos, do formulário, das respostas prontas e do horário da TI.

## ADDED Requirements

### Requirement: Chamados no dock

A casca SHALL ter o módulo Chamados, com o ícone da boia, primeiro na ordem de fábrica do dock, antes do Início (spec dock). Ele SHALL ser visível para quem tem `chamados.ver`, `chamados.atender` ou `chamados.configurar`, e só com o módulo ligado na organização.

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

Abrir a aplicação no endereço da organização, sem caminho, SHALL levar ao Início dos chamados a conta que vê os chamados, com o módulo ligado. As outras contas SHALL ver o Início. Escolher o Início no dock SHALL abrir o Início, sem levar aos chamados.

A troca SHALL acontecer só na primeira carga de cada aba do navegador. Recarregar a página SHALL manter a tela em que a conta estava, também o Início.

Com a sessão desconhecida, porque o servidor não respondeu, a casca SHALL ficar no Início.

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
- **a coluna "Sem responsável",** tracejada, com os chamados da triagem;
- **uma coluna por pessoa da TI** (spec chamados, requisito "Carga de cada pessoa"), com:
  - a sigla num círculo;
  - o nome em peso forte;
  - "2 abertos · mais antigo #1041, há 17 h", ou só "0 abertos";
  - a barra de carga em pedaços;
  - no pé, "Resolveu hoje: #1035" ou "Nada resolvido hoje";
- **a coluna de quem não atende mais os chamados** e ainda tem chamados abertos, depois das outras, com "não atende mais os chamados" junto do nome;
- **"Contando só os chamados dos locais que você vê.",** acima das colunas, a quem não vê os chamados da organização inteira.

Cada chamado SHALL ser um quadrado com:
- o ícone do tipo;
- o número, em mono;
- uma linha só de título, cortada em reticências;
- o prazo, em mono, com o ícone e a palavra.

Na coluna, os quadrados SHALL seguir o vencimento:
1. os estourados;
2. os que vencem antes;
3. os de relógio parado, por último.

Parar o ponteiro num quadrado por 200 ms, ou levar o foco a ele, SHALL abrir a prévia, opaca, sobre a área vazia das colunas. A prévia SHALL ter:
- a situação do prazo, como "Estourado há 20 min";
- o título inteiro;
- quem pediu, o ativo e quem atende;
- a última mensagem, com quem a escreveu e a hora;
- "Assumir", a ação principal;
- "Passar para…", com a carga de cada pessoa, como "Ana · 2 abertos".

Esc SHALL fechar a prévia. Enter e o clique SHALL abrir o chamado.

O menu do botão direito e o do teclado SHALL ter "Abrir o chamado", "Assumir", "Passar para…" e "Devolver à triagem", conforme as ações que o chamado aceita (spec chamados, requisito "Ações do atendimento"): sem "Assumir" no chamado que já está com a conta e sem "Devolver à triagem" no da triagem e no aguardando.

#### Scenario: Prévia do estourado
- **WHEN** Ana para o ponteiro no #1033, com Renato
- **THEN** a prévia mostra "Estourado há 20 min", o título inteiro, Sandra Melo, o ativo, Renato, a última mensagem de Sandra às 09:12, "Assumir" e "Passar para…" com Ana 2, Bruno 2 e Diego 3 abertos

### Requirement: Arrastar para passar

Arrastar um quadrado para a coluna de uma pessoa SHALL passar o chamado a ela. Arrastá-lo para "Sem responsável" SHALL devolvê-lo à triagem.

Durante o arraste:
- o lugar de origem SHALL ficar com o contorno tracejado e o aviso "O #1038 está sendo movido. O prazo dele vence em 2 h.";
- a coluna sob o ponteiro SHALL ganhar a borda forte, o pedaço seguinte da barra tracejado e a frase "Soltar para passar a Renato · o prazo continua contando", ou, no chamado aguardando, "Soltar para passar a Renato · o relógio continua parado";
- a coluna de quem não atende os locais do chamado SHALL dizer "Renato não atende Jundiaí" e SHALL NOT receber o quadrado;
- a coluna de quem não atende mais os chamados SHALL NOT receber o quadrado;
- a coluna "Sem responsável" SHALL dizer, no chamado aguardando, "O #1041 está aguardando Fernanda" e SHALL NOT recebê-lo.

Esc SHALL cancelar o arraste. Soltar fora de uma coluna SHALL deixar o chamado como estava.

#### Scenario: Passar arrastando
- **WHEN** Ana arrasta o #1038 da triagem para a coluna de Renato e solta
- **THEN** o #1038 entra na coluna de Renato, que passa de 2 para 3 abertos, e Renato é avisado

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
  - o detalhe: "Abriu às 07:40 · conta das 08:00 · vence às 16:00", "Parou às 09:21 · restam 1 h 44 min" ou, parado depois do prazo, "Parou às 09:40 · passou 20 min do prazo", no tempo do relógio;
  - com a primeira resposta pendente, "Responder até 08:30", ou "Resposta atrasada desde 08:30".

A conversa SHALL ficar numa coluna central, sem balão:
- cada mensagem com quem escreveu e a hora;
- cada nota interna num quadro tracejado, com o cadeado e "Só a TI vê";
- cada evento numa linha, como "Aguardando Fernanda · 09:21 · o relógio parou".

A coluna da direita SHALL ter as seções que recolhem:
- **"Pessoa":** o nome e o local de trabalho e, a quem vê a pessoa, os contatos e "Abrir a ficha" (spec chamados, requisito "Quem vê e quem atende os chamados");
- **"Ativo ligado":** o resumo do ativo, com a situação em texto, os suprimentos, como "Toner crítico", o total de páginas, "Virar OS", "Pedir toner" e "Trocar o ativo". A quem vê o estoque e as solicitações, mostra também o saldo do toner e a solicitação pendente, como "CF258A: 3 de 6, abaixo do mínimo; a solicitação 4 está Aberta; 'Pedir toner' se junta a ela";
- **"Linha do tempo":** os eventos do chamado;
- **"Campos do tipo":** as respostas e os campos só da TI, para preencher, com a contagem, como "3 respondidos, 1 pendente".

As seções SHALL começar com o Ativo ligado e a Linha do tempo abertos, e a escolha SHALL ficar guardada neste navegador.

A mudança de um campo só da TI que esconde, pela condição, um campo com anexo SHALL pedir a confirmação antes de gravar, com o nome do campo e quantos arquivos saem, porque o anexo é removido na hora (spec chamados, requisito "Ativo ligado e campos da TI").

Assumir SHALL mostrar o aviso "Você assumiu o #1042." com "Desfazer".

#### Scenario: Chamado aguardando
- **WHEN** Ana abre o #1041, que aguarda Fernanda desde 09:21
- **THEN** o cabeçalho mostra "Aguardando o colaborador", e o quadro do prazo diz "Relógio parado · Parou às 09:21 · restam 1 h 44 min"

#### Scenario: Mudança que esconde um anexo
- **WHEN** Ana muda o "Contrato de manutenção" do #1042 para "Sim", e a "Foto da peça", que só aparece com "Não", tem 1 arquivo
- **THEN** a tela pergunta "A Foto da peça some, e 1 arquivo é apagado." com "Mudar" e "Cancelar", e só grava depois de "Mudar"

#### Scenario: Ver sem atender
- **WHEN** Carla, que só vê os chamados, abre o #1042
- **THEN** a tela mostra o chamado e a conversa, sem as ações e sem o campo de escrever

### Requirement: Campo de escrever

O campo de escrever SHALL ter:
- a chave "Mensagem para Fernanda | Nota interna";
- "Respostas prontas", com as do tipo do chamado em botões, como "Pedir o print do erro";
- o clipe, para os anexos;
- "Enviar" e "Enviar e esperar a resposta". Ctrl+Enter manda.

A nota interna SHALL mudar o campo para o quadro tracejado da nota. A resposta pronta SHALL entrar no campo, com o primeiro nome da pessoa, e ser mandada só pela ação de quem atende. A que espera a resposta SHALL trocar "Enviar" por "Enviar e esperar a resposta".

Nesta versão, a ajuda do campo SHALL dizer "Escreva a resposta para Fernanda.".

No chamado resolvido, o campo SHALL dar lugar a "Reabra o chamado para escrever.", com "Reabrir".

#### Scenario: Nota pelo atalho
- **WHEN** Ana escolhe "Nota interna", escreve e aperta Ctrl+Enter
- **THEN** a nota entra na conversa com "Só a TI vê", e o chamado continua na situação em que estava

### Requirement: Prazos

A tela dos prazos SHALL ter, no alto, três selos em texto, como "1 estourado", "3 vencem em até 2 h" e "3 com o relógio parado", e a legenda escrita:
- o tempo já gasto;
- o tempo que resta;
- o prazo do tipo;
- o tempo além do prazo, hachurado.

Os chamados abertos SHALL ficar em grupos, cada um numa faixa:
- "Estourado";
- "Vence em até 2 horas · até as 11:40";
- "Vence hoje · depois das 11:40";
- "Vence depois de hoje";
- "Relógio parado".

Cada chamado SHALL ter:
- a barra até o prazo, com a linha do "agora";
- o prazo à direita, em mono, com o ícone e a palavra.

A cor SHALL entrar só no estourado, a de perigo, e nos que vencem em até 2 h, a de atenção. Os outros SHALL ficar em cinza.

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
- os tipos que aparecem ao colaborador, em 4 colunas, com o ícone, o nome, a frase e o atalho de 1 a 9;
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

O provedor de busca dos chamados SHALL achar, no grupo "Chamados", os chamados que a conta vê:
- pelo número, com ou sem o "#";
- pelas palavras do título, sem acento e em qualquer ordem.

Cada resultado SHALL mostrar o número, o título, quem pediu e a situação em texto, e Enter SHALL abrir o chamado.

#### Scenario: Pelo número
- **WHEN** Ana digita "1042" na busca
- **THEN** a busca mostra "#1042 Impressora manchando", com Marina Lopes e "Em atendimento", e Enter abre o chamado

### Requirement: Selos, prazo em texto e movimento

Toda situação SHALL vir em texto, num selo com borda, maiúsculas e ícone, e a mesma palavra SHALL ter sempre a mesma marca:

| Selo | Marca | Ícone |
|---|---|---|
| Estourado | perigo | o círculo com o x |
| Vencem em até 2 h | atenção | o relógio |
| Relógio parado | neutro | a ampulheta |
| Na triagem | neutro | a bandeja |
| Em atendimento | informação | o fone |
| Aguardando o colaborador | informação | a ampulheta |
| Resolvido | sucesso | o visto |
| Em uso | sucesso | o visto |
| Só a TI abre | informação | o cadeado |
| Rascunho e Ainda não criado | atenção | o lápis |
| Toner crítico | perigo | a gota |

O prazo de um quadrado e de uma linha SHALL ir em mono, com o ícone e a cor do estado, e a palavra ao lado. O tempo do prazo SHALL avançar sozinho a cada minuto, sem recarregar.

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
- **THEN** o #1033 diz "estourado há 20 min" em texto, além da cor

### Requirement: Telas atualizadas e módulo desligado

As telas dos chamados SHALL se atualizar sozinhas quando chegam os eventos `chamados.mudaram` e `ajustes-dos-chamados.mudaram`, sem uma ação do usuário e sem perder o que se escreve no campo de escrever. O `ajustes-dos-chamados.mudaram` SHALL atualizar também os chamados abertos na tela, porque o horário da TI muda os prazos deles.

Com o módulo desligado, o endereço de uma tela dos chamados SHALL dizer "O módulo Chamados está desligado nesta organização.", e a primeira tela ao entrar SHALL ser o Início.

#### Scenario: Chamado passado com a tela aberta
- **WHEN** Ana passa o #1038 a Renato, e Bruno está com "Quem está com o quê" aberto
- **THEN** o quadrado do #1038 passa para a coluna de Renato na tela de Bruno, sem recarregar

#### Scenario: Escrevendo durante a atualização
- **WHEN** Ana escreve uma mensagem no #1041, e chega uma nota de Bruno no mesmo chamado
- **THEN** a nota aparece na conversa, e o texto de Ana continua no campo
