## Why

A TI recebe os pedidos pelo telefone, pelo corredor e pelo e-mail, e não tem um lugar que diga quem está com o quê, o que vai vencer e o que falta perguntar a quem pediu. O usuário pediu um sistema de chamados completo (item 9 do `prompt-opus.md`), que não seja um sistema à parte: um módulo do Grafite, ligado aos ativos, às ordens de serviço e às solicitações, e a primeira tela ao entrar, porque o sistema é da TI.

A ideia 16 da rodada 3 desenha o lado da TI: os mockups `r3-16-chamados-ti`, m01 a m12, todos aprovados em 14/11/2026.
- **Quem está com o quê:** os chamados em quadrados, em colunas por pessoa.
- **O chamado aberto:** a conversa sem balão, a nota interna e o prazo à direita.
- **Os prazos:** em barras.
- **Os tipos e o formulário:** o prazo escrito como frase, a condição escrita como frase e a prévia do colaborador ao lado.
- **A primeira tela:** a tela que abre ao entrar.

A change cria o subprojeto **S7 · Chamados** da spec mestre, aprovado pelo usuário em 14/11/2026. Ela é a primeira das duas changes do S7 (a `chat-com-chamados`, ideia 17, vem em seguida) e a terceira das 24 da rodada 3. O **S8 · Aba dos colaboradores** (ideias 18 a 21) se apoia nela.

## What Changes

- **O módulo Chamados:**
  - opcional na organização;
  - primeiro no dock, com a boia;
  - a primeira tela ao entrar para quem vê os chamados. O Início continua no dock e no endereço dele.
- **O Início dos chamados** (m12):
  - "Bom dia, Ana" com a contagem (na triagem, passados do prazo, abertos e resolvidos hoje);
  - as colunas por pessoa, à esquerda;
  - à direita, a triagem, com "Assumir" e "Passar para…", e os prazos, compactos.
- **Quem está com o quê** (m01 e m02):
  - a coluna "Sem responsável" e uma coluna por pessoa da TI, com a carga em pedaços e o "Resolveu hoje" no pé;
  - cada chamado num quadrado de uma linha só de título;
  - a prévia ao parar o mouse, com "Assumir" e "Passar para…" com a carga de cada pessoa;
  - arrastar o quadrado para outra coluna passa o chamado.
- **O chamado aberto** (m03 e m04):
  - **o cabeçalho:** a situação, o tipo, quem pediu e quem atende, Transferir, Virar OS, Resolver e Responder, e o quadro do prazo;
  - **a conversa:** sem balão, com a nota interna que só a TI vê e os eventos;
  - **o campo de escrever:** "Mensagem para a pessoa | Nota interna" e as respostas prontas;
  - **a coluna da direita, que recolhe:** a pessoa, o ativo ligado (com os alertas e o toner), a linha do tempo e os campos do tipo;
  - "Você assumiu o #1042" com Desfazer.
- **Os prazos** (m05 e m06):
  - os grupos Estourado, Vence em até 2 horas, Vence hoje e Relógio parado, com as barras até o prazo e a linha do agora;
  - o chamado escolhido abre ao lado, com "Passar para…", a mensagem pronta para quem pediu e "Abrir o chamado".
- **O prazo:**
  - a resposta e a resolução de cada tipo, contadas em horas corridas ou no horário da TI, com o dia útil;
  - o relógio para enquanto o chamado aguarda o colaborador;
  - o aviso a quem atende quando o prazo passa.
- **Abrir um chamado:** a TI abre o chamado em nome da pessoa, com o tipo e o formulário do tipo, o mesmo que o colaborador vai preencher na aba.
- **Os tipos de chamado** (m07 e m08):
  - a tabela, com a ordem por arraste, e o editor com quatro seções:
    - a identificação, com o nome, o ícone e a frase para o colaborador;
    - o prazo e o atendimento, com o prazo como frase, quem atende por padrão e o que fazer sem ninguém;
    - o que acontece depois: pode virar OS, gera uma solicitação e pede o ativo;
    - quem vê: aparece para o colaborador e só a TI abre;
  - a prévia da grade da aba;
  - Duplicar, com o rascunho numa gaveta;
  - os 9 tipos de fábrica.
- **O formulário de cada tipo** (m09 a m11):
  - os 11 tipos de campo;
  - os campos em ordem por arraste, com Obrigatório, Só a TI vê e as opções;
  - a condição escrita como frase, com "e quando…" e "ou quando…" e "Apagar a resposta se o campo sumir";
  - o título do chamado montado das respostas;
  - a prévia do colaborador ao lado e em tamanho real, com "Ver como" e "O que chegaria para a TI".
- **As respostas prontas**, com as que pedem algo à pessoa e param o relógio, e **o horário da TI**, com a carga cheia de cada pessoa.
- **A OS e a solicitação pelo chamado:**
  - "Virar OS" abre a OS do ativo ligado;
  - "Pedir toner" se junta à solicitação de toner pendente da impressora ou abre uma;
  - o tipo que gera uma solicitação a abre na criação do chamado.
