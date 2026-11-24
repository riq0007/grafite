## Context

A `chat-com-chamados` deixou o chamado do chat como a leitura de quem participa: a pessoa do chamado e quem o abriu pelo chat. Essa leitura não tem as notas, os campos só da TI nem as ações do atendimento. As ações da TI ficam nas rotas `/chamados/:numero/<ação>`, com `chamados.atender`, gravadas pelo `agirNoChamado`, com a versão do chamado e as recusas da matriz (`MATRIZ_DAS_ACOES`).

A mensagem de quem participa é gravada com a `autor_pessoa`: a TI a lê como a da pessoa, ela não cumpre a primeira resposta, só avisa quem atende e, no chamado que aguarda, o retoma. Por isso a conta da TI que abre o chamado pelo chat no nome de outra pessoa hoje conversa com ela como se fosse quem pediu.

A origem do chamado aberto pelo chat é uma linha `origem` na conversa do chamado, uma por chamado (`mensagens_dos_chamados_origem_unica`), com a cópia da mensagem e os anexos dela. O chamado guarda a `origem_mensagem_id`, única.

Não há mockup do andamento nem da seleção: as lacunas são decididas aqui (decisão 9). Vale o modo rápido do `docs/agentes.md` até a `chamados-da-ti` ir para a produção-teste.

## Goals / Non-Goals

**Goals:**
- As ações do atendimento no chamado do chat, para quem participa e atende os locais dele, pelas rotas da TI, sem uma regra nova de transição.
- Quem participa pela TI fala e lê como a TI, no que a conversa com a pessoa precisa: a mensagem, a espera, as listas e a resposta nova.
- Um chamado com até 20 mensagens da mesma conversa, cada uma num chamado só.

**Non-Goals:**
- A leitura da TI no chat: as notas, o prazo, os campos só da TI, o ativo trocado e a OS ficam no Chamados.
- O campo de escrever da TI no chat: a nota, as opções, o "/ativo" e as respostas prontas.
- Abrir no chat o chamado de que a conta não participa (resposta do usuário de 23/11).

## Decisions

### 1. Quem atende pelo chat e quem participa pela TI

- **Quem atende pelo chat:** a conta que participa do chamado (`participaDoChamado`) e atende todos os locais dele (`atendeOChamado` com o alcance de `chamados.atender`). Só ela recebe o `andamento` na leitura.
- **Quem participa pela TI:** entre elas, a que abriu o chamado pelo chat no nome de outra pessoa, isto é, a que não é a pessoa do chamado. O domínio dá o `participaPelaTi`, com os testes antes, como toda permissão.
- **A pessoa do chamado que atende,** como quem é da TI e pede um chamado para si, segue como quem pediu, como a decisão 3 da `chat-com-chamados` diz ("a conta da TI que pede um chamado para si escreve no chat como pessoa"). Ela ganha o andamento, sem "Aguardar" e sem "Reabrir": esperar por si mesma não faz sentido, e ela já reabre como quem pediu, pelo "Reabrir até".
- **Quem atende sem participar** segue com o "Abrir chamado" no Chamados (`abrir: 'chamados'`).
- **Por que não pelo responsável:** quem participa pela TI é quem atende os locais, e não só quem está com o chamado agora, como no Chamados, onde qualquer conta que atende os locais escreve à pessoa.
- **Alternativa descartada:** manter a mensagem de quem participa pela TI como a de quem pediu e pôr o andamento só no menu. Pela resposta do usuário de 23/11, a mensagem vai como a da TI.

### 2. As ações do andamento

- O domínio dá `acoesDoAndamento(chamado, conta)`, na ordem do menu, a partir da `MATRIZ_DAS_ACOES`. Uma ação entra quando a célula dela, na situação de agora, não é uma recusa. Além da célula:
  - **Assumir:** fora o chamado que já está com a conta;
  - **Aguardar:** só na triagem e em atendimento, e nunca à pessoa do chamado. No aguardando, a matriz aceita o "Enviar e esperar" como a mensagem sem evento, e no menu ele não muda nada;
  - **Reabrir:** só a quem participa pela TI;
  - **o fechado:** nenhuma.

  Os testes vêm antes do código.
