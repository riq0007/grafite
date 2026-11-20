## Context

A `chamados-da-ti` deixou o chamado só com a TI: a mensagem para a pessoa fica no chamado, e ninguém a entrega. A conversa do chamado já guarda a mensagem "de uma conta ou da pessoa, pelo chat" (`mensagens_dos_chamados.autor_pessoa`), e a origem tem só a `ti`. Esta change cria o chat das pessoas (as conversas diretas, as equipes e os canais) e entrega por ele os chamados a quem os pediu, com a volta da pessoa ao chamado. Os mockups são os `r3-17-chat-tickets`, m01 a m12, aprovados em 14/11/2026.

Vale o modo rápido do `docs/agentes.md` até a `chamados-da-ti` ir para a produção-teste: as decisões ficam curtas, o teste antes do código só na conta do prazo e do fechamento, na ordenação e na permissão, e a tela se confere no `pnpm dev`, contra o mockup.

## Goals / Non-Goals

**Goals:**
- O chat em `/chat`, instalável à parte, e na casca, com as conversas diretas, as equipes pelos grupos do Grafite e os canais.
- O chamado como conversa da pessoa e de quem o abriu pelo chat, com a resposta, a escolha, a reabertura, a avaliação e o fechamento.
- A mensagem que vira chamado, com a origem guardada no chamado.
- As mensagens ricas da TI: as opções de resposta e o cartão do ativo.
- As não lidas, a resposta nova, as notificações e o push das mensagens.

**Non-Goals:**
- A aba dos colaboradores e a abertura pelo formulário do tipo (S8).
- A presença, o "escrevendo", as menções, os grupos avulsos, editar e apagar a mensagem e a busca no texto das mensagens.
- Os indicadores da avaliação.
- Um perfil "Colaborador" de fábrica: o runbook ensina a criá-lo (decisão 14).

## Decisions

### 1. As tabelas do chat

Todas com `orgScoped()`, RLS ativo e forçado e as chaves estrangeiras em `(org_id, id)`. Nenhuma se apaga pelo papel da aplicação, fora a reação.

- **`conversas`:** o `tipo` (`direta`, `equipe` ou `canal`), o `criada_em` e o `ultima_mensagem_em`, que ordena RECENTES.
  - Na direta, `conta_a` e `conta_b`, com a menor primeiro e o par único. A conversa nasce com a primeira mensagem, na mesma transação, e o par único segura a corrida das duas primeiras mensagens: a que perde lê a conversa que ganhou.
  - Na equipe e no canal, o cadastro fica nas próprias colunas, sem tabela à parte: o `nome` (de 1 a 60), o `nome_normalizado`, único entre os ativos, o `grupo_id` (só na equipe, obrigatório), o `escreve_grupo_id` (nulo é "Todos que participam"), o `avisar` e o `arquivada_em`. O CHECK confere as colunas de cada tipo. O limite de 100 ativos é do domínio, conferido com a organização travada.
- **`mensagens_do_chat`:** a `conversa_id`, a `especie` (`mensagem` ou `evento`), a `autor_conta`, sempre, o `texto` (de 1 a 4.000), a `responde_a`, da mesma conversa pela chave `(org_id, responde_a, conversa_id)`, o `evento` e os `dados` (o `virou-chamado`, com o chamado) e o `criada_em`. O id é o `uuidv7()` do banco, que ordena a conversa e a paginação. O `uuidv7()` sai na inclusão, e não no commit: por isso, a inclusão trava a conversa antes da mensagem, pelo `update` do `ultima_mensagem_em` (na direta que nasce, pelo `insert ... on conflict do update`), e o id segue a ordem do commit dentro da conversa. Sem a trava, duas mensagens ao mesmo tempo podem ficar visíveis fora da ordem do id, e a leitura e a página "depois de" pulariam a de id menor. O papel da aplicação só inclui e lê.
- **`reacoes_das_mensagens`:** a mensagem, a conta e o texto, de 1 a 20, únicos juntos. Reagir de novo apaga a linha. O teto de 10 textos é conferido com a trava da mensagem (`pg_advisory_xact_lock`), porque o papel não tem `UPDATE` nas mensagens para o `for update`.
- **`anexos_do_chat`:** o `arquivo_id` único e a conversa e a mensagem, as duas nulas no anexo sem dono, como os `anexos_dos_chamados`.
- **`leituras_das_conversas`:** a conversa, a conta, a `lida_ate` (o id da última mensagem lida) e o `silenciada`, únicos pela conversa e pela conta. A linha nasce na primeira leitura ou no primeiro silenciar. Ela guarda o estado da conta, e não quem participa (decisão 3).

### 2. O que muda nos chamados

- **`chamados`:**
  - a origem `chat`, com a `origem_conversa_id` e a `origem_mensagem_id`, única: a mensagem vira um chamado só, e a violação vira "Esta mensagem já virou o chamado #1045.";
  - o `fechado_em`: o Fechado é o resolvido com o `fechado_em`, e não uma situação nova no banco. A versão anterior, que a volta do runbook roda no banco novo, lê o fechado como resolvido, em vez de reprovar a situação que não conhece (decisão 7);
  - os CHECKs: a abertura pelo chat com quem abriu e a origem, sem a primeira resposta; o `fechado_em` só no resolvido, depois da resolução;
  - os índices: os chamados de cada conversa de origem, para a aba "Chamados da equipe"; os que cada conta abriu pelo chat, para a lista CHAMADOS; e os resolvidos que ainda não fecharam, para a tarefa do fechamento.
