Vale o modo rápido do `docs/agentes.md` até a `chamados-da-ti` ir para a produção-teste:
- o "Começa pelos testes…" fica só onde a tela não mostra o erro: a conta do prazo e do fechamento, a ordenação e a permissão;
- o "Verificar" fica com os testes da tarefa, o lint, o typecheck e, na tarefa com tela, a tela no `pnpm dev`, contra o mockup (`r3-17-chat-tickets`). As suítes inteiras rodam no CI do PR rascunho `dev` → `main`, aberto com o primeiro commit de tarefa;
- a revisora lê o diff do commit, depois dele;
- os casos raros vão para `.grafite/revisoes/chat-com-chamados-pendencias.md`;
- a tarefa que muda uma tela acerta no mesmo commit a web simulada, as pontas a ponta e as referências da regressão visual que ela muda, para o CI do PR ficar verde a cada commit.

## 1. Banco

- [x] 1.1 As tabelas do chat (design, decisão 1): `conversas`, com o cadastro da equipe e do canal e os CHECKs de cada tipo, o par da direta único e o nome único entre os ativos; `mensagens_do_chat`, só com INSERT e SELECT para o papel da aplicação, com a resposta da mesma conversa; `reacoes_das_mensagens`, com o DELETE; `anexos_do_chat`; e `leituras_das_conversas`. Todas com `orgScoped()` e o RLS ativo e forçado. Verificar: o teste da migration, o teste-guarda do RLS, o lint e o typecheck.
- [x] 1.2 O que muda nos chamados (decisão 2):
  - a origem `chat`, com a conversa e a mensagem, e a mensagem única;
  - o `fechado_em`, só no resolvido;
  - na conversa, a espécie `origem`, as `opcoes`, o `cartao`, o evento sem autor só no `fechou` e os índices únicos parciais do `escolheu` e do `avaliou`;
  - a `leituras_dos_chamados` e as `opcoes` das respostas prontas;
  - os CHECKs só alargados, com o teste de que a gravação da versão anterior continua aceita;
  - as listas do banco, com o teste que as compara com o domínio.

  Verificar: esses testes, o teste da migration, o lint e o typecheck.
- [x] 1.3 As notificações e os eventos (decisões 4 e 6):
  - a `mensagem`, o `assunto` e a `mensagem_do_chat_id` nas notificações, com o índice;
  - os `grupos` nos eventos, com o CHECK;
  - os `grupos` no `PublicoDoEvento` e no `podeReceber`, que restringem a `permissao`;
  - a conexão com os grupos da conta, relidos no `acessos.mudaram`;
  - o `registrarEvento` em linhas de 20;
  - o `chat.mudou` nos `TIPOS_DE_EVENTO` e na cópia do contrato de módulo.

  Começa pelos testes do `podeReceber` e do distribuidor. Verificar: esses testes, o da gravação em linhas, o lint e o typecheck.

## 2. Domínio

- [x] 2.1 Quem usa o chat e quem participa (decisão 3): o `usaOChat`, quem participa da direta, da equipe (pelo grupo ativo) e do canal, a arquivada só para ler, quem escreve (com "Só TI escreve neste canal." e a frase da equipe), o "(TI)" e o `participaDoChamado`. Começa pelos testes unitários. Verificar: esses testes, o lint e o typecheck.
- [x] 2.2 As mensagens, as reações e as citações:
  - o `conferirMensagem`: de 1 a 4.000 caracteres sem os espaços das pontas, até 5 anexos e as frases;
  - o `conferirReacao`: as três de sempre, a escrita de 1 a 20 e o teto de 10 textos;
  - o começo do texto em 120, cortado no fim de uma palavra, com as reticências;
  - o `citacoesDeChamados`: o "#" separado das outras palavras, até 10;
  - o `comandoDoAtivo`: o "/ativo" com e sem o patrimônio.

  Verificar: os testes unitários, o lint e o typecheck.
- [x] 2.3 As equipes e os canais: o `conferirEquipeOuCanal`, com o nome, o tipo, o grupo, quem escreve, o teto de 100 e as frases da spec. Verificar: os testes unitários, o lint e o typecheck.
- [x] 2.4 As listas e as contagens do chat:
  - a ordem de CHAMADOS (os que aguardam a conta primeiro, depois o aberto mais novo) e de FECHADOS;
  - EQUIPES E CANAIS pelo nome e RECENTES pela última mensagem;
  - os grupos da vista Chamados, só os que têm chamados;
  - as não lidas, com o "99+", e o total sem as silenciadas;
  - a resposta nova: só no chamado aberto, sem a mensagem da própria conta (a da TI que é a pessoa do chamado), com a `vista_ate` que anda na mensagem, na escolha, no "Reabrir", na avaliação e no "Marcar como vista", comparada pelo id, e o resolvido com o "O que foi feito" fora da conta.

  Começa pelos testes unitários. Verificar: esses testes, o lint e o typecheck.
