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

No repositório (tarefa 5.1), o workspace Cargo fica em `apps/aba`, com o `src-tauri` (o pacote `grafite-aba`) e o `servico` (`grafite-aba-servico`), e o `target` dos dois ao lado. O `build` da aba é o `tauri build`, que gera o MSI; a tela sozinha é o `build:tela`. O lint, os tipos, os testes e a ponta a ponta da aba não chamam o Cargo, e o resto do CI segue sem o Rust: o `cargo fmt`, o `clippy` e o `cargo test` ficam no job `aba` (tarefa 6.2). A ponta a ponta da tela usa a porta da web mais 3 (4176, e 4276 na instância seguinte do executor), livre das da pilha e do coletor. Os ícones vêm do ícone da PWA (`tauri icon`), só os do Windows.

O token da sessão da aba, por pessoa, fica com a aba, cifrado pelo DPAPI da pessoa (`CurrentUser`). Outra pessoa do mesmo computador não o abre.

### 2. As duas entradas

A entrada é do aparelho, guardada no servidor: `windows` ou `senha`. O MSI só a sugere no primeiro registro (`GRAFITE_ENTRADA`), e depois quem decide é o comando `aba entrada`. O administrador do computador não a troca pelo computador.

- **Pelo Windows:** o serviço manda o SID de quem chama pelo pipe (decisão 4).
- **Pela senha:**
  - a tela da aba pede o usuário e a senha. O pedido vai pelo pipe ao serviço, e dele à API, com o token do aparelho;
  - a API confere pela mesma função da entrada (`rotas/sessao.ts`), extraída para ser chamada dos dois lugares, e não por uma cópia: o `conferirNoDiretorio`, o bloqueio por tentativas e a pendência dos dois passos;
  - **o código:** a primeira chamada pode responder `falta-o-codigo`, com uma sessão pendente da aba, de 5 minutos. A primeira devolve o token da pendente, e a segunda leva o código e esse token, achado pelo hash como na pendente da web. Ao ativar, o último uso volta para o agora, e as tentativas do código contam como na entrada. A conta que exige os dois passos sem os ter cadastrado é recusada com a frase da spec;
  - **o fim:** a sessão termina no servidor (`DELETE /api/aba/sessao`) com o "Sair", com o fim da sessão do Windows ou a tela bloqueada (`WTSRegisterSessionNotification`: `WTS_SESSION_LOCK` e `WTS_SESSION_LOGOFF`) e com 30 minutos sem uso. O servidor conta os 30 minutos pelo último uso, e assim o computador desligado também tem a sessão vencida. O uso é a aba ou a tela maior com o foco, que o lado nativo informa ao servidor no máximo uma vez por minuto;
  - **o que fica no computador:** o token da sessão fica só na memória. A aba limpa os dados do chat (`clear_all_browsing_data` do WebView2) ao terminar e também ao abrir, para o caso de o processo ter morrido;
  - **a renovação** vai pelo token da sessão, sem a senha, e a API confere a pessoa no AD pela conta de serviço.
  - **no código:** a conferência é a `conferirAEntrada` do `rotas/sessao.ts`, com a `daAba`: só a entrada pelo diretório vale, e a conta local e o usuário que não serve de conta recebem a recusa das credenciais, sem a senha local conferida, para a aba não dizer quem tem conta local; a auditoria guarda o motivo `conta-local`. O diretório desligado e o AD fora do ar respondem a TI fora do alcance, sem contar tentativa. A ativação troca o token da pendente por um novo. O código de recuperação também serve, sem a notificação do último código, que fica na entrada da web. A renovação busca a pessoa pelo usuário da conta (`buscarPeloUsuario`), e o escopo da aba encerra com `sem-uso` a sessão parada há 30 minutos no primeiro pedido dela. Os pedidos pela senha, com o código ou sem ele, contam na chegada, por computador, no limite da entrada, de 20 por minuto, e passado ele a resposta é o 429, também com os pedidos em paralelo; o código certo zera as tentativas do usuário, como na web.

O aparelho com a entrada pela senha recusa o pedido pelo SID, e o com a entrada pelo Windows recusa o pedido pela senha. Sem isso, quem administra o computador genérico pediria a sessão de qualquer pessoa pelo SID.

### 3. Os tokens e as rotas da aba

As rotas, todas no OpenAPI, com o `/api` de fora. O cliente em Rust é escrito à mão, e um teste do job do CI confere os exemplos dele contra o OpenAPI gerado.
1. **`POST /api/aba/aparelho`**, do serviço, com a chave: registra ou re-registra, e devolve o token do aparelho e a entrada. Recusa o aparelho bloqueado.
2. **`GET /api/aba/configuracao`**, do serviço, com o token do aparelho: a forma, o contato, a entrada e a versão. Enquanto a organização não tem a linha da configuração, a resposta leva a forma de fábrica, sem contato, e a versão 0, para o primeiro `grafite aba configurar`, que grava a versão 1, ser visto pelo serviço que relê pela versão. O `configurar` que não muda nada não sobe a versão.
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

