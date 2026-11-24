Vale o modo rápido do `docs/agentes.md` até a `chamados-da-ti` ir para a produção-teste:
- o "Começa pelos testes…" fica só onde a tela não mostra o erro: a ordenação e a permissão;
- o "Verificar" fica com os testes da tarefa, o lint, o typecheck e, na tarefa com tela, a tela no `pnpm dev`, contra a decisão 9 do design, porque não há mockup do andamento nem da seleção. As suítes inteiras rodam no CI do PR rascunho `dev` → `main`, aberto com o primeiro commit de tarefa;
- a revisora lê o diff do commit, depois dele;
- os casos raros vão para `.grafite/revisoes/andamento-e-varias-mensagens-pendencias.md`;
- a tarefa que muda uma tela acerta no mesmo commit a web simulada, as pontas a ponta e as referências da regressão visual que ela muda, para o CI do PR ficar verde a cada commit.

## 1. Banco

- [x] 1.1 A origem de várias mensagens (design, decisão 5):
  - a migration 0070, que tira o `mensagens_dos_chamados_origem_unica` e cria o `mensagens_dos_chamados_origem_da_mensagem`, único em `(org_id, (dados->>'mensagem'))` na espécie `origem`;
  - o `schema.ts`;
  - os testes de que duas linhas `origem` no mesmo chamado entram, de que a mesma mensagem em dois chamados é recusada e de que a gravação da versão anterior, uma linha por chamado, continua aceita.

  Verificar: esses testes, o teste da migration, o lint e o typecheck.

## 2. Domínio

- [x] 2.1 Quem atende pelo chat (decisões 1 e 2): o `participaPelaTi` e as `acoesDoAndamento`, pela `MATRIZ_DAS_ACOES`, com:
  - o assumir fora do chamado que está com a conta;
  - o aguardar só na triagem e em atendimento, e nunca à pessoa;
  - o reabrir só a quem participa pela TI;
  - nada no fechado.

  Começa pelos testes unitários. Verificar: esses testes, o lint e o typecheck.
- [x] 2.2 As palavras e as listas de quem participa pela TI (decisão 4):
  - a espera "Aguardando o colaborador" na situação, no nome da etapa e na frase do `aguardando`;
  - a abertura "Você abriu este chamado para Paulo Nunes", no `fraseDoEventoParaQuemParticipa`;
  - o `secoesDoChat` e o `gruposDaVistaChamados` com o `pelaTi`: o aguardando não sobe e fica em EM ANDAMENTO;
  - a resposta nova zero, com o `pelaTi` obrigatório na `respostaNova`, para o typecheck acusar os três chamadores da API. Eles passam o `false` de hoje neste commit, e a 3.1 dá o valor.

  Começa pelos testes unitários das ordens. Verificar: esses testes, o lint e o typecheck.
- [x] 2.3 As recusas a quem participa pela TI (decisão 4), no `decidirAcaoDeQuemParticipa`:
  - a mensagem, a escolha e o "Reabrir", com "Você atende o chamado #1045. Responda pela TI.";
  - a avaliação, com "Quem atende o chamado #1045 não o avalia.";
  - o "Marcar como vista", que segue valendo.

  Começa pelos testes unitários. Verificar: esses testes, o lint e o typecheck.

## 3. API

- [x] 3.1 A leitura do chamado do chat (decisões 2 e 4):
  - o `andamento`, com a versão, as ações e a pessoa, com o nome e se ela usa o chat, a quem atende pelo chat;
  - o `pelaTi`, também nos itens da lista, e obrigatório no `ChamadoNaLista` do domínio, para o typecheck acusar o item que a API monta à mão para o `secoesDoChat`;
  - a espera, a abertura, a resposta nova, a avaliação e as opções de quem participa pela TI, também na lista, no chip e em "Chamados da equipe": os `false` e o `null` que a 2.2 deixou na API e o `participa` do `situacaoNoChat`, que passa a `participa && !pelaTi`;
  - a resposta nova no resumo do chat (`chamadosComResposta`, o "Chamados" da trilha e o selo do dock).

  Começa pelos testes de integração:
  - de quem recebe o `andamento`: quem participa e atende, quem só participa, a pessoa que atende e quem atende sem participar, que não lê o chamado pelo chat;
  - do lado de Ana, que abriu o #1050 no nome de Paulo e o atende, em cada leitura, porque os `false` e o `null` de hoje passam no typecheck: a lista (a situação em texto, a ordem dos abertos e a resposta nova 0), a leitura do chamado (a situação, a abertura, o evento do aguardar, a resposta nova 0 e o `desde` nulo), o chip da citação e "Chamados da equipe";
  - do resumo: Diego escreve a Paulo no #1050, que Ana abriu no nome dele e atende, e o resumo de Ana dá 0, e o de Paulo, 1.

  Verificar: esses testes, o `contrato:verificar`, o lint e o typecheck.
