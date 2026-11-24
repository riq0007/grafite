## Context

A aba é a primeira peça do Grafite que roda no computador do colaborador, fora do navegador. Ela vale para as ~500 pessoas da empresa, no Windows gerido pelo Intune, com o AD e uma autoridade de certificados interna. As decisões do usuário, de 24/11/2026:
- **As duas entradas, escolhidas por computador:**
  - pelo Windows, sem login, para o computador de uma pessoa. O risco aceito é que quem administra o computador pode se passar por outra pessoa;
  - pela senha do AD, para os computadores da produção de perfil genérico, que várias pessoas usam com o mesmo usuário do Windows.
- **O chat dentro da aba,** nesta change, sem abrir o navegador.
- **O "viu" da resposta guardado no servidor:** ver no celular tira o aviso da aba.
- **As ferramentas:** o Rust e o Build Tools com o C++ instalados neste computador. O CI monta no `windows-2022`.

O que já existe e a aba aproveita:
- **O escopo do coletor** (`apps/api/src/coleta/escopo.ts`): a organização vem do endereço pedido, e o coletor vem do `Authorization: Bearer`, procurado pelo hash (`hashDoToken`), sem cookie e sem a proteção contra outros sites.
- **A entrada pelo diretório** (`apps/api/src/diretorio/entrada.ts`):
  - `conferirNoDiretorio`, com a conta local barrada na linha 77;
  - `contaPeloDiretorio`, que acha a conta pelo usuário sem olhar a origem.
- **O AD falso dos testes**, injetado pelo `conectarDiretorio`.
- **As sessões** (`acesso/sessoes.ts`, `acesso/encerramento.ts`) e os eventos por SSE (`rotas/eventos.ts`), hoje só com o cookie.
- **O app do chat** em `/chat` (`apps/web/src/chat`), a resposta nova (`leituras_dos_chamados`, com o `vista_ate`) e o resumo do chat que o selo do dock lê.

## Goals / Non-Goals

**Goals:**
- a aba dos 12 mockups da ideia 18, fechada, aberta e nos estados, com o aviso das respostas;
- o chat do Grafite na tela maior da aba;
- a pessoa achada pelo Windows ou pela senha do AD, com o risco do Windows limitado a quem administra o computador;
- o MSI que o Intune instala com três propriedades;
- a configuração, a entrada e a chave pelo comando no servidor.

**Non-Goals:**
- abrir e listar chamados pela aba (changes 5 e 6);
- as telas de quem administra a aba, e o logo da empresa (change 7). Aqui o logo é o do Grafite;
- a atualização automática da aba, o macOS e o Linux;
- o MSI na release, que entra só na change 6;
- o PAC e o proxy com autenticação integrada.

## Decisions

### 1. Tauri 2, com o serviço da aba à parte

A aba é um app Tauri 2 (`apps/aba`). A tela fica em `apps/aba/src` (React + Vite, com os tokens do `packages/ui`) e o lado nativo em `apps/aba/src-tauri`. O mesmo workspace Cargo tem um segundo binário, `grafite-aba-servico`, um serviço do Windows que roda como o sistema.

O serviço segura o risco no nível que o usuário aceitou:
- **O token do aparelho** fica em `%ProgramData%\Grafite\Aba\aparelho`, com a permissão só do sistema e dos administradores, cifrado pelo DPAPI da máquina. O programa da aba, que roda como a pessoa, não o lê.
- **A aba fala com o serviço por um named pipe local,** `\\.\pipe\grafite-aba`. O serviço sabe quem chama pelo próprio Windows: `ImpersonateNamedPipeClient` mais o token da thread dão o SID e o nome. Ele não aceita o que a tela diz.
- **O pipe:**
  - é criado com `FILE_FLAG_FIRST_PIPE_INSTANCE`, para outro processo não o criar antes, com `PIPE_REJECT_REMOTE_CLIENTS` e com a DACL explícita: o sistema com tudo, e os usuários interativos só ler e escrever;
  - a aba abre o pipe com `SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION` e confere, por `GetNamedPipeServerProcessId`, que do outro lado está o processo do serviço `GrafiteAba`, rodando como o sistema. Um pipe falso de outro usuário é recusado.
- **No RDP e com duas pessoas no mesmo computador,** cada sessão do Windows roda a sua aba. O serviço atende as duas, cada uma pelo SID dela, e o token da sessão de cada pessoa só volta a quem pediu.