- [x] 2.5 As palavras do colaborador e os tempos:
  - a situação para quem participa e as etapas, com a hora de cada uma pelos eventos, também o desfazer: a da última chegada à etapa, a pulada sem hora e "ainda não" depois da de agora (decisão 9);
  - os eventos, com o "Você", e a espera só com o "Aguardando você" (decisão 15);
  - a previsão "responde em ~1 h", pelo prazo de resposta do tipo;
  - o `resumoDosTempos`, em horas corridas, com o "sem resposta".

  Começa pelos testes unitários da previsão, do resumo dos tempos e das horas das etapas. Verificar: esses testes, os das palavras, o lint e o typecheck. Os níveis da avaliação entraram aqui, porque a frase do `avaliou` os cita, e a conferência deles fica na 2.7.
- [x] 2.6 O fechamento (decisão 7): o `momentoDoFechamento`, o `ultimoDiaParaReabrir`, a `situacaoDoChamado` pelo `fechado_em` e o `estaFechado`, com o resolvido vencido que a tarefa ainda não fechou. Começa pelos testes unitários: o #1045 de 11/11, o horário de verão de `America/New_York`, a virada do mês e do ano e a resolução às 23:59. Verificar: esses testes, o lint e o typecheck.
- [x] 2.7 As ações de quem participa (decisão 9), numa matriz ao lado da do `acoes.ts` (`acoes-de-quem-participa.ts`):
  - responder, escolher, reabrir, avaliar e marcar como vista, por situação, com o fechado;
  - as recusas e as frases;
  - as opções da pergunta (`conferirOpcoes`, em `pergunta.ts`) e a avaliação (`conferirAvaliacao`): os quatro níveis e o comentário até 500.

  Começa pelos testes unitários, uma célula por teste. Verificar: esses testes, o lint e o typecheck.
- [x] 2.8 As notificações (decisão 6):
  - o `canaisNaHora` com a mensagem;
  - os títulos e os começos de cada notificação do chat e dos chamados;
  - quem recebe: fora quem escreveu (também a conta da TI que é a pessoa do chamado), quem silenciou e quem já leu, e sem a resposta do chamado na triagem;
  - o "com você" sozinho na mensagem que reabre.

  Começa pelos testes unitários de quem recebe. Verificar: esses testes, os dos títulos, o lint e o typecheck. A `NovaNotificacao` ganhou a `mensagem`, o `assunto` e a `mensagemDoChatId`, com as colunas da tabela; o chat ficou em `chat/notificacoes.ts`, e os chamados, em `chamados/notificacoes.ts` (`notificacoesDeQuemParticipa` e `notificacoesParaQuemParticipa`). A entrega já passa a `mensagem` ao `canaisNaHora`.
- [x] 2.9 As permissões e o módulo (decisão 14): o `chat.usar` e o `chat.configurar` na área "Chat" e o `chamados.pedir` na área "Chamados", no catálogo, nos enums do contrato da API e na lista da ficha do perfil, na web; o Chat nos módulos opcionais. Começa pelo teste do catálogo. Verificar: esse teste, o da ficha do perfil, o `contrato:verificar`, o lint e o typecheck. Feita antes da 2.1, porque o `usaOChat` pede o `chat.usar` e o módulo Chat.

## 3. API

Cada tarefa da API regera o contrato e confere o `pnpm contrato:verificar`. As organizações novas dos testes de integração usam endereços próprios, e o cenário do chat fica no arquivo de apoio `apps/api/test/chat.ts`.