- **A leitura do chat** (`GET /chat/chamados/:numero`) ganha:
  - o `andamento`, nulo a quem não atende pelo chat, com a `versao` do chamado, as `acoes` e a pessoa: o nome, para "Aguardar Fernanda", e se ela usa o chat, como a ficha já calcula, para a frase do Chamados "Fernanda ainda não usa o chat: a mensagem fica no chamado." na caixa e no diálogo do aguardar;
  - o `pelaTi`.
- **As ações vão pelas rotas da TI,** com a versão do andamento:
  - `assumir`, `passar`, `devolver`, `desfazer` e `reabrir`, pelo `useAcoesDoAtendimento` do Chamados, que só puxa a API, e não a casca;
  - `esperar`, `retomar` e `resolver`, por um gancho do chat, porque o `useAcoesDoChamadoAberto` puxa o roteador e o Toner, que não entram no app do chat.

  Depois de cada uma, aceita ou recusada, e do "Desfazer", a tela relê o chamado do chat e as listas, sem esperar o `chamados.mudaram`. Para isso, o `useAcoesDoAtendimento` ganha o `aoMudar` opcional, que ele chama depois de cada ação, também na recusa e no "Desfazer", que roda dentro dele: o gancho só relê as chaves do Chamados, e o chat passa a releitura das dele (`['chat', 'chamados']`). Sem isso, com a conexão de eventos caída, a ação seguinte iria com a versão velha. As recusas e o "O chamado #1045 mudou. Confira antes de assumir." são os da TI, no aviso crítico do gancho.
- **Alternativa descartada:** uma rota de ação no chat, como `/chat/chamados/:numero/assumir`. Ela repetiria as rotas da TI, com a mesma permissão e as mesmas recusas.

### 3. Quem recebe o chamado

- `GET /chamados/:numero/quem-recebe`, com `chamados.atender`. Ela lê o chamado:
  - pelo alcance de `chamados.ver`, ou ele não existe;
  - e confere que a conta o atende, com "Você não atende os chamados de <local>.".
- **Ela devolve as contas que recebem o chamado:**
  - ativas e que atendem todos os locais dele (`recusaDeQuemRecebe` nula);
  - fora quem está com ele;
  - pelo nome, como o `contasQueAtendem`;
  - com quantos chamados abertos cada uma tem, que o menu mostra como "2 abertos", contados nos locais que quem pede vê com `chamados.ver`, como a coluna dela no quadro (`quadro/previa.ts`). Assim o número é o mesmo nos dois, e a contagem não mostra chamados de locais que quem pede não vê.
- **Por que não o quadro:** o `GET /chamados/quadro` traz todos os chamados abertos do alcance, para montar as colunas, e o app do chat não carrega o quadro. A regra é a mesma do arraste, pelo domínio.

### 4. A conversa de quem participa pela TI

- **A caixa** manda a mensagem pela rota da TI (`/chamados/:numero/mensagem`), com o texto e os anexos, que já sobem por `/chamados/anexos`. Ela cumpre a primeira resposta, avisa a pessoa e, no aguardando, deixa o chamado esperando, como na matriz.
- **O resolvido:** a mensagem da TI é recusada nele. No lugar da caixa fica "O #1045 está resolvido.", com "Reabrir", pela rota da TI.
- **A leitura**, pelo `pelaTi`:
  - a espera é "Aguardando o colaborador" (`ESPERA_DE_OUTRO`), na situação, no nome da etapa e na frase do evento `aguardando`;
  - a abertura é "Você abriu este chamado para Paulo Nunes", e não "Recebemos o seu chamado": o chamado é de Paulo, e ela o conduz como a TI. O `fraseDoEventoParaQuemParticipa` recebe o `pelaTi` e o nome da pessoa;
  - a resposta nova é zero, na lista, no chamado e no resumo do chat (`chamadosComResposta`, em `rotas/chat.ts`), que dá o número do "Chamados" da trilha e o selo do dock. A `respostaNova` do domínio passa a pedir o `pelaTi`, obrigatório, para o typecheck acusar os três chamadores. Sem isso, a trilha de Ana contaria a mensagem de Diego e nada a tiraria: sem resposta nova, ela não tem o "Marcar como vista", e a mensagem dela pela rota da TI não move a `vista_ate`;
  - as opções das perguntas vêm sem ação;
  - a avaliação não é oferecida, e o "Reabrir até" dá lugar ao "Reabrir" da TI.
