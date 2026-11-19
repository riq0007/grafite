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

- O `PublicoDoEvento` ganha os `grupos`, que restringem a `permissao` como os `locais`: com eles, só recebe quem tem a permissão e é de um dos grupos. A conexão leva os grupos da conta, lidos com o acesso, e os relê no `acessos.mudaram`, que a entrada e a saída de um grupo já gravam. A tabela `eventos` ganha a coluna `grupos`, com até 8 e só com a `permissao`.
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
- **As horas das etapas** (m10) saem dos eventos, pela mesma leitura da situação da linha do tempo da TI (`linhaDoTempo`, em `lado.ts`): cada etapa até a de agora tem a hora da última chegada a ela, a pulada fica sem hora, e as depois da de agora, "ainda não". O domínio as calcula com todos os eventos, também o desfazer, antes de a leitura tirar os que a pessoa não lê.
- **As ações de quem participa** entram na matriz do `acoes.ts` (`acoesDeQuemParticipa`), com o chamado travado para a gravação:
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