O escopo da aba segue o do coletor: a organização vem do endereço, o token do `Authorization: Bearer`, sem cookie e sem a proteção contra outros sites, e o limite de requisições é por token. O token que não vale não entra nesse limite, e a rota com o limite próprio fica sem o geral: o escopo conta as recusas do token por endereço, 20 por minuto, como a entrada, e passado o limite responde 429 antes do banco. O token que valeu nos últimos 10 minutos passa por esse limite, para o computador registrado de novo não esperar atrás dos outros do mesmo endereço, como na filial atrás de um NAT; as recusas do token da sessão não entram nesse contador. A chave e o token recusados vão à auditoria uma vez por endereço a cada 10 minutos, com o código de rastreio, porque o serviço tenta de novo a cada minuto e o computador restaurado de um backup encheria a auditoria; o nome do computador, no corpo e no cabeçalho, não aceita caractere de controle, nem os de 8 bits. O escopo do cookie não aceita o token da aba, e o escopo da aba não aceita o cookie.

As tabelas, todas com `orgScoped()` e RLS forçado:
- **`chaves_da_aba`:** o hash, quando foi criada e quando foi trocada; uma ativa por organização.
- **`configuracoes_da_aba`:** a forma, o contato e a versão.
- **`aparelhos_da_aba`:** o identificador da máquina (`MachineGuid`), o identificador curto, o nome, a versão, a entrada, o último contato, o hash do token e o bloqueio. O `registrado_em` é o primeiro registro, que o `aba aparelhos` lê; o `token_trocado_em` é o último, que a regra do re-registro em menos de 1 hora lê.
- **`sessoes_da_aba`:** a conta, o aparelho, a entrada, o hash do token, quando começou, o último uso, quando vence, quando terminou e o motivo. Só a abertura, a ativação e o `POST /api/aba/uso` gravam o último uso, e o escopo da aba não o toca a cada pedido: senão a releitura do estado manteria viva a sessão da entrada pela senha. Uma aberta por conta e aparelho:
  - a entrada encerra a aberta antes de incluir, na mesma transação: com o motivo 'sem-uso' a que já venceu, e 'outra-sessao-no-aparelho' a que segue valendo;
  - duas entradas ao mesmo tempo dão o 23505 numa delas. A que perde não tem o token da que ganhou, que o banco só guarda pelo hash: ela tenta de novo uma vez, encerrando a que ganhou com o motivo 'outra-sessao-no-aparelho', e na segunda falha responde 503, que o serviço repete;
  - a aba que recebe o fim 'outra-sessao-no-aparelho' não pede outra sessão sozinha, para duas sessões do Windows com a mesma conta não se derrubarem em laço. Ela fica sem conexão com a frase "Você abriu a aba em outra sessão do Windows deste computador.", e a pessoa volta a ela saindo do Windows e entrando de novo.
- **`bilhetes_da_aba`:** o hash, a sessão da aba, o destino, quando vence e quando foi usado. A manutenção diária apaga os vencidos há mais de 24 horas.
- **Nos `eventos`:** as sessões da aba, os aparelhos e todas as abas, como partes do público, com as listas em linhas de 20.
- **Nas `sessoes`:** o `alcance` (`comum` ou `chat-da-aba`) e o `sessao_da_aba_id`, com a FK pela organização, pela sessão da aba e pela conta, para a sessão do chat na aba ser da mesma conta da sessão da aba. O nome é outro que o do `aparelho_id`, que é do aparelho confiável.
- **Nos `aparelhos_da_aba`,** também o teto de contas por dia, 5 de fábrica.
- **Os fins:** o `encerramento.ts` encerra as sessões da aba com as do chat na aba delas, que terminam com o motivo `sessao-da-aba-encerrada` (migration 0074). Isso vale nas mudanças da conta, no "Encerrar" e no "Encerrar as outras" da lista, no bloqueio do aparelho (`aparelho-bloqueado`) e na troca da entrada (`encerrada-pela-administracao`). A entrada nova, a renovação recusada, o "Sair" e o `sem-uso` do escopo também levam o chat. As duas listas leem as sessões da aba que valem, como "Aba · PC-FIN-09", e as do chat como "Chat na aba · PC-FIN-09"; a da aba pelo Windows traz o aviso de que a aba abre outra sessão na hora e de que quem para o computador é o bloqueio. Na entrada pelo Windows, o último uso da lista é a renovação, de hora em hora; na da senha, é o uso que conta os 30 minutos.

A sessão da aba fica numa tabela própria, e não nas `sessoes`:
- não tem CSRF, segundo passo nem cofre;
- uma linha nas `sessoes` abriria as rotas do cookie, se alguém errasse um filtro.

### 4. A pessoa pelo AD, pelo SID