- **As notificações:** quem participa pela TI não recebe as de quem participa, a mensagem da TI e o resolvido (`notificacoesParaQuemParticipa`). Ela recebe as da TI, como quem atende: o chamado passado a ela, a triagem e a resposta da pessoa no chamado com ela. A outra saída, a mensagem dela pela rota da TI marcar como lidas as dela, deixaria as notificações chegarem a cada mensagem de outra conta da TI, como se ela fosse quem pediu. A API decide o `pelaTi` de quem abriu pelo `participaPelaTi`, com os acessos dela, e não com os de quem age.
- **As listas** (`secoesDoChat` e `gruposDaVistaChamados`) recebem o `pelaTi` de cada chamado. Nesse chamado, o aguardando não sobe em CHAMADOS e fica em EM ANDAMENTO na vista Chamados. Os testes vêm antes do código, porque é ordenação.
- **As rotas de quem participa** (responder, escolher, reabrir e avaliar) recusam quem participa pela TI, pelo `decidirAcaoDeQuemParticipa`, com os testes antes:
  - "Você atende o chamado #1045. Responda pela TI.", na mensagem, na escolha e no "Reabrir";
  - "Quem atende o chamado #1045 não o avalia.", na avaliação.

  "Marcar como vista" segue valendo: muda só a leitura dela.
- **O chip e "Chamados da equipe"** dizem a espera a quem participa pela TI como a quem não participa (`situacaoNoChat` com `participa && !pelaTi`), e a spec chat, "Chamado citado numa mensagem", passa a dizer isso. O selo de "Aguardando o colaborador" no chat passa da atenção à informação, como no Chamados: a atenção chama a conta a responder, e essa espera é de outra pessoa. A mudança vale também para o chip de quem não participa, que hoje tem a atenção.
- **O lado vale na hora da mensagem:** quem perde `chamados.atender` volta a escrever como quem pediu, e as mensagens de antes ficam como foram gravadas.

### 5. A origem de várias mensagens

- **Uma linha `origem` por mensagem citada,** na ordem da conversa, cada uma com o texto, quem escreveu, a hora e os anexos dela, como a linha de hoje. Os ids `uuidv7()` seguem a ordem da gravação, e a conversa do chamado já se lê pelo id.
- **A migration 0070:**
  - tira o `mensagens_dos_chamados_origem_unica` (uma `origem` por chamado);
  - cria o `mensagens_dos_chamados_origem_da_mensagem`, único em `(org_id, (dados->>'mensagem'))` onde a espécie é `origem`, como o `mensagens_dos_chamados_escolha_unica`. Assim a mensagem vira um chamado só, e o índice serve à busca das marcas;
  - os dados de hoje já cumprem o índice, porque a `origem_mensagem_id` é única.
- **A `origem_mensagem_id`** do chamado segue com a primeira mensagem, para o FK, o CHECK `chamados_origem_coerente` e o "leva à mensagem de origem" do evento.
- **Alternativa descartada:** uma linha `origem` com a lista das mensagens nos dados. Os anexos ficariam num dono só, sem saber de qual mensagem vieram, e a mensagem num chamado só dependeria de uma consulta, sem índice.

### 6. Abrir com várias mensagens

- **A rota nova** é `POST /chat/conversas/:id/chamado`, com as `mensagens` (de 1 a 20 ids) e o tipo, o título, o ativo e a pessoa da abertura de hoje.
- **A rota de hoje,** `POST /chat/mensagens/:id/chamado`, fica como o caso de uma mensagem, pelo mesmo código. Assim, o app do chat da versão anterior aberto num navegador segue abrindo chamados até recarregar.
- **A conferência** (`conferirMensagensATransformar`, no domínio) tira os ids repetidos e recusa:
  - "Escolha as mensagens.", sem nenhuma;
  - "Escolha até 20 mensagens.", com mais de 20.
