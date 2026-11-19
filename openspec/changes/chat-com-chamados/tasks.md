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

- [ ] 2.1 Quem usa o chat e quem participa (decisão 3): o `usaOChat`, quem participa da direta, da equipe (pelo grupo ativo) e do canal, a arquivada só para ler, quem escreve (com "Só TI escreve neste canal." e a frase da equipe), o "(TI)" e o `participaDoChamado`. Começa pelos testes unitários. Verificar: esses testes, o lint e o typecheck.
- [ ] 2.2 As mensagens, as reações e as citações:
  - o `conferirMensagem`: de 1 a 4.000 caracteres sem os espaços das pontas, até 5 anexos e as frases;
  - o `conferirReacao`: as três de sempre, a escrita de 1 a 20 e o teto de 10 textos;
  - o começo do texto em 120, cortado no fim de uma palavra, com as reticências;
  - o `citacoesDeChamados`: o "#" separado das outras palavras, até 10;
  - o `comandoDoAtivo`: o "/ativo" com e sem o patrimônio.

  Verificar: os testes unitários, o lint e o typecheck.
- [ ] 2.3 As equipes e os canais: o `conferirEquipeOuCanal`, com o nome, o tipo, o grupo, quem escreve, o teto de 100 e as frases da spec. Verificar: os testes unitários, o lint e o typecheck.
- [ ] 2.4 As listas e as contagens do chat:
  - a ordem de CHAMADOS (os que aguardam a conta primeiro, depois o aberto mais novo) e de FECHADOS;
  - EQUIPES E CANAIS pelo nome e RECENTES pela última mensagem;
  - os grupos da vista Chamados, só os que têm chamados;
  - as não lidas, com o "99+", e o total sem as silenciadas;
  - a resposta nova: só no chamado aberto, sem a mensagem da própria conta (a da TI que é a pessoa do chamado), com a `vista_ate` que anda na mensagem, na escolha, no "Reabrir", na avaliação e no "Marcar como vista", comparada pelo id, e o resolvido com o "O que foi feito" fora da conta.

  Começa pelos testes unitários. Verificar: esses testes, o lint e o typecheck.
- [ ] 2.5 As palavras do colaborador e os tempos:
  - a situação para quem participa e as etapas, com a hora de cada uma pelos eventos, também o desfazer: a da última chegada à etapa, a pulada sem hora e "ainda não" depois da de agora (decisão 9);
  - os eventos, com o "Você", e a espera só com o "Aguardando você" (decisão 15);
  - a previsão "responde em ~1 h", pelo prazo de resposta do tipo;
  - o `resumoDosTempos`, em horas corridas, com o "sem resposta".

  Começa pelos testes unitários da previsão, do resumo dos tempos e das horas das etapas. Verificar: esses testes, os das palavras, o lint e o typecheck.
- [ ] 2.6 O fechamento (decisão 7): o `momentoDoFechamento`, o `ultimoDiaParaReabrir`, a `situacaoDoChamado` pelo `fechado_em` e o `estaFechado`, com o resolvido vencido que a tarefa ainda não fechou. Começa pelos testes unitários: o #1045 de 11/11, o horário de verão de `America/New_York`, a virada do mês e do ano e a resolução às 23:59. Verificar: esses testes, o lint e o typecheck.
- [ ] 2.7 As ações de quem participa (decisão 9), na matriz do `acoes.ts`:
  - responder, escolher, reabrir, avaliar e marcar como vista, por situação, com o fechado;
  - as recusas e as frases;
  - as opções da pergunta (`conferirOpcoes`) e a avaliação: os quatro níveis e o comentário até 500.

  Começa pelos testes unitários, uma célula por teste. Verificar: esses testes, o lint e o typecheck.