- **`mensagens_dos_chamados`:**
  - a mensagem de quem participa é a `mensagem` com a `autor_pessoa`, como a `chamados-da-ti` previu. A pessoa tem uma conta só (`contas_pessoa_unica`), e a pessoa marca o lado: a conta da TI que pede um chamado para si escreve no chat como pessoa e no módulo Chamados como TI;
  - a espécie `origem`: a cópia da mensagem citada, com o texto, a `autor_conta` de quem a escreveu, e nos dados a conversa, a mensagem e a hora dela, uma por chamado;
  - as colunas `opcoes` (de 2 a 3, só na mensagem da TI) e `cartao` (o retrato do ativo, até 4 KiB, na mensagem da TI e na nota);
  - os eventos novos: o `escolheu` (a mensagem e a opção, com o índice único parcial pela mensagem: a primeira escolha vence, e a violação vira "Esta pergunta já foi respondida."), o `avaliou` (o nível, o comentário e a `resolucao`, o `resolvido_em` do chamado em ISO, com o índice único parcial pelo chamado e pela resolução), e o `fechou`, o único evento sem autor, um por chamado;
  - o `retomou` e o `reabriu` de quem participa levam a conta dela, e as telas os dizem pela conta.
- **`leituras_dos_chamados`:** o chamado, a conta e a `vista_ate`, a última linha da conversa que a conta viu, do mesmo chamado pela chave `(org_id, vista_ate, chamado_id)`, únicos pelo chamado e pela conta (decisão 5).
- **`respostas_prontas`:** as `opcoes`, vazias ou de 2 a 3.

### 3. Quem usa o chat e quem participa

- **Usa o chat** a conta ativa com `chat.usar` e o módulo Chat ligado. O domínio dá o `usaOChat`.
- **Quem participa** não é gravado; sai na consulta:
  - a direta, das duas contas;
  - a equipe, de quem é do grupo dela agora (`membros_do_grupo` sem o `encerrada_em`), com o grupo ativo e a conta usando o chat;
  - o canal, de todas as contas que usam o chat.
- **A equipe e o canal arquivados** saem das listas e não recebem mensagens, e abrem só para ler, pelo link e pelos chamados, a quem participaria.
- **O "(TI)"** vai depois do nome de quem tem `chamados.atender` em algum local.
- **O chamado** tem como participantes a conta da pessoa e, na origem `chat`, a de quem abriu, quando usam o chat (`participaDoChamado`, na API). Elas não ganham nenhuma permissão dos chamados.

### 4. Os eventos

- O `PublicoDoEvento` ganha os `grupos`, que restringem a `permissao` como os `locais`: com eles, só recebe quem tem a permissão e é de um dos grupos. A conexão leva os grupos da conta, lidos com o acesso, e os relê no `acessos.mudaram`, que a entrada e a saída de um grupo já gravam. O `acessos.mudaram` com o alvo `conta`, o da entrada e o da saída, relê só as conexões dessa conta: com o chat, a empresa inteira fica conectada, e o primeiro login pelo AD grava um por grupo incluído. A tabela `eventos` ganha a coluna `grupos`, com até 8 e só com a `permissao`.
- O `registrarEvento` divide as `contas` e as `sessoes` em linhas de 20, o teto do CHECK. Sem isso, o `notificar` de um canal com 500 contas recusaria a gravação.
- O `chat.mudou` tem o alvo `conversa`:
  - na direta, as `contas` das duas;
  - na equipe, a `permissao` `chat.usar` com os `grupos` de antes e de depois;
  - no canal, a `permissao` `chat.usar`;
  - na leitura e no silenciar, a conta;
  - a mudança da situação ou de quem atende de um chamado aberto de uma conversa também o grava, para o chip seguir o chamado.
- O `chamados.mudaram` soma às `permissoes` as `contas` da pessoa e de quem abriu pelo chat.

### 5. As não lidas e a resposta nova

- **As não lidas** são as mensagens dos outros depois da `lida_ate`, contadas até 100, para o "99+". Sem a `lida_ate`, a conversa que a conta nunca leu abre na última mensagem, sem o separador.
- **A leitura** só anda para a frente. A tela a manda com a conversa à vista (a aba visível e a janela com o foco), na abertura e a cada mensagem que chega. Ela marca como lidas as notificações da conta com o assunto da conversa e a `mensagem_do_chat_id` até a mensagem lida (decisão 6): o id é o `uuidv7()`, que ordena.
- **A resposta nova** são as mensagens da TI (`mensagem` com a `autor_conta`) de outra conta depois da `vista_ate` da conta, pelo id, só no chamado aberto (na triagem, em atendimento e aguardando). O resolver grava o "O que foi feito" como mensagem da TI: sem o corte, todo resolvido teria resposta nova até a pessoa achar o "Marcar como vista". A `vista_ate` anda na mensagem, na escolha, no "Reabrir", na avaliação e no "Marcar como vista" dela: é a última linha da conversa, lida com o chamado travado. Ela é o id, e não a hora: a hora da mensagem da TI sai antes da trava (o `agora()` da rota), e a mensagem que esperou a trava ficaria com a hora de antes da marcação e nunca seria nova. O `uuidv7()` sai na inclusão, depois da trava, e segue a ordem das gravações no chamado. Os cinco marcam como lidas as notificações da conta com o assunto do chamado. Pelo "de outra conta", a conta da TI que é a pessoa do próprio chamado não ganha resposta nova da mensagem que ela mesma manda.
- **Na primeira versão,** os chamados abertos com mensagens da TI começam com resposta nova, e é o certo: até aqui ninguém as entregava à pessoa.
- **O resumo do chat,** num pedido só para o dock, a trilha e a lista: o total sem as silenciadas e os chamados com resposta nova.

