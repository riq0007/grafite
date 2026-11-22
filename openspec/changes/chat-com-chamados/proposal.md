## Why

Hoje a mensagem da TI fica no chamado: a pessoa que pediu não a recebe, não responde e não sabe em que pé está o pedido. O usuário pediu o chat dos colaboradores ligado aos chamados (itens 9.2 e 9.5 do `prompt-opus.md`): o chamado aparece para a pessoa como uma conversa aberta, bem marcada em azul, e a conversa anda nos dois sentidos. A TI escreve no chamado e a pessoa lê no chat; a pessoa responde no chat e a TI lê no chamado. O chat é "bem dinâmico e fluido, inspirado em Teams e Discord", e vale no computador, no celular e na casca da TI.

A ideia 17 da rodada 3 desenha o chat e o lado da TI: os mockups `r3-17-chat-tickets`, m01 a m12, todos aprovados em 14/11/2026.
- **O chat geral:** a lista com os chamados no alto, as equipes, os canais e as conversas recentes.
- **Transformar uma mensagem em chamado,** no computador e no celular.
- **As mensagens ricas:** o cartão do ativo, as respostas em botões e o fim do chamado, com a avaliação.
- **Vários chamados sem confusão.**
- **A TI no chat do chamado.**
- **O chamado citado numa conversa.**

A change é a segunda e última do subprojeto **S7 · Chamados** da spec mestre, que a `chamados-da-ti` criou. É a quarta das 24 da rodada 3. O **S8 · Aba dos colaboradores** (as changes 4 a 7) leva o mesmo chat e os mesmos chamados para a aba.

## What Changes

- **O módulo Chat:**
  - opcional na organização;
  - o app "Grafite · Chat", que se instala à parte no computador e no celular, com o push;
  - na casca, o Chat no dock, com as mesmas conversas;
  - quem só usa o chat entra direto nele.
- **As conversas:**
  - as diretas, entre duas pessoas;
  - as equipes, com as pessoas de um grupo do Grafite (assim o AD já as preenche);
  - os canais, de toda a organização, com quem escreve escolhido, como "Avisos da TI";
  - os chamados da pessoa.
- **O chat do computador** (m01, m03 e m10):
  - a trilha Chat, Equipes, Chamados e Avisos;
  - a lista:
    - CHAMADOS em azul no alto, cada chamado num cartão com o contorno azul, o título e a situação;
    - FECHADOS, recolhido;
    - EQUIPES E CANAIS;
    - RECENTES;
  - a conversa, com as reações, a resposta a uma mensagem, o link da mensagem, os anexos e o silenciar, e a caixa de escrever na largura da coluna;
  - a vista Chamados, com os grupos pela vez de quem age: Aguardando você, Em andamento e Fechados.
- **As mensagens:**
  - o texto, os anexos e as reações;
  - o chamado citado com "#", que vira o chip com a situação e quem atende, e o resumo para quem participa (m12).
- **As não lidas:**
  - o contador de cada conversa e o da trilha;
  - a "Resposta nova" azul do chamado aberto, que fica até a pessoa responder ou marcar como vista.
- **Transformar em chamado** (m01, m02 e m09):
  - pelo menu da mensagem, que também abre pelo botão direito, ou por Ctrl+Shift+T;
  - o formulário curto: a mensagem citada, o tipo em chips, o título, o ativo sugerido e "No nome de", trocáveis;
  - na conversa de origem, o evento com "Abrir chamado" e o fio azul na mensagem;
  - a aba "Chamados da equipe".
- **O chamado no chat da pessoa** (m04, m06, m07 e m10):
  - o cabeçalho, com o número, o título, a situação nas palavras do colaborador e as quatro etapas, com as horas;
  - "Seus outros chamados";
  - a conversa, sem as notas internas, com o resumo do formulário na abertura e os eventos nas palavras do colaborador;
  - o painel "Neste chamado", com os anexos, o ativo ligado e quem atende;
  - a caixa:
    - "Responder no #1045…";
    - no resolvido, "Escrever aqui reabre o chamado", com "Reabrir até 18/11";
    - no fechado, a frase de que ele fechou.
- **As mensagens ricas da TI** (m04 a m06):
  - o cartão do ativo pelo "/ativo PAT-00137", com o patrimônio, a situação e o toner do momento;
  - a pergunta com respostas em botões, também nas respostas prontas.

  A escolha da pessoa responde sem virar mensagem.
- **O fim do chamado** (m07):
  - o evento do resolvido, com o resumo dos tempos;
  - a avaliação em quatro níveis, de "Ruim · Não resolveu" a "Ótimo · Resolveu muito bem", com o comentário;
  - o chamado resolvido fecha sozinho 7 dias depois, e até lá escrever o reabre.
- **A resposta da pessoa:** a mensagem e a escolha dela, no chamado que aguarda, voltam o chamado ao atendimento, e o relógio volta a contar.
- **O lado da TI** (m05 e m11):
  - a conversa do chamado aberto mostra as mensagens da pessoa, as escolhas, a avaliação e a origem, "Aberto a partir da conversa Equipe Financeiro";
  - o campo de escrever manda "Enviar para Fernanda", com o "/ativo" e as opções de resposta.
- **No celular** (m08 e m09):
  - a lista e a conversa em telas;
  - alvos de 44 px;
  - o toque longo com a folha do menu;
  - o formulário curto em tela cheia.
- **As equipes e os canais na tela,** para quem configura o chat.
- **As notificações:**
  - a mensagem direta, a do canal que avisa e a resposta da TI no chamado;
  - a resposta da pessoa a quem atende;
  - as mensagens vão pelo push fora do modo Foco, qualquer que seja a severidade escolhida.