- [ ] 2.8 As notificações (decisão 6):
  - o `canaisNaHora` com a mensagem;
  - os títulos e os começos de cada notificação do chat e dos chamados;
  - quem recebe: fora quem escreveu (também a conta da TI que é a pessoa do chamado), quem silenciou e quem já leu, e sem a resposta do chamado na triagem;
  - o "com você" sozinho na mensagem que reabre.

  Começa pelos testes unitários de quem recebe. Verificar: esses testes, os dos títulos, o lint e o typecheck.
- [ ] 2.9 As permissões e o módulo (decisão 14): o `chat.usar` e o `chat.configurar` na área "Chat" e o `chamados.pedir` na área "Chamados", no catálogo, nos enums do contrato da API e na lista da ficha do perfil, na web; o Chat nos módulos opcionais. Começa pelo teste do catálogo. Verificar: esse teste, o da ficha do perfil, o `contrato:verificar`, o lint e o typecheck.

## 3. API

Cada tarefa da API regera o contrato e confere o `pnpm contrato:verificar`. As organizações novas dos testes de integração usam endereços próprios, e o cenário do chat fica no arquivo de apoio `apps/api/test/chat.ts`.

- [ ] 3.1 O módulo e as conversas:
  - o bloco do módulo `chat` em `apps/api/src/app.ts`, com o `exigirModuloLigado`;
  - o `GET /chat/resumo`;
  - o `GET /chat/conversas`, com as seções, os contadores, a última mensagem e o silenciar;
  - o `GET /chat/pessoas?busca=`: até 20, pela ordem do nome, sem a própria conta.
  - as listas do chat no banco (`TIPOS_DE_CONVERSA_NO_BANCO` e `ESPECIES_DO_CHAT_NO_BANCO`, da 1.1) comparadas com as do domínio, como em `chamados/listas.test.ts`.

  Começa pelos testes de integração da permissão: a conta sem `chat.usar`, o módulo desligado, a conversa de outros como inexistente e quem saiu do grupo. Verificar: esses testes, o lint, o typecheck e o contrato.
- [ ] 3.2 As mensagens:
  - o `GET /chat/conversas/:id/mensagens`: de 50 em 50, antes, depois e ao redor de uma mensagem, com as reações, a respondida, os anexos e as citações resolvidas para quem lê (decisão 11);
  - a mensagem, com a direta que nasce na primeira e o par único na corrida, as recusas de quem não escreve, da arquivada e da respondida de outra conversa;
  - o `ultima_mensagem_em` e o `chat.mudou`;
  - a ordem: o `update` do `ultima_mensagem_em` vem antes do `insert` da mensagem e trava a conversa (na direta que nasce, o `insert ... on conflict do update`), para o id seguir a ordem do commit dentro dela, com o teste das duas mensagens ao mesmo tempo em duas conexões; o par da direta na ordem do banco, com os ids em minúsculas.

  Começa pelos testes de integração da permissão: quem não escreve no canal, a direta com quem não usa mais o chat e a citação do chamado que a conta não vê. Verificar: esses testes, o lint, o typecheck e o contrato.
- [ ] 3.3 As reações, a leitura e o silenciar: a reação que vai e volta, com o teto de 10 pela trava da mensagem; a leitura, que só anda para a frente e marca as notificações do assunto até a mensagem lida, pela `mensagem_do_chat_id`; o silenciar; e os eventos de cada um. Verificar: os testes de integração, com as duas reações ao mesmo tempo em duas conexões, o lint, o typecheck e o contrato.
- [ ] 3.4 Os anexos do chat: o envio sem dono, com `chat.usar`; a mensagem que os toma; a entrega pela conversa dona, a quem participa agora; e a remoção dos sem dono em 24 h. Começa pelos testes de integração da entrega: quem saiu da equipe e o anexo de outra conta. Verificar: esses testes, o lint, o typecheck e o contrato.
- [ ] 3.5 As equipes e os canais:
  - o cadastro, com `chat.configurar` e as recusas;
  - arquivar e reativar, com o reativar recusado pelo nome em uso (a violação do `conversas_nome_unico` vira "Já existe uma equipe ou um canal com esse nome.") e pelo teto, que conta só as ativas, com os dois casos no teste de integração;
  - a auditoria, com o "antes → depois" e o alvo pelo nome de agora;
  - o `chat.mudou` aos grupos de antes e de depois;
  - quem participa, para a vista Equipes;
  - as abas Arquivos e "Chamados da equipe".

  Começa pelos testes de integração da permissão. Verificar: esses testes, o lint, o typecheck e o contrato.