- [ ] 3.2 Quem recebe o chamado (decisão 3): `GET /chamados/:numero/quem-recebe`.
  - A rota pede `chamados.atender`. O chamado que a conta não vê responde como inexistente, e quem não atende os locais é recusado.
  - Ela devolve as contas ativas que atendem todos os locais, fora quem está com o chamado, pelo nome, com os abertos contados nos locais que quem pede vê com `chamados.ver`, como no quadro.

  Começa pelos testes de integração da permissão e de quem entra na lista. Verificar: esses testes, o `contrato:verificar`, o lint e o typecheck.
- [ ] 3.3 Quem participa pela TI não age nem é avisada como quem pediu (decisão 4):
  - as rotas de quem participa recusam responder, escolher, reabrir e avaliar, com o `pelaTi` lido com o chamado travado;
  - o "Marcar como vista" segue;
  - as notificações de quem participa (a mensagem da TI e o resolvido) não vão a ela, pelo `pelaTi` de quem abriu, com os acessos dela.

  Começa pelos testes de integração das recusas e das notificações: Diego escreve a Paulo e resolve o #1050, e Paulo recebe as duas, e Ana, nenhuma. Verificar: esses testes, o lint e o typecheck.
- [ ] 3.4 Abrir com várias mensagens (decisão 6):
  - o `conferirMensagensATransformar` no domínio, com os testes unitários;
  - `POST /chat/conversas/:id/chamado`, com:
    - as travas na ordem dos ids;
    - as mensagens da conversa;
    - as recusas, com a violação do índice como a recusa;
    - as linhas `origem` na ordem da conversa, com os anexos de cada uma;
    - o evento com o número de mensagens;
    - a auditoria;
  - a rota de uma mensagem pelo mesmo código.

  Começa pelo teste de integração da ordem das linhas `origem`. Verificar: esses testes, os da abertura de uma mensagem, o `contrato:verificar`, o lint e o typecheck.
- [ ] 3.5 As origens nas leituras (decisão 7):
  - as `origens` na leitura do chat, com a `origem` de hoje, que fica como a primeira;
  - as `mensagens` na `origemNoChat` da ficha, com os campos de hoje, que ficam como os da primeira;
  - as marcas de cada mensagem pelas linhas `origem`;
  - o número de mensagens no evento. O evento de antes conta uma.

  A web mostra todas as mensagens citadas no mesmo commit, na abertura do chamado no chat e na origem do chamado aberto do Chamados, cada uma com quem a escreveu, a hora, o texto e os anexos. O "Abrir a conversa" leva à primeira.

  Verificar: os testes de integração das leituras e das marcas, o `contrato:verificar`, o lint, o typecheck e a tela no `pnpm dev`.

## 4. Web

- [ ] 4.1 O menu "Andamento" (decisões 2 e 9; spec modulo-chat, "Andamento do chamado no chat"):
  - o botão no cabeçalho do computador e o de ícone no do celular;
  - "Assumir", com o "Desfazer";
  - "Passar para…", pelo `quem-recebe`;
  - "Devolver à triagem", "Retomar" e "Abrir no Chamados";
  - os avisos e as recusas, no aviso crítico, como no Chamados;
  - o `aoMudar` do `useAcoesDoAtendimento`, que relê o chamado do chat e as listas depois de cada ação, aceita ou recusada, e do "Desfazer".

  Verificar: o lint, o typecheck e a tela no `pnpm dev`, no computador e a 390 px.