- [x] 3.1 O módulo e as conversas:
  - o bloco do módulo `chat` em `apps/api/src/app.ts`, com o `exigirModuloLigado`;
  - o `GET /chat/resumo`;
  - o `GET /chat/conversas`, com as seções, os contadores, a última mensagem e o silenciar;
  - o `GET /chat/pessoas?busca=`: até 20, pela ordem do nome, sem a própria conta.
  - quem usa o chat, na consulta das outras contas (a escolha da direta, o canal e quem recebe, depois), com o mesmo corte do `carregarAcesso`: a conta ativa, o perfil ativo, a atribuição e a participação no grupo sem encerramento, o grupo ativo e o `chat.usar` na organização, e não num local. As arquivadas ficam fora das listas, embora a `participacao` da 2.1 as abra para ler.
  - as listas do chat no banco (`TIPOS_DE_CONVERSA_NO_BANCO` e `ESPECIES_DO_CHAT_NO_BANCO`, da 1.1) comparadas com as do domínio, como em `chamados/listas.test.ts`.

  Começa pelos testes de integração da permissão: a conta sem `chat.usar`, o módulo desligado, a conversa de outros como inexistente e quem saiu do grupo. Verificar: esses testes, o lint, o typecheck e o contrato. O corte das outras contas ficou em `chat/quem-usa.ts` (`contaTemAPermissao`), e as rotas, em `rotas/chat.ts`. Entrou também a foto de quem usa o chat (`GET /chat/contas/:id/foto/:arquivo/:tamanho`, com `chat.usar`), que a spec pede e a foto da pessoa só entrega com `pessoas.ver` (decisão 15).
- [x] 3.2 As mensagens:
  - o `GET /chat/conversas/:id/mensagens`: de 50 em 50, antes, depois e ao redor de uma mensagem, com as reações, a respondida, os anexos e as citações resolvidas para quem lê (decisão 11);
  - a mensagem, com a direta que nasce na primeira e o par único na corrida, as recusas de quem não escreve, da arquivada e da respondida de outra conversa;
  - o `ultima_mensagem_em` e o `chat.mudou`;
  - a ordem: o `update` do `ultima_mensagem_em` vem antes do `insert` da mensagem e trava a conversa (na direta que nasce, o `insert ... on conflict do update`), para o id seguir a ordem do commit dentro dela, com o teste das duas mensagens ao mesmo tempo em duas conexões; o par da direta na ordem do banco, com os ids em minúsculas.

  Começa pelos testes de integração da permissão: quem não escreve no canal, a direta com quem não usa mais o chat e a citação do chamado que a conta não vê. Verificar: esses testes, o lint, o typecheck e o contrato. Entraram também o cabeçalho da conversa aberta (`GET /chat/conversas/:id`, com quem escreve, a recusa, o silenciar e a última lida) e a mensagem à pessoa (`POST /chat/diretas/:conta/mensagens`), que cria a direta; a conversa e a trava ficaram em `chat/conversa.ts`, a página e a gravação em `chat/mensagens.ts`, e as rotas em `rotas/chat-mensagens.ts` (decisão 15).
- [x] 3.3 As reações, a leitura e o silenciar: a reação que vai e volta, com o teto de 10 pela trava da mensagem; a leitura, que só anda para a frente e marca as notificações do assunto até a mensagem lida, pela `mensagem_do_chat_id`; o silenciar; e os eventos de cada um. Verificar: os testes de integração, com as duas reações ao mesmo tempo em duas conexões, o lint, o typecheck e o contrato. As rotas ficaram em `rotas/chat-leitura.ts` (`POST /chat/mensagens/:id/reacoes`, `POST /chat/conversas/:id/leitura` e `PUT /chat/conversas/:id/silenciada`), e a marcação das notificações pelo assunto em `notificacoes/leitura.ts`, que a 3.9 usa no chamado (decisão 15).
- [x] 3.4 Os anexos do chat: o envio sem dono, com `chat.usar`; a mensagem que os toma; a entrega pela conversa dona, a quem participa agora; e a remoção dos sem dono em 24 h. Começa pelos testes de integração da entrega: quem saiu da equipe e o anexo de outra conta. Verificar: esses testes, o lint, o typecheck e o contrato. O envio e a entrega dos anexos sem dono passaram dos chamados para `arquivos/anexos-sem-dono.ts`, que os dois usam; a tomada e a remoção ficaram em `chat/anexos.ts`, na manutenção diária com as dos chamados, e as rotas em `rotas/chat-anexos.ts` (decisão 15).
- [x] 3.5 As equipes e os canais:
  - o cadastro, com `chat.configurar` e as recusas, e o `antes` do `conferirEquipeOuCanal` lido da linha travada na transação da gravação, para duas alterações ao mesmo tempo não aceitarem o grupo inativo que a outra já trocou;
  - a leitura da equipe e do canal com o nome e a situação dos dois grupos gravados, para a gaveta da alteração (4.11);
  - arquivar e reativar, com o reativar recusado pelo nome em uso (a violação do `conversas_nome_unico` vira "Já existe uma equipe ou um canal com esse nome.") e pelo teto, que conta só as ativas, com os dois casos no teste de integração;
  - a auditoria, com o "antes → depois" e o alvo pelo nome de agora;
  - o `chat.mudou` aos grupos de antes e de depois;
  - quem participa, para a vista Equipes;
  - as abas Arquivos e "Chamados da equipe".

  Começa pelos testes de integração da permissão. Verificar: esses testes, o lint, o typecheck e o contrato. O cadastro ficou em `rotas/chat-equipes-e-canais.ts` (`/chat/equipes-e-canais`, com a gaveta, o `arquivamento` e a `reativacao`), e a vista Equipes e as abas em `rotas/chat-equipes.ts` (`GET /chat/equipes` e `GET /chat/conversas/:id/pessoas`, `/arquivos` e `/chamados`); as ações da auditoria são `equipe.*` e `canal.*`, com o alvo `conversa` (decisão 15). Da revisão: a escolha da gaveta lê os grupos ativos pelo `GET /chat/grupos`, com o `chat.configurar`, e a espera no chip e na aba é "Aguardando o colaborador" a quem não participa do chamado (decisão 15, confirmada pelo usuário).