- [ ] 3.6 A notificação do chat (decisão 6):
  - a tarefa `chat.notificar`, 10 s depois da mensagem, pelo `startAfter`, que o `enviar` da fila (`fila.ts`) passa a aceitar, a quem não leu, fora o autor e quem silenciou;
  - o assunto, a mensagem do chat e o destino;
  - a mensagem no push, também com a severidade fora das escolhas e nunca no Foco, e o título do push sem a severidade.

  Verificar: os testes da tarefa e da entrega, o lint e o typecheck.
- [ ] 3.7 Abrir pelo chat (decisão 8):
  - o `GET /chat/chamados/tipos` e o `GET /chat/chamados/sugestoes`, só com o id, o nome e o patrimônio;
  - o `POST /chat/mensagens/:id/chamado`, pela abertura com a origem `chat`;
  - na mesma transação: a linha `origem`, os anexos da mensagem, o evento `virou-chamado`, a auditoria, os eventos e as notificações da abertura;
  - a recusa da segunda abertura.

  Começa pelos testes de integração da permissão: sem `chamados.pedir`, a mensagem de uma conversa de que a conta não participa e o tipo só da TI. Verificar: esses testes, o da corrida das duas aberturas, o lint, o typecheck e o contrato.
- [ ] 3.8 A leitura de quem participa (decisão 9):
  - o `GET /chat/chamados`: os abertos, os que ainda reabrem e os fechados paginados, na ordem do domínio;
  - o `GET /chat/chamados/:numero`: a conversa sem o que é só da TI, os eventos para o colaborador, a resposta nova e o "Reabrir até";
  - o anexo;
  - o resumo do chip.

  Começa pelos testes de integração da permissão (o chamado de outra pessoa como inexistente, a nota e o anexo dela, que não vão) e da ordem. Verificar: esses testes, o lint, o typecheck e o contrato.
- [ ] 3.9 As ações de quem participa:
  - responder, com os anexos, escolher, reabrir, avaliar e marcar como vista, com o chamado travado;
  - a chave da escolha e da avaliação vem da linha lida com o chamado travado, e nunca do pedido: o `dados.mensagem` é o id da mensagem como o banco o devolve (o UUID do pedido em maiúsculas seria outro texto para o índice), e o `dados.resolucao` é o `toISOString()` do `resolvido_em` lido;
  - a retomada, a reabertura e a versão;
  - os eventos da conversa e a auditoria do retomar e do reabrir pela pessoa;
  - a notificação a quem atende;
  - a `vista_ate`, a última linha da conversa lida com o chamado travado, que anda também no "Reabrir" e na avaliação e marca as notificações do chamado, com o teste da mensagem da TI que espera a trava da marcação.

  Começa pelos testes de integração da permissão: quem não participa e o fechado. Verificar: esses testes, o da escolha ao mesmo tempo em duas conexões, o lint, o typecheck e o contrato.
- [ ] 3.10 O lado da TI (decisões 10 e 13):
  - a mensagem com as opções e o cartão, e o `GET /chamados/:numero/cartao` com o retrato;
  - as respostas prontas com as opções;
  - a notificação da mensagem da TI e do resolvido à pessoa e a quem abriu, fora o autor;
  - a ficha com a origem, as mensagens de quem participa, a escolha, a avaliação, o resumo dos tempos, o "usa o chat" da pessoa e o Fechado.

  Começa pelos testes de integração da permissão: o cartão (a prévia e o envio) de um ativo que a conta não vê e o "Abrir a conversa" da origem só a quem participa dela. Verificar: esses testes, os outros de integração, o lint, o typecheck e o contrato.