- **As permissões:**
  - `chat.usar` e `chat.configurar`;
  - `chamados.pedir`, para abrir os próprios chamados.
- **A auditoria e os eventos.**

Fica fora:
- **a aba dos colaboradores** (S8, changes 4 a 7);
- **mudar o andamento do chamado pelo chat e transformar várias mensagens num chamado só,** pedidos do usuário de 22/11: vêm na change seguinte, logo depois desta;
- **abrir um chamado com o formulário do tipo, pela grade dos tipos:** vem na `abrir-chamado-pela-aba`, que o leva também ao chat. Aqui o chat abre o chamado a partir de uma mensagem;
- **a presença** (quem está online agora), as conversas em grupo fora das equipes e dos canais, as menções e o "escrevendo";
- **editar e apagar uma mensagem.** A conversa guarda o que foi dito, como a do chamado;
- **a busca no texto das mensagens;**
- **os indicadores da avaliação.**

## Capabilities

### New Capabilities

- `chat`:
  - as conversas (diretas, equipes, canais e as dos chamados) e quem participa de cada uma;
  - as mensagens: o texto, os anexos, a resposta, as reações e o link;
  - o chamado citado e os chamados da conversa;
  - as não lidas, a resposta nova e o silenciar;
  - as equipes e os canais configurados;
  - as notificações;
  - as permissões (`chat.usar` e `chat.configurar`), a auditoria e os eventos.
- `modulo-chat`: o chat na tela, no app "Grafite · Chat" e na casca:
  - a entrada, a trilha, a lista e a conversa;
  - o menu da mensagem, o formulário curto do chamado e o chamado no chat da pessoa, com "Neste chamado";
  - a vista Chamados, as Equipes e os Avisos;
  - o celular e a tela das equipes e dos canais;
  - as telas atualizadas pelos eventos e o módulo desligado.

### Modified Capabilities

- `chamados`:
  - o chamado aberto pelo chat, em nome de quem o pede ou de outra pessoa, com a origem;
  - a situação Fechado e o fechamento 7 dias depois do resolvido;
  - a conversa entregue à pessoa, com as mensagens dela, o cartão do ativo e a pergunta com opções;
  - a leitura que a pessoa tem do próprio chamado;
  - a resposta e a reabertura pela pessoa;
  - a avaliação;
  - as respostas prontas com opções;
  - as notificações da pessoa e de quem atende;
  - `chamados.pedir`, a auditoria e o público dos eventos.
- `modulo-chamados`:
  - a primeira tela de quem só usa o chat;
  - a conversa com a pessoa no chamado aberto;
  - o campo de escrever, com "Enviar para Fernanda", o "/ativo" e as opções;
  - as opções nas respostas prontas;
  - o chamado fechado na tela.
- `modulos-da-organizacao`: o Chat entra nos módulos opcionais.
- `eventos-em-tempo-real`: o tipo de evento do chat na tabela, e o dos chamados passa a ir também à pessoa do chamado.
- `arquivos-e-imagens`: os anexos do chat, entregues pela conversa dona, e os anexos que a pessoa manda no próprio chamado.
- `notificacoes`: as notificações de mensagem vão pelo push fora do modo Foco, qualquer que seja a severidade escolhida para o push; o aparelho também se inscreve pelos Avisos do app do chat; e o toque no push escolhe a janela pelo endereço.
- `pwa`: o app do chat instalado à parte, com o nome "Grafite · Chat", e o push que abre a conversa nele, ou na janela do Chat da casca.

## Impact

- **Banco** (`packages/db`):
  - as tabelas `conversas` (com o cadastro das equipes e dos canais), `mensagens_do_chat`, `reacoes_das_mensagens`, `anexos_do_chat` e `leituras_das_conversas`, com `orgScoped()` e RLS;
  - nos chamados:
    - a origem pelo chat (a conversa e a mensagem) e a cópia da mensagem citada;
    - o momento do fechamento;
    - a avaliação e a escolha, como eventos da conversa;
    - a resposta vista de quem participa (`leituras_dos_chamados`);
    - as opções e o cartão do ativo nas mensagens;
    - as opções nas respostas prontas;
  - nas notificações, a marca da mensagem, o assunto e a mensagem do chat; nos eventos, o público por grupo.
- **Domínio** (`packages/domain`):
  - as palavras do colaborador, as etapas e os grupos dos chamados;
  - as não lidas e a resposta nova;
  - o "#" do chamado citado;
  - o fechamento;
  - o resumo dos tempos;
  - a resposta da pessoa.
- **API e contrato:**
  - as rotas das conversas, das mensagens, das reações, da leitura, do silenciar e das equipes e dos canais;
  - o transformar em chamado;
  - o chamado da pessoa: a lista, a conversa, responder, escolher, reabrir, avaliar e marcar como vista;
  - o cartão do ativo e as opções no campo da TI;
  - a tarefa do fechamento;
  - os eventos, as notificações e a auditoria.
- **Web:**
  - o app do chat em `/chat`, com a entrada e o manifesto próprios;
  - o módulo Chat na casca, em `/conversas`, com a tradução dos endereços do chat;
  - o toque no push (`sw-avisos.js`);
  - o chamado aberto e o campo de escrever do módulo Chamados;
  - a primeira tela.
- **Documentação:**
  - a linha do S7 na spec mestre;
  - o contrato de módulo, se mudar;
  - o runbook, com o perfil e o grupo dos colaboradores;
  - o `docs/mapa.md`.
- **Testes de ponta a ponta:** a pilha (`e2e-pilha/caminho.spec.ts`) leva uma conta de colaborador ao chat, transforma uma mensagem em chamado, a TI responde no chamado e a resposta chega à pessoa no outro navegador.