- [x] 3.6 A notificação do chat (decisão 6):
  - a tarefa `chat.notificar`, 10 s depois da mensagem, pelo `startAfter`, que o `enviar` da fila (`fila.ts`) passa a aceitar, a quem não leu, fora o autor e quem silenciou;
  - o assunto, a mensagem do chat e o destino, pelo `notificacoesDaMensagemDoChat`, com o silenciar e a `lida_ate` de cada conta que participa; ele não confere quem participa, e a consulta da tarefa lê as contas quando ela roda, e não na hora da mensagem: a conta ativa, com o `chat.usar` e, na equipe, do grupo agora. O `notificar` grava a `mensagem`, o `assunto` e a `mensagemDoChatId` da `NovaNotificacao`;
  - a mensagem no push, também com a severidade fora das escolhas e nunca no Foco, pela `mensagem` que a entrega já passa ao `canaisNaHora` (2.8), com o teste da entrega, e o título do push sem a severidade.

  Verificar: os testes da tarefa e da entrega, o da conta que sai do grupo nos 10 s, o lint e o typecheck. A tarefa ficou em `chat/notificar.ts`, pedida pelo `gravarMensagem` na transação da mensagem, com o `depoisDe` do `enviar`; a equipe ou o canal arquivado nos 10 s não notifica (decisão 15).
- [x] 3.7 Abrir pelo chat (decisão 8):
  - o `GET /chat/chamados/tipos` e o `GET /chat/chamados/sugestoes`, só com o id, o nome e o patrimônio;
  - o `POST /chat/mensagens/:id/chamado`, pela abertura com a origem `chat`;
  - o evento `abertura` com o `dados.para`, a conta de quem nasce atendendo ou nulo na triagem, na abertura pelo chat e na da TI (`apps/api/src/chamados/abertura.ts`), que a ficha já lê no `para` (decisão 15);
  - na mesma transação: a linha `origem`, os anexos da mensagem, o evento `virou-chamado`, a auditoria, os eventos e as notificações da abertura;
  - a recusa da segunda abertura;
  - o envio e a entrega do anexo sem dono dos chamados (`POST /chamados/anexos` e `GET /chamados/anexos/:arquivo`) passam a pedir `chamados.atender` em algum local ou `chat.usar` (spec arquivos-e-imagens, "Anexos dos chamados"), para o campo Anexo da abertura pelo chat e a resposta com anexos da 3.9, com o teste de quem tem só o `chat.usar`;
  - na página das mensagens (3.2), o evento `virou-chamado` com o número e o "Abrir chamado" resolvidos para quem lê, como a citação, e a marca na mensagem de origem.

  Começa pelos testes de integração da permissão: sem `chamados.pedir`, a mensagem de uma conversa de que a conta não participa e o tipo só da TI. Verificar: esses testes, o da corrida das duas aberturas, o lint, o typecheck e o contrato.