Com isso, se passar por outra pessoa pede trocar o serviço ou ler o arquivo, e os dois pedem o administrador do computador.

O token da sessão da aba, por pessoa, fica com a aba, cifrado pelo DPAPI da pessoa (`CurrentUser`). Outra pessoa do mesmo computador não o abre.

### 2. As duas entradas

A entrada é do aparelho, guardada no servidor: `windows` ou `senha`. O MSI só a sugere no primeiro registro (`GRAFITE_ENTRADA`), e depois quem decide é o comando `aba entrada`. O administrador do computador não a troca pelo computador.

- **Pelo Windows:** o serviço manda o SID de quem chama pelo pipe (decisão 4).
- **Pela senha:**
  - a tela da aba pede o usuário e a senha. O pedido vai pelo pipe ao serviço, e dele à API, com o token do aparelho;
  - a API confere pela mesma função da entrada (`rotas/sessao.ts`), extraída para ser chamada dos dois lugares, e não por uma cópia: o `conferirNoDiretorio`, o bloqueio por tentativas e a pendência dos dois passos;
  - **o código:** a primeira chamada pode responder `falta-o-codigo`, com uma sessão pendente da aba, de 5 minutos. A segunda leva o código e o id da pendente, e as tentativas do código contam como na entrada. A conta que exige os dois passos sem os ter cadastrado é recusada com a frase da spec;
  - **o fim:** a sessão termina no servidor (`DELETE /api/aba/sessao`) com o "Sair", com o fim da sessão do Windows ou a tela bloqueada (`WTSRegisterSessionNotification`: `WTS_SESSION_LOCK` e `WTS_SESSION_LOGOFF`) e com 30 minutos sem uso. O servidor conta os 30 minutos pelo último uso, e assim o computador desligado também tem a sessão vencida. O uso é a aba ou a tela maior com o foco, que o lado nativo informa ao servidor no máximo uma vez por minuto;
  - **o que fica no computador:** o token da sessão fica só na memória. A aba limpa os dados do chat (`clear_all_browsing_data` do WebView2) ao terminar e também ao abrir, para o caso de o processo ter morrido;
  - **a renovação** vai pelo token da sessão, sem a senha, e a API confere a pessoa no AD pela conta de serviço.

O aparelho com a entrada pela senha recusa o pedido pelo SID, e o com a entrada pelo Windows recusa o pedido pela senha. Sem isso, quem administra o computador genérico pediria a sessão de qualquer pessoa pelo SID.

### 3. Os tokens e as rotas da aba

As rotas, todas no OpenAPI, com o `/api` de fora. O cliente em Rust é escrito à mão, e um teste do job do CI confere os exemplos dele contra o OpenAPI gerado.
1. **`POST /api/aba/aparelho`**, do serviço, com a chave: registra ou re-registra, e devolve o token do aparelho e a entrada. Recusa o aparelho bloqueado.
2. **`GET /api/aba/configuracao`**, do serviço, com o token do aparelho: a forma, o contato, a entrada e a versão.
3. **`POST /api/aba/sessao`**, do serviço, com o token do aparelho e o SID, ou o usuário e a senha, ou o código e a pendente: devolve o token da sessão da aba, de 1 h.
4. **As rotas da sessão,** da aba, com o token da sessão:
   - `POST /api/aba/sessao/renovar`, que estende a mesma sessão;
   - `DELETE /api/aba/sessao`;
   - `GET /api/aba/estado`;
   - `GET /api/aba/eventos`, o SSE;
   - `POST /api/aba/uso`;
   - `POST /api/aba/bilhete`.
5. **`POST /api/sessao/bilhete`**, do chat da aba, sem cookie: troca o bilhete pela sessão do chat na aba.

No desenvolvimento, a aba fala com o Vite (`http://localhost:5173`), que repassa o `/api`. O `http://` só vale para os endereços locais.

O escopo da aba segue o do coletor: a organização vem do endereço, o token do `Authorization: Bearer`, sem cookie e sem a proteção contra outros sites, e o limite de requisições é por token. O escopo do cookie não aceita o token da aba, e o escopo da aba não aceita o cookie.