O cliente do diretório ganha `buscarPeloSid(sid)`, que entra com a conta de serviço e busca `(&<filtro das pessoas>(objectSid=S-1-5-…))` dentro da base. O `objectSid` é binário:
- o `ldap.ts` passa a pedi-lo em `explicitBufferAttributes`;
- ele vira o texto `S-1-5-…` por uma função com teste próprio.

Do resultado, a API lê o atributo do usuário configurado, que passa por `normalizarUsuario` e `validarUsuario` e vira o `contas.usuario`. Assim, a conta é a mesma da entrada pela web. O nome que o Windows manda fica só na auditoria. A conferência do domínio NetBIOS não existe: achado pelo SID dentro da base é do diretório, e não achado é o usuário de fora.

A conferência (`diretorio/aba.ts`) recusa, antes do `contaPeloDiretorio` e nesta ordem:
- o diretório desligado, sem o qual não há o que conferir;
- o SID fora da forma `S-1-5-…`, que nem vai ao AD, como o do computador só no Entra (`S-1-12-…`);
- o AD fora do ar, e a conta de serviço que o cofre não abre;
- o SID fora do diretório e o usuário que não passa no `validarUsuario`;
- a conta local com o mesmo usuário, conferida aqui de novo, porque o `contaPeloDiretorio` não olha a origem;
- a conta ou a pessoa inativa no Grafite;
- a conta desativada no AD e a falta de grupo mapeado, com a frase de quem não tem acesso.

Cada recusa tem a sua frase e o seu teste de integração. A frase da tela junta casos que a TI resolve de jeitos diferentes, então a auditoria leva também o detalhe de cada um, como a desativada no AD e a sem grupo. Com o AD fora do ar, a API responde a TI fora do alcance por 30 segundos sem tentar o AD de novo, para as abas da empresa, que tentam como na rede caída, não segurarem os pedidos pelo prazo da conexão.

Sem senha, não há bloqueio por tentativas na entrada pelo Windows. As recusas ficam na auditoria com o aparelho, com o usuário e o nome que o AD achou: a mesma pessoa pelo mesmo motivo uma vez até a sessão aberta dela, e no máximo 20 recusas por aparelho a cada 10 minutos. O AD fora do ar não vai à auditoria como pessoa recusada: fica no aviso do log. A sessão encerrada responde o 401 com o motivo do fim, e as recusas do token desconhecido da sessão contam por endereço no limite geral, de 600 por minuto; a vencida e a encerrada, que já valeram, não contam. O teto por aparelho é conferido antes da busca pela pessoa. A renovação, de hora em hora, refaz a busca.

O teto do aparelho: com a entrada pelo Windows, um aparelho que já abriu sessões de 5 contas diferentes em 24 horas recusa a sexta, com a auditoria. A entrada pela senha não tem teto.

### 5. A resposta por ver

A tabela `aberturas_dos_chamados` guarda, por conta e chamado, o momento da última abertura da conversa (as `leituras_dos_chamados` só existem depois do primeiro "Marcar como vista"). A resposta por ver é a resposta nova com mensagens depois dessa abertura. O chat grava a abertura por `POST /api/chat/chamados/:numero/aberta`:
- quando a conversa aparece na tela;
- quando chega uma mensagem com ela à vista: `document.visibilityState` visível e `document.hasFocus()`.

Na web (tarefa 4.2), a tela do chamado grava a abertura quando fica à vista (`useJanelaAVista`, o mesmo que cala as notificações dele) e de novo quando muda a última mensagem de outra pessoa com ela à vista; a da própria conta não grava. Ao sair da vista, a próxima aparição grava de novo. A gravação não mostra nada: a falha fica calada, e a seguinte grava.

Fechar a tela maior destrói o webview do chat (decisão 8). Assim, a conversa que ficou aberta na aba não marca como vista a resposta que chega depois, e 500 computadores não mantêm uma segunda conexão de eventos à toa.

A gravação manda o evento da leitura à pessoa. O domínio ganha a conta das duas respostas, a nova e a por ver. A por ver só vai ao estado da aba: a web segue com a resposta nova.

Na API (tarefa 3.9), a gravação usa o mesmo corte de quem participa da leitura: quem não participa recebe 404. O evento é o `chamados.mudaram` só à conta dela, e só quando a abertura tira a resposta por ver (há mensagem de outra conta depois da abertura anterior): a segunda abertura seguida não avisa, e a tela que grava a abertura ao reler não entra em laço. O estado da aba traz o `porVer` com quantas e a última por ver, a mais recente entre os chamados pela hora: quem respondeu, o número, o título e o momento.

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