- **Os eventos, as notificações e a auditoria dos chamados**, e as permissões `chamados.ver`, `chamados.atender` e `chamados.configurar`.

Fica fora:
- **o lado do colaborador:** o chat (`chat-com-chamados`, ideia 17), a aba (S8, ideias 18 a 21) e o portal (A1).
  - Até lá, a conversa fica no chamado, e a mensagem da TI chega ao colaborador quando o chat e a aba existirem.
  - O usuário pediu tudo o que envolve o chamado nas seis changes, sem atalho provisório (15/11/2026).
- **o fim do chamado do chat:** a avaliação e o resumo dos tempos (17, m07);
- **os feriados:** o dia útil é um dia da semana do horário da TI;
- **a busca no texto das mensagens:** a busca acha o chamado pelo número e pelo título.

## Capabilities

### New Capabilities

- `chamados`:
  - o chamado: a abertura pela TI em nome da pessoa, o número, os locais e quem vê e atende;
  - a situação, a triagem e quem atende;
  - a conversa, com as mensagens, as notas internas e os eventos;
  - o prazo, com o horário da TI;
  - as ações (assumir, desfazer, passar, devolver, responder, esperar, retomar, resolver e reabrir), os campos só da TI e o ativo ligado;
  - as respostas prontas, o horário da TI e a carga de cada pessoa;
  - as notificações, as permissões (`chamados.ver`, `chamados.atender` e `chamados.configurar`), a auditoria e os eventos, no requisito próprio, como nas salas e no software.
- `tipos-de-chamado`: os tipos, com a identificação, o prazo e o atendimento, o que acontece depois, quem vê, a ordem, o rascunho, o duplicar e os 9 de fábrica; o formulário de cada tipo, com os campos, as condições e o título montado das respostas.
- `modulo-chamados`: o módulo na casca:
  - o dock e a primeira tela ao entrar;
  - as telas: o Início dos chamados, quem está com o quê, os prazos, o chamado aberto, abrir um chamado, os tipos, o formulário com a prévia, as respostas prontas e o horário da TI;
  - a busca, a tela sem permissão e as telas atualizadas pelos eventos.

### Modified Capabilities

- `modulos-da-organizacao`: o Chamados entra nos módulos opcionais.
- `ordens-de-servico`: a OS aberta pelo chamado, ligada a ele.
- `solicitacoes`: a solicitação aberta pelo chamado ("Pedir toner" e o tipo que gera uma solicitação), ligada a ele.
- `arquivos-e-imagens`: os anexos dos chamados, enviados antes da gravação e entregues pelo chamado dono.
- `eventos-em-tempo-real`: os dois tipos de evento dos chamados na tabela dos tipos, o dos ajustes com o público de uma das permissões.
- `design-tokens`: as cores da aba, na matiz da informação, e a cápsula da aba, a exceção nomeada ao raio.
- `componentes-base`: o cabeçalho da página ganha a trilha, em cima, e o quadro, à direita do título e das ações, como o do prazo do chamado aberto; com o quadro, as ações vão embaixo do título e a principal fecha o grupo.

## Impact

- **Banco** (`packages/db`):
  - as tabelas `tipos_de_chamado`, `chamados`, `mensagens_dos_chamados`, `anexos_dos_chamados`, `numeracao_dos_chamados`, `respostas_prontas` e `horario_da_ti`, com `orgScoped()` e RLS;
  - os 9 tipos de fábrica na organização nova e nas que já existem;
  - a ligação à OS e à solicitação, no próprio chamado (`os_id` e `solicitacao_id`), sem coluna nova nelas.
- **Domínio** (`packages/domain`):
  - o prazo: contar, parar, vencer, as unidades e o horário da TI no fuso dele;
  - o formulário: a conferência, as condições e o título;
  - a situação e as ações, a carga, os grupos dos prazos e a saudação.
- **API e contrato:**
  - as rotas dos tipos, do formulário, das respostas prontas, do horário da TI e do chamado (abrir, o quadro, os prazos, a ficha e as ações);
  - a tarefa periódica do prazo;
  - os eventos, as notificações e a auditoria.
- **Web:**
  - o módulo Chamados, com as telas da ideia 16, e a prévia do colaborador no visual da aba;
  - o dock;
  - a primeira tela ao entrar.
- **Documentação:**
  - a linha do S7 na spec mestre;
  - o contrato de módulo, se mudar;
  - o runbook, com o horário da TI;
  - o `docs/mapa.md`.
- **Testes de ponta a ponta:** a pilha (`e2e-pilha/caminho.spec.ts`) conta os tipos de fábrica na auditoria do `organizacao criar` e abre, assume e resolve um chamado.
