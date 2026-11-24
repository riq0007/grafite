## Why

O colaborador hoje só fala com a TI se abrir o navegador, entrar no Grafite e achar o chat. O usuário pediu uma aba sempre à mão no computador de cada colaborador (ideia 18 da rodada 3). Ela fica presa ao alto da tela, mostra que a TI respondeu e tem o chat dentro dela. Os 12 mockups `r3-18-aba-flutuante` foram aprovados em 14/11/2026:
- o entalhe e a pílula;
- a notificação e o roteiro do movimento;
- os três temas do Windows e o teclado;
- o "sem conexão" e a apresentação;
- o logo e o notebook de 1366.

A change é a primeira do subprojeto **S8 · Aba dos colaboradores** da spec mestre, e a quinta das 24 da rodada 3. É o app nativo que a seção 2.4 deixava fora, e a única exceção a ela: a PWA não fica sempre à vista nem sabe quem está no Windows. A aba é um programa do Windows feito em Tauri 2, instalado pelo MSI que o Intune distribui.

## What Changes

- **O app `apps/aba`:**
  - Tauri 2, com o lado nativo em Rust e a tela em React e nos tokens do `packages/ui`;
  - o serviço da aba, que roda como o sistema;
  - só Windows 10 e 11 de 64 bits, com o WebView2;
  - o MSI por máquina, que o Intune instala com o endereço do servidor, a chave da organização e a entrada sugerida;
  - abre com o Windows, numa instância só e sem ícone na barra de tarefas.
- **Quem está na aba,** com a entrada escolhida por computador:
  - **pelo Windows:** a aba entra sozinha com o usuário do Windows, que o Grafite procura no AD pelo SID, sem senha;
  - **pela senha do AD:** para os computadores da produção de perfil genérico, que várias pessoas usam com o mesmo usuário do Windows. A aba pede o usuário e a senha, tem o "Sair" e esquece a pessoa ao sair.

  Nos dois casos:
  - o aparelho se registra no servidor pela chave da organização;
  - a conta é a do diretório, criada ou atualizada como na entrada pelo diretório;
  - a sessão da aba aparece nas sessões do usuário como "Aba · PC-FIN-09".
- **A aba fechada** (m01 a m04, m07 e m12):
  - a pílula de fábrica (162×34) ou o entalhe (184×32), no alto e no meio da tela principal, sem o logo;
  - os estados repouso, mouse em cima, pressionada e foco;
  - fora da forma, o clique passa para a janela de baixo;
  - os temas escuro, claro e de alto contraste do Windows;
  - no notebook de 1366, a pílula de 160×32.
- **A aba aberta** (m01, m02 e m12): o painel 2+1, com o logo do Grafite e três opções:
  - "Abrir chamado", larga e clara;
  - "Abrir chat", com as não lidas;
  - "Visualizar chamados", com as respostas novas.
- **O chat dentro da aba:** "Abrir chat" abre o chat do Grafite na tela maior da aba, sem o navegador e sem pedir a senha. Ele é o mesmo app do chat, numa sessão que só vale no chat.
- **A notificação** (m02, m04 e m06):
  - a resposta da TI alarga a aba com "1 resposta nova · Ana Souza", com o ponto ao lado;
  - aberta, a linha da resposta fica no alto do painel e abre o chamado no chat da aba;
  - abrir a conversa do chamado, na aba, na web ou no celular, tira o aviso. O servidor passa a guardar esse "viu";
  - o "1 nova" fica até a pessoa responder ou marcar como vista.
- **O movimento** (m05 e m06):
  - abrir leva 220 ms, mais a cascata até 340 ms, que é a exceção nomeada da aba;
  - fechar leva 160 ms;
  - com o reduzir movimento do Windows, 1 ms.
- **O teclado** (m08): Ctrl+Alt+T abre o painel com o foco em "Abrir chamado"; as setas andam pela grade, o Enter escolhe e o Esc volta e devolve o foco.
- **Sem conexão** (m09): a aba em cinza neutro com "Sem conexão" escrito e, aberta, o motivo e o ramal da TI, como "Ramal 2000, das 8h às 18h".
- **Durante uma apresentação** (m10): com um programa em tela cheia, a aba encolhe para a linha de 96×4. Depois, ela diz "1 resposta nova · chegou às 09:21" por 1 minuto.
- **A tela maior:** "Abrir chamado" e "Visualizar chamados" abrem a moldura com a trilha e o "Esc volta". O conteúdo chega nas changes 5 e 6, e até lá a moldura leva ao chat.
- **No servidor:**
  - o comando `grafite aba`: a chave, a forma, o contato, a entrada de cada computador, a lista dos aparelhos e o bloqueio;
  - a auditoria e os eventos da aba.