O `PublicoDoEvento` (`packages/domain`) ganha as sessões da aba, os aparelhos e todas as abas. O `todas` e as `contas` seguem chegando à conexão da aba, e é a rota que corta pelo tipo: o chat da aba usa a mesma função e precisa dos tipos que o chat lê. A conexão da aba, sem linha nas `sessoes`, leva no `sessaoId` um valor que nunca casa, e não o id da sessão da aba. A configuração, a entrada e o bloqueio ganham tipos próprios no `TIPOS_DE_EVENTO`; o fim da sessão da aba vai pelo `registrarEvento` com o público dado (`sessoesDaAba`), porque o público deduzido do `sessao.encerrada` é o da sessão comum. O aviso do banco (`app.avisar_evento()`) leva as três partes novas, como a linha. O sinal de vida dessa conexão é de 10 s. Nos eventos de muita gente (a configuração e a mensagem num canal), a aba relê o estado com um atraso sorteado de até 3 s, para 500 abas não lerem no mesmo instante. Na resposta a uma pessoa, relê na hora.

Os tipos novos são o `configuracao-da-aba.mudou`, a todas as abas, e o `entrada-da-aba.mudou` e o `bloqueio-da-aba.mudou`, às do aparelho, com o público deduzido do alvo; o desbloqueio não grava evento, porque o aparelho bloqueado não tem sessão. Todo fim da sessão da aba passa pelo `fimDasSessoesDaAba` (`acesso/encerramento.ts`), que encerra o chat na aba dela e grava o `sessao.encerrada` às sessões da aba e às do chat. A marca `deMuitos` (`eventoDeMuitos`, no domínio) é de cada conexão: o evento que chega a ela pela conta, pela sessão da aba ou pelo aparelho é da pessoa, e o resto, como o canal e a configuração, é de muitos. A conexão é conferida a cada 60 s pelo mesmo `sessaoDoToken` do escopo. Cada sessão da aba mantém até 3 conexões, e a nova fecha a mais antiga, porque a que ficou para trás na troca de rede só termina quando o TCP desiste. O `modulos.mudaram` também vai à aba, porque o chat e os chamados desligados tiram as contagens do estado. A conexão não retoma pelo Last-Event-ID: a aba lê o estado depois de ela abrir, e o `reiniciar` vai com o `deMuitos`.

Sem nenhuma sessão no computador, como na tela de pedir a senha ou na pessoa recusada, não há conexão de eventos.

A recusa da pessoa na entrada pelo Windows volta a ser tentada a cada 10 minutos. Para não repetir a auditoria, a API lê a última linha da auditoria do aparelho com aquele SID: se ela é uma recusa com o mesmo motivo, não grava outra. Nenhum sinal da aba decide isso, porque quem controla o computador esconderia as recusas. A tentativa a cada 10 minutos é só da entrada pelo Windows. Na entrada pela senha a aba não guarda a senha, e a conta inativa, a conta local e o sem grupo voltam ao formulário. A última resposta do estado da aba é a mais recente entre os chamados, pela hora, e a consulta da 3.9 ordena as linhas pela conversa antes do `linhasPorVer`. O serviço confere o `GET /api/aba/configuracao` a cada 60 s.

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

Na tela (tarefa 5.3), o contrato com o lado nativo fica em `apps/aba/src/nativo.ts`:
- o comando `aparencia` e o evento `aparencia-mudou` dão a forma da configuração, o tema e as animações do Windows e a tela principal em px lógicos;
- a tela põe o tema no `data-windows-theme` e o reduzir movimento no `data-motion`;
- o comando `informar_forma` recebe os retângulos da forma, em px CSS da janela, com o raio de cima e o de baixo, a cada mudança de tamanho ou de lugar. Ele mede pela caixa do layout, sem a escala do mouse em cima.

A janela é transparente, e a tela põe a forma no alto e no meio dela. A pílula fica a 8 px do alto, ou a 36 px numa tela de até 800 px de altura, abaixo da barra de título do programa maximizado (m12); o entalhe fica a 0. A pílula tem a largura mínima da spec (162 e 160 px), porque a fonte deixava a de 162 com 161. A aba pressionada leva o `aba.pressionada` (80 ms), que entrou no `movimento`, e o mouse em cima da pílula usa o `aba.entalhe`. As referências visuais da aba fechada (as duas formas nos três temas) são do Windows: o e2e as pula nos outros sistemas, como o CI. Os comandos do Rust entram na 5.8 e na 5.9; até lá, a tela usa a aparência de fábrica.

No painel (tarefa 5.4), o contrato cresce:
- o comando `estado` e o evento `estado-mudou` dão as não lidas, as respostas novas, quem está na aba (com o `pelaSenha`) e o atalho ocupado;
- o evento `atalho` abre o painel com o foco em "Abrir chamado", e o `fechar-o-painel` é o clique fora, que o lado nativo vê na perda do foco: a tela não usa o `blur`, porque a tela maior também tira o foco da janela da aba sem fechar o painel;
- os comandos `abrir_tela_maior` (com o destino), `devolver_o_foco`, no Esc, e `sair`.

O logo é a `Marca` do `@grafite/ui`, na cor do texto da aba, e não o "g" desenhado do mockup. Com um selo, as opções de baixo crescem 8 px para o selo não cobrir o símbolo, como o painel da notificação do m04. Quem está na aba, com "Sair", fica embaixo das opções, e o "Sair" entra na grade e no Tab. O fio de 1,5 px arredonda para 1 px na tela de escala 1, e o painel tem a largura da spec escrita.