As tabelas, todas com `orgScoped()` e RLS forçado:
- **`chaves_da_aba`:** o hash, quando foi criada e quando foi trocada; uma ativa por organização.
- **`configuracoes_da_aba`:** a forma, o contato e a versão.
- **`aparelhos_da_aba`:** o identificador da máquina (`MachineGuid`), o identificador curto, o nome, a versão, a entrada, o último contato, o hash do token e o bloqueio.
- **`sessoes_da_aba`:** a conta, o aparelho, a entrada, o hash do token, quando começou, o último uso, quando vence, quando terminou e o motivo.
- **`bilhetes_da_aba`:** o hash, a sessão da aba, o destino, quando vence e quando foi usado.
- **Nas `sessoes`:** o `alcance` (`comum` ou `chat-da-aba`) e o `sessao_da_aba_id`. O nome é outro que o do `aparelho_id`, que é do aparelho confiável.
- **Nos `aparelhos_da_aba`,** também o teto de contas por dia, 5 de fábrica.

A sessão da aba fica numa tabela própria, e não nas `sessoes`:
- não tem CSRF, segundo passo nem cofre;
- uma linha nas `sessoes` abriria as rotas do cookie, se alguém errasse um filtro.

### 4. A pessoa pelo AD, pelo SID

O cliente do diretório ganha `buscarPeloSid(sid)`, que entra com a conta de serviço e busca `(&<filtro das pessoas>(objectSid=S-1-5-…))` dentro da base. O `objectSid` é binário:
- o `ldap.ts` passa a pedi-lo em `explicitBufferAttributes`;
- ele vira o texto `S-1-5-…` por uma função com teste próprio.

Do resultado, a API lê o atributo do usuário configurado, que passa por `normalizarUsuario` e `validarUsuario` e vira o `contas.usuario`. Assim, a conta é a mesma da entrada pela web. O nome que o Windows manda fica só na auditoria. A conferência do domínio NetBIOS não existe: achado pelo SID dentro da base é do diretório, e não achado é o usuário de fora.

A conferência (`diretorio/aba.ts`) recusa, antes do `contaPeloDiretorio`:
- o SID fora do diretório e o usuário que não passa no `validarUsuario`;
- a conta local com o mesmo usuário, conferida aqui de novo, porque o `contaPeloDiretorio` não olha a origem;
- a conta ou a pessoa inativa no Grafite;
- a falta de grupo mapeado e a conta desativada no AD;
- o diretório desligado ou fora do ar.

Cada recusa tem a sua frase e o seu teste de integração.

Sem senha, não há bloqueio por tentativas na entrada pelo Windows. As recusas ficam na auditoria com o aparelho. A renovação, de hora em hora, refaz a busca.

O teto do aparelho: com a entrada pelo Windows, um aparelho que já abriu sessões de 5 contas diferentes em 24 horas recusa a sexta, com a auditoria. A entrada pela senha não tem teto.

### 5. A resposta por ver

As `leituras_dos_chamados` ganham `aberta_ate`, o momento da última abertura da conversa. A resposta por ver é a resposta nova com mensagens depois do `aberta_ate`. O chat grava a abertura por `POST /api/chat/chamados/:numero/aberta`:
- quando a conversa aparece na tela;
- quando chega uma mensagem com ela à vista: `document.visibilityState` visível e `document.hasFocus()`.

Fechar a tela maior destrói o webview do chat (decisão 8). Assim, a conversa que ficou aberta na aba não marca como vista a resposta que chega depois, e 500 computadores não mantêm uma segunda conexão de eventos à toa.

A gravação manda o evento da leitura à pessoa. O domínio ganha a conta das duas respostas, a nova e a por ver. A por ver só vai ao estado da aba: a web segue com a resposta nova.

### 6. O estado e os eventos

`GET /api/aba/estado` junta:
- as não lidas do resumo do chat;
- as respostas novas e as por ver, com a última;
- a versão da configuração.

O `/api/aba/eventos` reusa o distribuidor com o público da conta, e manda à aba só os tipos que mudam o estado:
- a mensagem do chat e a resposta no chamado;
- a leitura e a abertura;
- a configuração e a entrada;
- o fim da sessão da aba e o bloqueio do aparelho.

O `PublicoDoEvento` (`packages/domain`) ganha as sessões da aba e o aparelho. O sinal de vida dessa conexão é de 10 s. Nos eventos de muita gente (a configuração e a mensagem num canal), a aba relê o estado com um atraso sorteado de até 3 s, para 500 abas não lerem no mesmo instante. Na resposta a uma pessoa, relê na hora.