- [x] 3.8 A leitura de quem participa (decisão 9):
  - o `GET /chat/chamados`: os abertos, os que ainda reabrem e os fechados paginados, na ordem do domínio, com o `fechado` do `ChamadoNaLista` pelo `estaFechado(chamado, agora, fuso)`, e não só pelo `fechado_em`: o resolvido vencido que a tarefa ainda não fechou já não reabre;
  - o `GET /chat/chamados/:numero`: a conversa sem o que é só da TI, os eventos para o colaborador, a resposta nova e o "Reabrir até";
  - as etapas, pelo `etapasDoChamado` com todos os eventos, também o desfazer, antes de a leitura tirar os que a pessoa não lê, a previsão e o resumo dos tempos de cada resolvido;
  - no resumo de cada resolvido, a hora e o "Atendeu" do próprio evento `resolveu`, e não o `resolvido_em` e o `resolvido_por` do chamado, que são só do último; e a primeira resposta pela primeira `mensagem` com a `autor_conta` da conversa, e não pela `primeira_resposta_em`, que na abertura pela TI é a hora da abertura (decisão 15);
  - o anexo;
  - o resumo do chip.

  Começa pelos testes de integração da permissão (o chamado de outra pessoa como inexistente, a nota e o anexo dela, que não vão) e da ordem. Verificar: esses testes, o lint, o typecheck e o contrato.
- [x] 3.9 As ações de quem participa:
  - responder, com os anexos, escolher, reabrir, avaliar e marcar como vista, com o chamado travado;
  - a chave da escolha e da avaliação vem da linha lida com o chamado travado, e nunca do pedido: o `dados.mensagem` é o id da mensagem como o banco o devolve (o UUID do pedido em maiúsculas seria outro texto para o índice), e o `dados.resolucao` é o `toISOString()` do `resolvido_em` lido;
  - a retomada, a reabertura e a versão, pelo `decidirAcaoDeQuemParticipa`, com o `fechado` do `estaFechado`, quem resolveu (o `resolvido_por`, como no reabrir da TI) como a conta está agora e a pergunta e o `avaliado` lidos com o chamado travado; as recusas por campo (o texto, os anexos, a opção, o nível e o comentário) e as outras como conflito, como o `problemaDaRecusa` da TI; o `desdeDeQuemAtende` passa a aceitar a mudança de quem participa;
  - os eventos da conversa e a auditoria do retomar e do reabrir pela pessoa;
  - a notificação a quem atende, pelo `notificacoesDeQuemParticipa` com a mudança decidida, e as contas da triagem lidas só na reabertura que vai à triagem (o `reabriu` sem o `para`);
  - a `vista_ate`, a última linha da conversa lida com o chamado travado, que anda também no "Reabrir" e na avaliação e marca as notificações do chamado, com o teste da mensagem da TI que espera a trava da marcação.

  Começa pelos testes de integração da permissão: quem não participa e o fechado. Verificar: esses testes, o da escolha ao mesmo tempo em duas conexões, o lint, o typecheck e o contrato. As ações ficaram em `chat/acoes-de-quem-participa.ts` (`agirComoQuemParticipa`), e as rotas, em `rotas/chat-chamados-acoes.ts` (`POST /chat/chamados/:numero/mensagens`, `/escolha`, `/reabertura`, `/avaliacao` e `/vista`), que devolvem a conversa depois da ação; a leitura ganhou a avaliação da resolução de agora (`avaliacao`), da revisão da 3.8 (decisão 15).
- [x] 3.10 O lado da TI (decisões 10 e 13):
  - a mensagem com as opções e o cartão, e o `GET /chamados/:numero/cartao` com o retrato; a mensagem sem pergunta grava `null` nas opções da `mensagens_dos_chamados`, e não o `[]` do `conferirOpcoes`, que o CHECK `mensagens_dos_chamados_opcoes_validas` reprova (na `respostas_prontas`, o vazio é o certo);
  - as respostas prontas com as opções;
  - a notificação da mensagem da TI e do resolvido à pessoa e a quem abriu, fora o autor, pelo `notificacoesParaQuemParticipa` com a mudança decidida e as contas da pessoa e de quem abriu, com o `usaOChat`, ao lado do `notificacoesDaAcao`;
  - a ficha com a origem, as mensagens de quem participa, a escolha, a avaliação, o resumo dos tempos, o "usa o chat" da pessoa e o Fechado; o `EventoGravado` da ficha ganha os eventos de quem participa (`EventoDeQuemParticipa`), para o guarda dos eventos reprovar o que ela não lê.

  Começa pelos testes de integração da permissão: o cartão (a prévia e o envio) de um ativo que a conta não vê e o "Abrir a conversa" da origem só a quem participa dela. Verificar: esses testes, os outros de integração, o lint, o typecheck e o contrato. O retrato ficou em `chamados/cartao.ts` (`retratoDoAtivo`, também da prévia) e as contas de quem participa em `chamados/quem-participa.ts` (`contasQueParticipam`); a escolha, a avaliação e o resumo da resolução são lidos pelos mesmos `escolhasDasPerguntas` e `resumoDaResolucao` da leitura do chat. Na web, só o que o contrato pede: as opções na gaveta das respostas prontas e na Auditoria ("Opções da pergunta"), e o `avaliou` fora da conversa da TI até a 4.13 (decisão 15).