No aviso (tarefa 5.5), o estado que a tela lê tem o formato do `GET /api/aba/estado`: o `porVer` com quantas e a última, que pode faltar, e as contas que podem ser `null`. O nome da aba fica para o leitor de tela antes do aviso ("Suporte da TI: 1 resposta nova · Ana Souza"). Escolher a linha da resposta pede `abrir_tela_maior` com o destino `chamado` e o número: a spec abre o chamado no chat da aba, e não em "Visualizar chamados", como a legenda do m02 dizia. O movimento:
- o ponto pulsa uma vez em cada chegada (o número e o momento da última), e não de novo quando a aba volta do painel; sem animações no Windows, o anel fica parado à vista, como o quadro 6 do m06;
- a linha da resposta entra com o logo, aos 60 ms, para a cascata não passar dos 340 ms, e o "Sair" e a nota entram com a última opção;
- a forma que cresce corta o conteúdo que ainda não cabe (`overflow: clip`), com a margem do encaixe à vista no entalhe; o encaixe, registrado com o `@property`, cresce de 14 para 18 px;
- ao fechar, o painel volta à aba fechada de quando abriu, e a aba anima dela para a largura de agora, como os 246 para 162 px do m04 depois de ler.

As referências da 5.4 foram gravadas de novo: as opções que sobem na cascata mudam a suavização do texto, e nada mais.

A moldura da tela maior (tarefa 5.6) é a página `maior.html`, a segunda entrada do build, para a segunda janela do Tauri, que o lado nativo cria (tarefas 5.8 e 5.15). O contrato:
- o comando `tela_maior` e o evento `tela-maior-mudou`, às duas janelas, com o destino (as três opções ou o `chamado` com o número) ou `null` ao fechar;
- o `fechar_tela_maior`, no Esc que chega à moldura e no voltar da trilha;
- o `informar_corpo`, com o lugar do chat em px da janela, ou `null` sem o chat; e o `informar_forma` de sempre, pela janela que chama;
- "Abrir no chat" pede `abrir_tela_maior` com o `abrir-chat`, e a mesma tela maior troca de destino.

A janela é transparente, com a folga da sombra dos lados e embaixo. A faixa fica no azul da aba, e o corpo, no tema do Grafite que segue o do Windows: o escuro é o Grafite, o claro é o Papel e o alto contraste é o Alto contraste. O lugar do chat fica 6 px para dentro dos cantos redondos, e o webview retangular cabe na moldura. A trilha da linha da resposta é "Aba › Abrir chat › #1041". Com a tela maior aberta, o painel fica atrás, recuado a 0,94 em 220 ms, com a opção de origem marcada pelo anel (`aria-current`), e o foco volta a ela quando a tela maior fecha.

O sem conexão, a apresentação e a entrada pela senha (tarefa 5.7) chegam pelo estado e pela aparência que o lado nativo manda. O contrato:
- no estado, o `semConexao` com o motivo, ou `null`, e o `formulario` da entrada pela senha, com o passo (`senha` ou `codigo`), a recusa escrita e o `esperaAte` das tentativas esgotadas, ou `null`; sem conexão vence o formulário;
- na aparência, o `contato` de reserva da configuração guardada, `null` na de fábrica, e o `apresentacao`;
- os comandos `entrar`, com o usuário e a senha, `enviar_o_codigo` e `recomecar_a_entrada`; a recusa e o passo seguinte voltam pelo estado.

Sem conexão, a tela segue a spec, e não o m09, onde ele vai além dela: a pessoa não escreve o chamado para enviar depois, e "Visualizar chamados" não mostra uma cópia, porque as duas opções ainda abrem a frase da versão seguinte; o contato diz "Urgente? Fale com a TI" e o texto da configuração, sem o "Atendendo agora", que a aba não sabe sem a rede. O painel sem conexão tem a largura do painel com a resposta (372 px, ou 300 na tela pequena), e o que precisa de rede fica tracejado, com "precisa de conexão" escrito: o "Abrir chat", a linha da resposta, com o ponto no tom do indisponível, e o chat da tela maior, com o "Abrir no chat" desligado. Os números e o aviso saem, porque são de antes. As setas passam pelo que está indisponível (`aria-disabled`), para o motivo ser lido. A aba fechada troca o azul pelo neutro em 200 ms, com o contorno e o encaixe no tom dele.

Na apresentação, a linha de 96×4 não leva a contagem do m10: a spec diz que a aba não avisa. A forma informada é vazia, e o clique passa; o atalho abre o painel, e o Esc volta à linha. A aba encolhe para a linha em 160 ms (`--dur-aba-fechar`, a curva de saída) e volta dela em 220 ms; a resposta que chegou durante a apresentação diz "chegou às 09:21" por 1 minuto, e a de antes volta com o aviso de sempre.