Sem nenhuma sessão no computador, como na tela de pedir a senha ou na pessoa recusada, não há conexão de eventos. O serviço confere o `GET /api/aba/configuracao` a cada 60 s.

### 7. A janela, o clique que passa e o foco

A janela da aba é uma só, transparente, sem borda, sempre por cima e fora da barra de tarefas (`skipTaskbar`). Ela vai do tamanho da aba fechada ao do painel. O lado nativo:
- **o clique:** liga `set_ignore_cursor_events(true)` fora da forma. Ele acompanha o ponteiro a cada 16 ms (`GetCursorPos`) e desliga o ignorar quando o ponteiro entra na forma, que a tela informa em retângulos com cantos. A linha da apresentação nunca desliga o ignorar;
- **a posição:** põe a janela no alto e no meio do monitor principal, com a escala dele (`MonitorFromPoint` e `GetDpiForMonitor`), e a recoloca no `WM_DISPLAYCHANGE` e no `WM_DPICHANGED`;
- **o foco:**
  - guarda a janela da frente (`GetForegroundWindow`) quando o atalho abre o painel, e a devolve no Esc (`SetForegroundWindow`);
  - a perda do foco da janela da aba fecha o painel, e é o "clique fora";
- **o tema:** lê `AppsUseLightTheme`, o alto contraste (`SPI_GETHIGHCONTRAST`) e as animações (`SPI_GETCLIENTAREAANIMATION`), e lê de novo a cada `WM_SETTINGCHANGE`;
- **a apresentação:** lê o `SHQueryUserNotificationState` a cada 2 s. Os estados `QUNS_BUSY`, `QUNS_RUNNING_D3D_FULL_SCREEN` e `QUNS_PRESENTATION_MODE` encolhem a aba. A leitura não diz o monitor: um programa em tela cheia em qualquer tela encolhe a aba;
- **o atalho:** o plugin `global-shortcut` do Tauri. A falha no registro vira a frase do painel.

O ponto do aviso pulsa por 1.400 ms e para, e não até a pessoa abrir, como o LEIA do m06 descreve. O ANTISLOP só deixa o movimento contínuo para o que está carregando. O texto do aviso fica, e o 5.4 confere o m06 com essa diferença escrita.

### 8. A tela maior e o chat

A tela maior é uma segunda janela do Tauri, embaixo da aba, com duas partes:
- a moldura (a trilha e o "Esc volta"), local;
- um webview do chat, com a página remota `https://<servidor>/chat`.

O webview do chat:
- não tem nenhuma permissão do Tauri: as capabilities não listam o domínio remoto, e a página não chama o lado nativo;
- só navega em `/chat` do servidor. Outro endereço, mesmo da mesma origem, e a janela nova abrem no navegador padrão (`on_navigation` e `on_new_window`);
- guarda os dados do WebView2 em `%LOCALAPPDATA%\Grafite\Aba\WebView2`, por pessoa do Windows;
- é criado ao abrir a tela maior e destruído ao fechá-la.

**A navegação é o canal da página com a aba,** sem dar permissão à página. O `on_navigation` intercepta dois endereços, que não carregam:
- `/chat/entrar` sem o fragmento: a sessão do chat venceu. O chat navega para ele no 401, e a aba pede o bilhete;
- `/chat/fechar-a-aba`: o chat navega para ele no Esc que ninguém consumiu (um menu, um diálogo ou a seleção aberta consomem), e a aba fecha a tela maior.

Com o foco no webview, o Esc vai à página, e por isso a tela maior não o escuta sozinha. A linha da resposta, com o chat já aberto, navega o webview para o chamado.

Quando a sessão do chat na aba falta, a aba pede o bilhete (`POST /api/aba/bilhete`) e navega para `/chat/entrar#<bilhete>`. A página:
- troca o bilhete por `POST /api/sessao/bilhete`;
- recebe o cookie da sessão do chat na aba;
- vai ao destino com `history.replaceState`, sem o fragmento.

A troca calcula de novo a pendência da conta e confere a sessão da aba e o aparelho. O usado, o vencido e o desconhecido têm a mesma resposta, e a rota tem o `LIMITE_DA_ENTRADA`.