### 6. As notificações

- A `notificacoes` ganha a `mensagem`, o `assunto` (`conversa:<id>` ou `chamado:<id>`, até 80 caracteres) e a `mensagem_do_chat_id`, a mensagem do chat de que ela trata, para a leitura marcar só as notificações até a mensagem lida. O índice das não lidas fica pelo assunto.
- **Quem escreve** nunca é notificado da própria mensagem: no chat, o autor; no chamado, também a conta da TI que é a pessoa dele.
- O `canaisNaHora` do domínio recebe a `mensagem`: o push vai qualquer que seja a severidade, nunca no Foco, e leva só o título. O e-mail e o resumo seguem as escolhas da conta, como em qualquer notificação.
- **A mensagem do chat** é notificada pela fila, 10 s depois (a tarefa `chat.notificar`, com o `startAfter`), a quem ainda não a leu, fora quem escreveu e quem silenciou. É assim que a regra "a conta que já leu a mensagem" se cumpre: quem está com a conversa à vista a lê antes. O destino é `/chat/c/<conversa>?m=<mensagem>`.
- **Os chamados** notificam na transação, como já fazem:
  - à pessoa e a quem abriu, a resposta da TI e o resolvido, com o destino `/chat/chamados/<número>`;
  - a quem atende, a resposta da pessoa, com o destino `/chamados/<número>`. Ela é uma mensagem, como mostra o cenário "Mensagem no modo Foco".
  - A mensagem da pessoa que reabre o chamado notifica só o "Chamado #1045 com você".
- O aviso na tela não aparece quando a conversa do assunto está à vista (na web).

### 7. O fechamento

- O domínio dá o `momentoDoFechamento(resolvidoEm, fuso)`: a meia-noite que começa o oitavo dia depois do dia da resolução, no fuso do horário da TI de agora. Dá também o `ultimoDiaParaReabrir` (o "Reabrir até 18/11"), a `situacaoDoChamado`, que lê o Fechado pelo `fechado_em`, e o `estaFechado(chamado, agora, fuso)`, que vale também para o resolvido vencido que a tarefa ainda não fechou. As ações usam o `estaFechado`, e nenhuma reabre um chamado depois da meia-noite. Os testes vêm antes do código: o horário de verão, a virada do mês e do ano e a resolução às 23:59.
- O momento sai do `resolvido_em`, sem coluna própria: os resolvidos de antes desta versão fecham pela data deles sem migração, e a versão anterior não precisa gravar nada no resolver.
- A tarefa `chamados.fechamento`, a cada minuto, como a `chamados.prazo`, fecha os vencidos de cada organização em lotes de 500: o `fechado_em` no momento do fechamento, o evento `fechou` e os eventos em tempo real, sem auditoria e sem notificação. Vencido é o resolvido antes do começo do dia de 7 dias atrás, no fuso. A organização com o módulo desligado é pulada.

### 8. Abrir pelo chat

- **A rota:** `POST /chat/mensagens/:id/chamado`, com o tipo, o título, o ativo e a pessoa. Ela pede `chamados.pedir` e os módulos Chat e Chamados ligados, e passa pela abertura da `chamados-da-ti` (`abertura.ts`), com a origem `chat`:
  - sem o "Fica comigo";
  - as respostas vazias, fora a do primeiro campo Ativo;
  - sem a conferência dos obrigatórios;
  - a primeira resposta nula, que a primeira mensagem da TI grava (`cumpreAPrimeiraResposta`).
- **A mensagem** fica travada (`pg_advisory_xact_lock`), e a `origem_mensagem_id` única recusa a segunda abertura.
- **Na mesma transação:**
  - a linha `origem`;
  - os anexos da mensagem, como linhas novas em `anexos_dos_chamados`, sobre os mesmos arquivos. Nenhum dos dois donos remove o arquivo, porque a mensagem não se apaga;
  - o evento `virou-chamado` na conversa;
  - a auditoria `chamado.aberto`, com a origem;
  - o `chamados.mudaram` e o `chat.mudou`.
- **O que a abertura lê:**
  - os tipos, pelo `GET /chat/chamados/tipos`: os Em uso que aparecem para o colaborador e não são "Só a TI abre";
  - os ativos sugeridos, pelo `GET /chat/chamados/sugestoes`, com o id, o nome e o patrimônio, sem `ativos.ver`, pela mesma consulta das sugestões da TI (4.8 da `chamados-da-ti`);
  - a pessoa, pelos `GET /pessoas/nomes`.

### 9. O chamado para quem participa

- **As rotas** ficam em `/chat/chamados`:
  - a lista: os abertos, os resolvidos que ainda reabrem e os fechados, paginados;
  - o chamado com a conversa;
  - responder, escolher, reabrir, avaliar e marcar como vista;
  - o anexo;
  - o resumo do chip.