O formulário fica no painel de sempre, no lugar das opções: o usuário, com a dica de sem o domínio, e a senha, ou o código do app, com o "Voltar ao usuário". A senha sai da tela depois de cada tentativa, a recusa é escrita (`role="alert"`) e o foco vai ao campo que falta. O "Entrar" fica desligado até o `esperaAte` e volta sozinho.

A janela do e2e passou a 440×560, a do painel mais alto com a sombra (sem conexão, com a resposta e o "Sair": 372×506), e as referências foram gravadas de novo, com a sobra embaixo e nada mais. A janela do lado nativo (tarefa 5.8) tem essa medida.

A janela da aba no lado nativo (tarefa 5.8) tem o tamanho fixo do painel mais alto, 440×560 px lógicos, e não muda entre a aba fechada e o painel: o movimento não espera o Windows, e fora da forma o clique passa. O lado nativo:
- **o clique:** a cada 16 ms, o `GetCursorPos` leva o ponteiro aos px CSS da janela, e o `set_ignore_cursor_events` só é chamado quando o ponteiro entra ou sai da forma. A origem e a escala de cada janela ficam guardadas nos eventos de lugar e de tamanho, sem perguntar ao laço do Tauri a cada passo. Até a forma chegar, todo clique passa, como na forma vazia da apresentação;
- **a posição:** o `primary_monitor` do Tauri dá o monitor principal em px físicos, com a escala dele, e a janela fica presa ao alto e no meio. O `WM_DISPLAYCHANGE` chega por um subclass da janela (`SetWindowSubclass`), porque o Tauri não o passa adiante, e o `WM_DPICHANGED` chega como o `ScaleFactorChanged`. As trocas em rajada viram uma recolocação, 250 ms depois, e a tela nova vai no `aparencia-mudou`;
- **ao abrir:** a janela aparece pelo Tauri, que liga também o WebView2, e a frente volta a quem estava nela. O `ShowWindow` sem ativar deixava o WebView2 desligado, sem a aba e sem a forma.

A tela maior é a segunda janela, `maior`, criada no `abrir_tela_maior` e destruída no `fechar_tela_maior`; os dois comandos são assíncronos, porque criar uma janela num comando síncrono trava no Windows. Ela tem 760×560 px lógicos, com a folga da sombra, e fica no meio, 160 px abaixo do topo da aba, por cima da parte de baixo do painel, como o m08; numa tela que não a cabe, ela fica menor. O `informar_corpo` só guarda o lugar do chat, para a tarefa 5.15. As capabilities da tela passam a valer também para a moldura. A aparência é a de fábrica, com a tela principal de agora: o tema, o movimento e a apresentação entram na 5.9, e a forma e o contato da configuração, na 5.14.

No `tauri dev`, numa tela de 1920×1080:
- com o ponteiro longe, o `WindowFromPoint` no meio da aba e ao lado dela dá a janela de baixo;
- com o ponteiro na aba, dá a aba, e ao sair dela volta à de baixo;
- o clique abre o painel, "Abrir chamado" abre a tela maior em 580,168, e o Esc a fecha.

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
  - o gancho do escopo lê com os dois alcances e decide pela rota: na que não tem o `chatDaAba`, a de entrada trata a sessão do chat na aba como sem sessão, e as outras recebem o 403;
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

Na API (tarefa 3.10), o gancho do escopo lê a sessão com os dois alcances e decide pela rota: fora da lista, a de entrada a trata como sem sessão (o `POST /sessao` segue abrindo a entrada), e as outras recebem o 403. As rotas de `/chat/` entram na lista sozinhas, no registro, e as outras declaram o `chatDaAba`: o `GET /sessao`, o `GET /eventos` e as duas fotos no `GET`. A lista juntada no registro (`ROTAS_DO_CHAT_DA_ABA`) é a que o teste fixa. Os tipos da conexão do chat na aba são os que o chat relê, os do que o `/api/sessao` traz (as preferências e os padrões) e o fim da sessão. O `GET /pessoas/nomes` do "No nome de" fica fora: só a TI o usa, e o chat o trata como o pedido que falhou.

Na API (tarefa 3.11), o `POST /api/aba/bilhete` leva o destino fechado (`{ destino: 'chat' }` ou `{ destino: 'chamado', numero }`), e a troca devolve o estado da sessão com o mesmo destino. A troca marca o bilhete como usado antes de conferir o resto, e a sessão da aba que já não vale, o aparelho bloqueado e a conta inativa recebem a mesma recusa do usado (`bilhete-recusado`). Na entrada pela senha, a sessão do chat na aba leva o código da sessão da aba: a conta com os dois passos só a tem depois do código, e ativá-los depois a encerra. A recusa do bilhete à conta com os dois passos (`bilhete-pede-a-entrada`) leva o identificador curto do computador, que é a marca da página de entrada do chat. A marca sem a sessão da aba da conta naquele computador recebe o 403 `sem-sessao-da-aba`, com a recusa na auditoria, sem contar no bloqueio. O `POST /sessao/segundo-passo` entra na lista do alcance, para a pendente do chat na aba chegar ao código. O `naAba` deixou de ser opcional no `estadoDaSessao`.