A sessão do chat na aba é uma linha nas `sessoes`, com `alcance = 'chat-da-aba'` e o `sessao_da_aba_id`. O alcance é recusado por padrão:
- **O `lerSessao` recebe os alcances que o chamador aceita** e, sem eles, só devolve a sessão comum. Os três chamadores:
  - o gancho do escopo passa o `chatDaAba` da rota;
  - a conferência da conexão de eventos (`rotas/eventos.ts`) passa o da própria conexão;
  - a ponte dos painéis (`paineis/ponte.ts`) não passa nada.
- **O `lerSessao` confere ao vivo a sessão da aba ligada:** vencida, terminada ou com o aparelho bloqueado, a do chat também vale como terminada.
- **A lista do alcance é escolhida e fixada num teste da API:**
  - entram as rotas `/chat`, a leitura da sessão, das preferências, dos padrões e dos módulos, a foto só no `GET` (a mesma rota no `PUT` fica fora), os anexos do chat e os eventos;
  - ficam fora de propósito o `/conta` inteiro (os dois passos, as sessões, os aparelhos e os canais), as escritas das preferências e o `/chamados` do módulo. Sem este último, o "Andamento" do chat, que usa rotas do Chamados, fica escondido pelo `naAba`.
- **O e2e da web confere o outro sentido:** o app do chat com o `naAba` não pede nada fora da lista, medido pelos pedidos que saem.
- **A recusa fora do alcance é o 403 `fora-do-alcance-da-aba`,** e não o 401 `sem-sessao`. O cliente do chat a trata como o pedido que falhou, e uma rota esquecida não derruba o chat para a entrada, em laço com o bilhete.
- **A conexão de eventos da sessão do chat na aba** recebe só os tipos que o chat usa.
- **O `/api/sessao` diz `naAba: true`,** e o app do chat esconde o que leva à casca, o "Andamento", a instalação e o push.

Com a entrada pelo Windows, a conta que exige ou tem os dois passos não recebe o bilhete. O webview mostra a entrada do chat, com a senha e o código. A página de entrada do chat aberta pela aba leva a marca da aba (`/chat/entrar?aba=<id curto do aparelho>`), e a sessão que sai dali nasce com o alcance `chat-da-aba`, ligada à sessão da aba da mesma conta e do mesmo aparelho. Sem essa sessão da aba, a entrada é recusada. Falsificar a marca só reduz o alcance.

### 9. Os tokens da aba

As cores da aba dos chamados (`aba.*` em `gerador.ts`) já existem, e a aba do Windows reaproveita a matiz e o croma delas para o azul de fábrica e o âmbar fixo. O que é novo entra no grupo `abaFlutuante.*`:
- o fio claro e o segundo tom do ícone;
- o neutro do sem conexão;
- a sombra e o fio escuro por fora.

A aba do Windows não segue os temas do Grafite: ela segue o tema do Windows, que é outro eixo. O `tokens:contraste` ganha uma tabela própria, com os pares da aba nos três temas do Windows (escuro, claro e alto contraste, este com as cores do sistema de referência), fora das 24 combinações.

As durações entram no `movimento` (`escalas.ts`) como `aba.abrir`, `aba.cascata`, `aba.fechar`, `aba.entalhe` e `aba.ponto`. A exceção dos 340 ms entra na lista nomeada do `docs/ANTISLOP.md`.

### 10. A rede no lado nativo

As chamadas do serviço e da aba saem do Rust, pelo `reqwest` com o `native-tls` (o schannel), e assim vale a autoridade interna. O proxy:
- o da aba é a parte manual do proxy da pessoa (`WinHttpGetIEProxyConfigForCurrentUser`), com as exceções;
- o do serviço é o da máquina (`WinHttpGetDefaultProxyConfiguration`, o `netsh winhttp`).

O PAC fica fora, e o runbook diz isso. O webview do chat usa a rede do WebView2, que segue o proxy do Windows inteiro.

A tela da aba não fala com a rede: ela chama os comandos do Tauri (`estado`, `entrar`, `sair`, `abrir`). Os eventos chegam ao Rust e passam à tela pelo `emit`. A CSP da tela é a de fábrica do Tauri, sem `connect-src` para fora.