- **Na transação:**
  - as travas das mensagens (`travar(tx, 'mensagem:<id>')`), na ordem dos ids, para duas aberturas com mensagens em comum não se travarem uma à outra;
  - a leitura delas na conversa do caminho, de que a conta participa. Quando falta uma, a recusa é "A mensagem não foi encontrada.";
  - a mensagem que já virou chamado, pelas linhas `origem`. A recusa é "Esta mensagem já virou o chamado #1045." com uma mensagem e "Uma das mensagens já virou o chamado #1045." com várias. A violação do índice único vira a mesma recusa;
  - o `gravarAbertura` com as mensagens na ordem dos ids, que é a da conversa, cada uma com os anexos;
  - o evento `virou-chamado`, com o número de mensagens nos dados (`mensagens`). O evento de antes, sem ele, conta uma;
  - a auditoria `chamado.aberto`, com quantas mensagens no depois.
- **O teste** da ordem das linhas `origem` vem antes do código, porque é ordenação.

### 7. As marcas e as leituras

- **As marcas** (`marcasDosChamados`) saem das linhas `origem` das mensagens da página, pelo índice novo, com o número do chamado. O evento ganha o número de mensagens (`chamado.mensagens`).
- **A leitura do chat** ganha as `origens`, a lista na ordem, vazia no chamado aberto pela TI. A `origem` fica, como a mensagem de origem, a primeira.
- **A ficha da TI** ganha as `mensagens` na `origemNoChat`: quem escreveu, a hora, o texto e os anexos de cada uma. A conversa, o "Abrir a conversa", que leva à primeira, e os campos de hoje, que são os da primeira, ficam.
- **Por que os campos da primeira ficam:** a aba aberta da versão anterior lê a `origem` e a `origemNoChat.autor`, e sem eles a tela quebraria até recarregar. O contrato só cresce, e a primeira mensagem já é a de origem na spec ("leva à mensagem de origem").
- O contrato se gera de novo, e a web muda na mesma tarefa.

### 8. A seleção na tela

- **A seleção** é um estado da conversa aberta: os ids marcados, na ordem da conversa.
  - "Selecionar" entra no menu da mensagem, ao lado do "Transformar em chamado", só a quem pode abrir pelo chat, e começa com a mensagem do menu marcada. Na que já virou chamado, ela começa sem nenhuma, e a barra diz "Nenhuma mensagem selecionada".
  - Sair da conversa, "Cancelar" e o Esc a desfazem. "Cancelar" e o Esc no diálogo do transformar fecham só ele.
  - A mensagem que chega não a muda. A marcada que vira chamado sai dela: a seleção que vale é a dos ids marcados sem a marca de chamado, cada um pela última leitura da mensagem, relida a cada leitura da conversa, pelo `chat.mudou` e depois da recusa das mensagens. A marcada que sai do trecho carregado, como pelas "mais novas", segue na conta e nas citadas, pela última leitura dela. Assim, a mensagem que Tatiana transforma enquanto Fernanda seleciona não prende a seleção de Fernanda na recusa "Uma das mensagens já virou o chamado #1045.".
- **Cada mensagem** ganha, à esquerda, a caixa de marcar, com o nome de quem escreveu e a hora no rótulo, como "Selecionar a mensagem de Paulo Nunes das 10:19".
  - Escolher qualquer ponto da mensagem a marca ou desmarca, também um link, um anexo ou a miniatura, que não abrem na seleção: no celular, o toque é o único gesto.
  - A barra dela e o menu saem enquanto a seleção vale. As reações ficam à vista, sem ação, para as mensagens não mudarem de altura e a conversa não pular ao entrar na seleção.