- [x] 3.11 O fechamento (decisão 7): a tarefa `chamados.fechamento`, a cada minuto e em lotes, com o evento `fechou`, sem auditoria e sem notificação, e o módulo desligado pulado; as ações da TI e de quem participa recusadas no fechado pelo `estaFechado`. Começa pelos testes da tarefa: o vencido, o do dia, o reaberto e o resolvido antes desta versão. Verificar: esses testes, o lint e o typecheck. A tarefa ficou em `chamados/fechamento.ts` (`fecharOsVencidos`, `tarefaDoFechamento`), com o `fechado_em` e o `fechou` na meia-noite do `momentoDoFechamento`; na TI, o `fechado` do `ChamadoParaAcao` recusa no lugar da célula; quem participa já recusava desde a 3.9. O `fechou` entrou no guarda da ficha, sem autor (decisão 15, "O fechamento").
- [x] 3.12 Os eventos dos chamados a quem participa (decisão 4): o `chamados.mudaram` com as contas da pessoa e de quem abriu, nas ações da TI, no fechamento e nas de quem participa (as quatro que escrevem na conversa, em `chat/acoes-de-quem-participa.ts`, publicam hoje só ao `publicoDoChamado`; da revisão da 3.9, com o teste de que a mensagem da pessoa chega a quem abriu), e o `chat.mudou` da conversa de origem na mudança da situação ou de quem atende. Começa pelos testes de integração do público. Verificar: esses testes, o lint e o typecheck. O público ficou em `chamados/quem-participa.ts` (`publicoComQuemParticipa`, e o `contasQueParticipamDos` do lote do fechamento), também na abertura e na edição, e o `chat.mudou` em `chat/conversa.ts` (`avisarAsConversasDeOrigem`); a nota, o Virar OS e o "Pedir toner" ficam só com quem vê o chamado (decisão 15). O teste do fechamento lê o "O chamado fechou" de quem participa (nota da revisão da 3.11).

## 4. Web

Cada tela é conferida no `pnpm dev` contra o mockup, com a conta de revisão. O que mudar o kit em todas as telas vai antes ao usuário por cartão.

- [x] 4.1 O app do chat (decisão 12):
  - a página `chat/index.html` no build, com a entrada própria `src/chat/main.tsx`, sem o roteador da casca nem os módulos, e o `chegadaNoIndex` que pula a página;
  - o manifesto pelo `pnpm marca:gerar`;
  - a árvore de rotas do chat, com os provedores e a sessão validada sem a camada do carregamento;
  - a entrada que volta ao endereço pedido, "Você não tem acesso ao chat." e o módulo desligado;
  - o menu da conta, com o tema e "Sair";
  - a página servida em `/chat` pela API e pelo plugin do `pnpm dev`, e o service worker sem o `/chat` no `navigateFallback`.

  Verificar: os testes da entrada, do plugin da chegada e da rota da página, o build com as duas páginas, o `marca:verificar`, o lint, o typecheck e o `/chat` no `pnpm dev`.