- [ ] 4.2 Os diálogos do aguardar e do resolver e o reabrir:
  - "Aguardar Fernanda no #1045", com "Mensagem para Fernanda" e, à pessoa que não usa o chat, "Fernanda ainda não usa o chat: a mensagem fica no chamado.";
  - "Resolver o #1045", com "O que foi feito";
  - nos dois, a recusa do campo nele e toda outra no alto, com o diálogo aberto e o texto escrito: no resolver, a de versão e a do campo só da TI vazio, com "Abrir no Chamados"; no aguardar, que não leva a versão, a da situação;
  - o "Reabrir" no menu.

  Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [ ] 4.3 O chamado de quem participa pela TI (decisão 4; spec modulo-chat, "Chamado no chat"):
  - a caixa com "Escrever para Fernanda no #1045…", pela rota da TI, com os anexos e, à pessoa que não usa o chat, a frase do Chamados. É a mesma caixa de quem pediu, montada nos dois lados, que troca só o envio e o texto de dentro: a recusa "Responda pela TI" relê o chamado com o `pelaTi`, e o texto e os anexos na fila ficam;
  - no resolvido, o cadeado, "O #1045 está resolvido." e "Reabrir";
  - a espera "Aguardando o colaborador" nas etapas, pelo `nomeDaEtapa`, que também dá a marca da etapa de agora, e o selo dela na informação, também no chip de quem não participa (spec modulo-chat, "Selos e movimento do chat");
  - as opções sem ação;
  - sem a avaliação e sem a resposta nova;
  - as listas.

  Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [ ] 4.4 Selecionar as mensagens no computador (decisão 8; spec modulo-chat, "Mensagens selecionadas"):
  - "Selecionar" no menu, que começa sem nenhuma na mensagem que já virou chamado;
  - as caixas de marcar e o fundo da marcada, com o clique em qualquer ponto, também no link e no anexo, que marca sem abrir;
  - as reações à vista, sem ação;
  - a mensagem que já virou chamado, sem ação, e a marcada que vira chamado, que sai da seleção;
  - a barra no lugar da caixa, também no lugar do "Só TI escreve neste canal.", e o máximo de 20;
  - o Esc e o Ctrl+Shift+T;
  - a caixa montada e escondida, que volta com o texto, o "Respondendo a…" e os anexos na fila.

  Verificar: o lint, o typecheck e a tela no `pnpm dev`.
- [ ] 4.5 Selecionar no celular:
  - "Selecionar" na folha do toque longo;
  - o toque que marca e desmarca, também no link e no anexo, sem a folha na seleção;
  - a barra embaixo, com os alvos de 44 px.

  Verificar: o lint, o typecheck e a tela no `pnpm dev` a 390 px.
- [ ] 4.6 O transformar com várias mensagens (spec modulo-chat, "Transformar em chamado na tela"):
  - o diálogo com as mensagens citadas, na ordem, com o título "3 mensagens" e a lista que rola;
  - "Cancelar" e o Esc, que fecham só o diálogo, com a seleção como estava;
  - a rota nova, com a recusa das mensagens no alto do diálogo, que tira das citadas e da seleção a que já virou chamado;
  - o evento "transformou 3 mensagens", que leva à primeira;
  - as marcas.

  Verificar: o lint, o typecheck e a tela no `pnpm dev`, no computador e a 390 px.

## 5. Fechamento

- [ ] 5.1 A documentação:
  - a linha do S7 na spec mestre;
  - o runbook, com as exceções da volta à versão anterior (design, "Migration Plan");
  - o `docs/mapa.md`.

  Verificar: o teste do mapa e o lint.
- [ ] 5.2 O ponta a ponta da pilha (`e2e-pilha/caminho.spec.ts`): uma conta da TI marca duas mensagens de uma equipe e as transforma num chamado no nome de outra pessoa. Ela assume pelo "Andamento" e responde no chat, e a resposta chega à pessoa como a da TI, no outro navegador. Verificar: `pnpm test:e2e:pilha`.
- [ ] 5.3 O ponta a ponta da web e o visual que faltarem:
  - na web simulada, o menu "Andamento", a seleção, também no canal em que a conta não escreve, e o transformar com várias mensagens;
  - as referências da regressão visual que as tarefas não gravaram.

  Verificar: `pnpm test:e2e` e `pnpm test:visual`.