- **No desenvolvimento:** o `pnpm dev` liga um diretório simulado com o usuário do Windows de quem desenvolve, para a aba entrar.
- **O pacote:** o CI monta o MSI no executor `windows-2022` e o guarda como artefato.

Fica fora:
- **a abertura do chamado pela aba,** com a grade dos tipos, o formulário e o chamado escrito sem rede: vem na `abrir-chamado-pela-aba`;
- **a lista dos chamados pela aba:** vem na `chamados-pela-aba`;
- **as telas da aba para quem administra:** a chave, os aparelhos, o logo da empresa (m11) e a publicação em etapas. Vêm na `configuracoes-da-aba`. Até lá, o comando no servidor faz o resto, e o logo é o do Grafite;
- **o MSI na release:** entra quando a `chamados-pela-aba` fechar;
- **o macOS e o Linux;**
- **a atualização automática da aba:** o Intune instala a versão nova;
- **o proxy por PAC e o proxy com autenticação integrada.**

## Capabilities

### New Capabilities

- `aba-dos-colaboradores`, a aba no Windows e o lado dela no servidor:
  - o app, o serviço e o MSI, com a pré-configuração;
  - o aparelho registrado pela chave;
  - as duas entradas, a sessão da aba e o teto do aparelho;
  - o chat dentro da aba, pelo bilhete;
  - as formas, os estados, os temas, o movimento e o teclado;
  - a notificação, o "sem conexão" e a apresentação;
  - a tela maior;
  - o estado e a configuração;
  - o comando, a auditoria e os eventos.

### Modified Capabilities

- `plataforma-base`:
  - a estrutura do repositório, com as aplicações que já existem (operação e painel) e a aba;
  - o diretório de desenvolvimento no `pnpm dev`;
  - o MSI montado no CI.
- `entrada-e-sessoes`: as sessões da aba e as do chat na aba na lista das sessões do usuário e nos encerramentos pelas mudanças da conta.
- `chamados`: a resposta por ver, que abrir a conversa do chamado tira, ao lado da resposta nova.
- `modulo-chat`: o chat grava a abertura da conversa do chamado, e sabe quando está dentro da aba.

## Impact

- **Banco** (`packages/db`):
  - as tabelas da aba, com `orgScoped()` e RLS: a chave, a configuração, os aparelhos, as sessões e os bilhetes;
  - o `aberta_ate` nas `leituras_dos_chamados`;
  - o alcance nas `sessoes`.
- **Domínio** (`packages/domain`):
  - o estado que a aba mostra: a forma, o aviso, as não lidas e as respostas;
  - as respostas por ver;
  - o público dos eventos com as sessões da aba e o aparelho.
- **API e contrato:**
  - as rotas da aba, com o token do aparelho e o da sessão no lugar do cookie: o registro, a configuração, a sessão, o estado, os eventos e o bilhete;
  - a troca do bilhete pela sessão do chat na aba, com o alcance só nas rotas do chat;
  - a busca no AD pelo SID;
  - a abertura do chamado pelo chat;
  - o comando `grafite aba`;
  - o diretório de desenvolvimento.
- **Web:**
  - o chat na aba, com a entrada pelo bilhete e sem o que leva à casca;
  - a abertura do chamado gravada pelo chat.
- **Aba** (`apps/aba`, nova):
  - **o serviço:** o token do aparelho, o pipe que diz quem chama, a entrada pela senha e a renovação;
  - **o lado nativo:** a janela transparente, o clique que passa, a posição, o foco, a apresentação, o atalho, o tema, o webview do chat e a rede com o TLS do sistema;
  - **a tela** em React.
- **Kit** (`packages/ui`): os tokens da aba (o fio claro, o neutro e o âmbar fixo), as durações da aba e o contraste nos três temas do Windows.
- **CI:** o job da aba no `windows-2022`, com o Rust, os testes do lado nativo e o MSI como artefato.
- **Documentação:**
  - a linha do S8 e a exceção da seção 2.4 na spec mestre;
  - a exceção dos 340 ms no `docs/ANTISLOP.md`;
  - o runbook: o MSI pelo Intune, as propriedades, a entrada por computador, o comando `grafite aba`, a troca da chave e o que fazer depois de restaurar um backup;
  - o `docs/mapa.md` e o `CLAUDE.md`.
- **Testes:**
  - a integração das rotas da aba com o PostgreSQL e o AD falso;
  - o e2e da tela da aba, com o lado nativo simulado, e o do chat na aba;
  - a pilha, com o bilhete que abre o chat da aba já com a sessão.