Com a entrada pelo Windows, a conta que exige ou tem os dois passos não recebe o bilhete. O webview mostra a entrada do chat, com a senha e o código. A página de entrada do chat aberta pela aba leva a marca da aba (`/chat/entrar?aba=<id curto do aparelho>`), e a sessão que sai dali nasce com o alcance `chat-da-aba`, ligada à sessão da aba da mesma conta e do mesmo aparelho. Sem essa sessão da aba, a entrada é recusada. Falsificar a marca só reduz o alcance.

Na web (tarefa 4.1), a página do chat lê o `/chat/entrar` antes de montar o roteador: com o fragmento, tira o bilhete do endereço, troca-o e só então monta, já no destino; com `?aba=`, a entrada manda a marca. A marca do bilhete pedido de novo fica no `sessionStorage`, que a página carregada pela aba mantém. A sessão do chat na aba que termina navega para `/chat/entrar`; a que nunca valeu nesta página, não. O Esc é conferido depois do despacho inteiro, porque a seleção das mensagens o ouve na janela e liga o ouvinte depois. No `naAba` somem, além do "Andamento": os Avisos (a vista e o endereço, que leva ao começo do chat), as notificações, que nem são lidas, o menu da conta, cujo tema grava na conta e cujo "Sair" encerra a sessão, ambos fora do alcance, e o "Abrir a ficha" do ativo. A página aberta pela aba não registra o service worker, e a recarregada só o registra fora da sessão da aba. Na pendente do chat na aba, a senha temporária e a ativação dos dois passos dão lugar a "Abrir o Grafite no navegador" (`/conta`), e o "Sair" do passo do código navega para `/chat/fechar-a-aba`: a pendente vence sozinha.

### 9. Os tokens da aba

As cores da aba dos chamados (`aba.*` em `gerador.ts`) já existem, e a aba do Windows reaproveita a matiz e o croma delas para o azul de fábrica e o âmbar fixo. O que é novo entra no grupo `abaFlutuante.*`:
- o fio claro e o segundo tom do ícone;
- o neutro do sem conexão;
- a sombra e o fio escuro por fora.

A aba do Windows não segue os temas do Grafite: ela segue o tema do Windows, que é outro eixo. O `tokens:contraste` ganha uma tabela própria, com os pares da aba nos três temas do Windows (escuro, claro e alto contraste, este com as cores do sistema de referência), fora das 24 combinações.

As durações entram no `movimento` (`escalas.ts`) como `aba.abrir`, `aba.cascata`, `aba.fechar`, `aba.entalhe` e `aba.ponto`. A exceção dos 340 ms entra na lista nomeada do `docs/ANTISLOP.md`.

No `packages/ui` (tarefa 5.2), as cores são o `--cor-aba-flutuante-*` (`gerarAbaFlutuante`, em `gerador.ts`). Além das da lista, entram as peças que o mockup pinta e que o alto contraste troca: a opção sob o mouse, a opção larga e o texto dela, o texto do indisponível, o anel do foco e o anel do mouse em cima. O fio claro vale nos dois temas do Windows, e do escuro para o claro mudam só o fio escuro por fora, a sombra e o anel do mouse. No alto contraste:
- o fundo é o `Canvas`, e o texto e o fio são o `CanvasText`;
- a opção larga e o aviso são a seleção (`Highlight` e `HighlightText`);
- o indisponível é o `GrayText`;
- o foco é o `LinkText`, o amarelo do Alto Contraste Preto do mockup;
- não há sombra nem anel.

A parte nativa põe o tema no `data-windows-theme` do `<html>` (`claro` ou `alto-contraste`; sem ele, o escuro); sem o atributo, valem o `prefers-color-scheme` e o `forced-colors`. Para a soma dos 340 ms ficar nos tokens, o `movimento.aba` traz também a `entrada` de cada peça (140 ms), o `inicioDoLogo` (60 ms) e o `inicioDaCascata` (120 ms). Com o movimento reduzido, as durações valem 1 ms, os começos e a cascata 0 ms, e o ponto para. A tabela do `tokens:contraste` mede a área no fundo das janelas do Windows 11 (`#202020` e `#f3f3f3`) e o alto contraste nas cores do Alto Contraste Preto.

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

O MSI que o job guarda como artefato se chama `Grafite-Aba.msi`, sem a versão nem a arquitetura do nome de fábrica do Tauri, porque é o nome do exemplo que o `grafite aba chave` mostra e o do runbook. A release o leva com esse nome quando ele entrar nela.

O job `aba` do `ci.yml`, no `windows-2022`:
- `cargo fmt --check`, `cargo clippy -D warnings` e `cargo test`;
- `tauri build`;
- a conferência de que o MSI não leva endereço, chave nem token;
- o upload do MSI como artefato;
- o cache do Cargo pela `actions/cache`.