- **A leitura** tira as notas, os campos só da TI e os anexos dos dois, os alertas, o prazo da resolução e os eventos do desfazer, da OS, da solicitação e das trocas.
- **O domínio dá as palavras do colaborador:** a situação, as etapas e os eventos, com o "Você" quando quem agiu é a conta que lê. Dá também a ordem da lista CHAMADOS e os grupos da vista Chamados, com os testes antes do código.
- **As horas das etapas** (m10) saem dos eventos, pela mesma leitura da situação da linha do tempo da TI: o `caminhoDaSituacao`, no domínio, que a `linhaDoTempo` (em `lado.ts`) passa a usar: cada etapa até a de agora tem a hora da última chegada a ela, a pulada fica sem hora, e as depois da de agora, "ainda não". O domínio as calcula com todos os eventos, também o desfazer, antes de a leitura tirar os que a pessoa não lê.
- **As ações de quem participa** ficam numa matriz ao lado da do `acoes.ts`, em `acoes-de-quem-participa.ts` (`MATRIZ_DE_QUEM_PARTICIPA` e `decidirAcaoDeQuemParticipa`), com o Fechado como uma situação e o chamado travado para a gravação. A retomada e a reabertura saem da matriz da TI (`MATRIZ_DAS_ACOES`):
  - a mensagem e a escolha que retomam o aguardando;
  - a mensagem e o "Reabrir" que reabrem o resolvido, para quem resolveu ou para a triagem, como o reabrir da TI;
  - as recusas do resolvido e do fechado.
  - A permissão (participa, usa o chat e os módulos ligados) também tem os testes antes.
- **A mensagem de quem abriu no nome de outra pessoa** sai como "Fernanda Rocha · abriu o chamado" para a TI, e com o nome para a pessoa.

### 10. As mensagens ricas da TI

- **As opções:** a mensagem da TI leva de 2 a 3, conferidas no domínio, e a resposta pronta as põe no campo.
- **O cartão:** a API monta o retrato na hora de mandar, de um ativo que quem escreve vê. Ela usa as leituras do resumo do ativo (o nome, o modelo, o patrimônio, o IP, a disponibilidade em texto, o suprimento mais baixo e a hora da leitura) e grava no `cartao`.
- **O campo de escrever** pede a prévia pelo `GET /chamados/:numero/cartao?patrimonio=`, que dá o mesmo retrato. O "/ativo" é lido na web, pelo `comandoDoAtivo` do domínio.

### 11. O chamado citado

- O `citacoesDeChamados` do domínio acha o "#" seguido do número, separado das outras palavras, até 10 por mensagem.
- A API resolve as citações na leitura, para a conta que lê: a situação nas palavras do colaborador e quem atende, só dos chamados de que ela vê o resumo (participa, tem `chamados.ver` nos locais dele ou participa da conversa de origem). Nada se grava, e por isso o chip segue o chamado.
- O resumo do chip, com as duas últimas mensagens e o ativo, vai só a quem participa do chamado e a quem tem `chamados.ver`.

### 12. O app do chat na web

- **Uma página própria do build:** o `apps/web/chat/index.html`, com o título "Grafite · Chat" e o manifesto `/chat/manifest.webmanifest`, gerado pelo `pnpm marca:gerar` com os ícones de sempre. A página tem a entrada própria, o `src/chat/main.tsx`, que não importa o roteador da casca nem os módulos: o pacote principal já passa de 2 MiB (`vite.config.ts`), e o colaborador abre o chat no celular. O build passa a ter as duas páginas.
- **O app** tem a árvore de rotas própria (`/chat`, `/chat/c/:conversa`, `/chat/chamados`, `/chat/chamados/:numero`, `/chat/equipes` e `/chat/avisos`) e os mesmos provedores: as preferências, a sessão, a API, o TanStack Query, o canal e as notificações. Não tem a casca nem a chegada: a entrada valida a sessão como a etapa da sessão da chegada, sem a camada do carregamento, e o `chegadaNoIndex` pula a página do chat, que de outro modo ficaria com o "Carregando o Grafite", que só o `chegar` fecha.
- **"Receber neste aparelho"** fica em cima dos Avisos do app, pelo mesmo `inscreverEsteAparelho` dos Ajustes e com os motivos em texto deles: quem só usa o chat nunca chega aos Ajustes, e no iPhone o push só vale no app instalado, que tem o alcance `/chat`.
- **A API** serve o `chat/index.html` aos pedidos de página em `/chat`. No `pnpm dev`, um plugin do Vite faz o mesmo.
- **O service worker** deixa o `/chat` de fora do `navigateFallback`: o app do chat abre pela rede, porque sem ela não há conversa, e sem isso o cache serviria a página com o manifesto do Grafite.
- **O toque no push** (`sw-avisos.js`) guarda o destino com a busca e o fragmento (o `?m=` da mensagem), e não só o caminho, e escolhe a janela pelo caminho, nos dois sentidos: o destino em `/chat` vai à janela do app do chat ou, sem ela, à da casca, que o traduz; os outros vão só à janela da casca, porque o app do chat não tem as rotas dela. Sem a janela certa, ele abre o endereço, que o navegador entrega ao app instalado.
- **A casca** ganha o módulo `chat`, com as mesmas vistas numa janela, o selo do resumo e "Abrir no app do chat", no endereço `/conversas` (`/conversas/c/:conversa`, `/conversas/chamados/:numero`, `/conversas/equipes` e `/conversas/equipes-e-canais`). O `/chat` é do app: com ele, recarregar a casca com a janela do Chat aberta cairia no app sem a casca.
- **A tradução dos destinos:** o `navegar` do `App.tsx`, que abre os destinos das notificações, do aviso e do push, leva `/chat/...` a `/conversas/...`, com a busca. No app, o destino fora do `/chat` abre o Grafite numa janela nova. "Abrir no app do chat" faz o inverso, de `/conversas/...` a `/chat/...`. O "Copiar link da mensagem" copia sempre o endereço do app.
- **A primeira tela:** a conta que, entre os módulos da casca, só vê o Chat vai ao `/chat` com o `location.replace`, na mesma regra da marca da aba da `chamados-da-ti`.