- **Ficam sem a caixa** os eventos e o dia. A mensagem que já virou chamado tem a caixa sem ação, com "Já virou o #1045".
- **No limite:** com 20 marcadas, as outras caixas ficam sem ação, e a barra diz "20 mensagens selecionadas, o máximo".
- **A barra** fica no lugar da caixa de escrever:
  - "3 mensagens selecionadas" ("1 mensagem selecionada");
  - "Transformar em chamado", a principal, no azul do chamado, com o Ctrl+Shift+T;
  - "Cancelar".

  A caixa de escrever fica montada e escondida, e não sai: assim, o texto, o "Respondendo a…" e os anexos na fila do `useFilaDeAnexos` voltam como estavam. No canal ou na equipe em que a conta não escreve, a barra fica no lugar do aviso "Só TI escreve neste canal.".
- **No celular:** "Selecionar" fica na folha do toque longo; o toque marca e desmarca; a barra fica embaixo, com os alvos de 44 px.
- **O transformar** recebe a lista, e o formulário de uma mensagem é o caso dela. O diálogo cita as mensagens na ordem, com quem escreveu e a hora. Com mais de 3, a lista rola dentro do diálogo, com o título "3 mensagens" em cima.

### 9. O visual que os mockups não mostram

- **O "Andamento"**, um menu em camada opaca:
  - no computador, o botão "Andamento" no cabeçalho do chamado, antes de "Neste chamado";
  - no celular, o botão de ícone "Andamento do #1045", ao lado do de "Neste chamado", com o submenu embaixo do item, como o kit já faz.
- **Os itens:**
  - na ordem da decisão 2, com os ícones do Chamados onde ele os tem: o `HandGrab` do assumir, o `ArrowLeftRight` do passar, o `CircleCheck` do resolver e o `RotateCcw` do reabrir;
  - nos outros, ícones do kit;
  - "Abrir no Chamados" no fim, separado. No app ele abre o Grafite numa janela nova, como o "Abrir" dos Avisos, e na casca vai ao módulo.
- **O "Passar para…":**
  - o submenu com as contas da decisão 3, cada uma com "2 abertos";
  - "Carregando quem atende…" enquanto lê;
  - "Ninguém mais atende os locais do chamado." sem ninguém, como no Chamados.
- **O retorno:**
  - o aviso de cada ação, com as frases do Chamados: "Você assumiu o #1045." com "Desfazer", "Você passou o #1045 a Bruno." e "Você devolveu o #1045 à triagem.";
  - as novas: "Você pôs o #1045 aguardando Fernanda.", "Você retomou o #1045." e "Você resolveu o #1045.";
  - a recusa vai no aviso crítico, com a frase da API, como no Chamados, porque as ações vão pelo mesmo `useAcoesDoAtendimento`.
- **Os diálogos:**
  - "Aguardar Fernanda no #1045", com "Mensagem para Fernanda" (até 4.000 caracteres), "Cancelar" e "Enviar e aguardar";
  - "Resolver o #1045", com "O que foi feito" (até 2.000), "Cancelar" e "Resolver".

  A recusa do campo fica nele, e toda outra vai no alto do diálogo, que fica aberto com o texto escrito. No resolver, elas são a de versão ("O chamado #1045 mudou. Confira antes de resolver."), porque o `PedidoDoResolver` leva a versão, e a do campo só da TI obrigatório e vazio ("Preencha Contador de páginas antes de resolver.", o conflito do `problemaDaRecusa`), que leva também "Abrir no Chamados", porque o campo se preenche na ficha do chamado. No aguardar, é a da situação, como a do resolvido, porque a mensagem da TI não leva a versão (`PedidoDaMensagemDoChamado`). À pessoa que não usa o chat, o diálogo do aguardar diz a frase do Chamados, como a caixa.
- **A caixa de quem participa pela TI:**
  - diz "Escrever para Fernanda no #1045…", com a dica "# cita um chamado", e, quando Fernanda não usa o chat, "Fernanda ainda não usa o chat: a mensagem fica no chamado." (`ajudaDoCampo` do Chamados);
  - no resolvido, tem o cadeado, "O #1045 está resolvido." e "Reabrir";
  - a mensagem dela aparece como a da própria conta;
  - é a mesma caixa de quem pediu, que troca só o envio e o texto de dentro. O `pelaTi` muda com a aba aberta, quando a conta passa a atender o local: a caixa antiga é recusada com "Responda pela TI", o 409 relê o chamado, e o texto e os anexos na fila ficam para o envio pela TI.