- [x] 4.2 A trilha e a lista do Chat (m01 e m03): as seções, os contadores, o chamado novo no alto com o contorno forte (o `novo` do `secoesDoChat` sai só quando a tela é montada de novo, e não na consulta que o evento da abertura refaz), FECHADOS recolhido e "Nova conversa", com a escolha da pessoa. Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [x] 4.3 A conversa (m01):
  - o cabeçalho e as abas;
  - as mensagens seguidas juntas, os dias e os eventos;
  - a primeira não lida, a conversa nunca lida na última mensagem, sem o separador, a conversa presa embaixo, "Mensagens anteriores" e "Mensagens novas · 2";
  - a leitura com a conversa à vista.

  Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [x] 4.4 A caixa de escrever e o menu da mensagem (m01):
  - a caixa: o Enter e o Shift+Enter, a respondida, os anexos, o "#" com a lista dos chamados, o texto que fica e as recusas;
  - o menu: a barra, as reações, o link, o silenciar e o Ctrl+Shift+T.

  Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [x] 4.5 Transformar em chamado (m02 e m03): o diálogo, os tipos em chips, o título com o contador, o ativo sugerido e "Trocar", "No nome de", e o evento e a marca na conversa. O evento passou a dizer o nome de quem transformou também à conta que agiu, como a spec (a 4.3 dizia "Você"), e o chamado aberto entra marcado no alto de CHAMADOS. Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [x] 4.6 O chamado no chat (m04, m06, m07 e m10):
  - o cabeçalho, as etapas com as horas e "Seus outros chamados"; a hora da etapa como a spec a escreve, "ontem 17:05", sem a vírgula do `momentoNaConversa` da TI ("ontem, 17:05");
  - a conversa, com a espera em "Aguardando você", a resposta nova e "Marcar como vista";
  - a pergunta pelo teclado e o cartão do ativo;
  - o resolvido, com a avaliação;
  - "Neste chamado";
  - a caixa do aberto, do resolvido (com "Reabrir até 18/11") e do fechado.

  Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [x] 4.7 A vista Chamados (m10), as Equipes e os Avisos, com "Receber neste aparelho" pelo `inscreverEsteAparelho` dos Ajustes, os motivos em texto e o "Abrir" do endereço da casca numa janela nova. Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [x] 4.8 O chamado citado (m12): o chip de 32 px e o resumo, pelo mouse e pelo foco, com o Esc. Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [x] 4.9 O celular (m08 e m09):
  - a lista e a conversa em telas, com a trilha na barra de baixo e os alvos de 44 px;
  - o toque longo, com a folha;
  - o transformar em tela cheia;
  - o cabeçalho do chamado, com quem atende e a previsão.

  Verificar: o lint, o typecheck e a tela no `pnpm dev`, a 375 px.
- [x] 4.10 O Chat na casca e a primeira tela:
  - o módulo depois do Chamados, no endereço `/conversas`, com o selo, o menu, a janela e "Abrir no app do chat";
  - a tradução dos destinos `/chat/...` para a janela do Chat no `navegar` do `App.tsx`, com a busca;
  - quem só vê o Chat entre os módulos da casca, que vai ao `/chat`;
  - a web simulada com o `GET /chat/resumo` e as pontas a ponta que o dock novo muda.

  Começa pelos testes da primeira tela. Verificar: esses testes, os do registro e da tradução, o `pnpm test:e2e`, o lint, o typecheck e o dock no `pnpm dev`, com a casca recarregada na janela do Chat.
- [x] 4.11 As equipes e os canais na tela: a lista, com a situação em texto, e a gaveta, com os avisos e as recusas no campo. Na alteração, o grupo gravado inativo aparece como o escolhido, com a situação em texto, como "Financeiro (inativo)": sem ele, o campo abre vazio e o salvar volta "Escolha o grupo da equipe.". Verificar: o lint, o typecheck e a tela no `pnpm dev`. A tela ficou em `modulos/chat/EquipesECanais.tsx`, com o que ela decide sem a API em `equipesECanais.ts`, no `/conversas/equipes-e-canais`, fora da moldura do chat, e o módulo Chat aparece também para quem só configura o chat (decisão 15). A gaveta abre com a linha da lista, que tem o mesmo retrato, e a leitura de uma ficou sem uso na tela.
- [x] 4.12 As telas atualizadas e os avisos:
  - o `chat.mudou` e o `chamados.mudaram`, sem perder o que se escreve;
  - o aviso escondido com a conversa à vista;
  - o "Abrir" no app ou na janela da casca;
  - o toque no push (`sw-avisos.js`): o destino guardado com a busca e a janela pelo caminho, nos dois sentidos (o destino do chat no app do chat ou, sem ele, na casca; os outros só na casca; sem janela, o `openWindow`).

  Verificar: os testes do `sw-avisos.js`, com o destino do chat e o da casca diante de cada janela aberta, o lint, o typecheck e as duas sessões no `pnpm dev`.