### 13. O lado da TI

- O campo de escrever do chamado aberto ganha "Enviar à Fernanda", o cartão, as opções e a ajuda de quem usa o chat. A ficha passa a dizer se a conta da pessoa usa o chat.
- A conversa ganha as mensagens de quem participa, a origem com "Abrir a conversa" a quem participa dela, a escolha, a avaliação e o resumo dos tempos, este montado na leitura pelo domínio (`resumoDosTempos`, em horas corridas).
- O Fechado ganha o selo, a frase do campo e a linha "Fechado · 18/11"; o resolvido diz "fecha em 18/11".
- A lista das respostas prontas mostra as opções contadas, e a gaveta as edita.

### 14. As permissões e o módulo

- O catálogo ganha a área "Chat", no fim, com o `chat.usar` e o `chat.configurar`, e o `chamados.pedir` no fim da área "Chamados", os três na organização. O Administrador os tem pelo `todasAsPermissoes`.
- O Chat entra nos módulos opcionais, ligado como os outros.
- O perfil dos colaboradores não vem de fábrica: o runbook ensina a criar o "Colaborador" (`chat.usar` e `chamados.pedir`) e a dá-lo ao grupo do AD de todos, para cada organização escolher quem usa o chat.

### 15. O visual que os mockups deixam em aberto

- **O azul do chamado** são os tokens de informação (`--cor-info`, `--cor-info-borda` e `--cor-info-fundo`), como nos mockups, sem token novo. O contorno forte do chamado novo usa o `--cor-info-forte`.
- **As durações** vêm dos tokens de movimento. A que faltar entra neles, com o teste.
- **A forma da conversa:** o chat é sempre o do Discord (o nome e a hora em cima, sem balão), e não segue a preferência "conversas", que é do chamado aberto da TI.
- **O título** do transformar vai até 120 caracteres, a regra do chamado, e não 80, como no m02.
- **A origem de uma conversa direta** diz "Aberto a partir da conversa de Fernanda Rocha com Paulo Nunes".
- **"Mensagens anteriores"** carrega 50 por vez.
- **A espera** fica na linha "Aguardando você", com a hora, sem a razão dos mockups ("confirme o nome da pasta", no m08 e no m10): o evento `aguardando` não tem dados, a razão foi escrita à mão no mockup, e a mensagem da TI logo acima já diz o que falta.
- **As horas das etapas** do m10 ("ontem 17:05", "ainda não") saem dos eventos (decisão 9).
- **A gaveta das equipes e dos canais,** que os mockups não mostram: "Quem escreve" tem "Todos que participam" e "Um grupo", que abre a escolha do grupo, e o "Um grupo" sem a escolha dá "Escolha o grupo que escreve.", a frase da spec. A escolha lista os grupos ativos, lidos pelo `chat.configurar` (`GET /chat/grupos`, só o id e o nome), porque o `GET /grupos` pede o `acessos.ver`, que quem configura o chat pode não ter. Na alteração, o grupo gravado fica, mesmo inativo, para o nome mudar sem trocar o grupo, e aparece na escolha como o escolhido, com "(inativo)".
- **As ordens que a spec deixa em aberto:** FECHADOS, na lista do Chat e na vista Chamados, vai pelo resolvido mais novo, porque o que se procura ali é o que acabou de ser resolvido, para reabrir ou avaliar. Os grupos abertos da vista Chamados vão pelo aberto mais novo, como CHAMADOS na lista, para o mesmo chamado ficar na mesma ordem nas duas. EQUIPES E CANAIS compara os nomes sem os acentos e as maiúsculas, com os números em ordem de valor ("Sala 2" antes de "Sala 10"). O empate vai pelo número do chamado, o mais alto primeiro, ou pelo id.
- **A previsão da resposta** ("responde em ~1 h") só aparece na vez da TI, na triagem e em atendimento: no Aguardando você, a TI espera a pessoa, e o resolvido não espera resposta. O texto é o prazo de resposta que o chamado copiou do tipo, com a unidade dele.
- **O resumo dos tempos** escreve o tempo como os indicadores (`textoDoTempo`: "18 min", "1,5 h" e "2,7 dias") e o conta pelos minutos das horas que mostra, para a conta fechar com elas. A primeira resposta é a primeira mensagem da TI na conversa (a `mensagem` com a `autor_conta`), como pede a spec, que conta o "O que foi feito" do resolver. Na origem `chat`, ela é a `primeira_resposta_em` do prazo; na origem `ti`, não, porque a abertura pela TI grava a `primeira_resposta_em` na hora da abertura, e o resumo diria a primeira resposta na hora do "Aberto", sem nenhuma mensagem. Cada resolvido tem o seu resumo, com a hora e o "Atendeu" do próprio evento `resolveu`.
- **A abertura com quem atende** (o "Fica comigo" ou quem atende o tipo por padrão) guarda quem nasce atendendo no `dados.para`, como o reabrir: o chamado chega na abertura ao Aberto e ao Em andamento, nas etapas e na linha do tempo da TI, que diz "Em atendimento · hoje, 07:40 · aberto por Fernanda Rocha · com Bruno Lima", sem o "com" quando quem atende é quem abriu. A abertura de antes desta versão, sem o `para`, lê como antes, na triagem.
- **O "Você"** vale para a conta que a frase cita: quem agiu e, no passar, quem recebe o chamado ("Você está atendendo o chamado").
- **As ações de quem participa,** nos casos que a spec não escreve:
  - "Marcar como vista" vale em toda situação, também no resolvido e no fechado: muda só a leitura da conta, e não o chamado, e o pedido que chega depois da resolução não volta como erro;
  - a mensagem vem antes do evento que ela causa, o "retomou" ou o "reabriu", como o "O que foi feito" antes do "resolveu", e a escolha antes do "retomou";
  - o "Reabrir" fora do resolvido recusa com a frase do reabrir da TI ("O chamado #1045 não está resolvido."), e a avaliação, com a da spec dela, sem o número ("O chamado não está resolvido.");
  - a escolha compara a opção como foi gravada, e as opções de uma pergunta são diferentes sem contar os acentos e as maiúsculas: "Sim" e "sim" seriam a mesma resposta;
  - a célula recusa antes do conteúdo, como na TI: no fechado, a mensagem vazia recusa pelo fechado; e a avaliação já feita recusa antes do nível.