- [ ] 3.11 O fechamento (decisão 7): a tarefa `chamados.fechamento`, a cada minuto e em lotes, com o evento `fechou`, sem auditoria e sem notificação, e o módulo desligado pulado; as ações da TI e de quem participa recusadas no fechado pelo `estaFechado`. Começa pelos testes da tarefa: o vencido, o do dia, o reaberto e o resolvido antes desta versão. Verificar: esses testes, o lint e o typecheck.
- [ ] 3.12 Os eventos dos chamados a quem participa (decisão 4): o `chamados.mudaram` com as contas da pessoa e de quem abriu, e o `chat.mudou` da conversa de origem na mudança da situação ou de quem atende. Começa pelos testes de integração do público. Verificar: esses testes, o lint e o typecheck.

## 4. Web

Cada tela é conferida no `pnpm dev` contra o mockup, com a conta de revisão. O que mudar o kit em todas as telas vai antes ao usuário por cartão.

- [ ] 4.1 O app do chat (decisão 12):
  - a página `chat/index.html` no build, com a entrada própria `src/chat/main.tsx`, sem o roteador da casca nem os módulos, e o `chegadaNoIndex` que pula a página;
  - o manifesto pelo `pnpm marca:gerar`;
  - a árvore de rotas do chat, com os provedores e a sessão validada sem a camada do carregamento;
  - a entrada que volta ao endereço pedido, "Você não tem acesso ao chat." e o módulo desligado;
  - o menu da conta, com o tema e "Sair";
  - a página servida em `/chat` pela API e pelo plugin do `pnpm dev`, e o service worker sem o `/chat` no `navigateFallback`.

  Verificar: os testes da entrada, do plugin da chegada e da rota da página, o build com as duas páginas, o `marca:verificar`, o lint, o typecheck e o `/chat` no `pnpm dev`.
- [ ] 4.2 A trilha e a lista do Chat (m01 e m03): as seções, os contadores, o chamado novo no alto com o contorno forte, FECHADOS recolhido e "Nova conversa", com a escolha da pessoa. Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [ ] 4.3 A conversa (m01):
  - o cabeçalho e as abas;
  - as mensagens seguidas juntas, os dias e os eventos;
  - a primeira não lida, a conversa nunca lida na última mensagem, sem o separador, a conversa presa embaixo, "Mensagens anteriores" e "Mensagens novas · 2";
  - a leitura com a conversa à vista.

  Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [ ] 4.4 A caixa de escrever e o menu da mensagem (m01):
  - a caixa: o Enter e o Shift+Enter, a respondida, os anexos, o "#" com a lista dos chamados, o texto que fica e as recusas;
  - o menu: a barra, as reações, o link, o silenciar e o Ctrl+Shift+T.

  Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [ ] 4.5 Transformar em chamado (m02 e m03): o diálogo, os tipos em chips, o título com o contador, o ativo sugerido e "Trocar", "No nome de", e o evento e a marca na conversa. Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [ ] 4.6 O chamado no chat (m04, m06, m07 e m10):
  - o cabeçalho, as etapas com as horas e "Seus outros chamados";
  - a conversa, com a espera em "Aguardando você", a resposta nova e "Marcar como vista";
  - a pergunta pelo teclado e o cartão do ativo;
  - o resolvido, com a avaliação;
  - "Neste chamado";
  - a caixa do aberto, do resolvido (com "Reabrir até 18/11") e do fechado.

  Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [ ] 4.7 A vista Chamados (m10), as Equipes e os Avisos, com "Receber neste aparelho" pelo `inscreverEsteAparelho` dos Ajustes, os motivos em texto e o "Abrir" do endereço da casca numa janela nova. Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [ ] 4.8 O chamado citado (m12): o chip de 32 px e o resumo, pelo mouse e pelo foco, com o Esc. Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [ ] 4.9 O celular (m08 e m09):
  - a lista e a conversa em telas, com a trilha na barra de baixo e os alvos de 44 px;
  - o toque longo, com a folha;
  - o transformar em tela cheia;
  - o cabeçalho do chamado, com quem atende e a previsão.

  Verificar: o lint, o typecheck e a tela no `pnpm dev`, a 375 px.