- [x] 4.13 O lado da TI (m05 e m11):
  - o campo de escrever: "Enviar para Fernanda", o "/ativo", "Cartão do ativo", "Pedir uma escolha" e a ajuda do chat;
  - a conversa: as mensagens de quem participa, a origem, a escolha, a avaliação e o resumo dos tempos;
  - o Fechado na tela, também na lista: a API soma o `fechado` aos itens do `buscarChamados`, pelo `estaFechado(chamado, agora, fuso)`, como a lista do chat (nota da revisão da 3.11);
  - as respostas prontas com as opções;
  - as pontas a ponta e as referências visuais do chamado aberto que o campo de escrever novo muda.

  Verificar: o `pnpm test:e2e` dos chamados, o lint, o typecheck e as telas no `pnpm dev`.
- [x] 4.14 Os registros na Auditoria (`registro.ts`): os alvos e os campos das equipes e dos canais, a abertura pelo chat e o retomar e o reabrir pela pessoa, nos termos da operação. Verificar: os testes do `registro.test.ts`, o lint, o typecheck e a Auditoria no `pnpm dev`. O alvo `conversa` sai pelo tipo da ação (`textoDoAlvo` com a ação), os campos pelos da lista do cadastro e a ordem das telas vale para todo alvo que a tem (`ORDEM_NAS_TELAS`); o retomar e o reabrir pela pessoa já saíam nos termos da TI, e os testes os fixam (decisão 15, "A Auditoria").
- [x] 4.15 A caixa de escrever na largura da coluna (pedido do usuário de 22/11): a caixa e a frase que fica no lugar dela, na conversa e no chamado do chat, vão de uma borda à outra da coluna, e as mensagens e a lista do "#" ficam na largura de leitura (decisão 15, "Os pedidos do usuário de 22/11"). Verificar: o lint, as pontas a ponta e as referências visuais que ela mudar e as telas no `pnpm dev`, no app e na casca.
- [x] 4.16 O botão direito na mensagem (pedido do usuário de 22/11): abre o menu do "Mais" onde o ponteiro está, e a tecla de menu, no canto da mensagem; o menu do navegador fica no link e no texto selecionado e, no toque, a folha do toque longo; as conversas dos chamados ficam sem ele. O `MenuDeContexto` do kit (`packages/ui`) passa a aceitar os itens do menu com submenu e a camada opaca, e o foco volta à mensagem sem rolar, antes das ações que o levam a outro lugar (decisão 15). Verificar: os testes do kit, da conversa e da barra da mensagem, o `pnpm test:stories`, o lint, o typecheck e a conversa no `pnpm dev`.

## 5. Fechamento

- [x] 5.1 A documentação:
  - a linha do S7 na spec mestre;
  - o runbook: o perfil "Colaborador" e o grupo do AD, com a atribuição na organização inteira, porque as três permissões são da organização e a atribuição num local as deixa de fora, o app do chat instalado, com o "Receber neste aparelho", e a exceção da volta à versão anterior, com o erro ao reabrir um fechado nela;
  - o `docs/mapa.md`, com as specs novas;
  - o contrato de módulo (`docs/casca/modulos.md`), com o público por grupo e o app próprio.

  Verificar: o teste da documentação dos módulos e o lint.

  Feito: a spec mestre ganhou também o push das mensagens e a entrada de quem só vê o Chat; o runbook, a seção Chat, o fechamento e o grupo de todos no AD, que não pode ser o "Usuários do domínio", fora do `memberOf`; o contrato, o selo dos dados e o `comOModulo`, com o teste da documentação deles.
- [x] 5.2 O ponta a ponta da pilha (`e2e-pilha/caminho.spec.ts`): uma conta de colaborador transforma uma mensagem da equipe em chamado, a TI responde no chamado, e a resposta chega à pessoa no outro navegador. Verificar: `pnpm test:e2e:pilha`.

  Feito: o passo 39, pela tela: o perfil Colaborador vem do grupo da recepção de Campinas, que também é o da equipe, e a conta de Carla Dias, só com ele, cai no app do chat ao entrar; a etapa de agora e a resposta mudam na tela aberta dela, sem recarregar.
- [ ] 5.3 O ponta a ponta da web e o visual que faltarem: o app do chat na web simulada (a entrada, a lista, a conversa e o chamado, e o botão direito: o menu abre na mensagem e não no link, e o "Responder" deixa o foco na caixa) e as referências da regressão visual dos componentes novos do kit que as tarefas não gravaram. Verificar: `pnpm test:e2e` e `pnpm test:visual`.