- **A foto no chat:** a entrega da foto da pessoa pede `pessoas.ver`, que quem só usa o chat não tem. O chat entrega a foto da conta que usa o chat a quem usa o chat (`GET /chat/contas/:id/foto/:arquivo/:tamanho`), e as listas mandam a foto só dela: a conta que deixou o chat fica com as iniciais, como fica fora das conversas.
- **As não lidas** contam as mensagens dos outros, e não os eventos, como o `virou-chamado`: a spec fala das mensagens, e o evento não notifica.
- **A conversa aberta** tem o cabeçalho próprio (`GET /chat/conversas/:id`): o nome, a outra conta da direta, as pessoas da equipe que usam o chat, o grupo que escreve, o arquivamento, o silenciar, a última lida e, a quem só lê, a frase no lugar da caixa (`fraseNoLugarDaCaixa`): a da mensagem recusada, fora a da arquivada, que a spec modulo-chat escreve "Esta equipe foi arquivada.". O link da mensagem (o `em` da página) de uma conversa de que a conta não participa responde "A mensagem não foi encontrada.", como a spec chat pede. A tela abre o link de uma conversa que não está nas listas, como a arquivada.
- **A primeira mensagem da direta** vai pela pessoa (`POST /chat/diretas/:conta/mensagens`), e não pela conversa, que ainda não existe; a resposta traz a conversa. A conta que não usa o chat e não tem a direta responde como a pessoa que não existe, como fica fora da escolha; com a direta, a mensagem é recusada pela frase.
- **A página** de 50 traz as mais novas, as 50 antes ou depois de uma mensagem e, ao redor dela, as 25 de antes, ela e as 24 de depois, com `anteriores` e `seguintes`; a mensagem da busca que não é da conversa responde como inexistente. As reações e a respondida levam o nome no chat, com o "(TI)", porque não têm o `daTi` da conta ao lado.
- **As reações** são de quem participa, também de quem só lê, como no canal de avisos, onde o "visto" serve; a equipe e o canal arquivados as recusam pela frase da arquivada. A trava da mensagem é a trava transacional da organização (`mensagem:<id>`, em `travas.ts`), e não o `for update`, que o papel da aplicação não pode na `mensagens_do_chat`, sem o `update`. A resposta é a mensagem com as reações de agora.
- **A leitura** marca as notificações da conversa até a última lida a cada pedido, também quando a lida não anda: a notificação que a tarefa gravou depois de ler a `lida_ate` de antes fica lida na próxima leitura. O `chat.mudou` à conta vai só quando a lida anda, e o silenciar, só quando muda.
- **Os anexos do chat** seguem os dos chamados: o envio e a entrega ficaram em `arquivos/anexos-sem-dono.ts`, com o mesmo `AnexoEnviado` (`POST /chat/anexos`, `GET /chat/anexos/:arquivo` e `GET /chat/conversas/:id/anexos/:arquivo`). A mensagem confere o número de anexos depois do texto, com a recusa em `anexos`, e os toma depois de gravada, porque a chave estrangeira do anexo pede a mensagem. O anexo pela conversa de que a conta não participa, ou de outra conversa, responde "Arquivo não encontrado.".
- **As equipes e os canais:**
  - a lista do cadastro traz as ativas primeiro, cada parte pelo nome; a gaveta lê o grupo e o grupo que escreve com o nome e a situação de agora;
  - o reativar não recebe o pedido: volta como está gravado, com o nome e o teto conferidos. Ele toma a trava do teto antes da linha, como o cadastro, que só tem a trava;
  - o nome repetido e o teto respondem 409, o nome no campo dele, como no tipo de chamado; a alteração que não muda nada não grava nem audita;
  - a auditoria tem as ações `equipe.*` e `canal.*`, com o alvo `conversa` pelo nome de agora e o retrato nos termos da tela ("Todos que participam", "Ativo" e "Arquivado"). O `chat.mudou` da auditoria vai a quem tem o `chat.configurar`, para a tela do cadastro, e a rota manda o de quem participa depois e, se o grupo mudou, o de antes;
  - a vista Equipes conta, no canal, todas as contas que usam o chat;
  - as abas Arquivos e "Chamados da equipe" vêm de 50 em 50, o mais novo primeiro, e servem a qualquer conversa de que a conta participa; com o módulo Chamados desligado, a segunda fica vazia.