### 13. O diretório de desenvolvimento

O `pnpm dev`, no Windows, lê o SID e o usuário de quem roda (`whoami /user`) e liga na organização de desenvolvimento um diretório simulado. Ele usa o mesmo `conectarDiretorio` falso dos testes, movido para um módulo (`diretorio/simulado.ts`) que a API só carrega, por import dinâmico, com `GRAFITE_DIRETORIO_DE_DESENVOLVIMENTO=1`. Duas travas recusam o diretório simulado fora do desenvolvimento:
- a validação da configuração recusa a variável em qualquer ambiente que não seja o de desenvolvimento: na produção e também no `teste`, que tem a cópia das contas da produção;
- a organização com algum endereço que não é local, ou sem endereço, recebe o AD fora do ar. Essa recusa não cabe na validação da configuração, que não lê o banco: ela é conferida onde o diretório simulado atende, por organização, antes de cada pedido.

Só o servidor marcado `ldap://diretorio.localhost` cai no diretório simulado. Os outros seguem para o cliente de verdade (o ldapts), para quem desenvolve contra um AD de verdade.

O diretório simulado tem:
- o usuário de quem desenvolve, num grupo mapeado ao grupo "Colaboradores" do Grafite, com o perfil "Colaborador da aba", e sem os dois passos. O perfil tem o chat e o pedido de chamados (`chat.usar` e `chamados.pedir`), como o dos colaboradores da chat-com-chamados, para quem desenvolve abrir um chamado pela aba e ver o aviso e o painel com resposta. O `pnpm dev` garante cada peça por si, pelo nome: o perfil (acrescentando as permissões que faltam), o grupo e a atribuição em vigor entre os dois, e o mapeamento;
- a senha `aba123`, que só ele aceita, para a entrada pela senha.

O diretório que a organização de desenvolvimento já tem:
- ligado, com outro servidor, fica como está, e o terminal diz que o simulado ficou desligado;
- desligado, dá lugar ao simulado, porque só cabe um diretório por organização, e o terminal diz "O diretório desligado <servidor> deu lugar ao simulado.". A base, o filtro e a AC do anterior se perdem; os mapeamentos e o segredo da conta de serviço anterior ficam;
- o simulado desligado na tela volta a ligar, como a senha do `admin`, que o comando garante a cada execução.

Fora do Windows, sem o `whoami`, não há quem atender: o `pnpm dev` grava só a chave da aba, e o diretório fica como está. O usuário do Windows que não serve de usuário do Grafite (com espaço ou acento, como o de um computador do Entra) e o de uma conta local que já existe na organização ficam com a entrada local: o terminal diz o motivo, em vez da frase de como a aba entra.

O `.env` ganha também a chave da aba de desenvolvimento, gerada uma vez, gravada pelo mesmo caminho do `grafite aba chave`, com a auditoria. A variável do diretório simulado só entra no `.env` do ambiente de desenvolvimento. O `.env` de outro ambiente ganha a chave, mas ela não é gravada na organização: quem a grava é o mesmo passo do diretório simulado, que só roda com a variável.

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
- **Pilha:** a aba simulada pelas rotas: o aparelho, a pessoa do AD falso, o bilhete e o chat da aba com a sessão dele. O AD falso da pilha não é o diretório de desenvolvimento: a pilha sobe a API em `producao`, onde a variável é recusada, e o CI é Linux, sem o `whoami`. Ele é um servidor LDAP em processo, como o SMTP e o push falsos da pilha.

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

- As migrations criam as tabelas da aba e a tabela `aberturas_dos_chamados`, as colunas `alcance` e `sessao_da_aba_id` (`sessoes`) e as partes da aba no público dos `eventos` (`sessoes_da_aba`, `aparelhos_da_aba` e `abas`), com os valores de hoje como padrão. Nada mais muda nas que existem.
- A aba só aparece onde o Intune a instala, e sem a chave criada nenhuma aba conecta.
- As `aberturas_dos_chamados` nascem vazias: no primeiro dia, a resposta nova que a pessoa já leu pela web, sem responder nem marcar como vista, aparece na aba como resposta por ver. Fica assim, e o runbook diz: é resposta que segue sem resposta dela.
- **Depois de restaurar um backup do servidor,** os aparelhos registrados depois dele ficam com "Este computador precisa ser registrado de novo." A TI repõe a chave pelo script do Intune do runbook.
- **Mudar o endereço do servidor** é reinstalar o MSI com o `GRAFITE_SERVIDOR` novo.
- **Para voltar atrás,** desinstalar o MSI pelo Intune e trocar a chave.

## Open Questions

- A VM Windows de testes precisa estar no domínio, com uma conta do AD de teste, para conferir a entrada pelo Windows e o SID no filtro. Se ela não estiver, a conferência fica com o AD falso, e a do domínio fica para a produção-teste.