Os logs têm rotação de 5 arquivos de 1 MB, sem a chave, os tokens, as senhas e as mensagens:
- o do serviço fica em `%ProgramData%\Grafite\Aba\logs`, que só o sistema e os administradores escrevem. Uma pasta que a pessoa também escrevesse deixaria quem não é administrador pôr ali um atalho de pasta e fazer o serviço escrever onde quisesse;
- o da aba fica no `%LOCALAPPDATA%\Grafite\Aba\logs` da pessoa.

### 11. O comando e a configuração

Os comandos de `grafite aba …` entram em `apps/api/src/comando`, como os da `organizacao` e da `conta`, e no `grafite.ps1` e no lançador do Linux, que só repassam. O identificador curto do aparelho tem 6 caracteres do Crockford (`crockford.ts`) e escolhe o aparelho quando o nome se repete.

### 12. O MSI e o CI

O `tauri build` gera o MSI pelo WiX, com um fragmento próprio (`src-tauri/wix/servico.wxs`) que:
- instala e inicia o serviço (`ServiceInstall` e `ServiceControl`);
- grava as três propriedades em `HKLM\SOFTWARE\Grafite\Aba`, com a permissão só do sistema e dos administradores. A `GRAFITE_CHAVE` é `Hidden`, para não ir ao log do MSI;
- põe a aba no `Run` da máquina;
- na desinstalação de verdade (`REMOVE="ALL" AND NOT UPGRADINGPRODUCTCODE`), para o serviço e apaga o `%ProgramData%\Grafite\Aba` e o `HKLM\SOFTWARE\Grafite\Aba`. A troca de versão não limpa nada: o aparelho segue com o mesmo token, sem precisar da chave, que o runbook manda trocar depois de cada onda. O `%LOCALAPPDATA%` de cada pessoa (o WebView2, o token e o log) fica: o MSI por máquina não alcança o perfil de cada uma.

O serviço lê a chave sempre que ela aparece no registro e ele não tem token, ou o token foi recusado. Depois de registrar, apaga a chave. A TI repõe a chave por um script do Intune depois de restaurar um backup do servidor.

O WebView2 vai pelo bootstrapper embutido.

O job `aba` do `ci.yml`, no `windows-2022`:
- `cargo fmt --check`, `cargo clippy -D warnings` e `cargo test`;
- `tauri build`;
- a conferência de que o MSI não leva endereço, chave nem token;
- o upload do MSI como artefato;
- o cache do Cargo pela `actions/cache`.

### 13. O diretório de desenvolvimento

O `pnpm dev`, no Windows, lê o SID e o usuário de quem roda (`whoami /user`) e liga na organização de desenvolvimento um diretório simulado. Ele usa o mesmo `conectarDiretorio` falso dos testes, movido para um módulo que a API só carrega com `GRAFITE_DIRETORIO_DE_DESENVOLVIMENTO=1`. A validação da configuração recusa essa variável:
- com o ambiente de produção;
- numa organização com endereço que não é local.

A recusa da organização com endereço que não é local não cabe na validação da configuração, que não lê o banco. Ela é conferida onde o diretório simulado atende, por organização.

O diretório simulado tem:
- o usuário de quem desenvolve, num grupo mapeado a um grupo do Grafite com o chat, e sem os dois passos;
- a senha `aba123`, que só ele aceita, para a entrada pela senha.

O `.env` ganha também a chave da aba de desenvolvimento, gerada uma vez.

### 14. Os testes

- **Domínio:** o estado que a aba mostra (a forma, o aviso, a largura, as palavras e o "chegou às") e as respostas por ver, em testes unitários.
- **Integração,** com o PostgreSQL e o AD falso:
  - o registro, a chave trocada, o token perdido e o bloqueio;
  - a pessoa pelo SID, com as recusas, e a pessoa pela senha;
  - o teto do aparelho;
  - a sessão fora das rotas dela, a renovação e os seis fins;
  - o bilhete e o alcance do chat na aba;
  - qual evento chega a qual aba.
- **Rust:**
  - a forma que deixa o clique passar;
  - o modo da apresentação;
  - o SID em texto;
  - o pipe que recusa o servidor falso e lê quem chama.

  O que o Windows responde é simulado por traços.
- **E2e:** a tela da aba no Playwright, com os comandos do Tauri simulados (`window.__TAURI_INTERNALS__`), num projeto próprio em `apps/aba/e2e`, que o `pnpm test:e2e` também roda:
  - os estados, o aviso, o sem conexão, a apresentação, o teclado e a entrada pela senha;
  - os três temas.

  O chat da aba no e2e da web, com o `naAba`.