- **A espera no chip e em "Chamados da equipe"** (confirmada pelo usuário em 19/11, com a spec chat mudada): "Aguardando você" só a quem participa do chamado, a pessoa e quem o abriu pelo chat. Quem o vê por ser da conversa de origem ou pelo `chamados.ver` lê "Aguardando o colaborador", a palavra da TI, porque a resposta não é dele (`situacaoNoChat`).
- **As notificações,** nos casos que a spec não escreve:
  - os títulos levam o nome sem o "(TI)" do chat, como nos exemplos da spec ("Ana Souza em Avisos da TI");
  - a mensagem da espera ("Aguardando o colaborador") é mensagem da TI para a pessoa e notifica como a resposta; o resolver notifica só o resolvido, e não a resposta pelo "O que foi feito";
  - o "Chamado #1045 com você" da reabertura, também pela mensagem da pessoa, não é mensagem: vai por push nas severidades escolhidas, como o de qualquer chamado passado;
  - a mensagem vai por push também quando a conta não escolheu nenhuma severidade: a spec diz "qualquer que seja a severidade escolhida", e quem não quer o push de nenhuma mensagem liga o Foco ou não inscreve o aparelho;
  - a tarefa `chat.notificar` lê quem participa quando roda, pela mesma consulta da aba das pessoas (`idsDeQuemParticipa`, em `chat/conversa.ts`). A equipe ou o canal arquivado nos 10 s não notifica ninguém, porque o arquivado sai da lista de quem participa; o módulo Chat desligado também não. Ela roda numa transação só, e a nova tentativa depois de uma falha não acha nada gravado; a que gravou e caiu antes de a fila a dar como concluída roda de novo sem repetir o aviso, porque quem já tem a notificação da mensagem fica de fora.
- **A abertura pelo chat,** nos casos que a spec não escreve:
  - a mensagem de uma equipe ou de um canal arquivado, ou em que só um grupo escreve, também vira chamado: a spec pede só que a conta participe da conversa, e o `virou-chamado` é um evento, e não uma mensagem;
  - o evento entra na conversa na hora da abertura, na ordem dela, e não colado à mensagem de origem, que pode estar longe: a conversa vai pelo id, que sai depois da trava da conversa. A hora da última mensagem não muda. A marca do evento leva a mensagem de origem (`chamado.mensagem`), que o "esta mensagem" cita e a que leva. **Confirmado pelo usuário em 19/11, pela pergunta,** com as specs chat e modulo-chat mudadas, que diziam "logo depois da mensagem": a mensagem antiga pode estar noutra página, e quem só olha o fim da conversa não veria o evento;
  - a recusa da mensagem que já virou chamado vem antes da conferência dos campos, com a mensagem travada (`mensagem:<id>`, a mesma trava das reações);
  - os ativos sugeridos, o escolhido e a solicitação que o tipo gera são lidos pela organização inteira, porque quem abre não tem o `ativos.ver`: dos sugeridos, ele lê só o id, o nome (o rótulo do ativo: o nome ou o modelo) e o patrimônio. O registro delegado da solicitação lê pelo leitor da abertura, e não pelo da sessão: a impressora, o consumível sugerido pelo saldo, com o estoque da organização inteira, e a visão da auditoria;
  - os sugeridos vêm todos, sem o teto de 10 da TI, que tem a busca: no chat, o ativo só se escolhe da lista, e a spec põe nela todos os da pessoa e do local dela;
  - os tipos trazem o ícone, a frase e se o tipo pede o ativo, para a escolha; os sugeridos de um tipo que não abre pelo chat ou não pede o ativo vêm vazios;
  - a auditoria `chamado.aberto` leva a origem nas duas aberturas, a `ti` e a `chat`;
  - a marca na mensagem e o evento trazem o número a quem lê a conversa, e o "Abrir chamado" só a quem participa do chamado ou o vê com `chamados.ver`; com o módulo Chamados desligado, o número fica, sem o "Abrir chamado";
  - o anexo sem dono dos chamados, enviado por quem tem só o `chat.usar`, pede o módulo Chat ligado, porque não serviria a nenhuma gravação dela. A guarda da rota aceita a lista de permissões, de que a conta precisa de uma.