- [ ] 4.10 O Chat na casca e a primeira tela:
  - o módulo depois do Chamados, no endereço `/conversas`, com o selo, o menu, a janela e "Abrir no app do chat";
  - a tradução dos destinos `/chat/...` para a janela do Chat no `navegar` do `App.tsx`, com a busca;
  - quem só vê o Chat entre os módulos da casca, que vai ao `/chat`;
  - a web simulada com o `GET /chat/resumo` e as pontas a ponta que o dock novo muda.

  Começa pelos testes da primeira tela. Verificar: esses testes, os do registro e da tradução, o `pnpm test:e2e`, o lint, o typecheck e o dock no `pnpm dev`, com a casca recarregada na janela do Chat.
- [ ] 4.11 As equipes e os canais na tela: a lista, com a situação em texto, e a gaveta, com os avisos e as recusas no campo. Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [ ] 4.12 As telas atualizadas e os avisos:
  - o `chat.mudou` e o `chamados.mudaram`, sem perder o que se escreve;
  - o aviso escondido com a conversa à vista;
  - o "Abrir" no app ou na janela da casca;
  - o toque no push (`sw-avisos.js`): o destino guardado com a busca e a janela pelo caminho, nos dois sentidos (o destino do chat no app do chat ou, sem ele, na casca; os outros só na casca; sem janela, o `openWindow`).

  Verificar: os testes do `sw-avisos.js`, com o destino do chat e o da casca diante de cada janela aberta, o lint, o typecheck e as duas sessões no `pnpm dev`.
- [ ] 4.13 O lado da TI (m05 e m11):
  - o campo de escrever: "Enviar à Fernanda", o "/ativo", "Cartão do ativo", "Pedir uma escolha" e a ajuda do chat;
  - a conversa: as mensagens de quem participa, a origem, a escolha, a avaliação e o resumo dos tempos;
  - o Fechado na tela;
  - as respostas prontas com as opções;
  - as pontas a ponta e as referências visuais do chamado aberto que o campo de escrever novo muda.

  Verificar: o `pnpm test:e2e` dos chamados, o lint, o typecheck e as telas no `pnpm dev`.
- [ ] 4.14 Os registros na Auditoria (`registro.ts`): os alvos e os campos das equipes e dos canais, a abertura pelo chat e o retomar e o reabrir pela pessoa, nos termos da operação. Verificar: os testes do `registro.test.ts`, o lint, o typecheck e a Auditoria no `pnpm dev`.

## 5. Fechamento

- [ ] 5.1 A documentação:
  - a linha do S7 na spec mestre;
  - o runbook: o perfil "Colaborador" e o grupo do AD, o app do chat instalado, com o "Receber neste aparelho", e a exceção da volta à versão anterior, com o erro ao reabrir um fechado nela;
  - o `docs/mapa.md`, com as specs novas;
  - o contrato de módulo (`docs/casca/modulos.md`), com o público por grupo e o app próprio.

  Verificar: o teste da documentação dos módulos e o lint.
- [ ] 5.2 O ponta a ponta da pilha (`e2e-pilha/caminho.spec.ts`): uma conta de colaborador transforma uma mensagem da equipe em chamado, a TI responde no chamado, e a resposta chega à pessoa no outro navegador. Verificar: `pnpm test:e2e:pilha`.
- [ ] 5.3 O ponta a ponta da web e o visual que faltarem: o app do chat na web simulada (a entrada, a lista, a conversa e o chamado) e as referências da regressão visual dos componentes novos do kit que as tarefas não gravaram. Verificar: `pnpm test:e2e` e `pnpm test:visual`.