- **Visual:** as capturas da aba fechada e aberta nos três temas, com as referências gravadas nas tarefas da tela.
- **Pilha:** a aba simulada pelas rotas: o aparelho, a pessoa do AD falso, o bilhete e o chat da aba com a sessão dele.

O MSI, o serviço e o webview do chat são conferidos à mão neste computador, contra o `pnpm dev`, e numa VM Windows de testes.

## Risks / Trade-offs

- **O alcance do risco aceito na entrada pelo Windows:**
  - quem administra qualquer computador com a aba lê o token do aparelho e pede a sessão de qualquer pessoa do AD num grupo mapeado, porque o SID não é segredo;
  - quem pega a chave da organização faz o mesmo de qualquer computador.

  O que limita isso:
  - a sessão vale só nas rotas da aba, e a do chat na aba só nas do chat. Ninguém abre a casca, o cofre ou os ativos por ela;
  - a conta com os dois passos não recebe o bilhete;
  - o teto de 5 contas por aparelho em 24 horas;
  - a auditoria do aparelho em cada sessão e em cada bilhete;
  - o `aba aparelhos` marca os aparelhos novos, e o bloqueio;
  - a chave `Hidden` no MSI. O runbook manda trocar a chave depois de cada onda de instalação e diz onde o Intune guarda a linha de comando.
- **O chat na aba é a conversa inteira da pessoa.** Quem se passa por ela lê e escreve no chat dela e nos chamados dela. É o risco aceito, e é por isso que o alcance para no chat, sem a conta e sem o andamento dos chamados.
- **O perfil genérico é de todos.** Um programa deixado no mesmo usuário do Windows lê a senha digitada e a memória da aba. O risco é do perfil compartilhado, e não da aba. E os anexos baixados pelo chat ficam na pasta de downloads depois do "Sair", o que o runbook diz.
- **A mesma conta em duas sessões do Windows no mesmo aparelho,** como num servidor de área de trabalho remota: com uma sessão por conta e aparelho, uma derruba a outra. Raro, e vai para as pendências.
- **A chave e o Intune:** o Intune instala nos computadores novos o tempo todo. Trocar a chave pede atualizar o pacote do Intune no mesmo passo.
- **O serviço como o sistema aumenta o que roda com privilégio.** Ele faz só o contato com a API e o pipe, sem nenhum comando vindo da rede.
- **O `MachineGuid` repetido,** como nas imagens clonadas sem o sysprep: as duas máquinas se derrubam a cada registro. A API registra na auditoria o re-registro com outro nome em menos de 1 hora, e o runbook manda o sysprep.
- **O computador reinstalado** volta com outro identificador e o mesmo nome. O comando escolhe pelo identificador curto.
- **O SID no filtro do LDAP em texto:** o AD aceita, e a VM confere com o AD de verdade.
- **A janela transparente pode custar ao WebView2.** O acompanhamento do ponteiro é de 16 ms e só no Rust, e a tela fica parada sem mudança.
- **A tela de 1366 e a escala de 125% ou 150%** podem cortar o painel. O e2e confere as medidas nas duas escalas.
- **O WiX e o serviço** são a parte com menos exemplo no Tauri. Se o fragmento não servir, o plano B é um MSI montado pelo WiX direto no CI, com os binários do Tauri dentro.

## Migration Plan

- As migrations criam as tabelas da aba e as colunas `aberta_ate` (`leituras_dos_chamados`) e `alcance` e `sessao_da_aba_id` (`sessoes`), com os valores de hoje como padrão. Nada mais muda nas que existem.
- A aba só aparece onde o Intune a instala, e sem a chave criada nenhuma aba conecta.
- **Depois de restaurar um backup do servidor,** os aparelhos registrados depois dele ficam com "Este computador precisa ser registrado de novo." A TI repõe a chave pelo script do Intune do runbook.
- **Mudar o endereço do servidor** é reinstalar o MSI com o `GRAFITE_SERVIDOR` novo.
- **Para voltar atrás,** desinstalar o MSI pelo Intune e trocar a chave.

## Open Questions

- A VM Windows de testes precisa estar no domínio, com uma conta do AD de teste, para conferir a entrada pelo Windows e o SID no filtro. Se ela não estiver, a conferência fica com o AD falso, e a do domínio fica para a produção-teste.