- **A leitura de quem participa,** nos casos que a spec não escreve:
  - a conversa e o anexo pelo chat vão só a quem participa do chamado. Quem o vê com `chamados.ver` e não participa recebe "Chamado não encontrado." no chat e o lê no módulo Chamados, onde está também o que é só da TI; o "Abrir chamado" do resumo do chip diz aonde levar cada um (`abrir`: a conversa do chat ou o módulo);
  - a lista traz todos os abertos na primeira página, na ordem da lista do Chat, e os resolvidos de 50 em 50, os que ainda reabrem e os fechados juntos, o resolvido mais novo primeiro, com o número do último da página como o cursor (`resolvidosAntes`). Os que reabrem vêm antes dos fechados, porque o chamado fecha pela data da resolução;
  - o "Reabrir até" vem em todo resolvido, também no fechado, onde é o dia do "O chamado fechou em 18/11";
  - a resposta nova traz quantas e a primeira delas, onde entra o separador "Resposta nova";
  - a última mensagem da lista e da vista Chamados é a última `mensagem` da conversa, sem as notas e os eventos, com quem a escreveu;
  - a escolha vai na própria pergunta (`escolhida`), a primeira de cada uma, com quem escolheu e quando, e o cartão, como foi gravado;
  - o assumir que o desfazer desfez sai da conversa com ele, como sai das etapas: a pessoa não lê "está atendendo" de quem não atende;
  - a mensagem de origem vem à parte (`origem`), com os anexos dela, para a abertura a mostrar;
  - as duas últimas mensagens do resumo do chip incluem as notas só a quem vê o chamado com `chamados.ver`;
  - a avaliação da resolução de agora vem à parte (`avaliacao`), com o nível e se foi a conta que lê, para a tela saber se oferece a avaliação.
- **As ações de quem participa,** nos casos que a spec não escreve:
  - as rotas são `POST /chat/chamados/:numero/mensagens`, `/escolha`, `/reabertura`, `/avaliacao` e `/vista`, e cada uma devolve a conversa depois da ação, lida na mesma transação, para a tela não pedir de novo;
  - quem não participa recebe "Chamado não encontrado.", como na leitura, também quem vê o chamado com `chamados.ver`, que age no módulo Chamados;
  - a escolha numa mensagem que não é do chamado, também a nota, que a pessoa não lê, é a pergunta sem opções: "Escolha uma opção da pergunta.", no campo `opcao`, sem dizer se a mensagem existe;
  - a marcação como vista avisa só as telas da conta (`chamados.mudaram` com a conta), porque muda só a leitura dela; as outras ações avisam quem vê o chamado, e a 3.12 soma as contas de quem participa.

## Risks / Trade-offs

- **A notificação de um canal com aviso** grava uma linha por conta e põe o push de cada aparelho na fila: em 500 contas, 500 linhas e até 25 eventos por mensagem. Por isso o aviso começa desligado, e o limite de 100 equipes e canais fica.
- **Quem participa, pela consulta,** custa a junção com os grupos em cada leitura da lista. Os índices `membros_do_grupo_conta_idx` e o novo `mensagens_do_chat (org_id, conversa_id, id)` seguram a lista e a paginação.
- **A notificação 10 s depois** chega 10 s mais tarde a quem não está no chat, em troca de não avisar quem já está lendo.
- **O app do chat não abre sem a rede,** ao contrário do Grafite.
- **O arquivo dividido** entre a conversa e o chamado não pode ganhar o `removido_em` por um dos dois. Hoje nenhum remove o anexo de uma mensagem; a remoção de um anexo de mensagem, se vier, terá de olhar os dois donos.
- **O resolvido vencido** que a tarefa ainda não fechou já se comporta como fechado, pelo `estaFechado`. A tela pode mostrá-lo como Resolvido por até 1 min.
- **O fuso do horário da TI trocado** depois da resolução muda o dia do fechamento dos resolvidos, porque ele sai do fuso de agora. A troca é rara, e o erro é de horas.
- **A conversa que a conta nunca leu** conta a história inteira como não lida, até o "99+", até ser aberta: quem entra num grupo vê a equipe com o contador cheio uma vez. Ela abre na última mensagem, e a leitura zera o contador.

## Migration Plan

- Uma migration cria as tabelas, as colunas, os CHECKs e os índices, com o RLS e os privilégios do papel da aplicação, e acrescenta a origem `chat` e as espécies e os eventos novos às listas do banco, com o teste que as compara com o domínio. Os CHECKs só se alargam: o que a versão anterior grava continua aceito.
- O módulo Chat começa ligado nas organizações que já existem, sem equipe e sem canal. Ninguém tem `chat.usar` fora o Administrador até quem administra criar o perfil.
- **A volta à versão anterior** (o `voltar` do runbook) roda a versão de antes no banco novo, e ela não conhece a origem `chat` nem a linha `origem` da conversa. Como a versão dos campos de arquivo, esta só volta à anterior enquanto nenhum chamado foi aberto pelo chat; depois, o caminho é corrigir numa versão nova ou restaurar o backup de antes da atualização. O runbook ganha essa exceção. O chamado fechado a versão anterior lê como resolvido, e reabri-lo é recusado pelo CHECK do `fechado_em`, com um erro: o runbook também diz isso. A versão anterior pula os eventos que não conhece (`ficha.ts`), então o `fechou`, o `escolheu` e o `avaliou` não quebram a volta.

## Open Questions

Nenhuma que pare o código.