- **A seleção:**
  - a mensagem marcada ganha o fundo de seleção dos tokens;
  - a caixa de marcar é a do kit;
  - o estado vai também em texto, no rótulo e na contagem da barra.
- **O evento de várias mensagens:** "Fernanda Rocha transformou 3 mensagens no chamado #1045 · 10:32". "3 mensagens" leva à primeira delas, como "esta mensagem" leva à dela.
- **As durações** vêm dos tokens de movimento, sem animação nova.

### 10. Os eventos e as telas

- **Nenhum tipo de evento novo:**
  - as ações da TI já mandam o `chamados.mudaram` às contas de quem participa (tarefa 3.12 da `chat-com-chamados`);
  - elas já mandam o `chat.mudou` à conversa de origem quando a situação ou quem atende muda;
  - a abertura com várias mensagens manda os mesmos da abertura de uma.
- **A auditoria** das ações pelo chat é a das ações da TI, com a conta e a origem da requisição.

## Risks / Trade-offs

- **Quem participa pela TI não tem resposta nova** → a mensagem da pessoa chega a quem atende pela notificação "a resposta da pessoa a quem atende", e a conta que não está com o chamado a vê no Chamados. Na triagem, a resposta não notifica ninguém, como para a TI. O "Abrir" dessa notificação leva ao Chamados, e não ao chat onde ela conversa com a pessoa. Contar a mensagem da pessoa como resposta nova da TI pediria uma segunda regra da `vista_ate`.
- **O lado muda com a permissão** → quem ganha ou perde `chamados.atender` passa a escrever do outro lado, e a conversa mostra as duas espécies de mensagem dela. É raro, e cada mensagem guarda o lado com que foi escrita.
- **A seleção vale nas mensagens carregadas** → as de antes vêm ao rolar, por "Mensagens anteriores", e a marca de cada uma fica pelo id. A marcada fora do trecho que vira chamado por outra conta só sai quando a tela a relê: até lá, o transformar recusa com "Uma das mensagens já virou o chamado #1045.", e rolar até ela a tira.
- **Até 100 anexos numa abertura** (20 mensagens com 5 cada) → são linhas novas sobre os mesmos arquivos, sem cópia do arquivo, na mesma transação.
- **O `quem-recebe` lê os acessos da organização** a cada abertura do submenu, como o editor do tipo lê quem atende. O submenu só lê quando abre.
- **A aba aberta da versão anterior** → a caixa dela, de quem passa a participar pela TI, é recusada com "Você atende o chamado #1050. Responda pela TI." até recarregar. As leituras não quebram, porque os campos da primeira mensagem ficam (decisão 7).
## Migration Plan

- **A migration 0070** troca o índice único da linha `origem`: o de uma por chamado sai, e entra o de uma por mensagem. Os dados de hoje cumprem o índice novo.
- **A volta à versão anterior** (o `voltar` do runbook) roda a versão de antes no banco novo:
  - ela grava uma linha `origem` por chamado, e o índice novo a aceita;
  - o chamado de várias mensagens aparece nela só com a última mensagem citada na origem, porque a leitura de antes percorre as linhas `origem` e fica com a última (`ficha.ts` e `chamados-de-quem-participa.ts`);
  - nas conversas, só a primeira mensagem tem a marca, porque ela marca pela `origem_mensagem_id`, e o evento diz "transformou esta mensagem" e leva à primeira, porque ela não lê as `mensagens` da `origemNoChat`. Transformar uma das outras dá erro, pelo índice único, em vez da recusa "Esta mensagem já virou o chamado", e a transação inteira volta, sem gastar o número;
  - a mensagem de quem participa pela TI é uma mensagem da TI comum, e a versão anterior a lê.

  O runbook ganha essas exceções. A volta segue possível, sem restaurar o backup.
- **O contrato só cresce** (as `origens` e as `mensagens` da `origemNoChat`), e a web e a API saem na mesma versão.
