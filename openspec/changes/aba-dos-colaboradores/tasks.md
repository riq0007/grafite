Vale o modo rápido do `docs/agentes.md` até a `chamados-da-ti` ir para a produção-teste:
- **O "Começa pelos testes…"** fica só onde a tela não mostra o erro: a permissão, que aqui é quem entra pela aba (o aparelho, a pessoa, a sessão, o bilhete, o alcance e qual evento chega a qual aba).
- **O "Verificar"** fica com:
  - os testes da tarefa, o lint e o typecheck;
  - na tarefa com tela, a tela da aba no navegador, com o lado nativo simulado, contra os mockups `r3-18-aba-flutuante`.

  As suítes inteiras rodam no CI do PR rascunho `dev` → `main`, aberto com o primeiro commit de tarefa.
- **A rota nova** entra no OpenAPI na mesma tarefa, com o `pnpm contrato:verificar`.
- **A revisora** lê o diff do commit, depois dele.
- **Os casos raros** vão para `.grafite/revisoes/aba-dos-colaboradores-pendencias.md`.
- **O mesmo commit** acerta as pontas a ponta e as referências da regressão visual que a tarefa muda.

## 1. Banco

- [x] 1.1 As tabelas da aba (design, decisão 3):
  - a migration, com `chaves_da_aba`, `configuracoes_da_aba`, `aparelhos_da_aba`, `sessoes_da_aba` e `bilhetes_da_aba`, todas com `orgScoped()`, RLS forçado e os hashes únicos;
  - a tabela `aberturas_dos_chamados`, e o `alcance` e o `sessao_da_aba_id` nas `sessoes`, com o padrão de hoje;
  - o teto de contas por dia nos `aparelhos_da_aba`;
  - o `schema.ts`;
  - os testes de que uma organização não vê o aparelho da outra, de que a organização tem só uma chave ativa e de que o identificador da máquina não se repete na organização.

  Verificar: esses testes, o teste da migration, o teste-guarda do RLS, o lint e o typecheck.

## 2. Domínio

- [x] 2.1 O estado que a aba mostra (os requisitos "Aba fechada", "Aviso da resposta nova" e "Aba durante uma apresentação"):
  - a forma e o tamanho pela configuração e pela largura da tela;
  - o aviso, com "1 resposta nova · Ana Souza", o corte e "3 respostas novas";
  - o "chegou às" por 1 minuto, com uma e com várias;
  - o sem conexão, com o motivo.

  Verificar: os testes unitários, o lint e o typecheck.
- [x] 2.2 A resposta por ver (decisão 5) e o público dos eventos com as sessões da aba e o aparelho (decisão 6), no `packages/domain`.

  Começa pelos testes unitários. Verificar: esses testes, o lint e o typecheck.

## 3. API

- [x] 3.1 O diretório de desenvolvimento (decisão 13):
  - o AD falso num módulo próprio, que os testes e o `pnpm dev` usam;
  - a `GRAFITE_DIRETORIO_DE_DESENVOLVIMENTO`, recusada na validação da configuração fora do ambiente de desenvolvimento e, por organização, onde o diretório simulado atende, na organização com endereço de verdade;
  - o `dev.ts`, com o SID e o usuário de quem roda, o grupo mapeado, a senha `aba123` e a chave da aba de desenvolvimento no `.env`.

  Começa pelos testes da recusa. Verificar: esses testes e o `pnpm dev`, com a organização ligada ao diretório simulado.
- [x] 3.2 O comando `grafite aba` (decisão 11):
  - `chave criar|trocar`, com o exemplo das propriedades;
  - `configurar`, `entrada`, `teto`, `aparelhos`, `bloquear` e `desbloquear`, pelo nome ou pelo identificador curto;
  - a auditoria do comando;
  - o repasse no `grafite.ps1` e no lançador do Linux.

  Verificar: os testes do comando com o PostgreSQL, o lint e o typecheck.
- [x] 3.3 O registro e a configuração do aparelho (`POST /api/aba/aparelho` e `GET /api/aba/configuracao`):
  - a chave, o token e o re-registro, com a entrada e o bloqueio mantidos;
  - o bloqueio no registro e no contato;
  - a entrada do aparelho, que recusa o pedido pela outra entrada;
  - o token recusado;
  - o re-registro com outro nome na auditoria;
  - o limite por token.

  Começa pelos testes de integração. Verificar: esses testes, o contrato, o lint e o typecheck.
- [ ] 3.4 A pessoa pelo SID (decisão 4):
  - o `objectSid` binário no `ldap.ts`, com o texto `S-1-5-…`;
  - o `buscarPeloSid` e o AD falso com ele;
  - a conferência do `diretorio/aba.ts`, com as seis recusas e as frases.

  Começa pelos testes de integração e pelo `ldap.test.ts`. Verificar: esses testes, o lint e o typecheck.
- [ ] 3.5 A sessão da aba pelo Windows (`POST /api/aba/sessao` e o escopo da aba):
  - o token de 1 h;
  - o `renovar`, que estende a mesma sessão e confere a pessoa de novo;
  - o teto do aparelho;
  - o token só nas rotas da aba, e o cookie fora delas.

  Começa pelos testes de integração. Verificar: esses testes, o contrato, o lint e o typecheck.
- [ ] 3.6 A sessão da aba pela senha (decisão 2):
  - a conferência da entrada extraída do `rotas/sessao.ts`, chamada dos dois lugares;
  - o bloqueio por tentativas, a pendente de 5 minutos com o código e as tentativas dele;
  - a recusa de quem exige os dois passos sem os ter;
  - o `DELETE /api/aba/sessao`, o `POST /api/aba/uso` e os 30 minutos contados no servidor.

  Começa pelos testes de integração. Verificar: esses testes, os da entrada de hoje, o contrato, o lint e o typecheck.
- [ ] 3.7 Os fins da sessão da aba e a lista:
  - os seis encerramentos da conta, o "Encerrar as outras", o bloqueio e a troca da entrada do aparelho pelo `grafite aba`, no `encerramento.ts`, com o fim em até 30 s;
  - a sessão da aba na lista das sessões do usuário, como "Aba · PC-FIN-09", com a frase do bloqueio;
  - a tela das sessões na web.

  Começa pelos testes de integração. Verificar: esses testes, o contrato e a tela das sessões no `pnpm dev`.
- [ ] 3.8 O estado e os eventos (decisão 6):
  - o `GET /api/aba/estado`;
  - o `GET /api/aba/eventos`, com os tipos, o sinal de 10 s e o fim da sessão;
  - os eventos da configuração, da entrada e do bloqueio, com a marca dos que vão a muita gente;
  - o `PublicoDoEvento` com as sessões da aba e o aparelho.

  Começa pelos testes de qual evento chega a qual aba. Verificar: esses testes, o contrato, o lint e o typecheck.
- [ ] 3.9 A resposta por ver na API: a gravação da abertura (`POST /api/chat/chamados/:numero/aberta`), o evento à pessoa e as respostas por ver no estado da aba.

  Verificar: os testes de integração, o contrato, o lint e o typecheck.
- [ ] 3.10 O alcance `chat-da-aba` (decisão 8):
  - o `lerSessao` com os alcances aceitos, nos três chamadores, e a sessão da aba ligada conferida ao vivo;
  - o `chatDaAba` nas rotas da lista, fixada num teste;
  - o 403 `fora-do-alcance-da-aba`;
  - os eventos filtrados pelos tipos do chat;
  - o `naAba` no `/api/sessao`.

  Começa pelos testes de integração, com a linha posta à mão: a casca e a ponte dos painéis recusam, e a conexão de eventos segue depois de mais de uma conferência. Verificar: esses testes, o contrato, o lint e o typecheck.
- [ ] 3.11 O bilhete:
  - o `POST /api/aba/bilhete`, com o destino fechado e a recusa da conta com os dois passos na entrada pelo Windows;
  - o `POST /api/sessao/bilhete`, com o uso único, os 60 s, a mesma resposta para o usado, o vencido e o desconhecido, a pendência calculada de novo e o `LIMITE_DA_ENTRADA`;
  - a entrada do chat com a marca da aba, que nasce no alcance;
  - a auditoria;
  - a limpeza dos bilhetes vencidos há mais de 24 horas, na manutenção diária.

  Começa pelos testes de integração. Verificar: esses testes, o contrato, o lint e o typecheck.

## 4. Web

- [ ] 4.1 O chat na aba:
  - a entrada pelo bilhete em `/chat/entrar`, com a troca, o endereço limpo e o destino;
  - o `naAba`, sem o que leva à casca, o "Andamento", a instalação e o push;
  - o 401 que navega para `/chat/entrar` sem o fragmento, o 403 do alcance tratado como o pedido que falhou e o Esc não consumido que navega para `/chat/fechar-a-aba`.

  Verificar: o e2e da web simulada, com os pedidos que saem do app do chat todos dentro da lista do alcance, o caso da PWA com o service worker, o lint e o typecheck.
- [ ] 4.2 A abertura do chamado gravada pelo chat, na conversa que aparece e na mensagem que chega com ela à vista e com o foco.

  Verificar: o e2e da web simulada e a tela no `pnpm dev`.

## 5. Aba

- [ ] 5.1 O esqueleto do `apps/aba`:
  - o Tauri 2, com a tela em React e Vite e o workspace Cargo com a aba e o serviço;
  - os scripts `dev`, `build`, `lint` e `test`, e o `apps/aba` no verificador de cores;
  - o projeto do e2e em `apps/aba/e2e`, no `pnpm test:e2e`;
  - a verificação do repositório sem o Rust;
  - a estrutura no `CLAUDE.md`.

  Verificar: `cargo test`, `pnpm --filter @grafite/aba build`, o e2e vazio e a janela abrindo no `tauri dev`.
- [ ] 5.2 Os tokens da aba (decisão 9) no `packages/ui`:
  - o `abaFlutuante.*`, que reaproveita o azul e o âmbar;
  - as durações da aba no `movimento`;
  - a tabela dos três temas do Windows no `tokens:contraste`.

  Verificar: `pnpm tokens:verificar`, `pnpm tokens:contraste` e o lint.
- [ ] 5.3 A aba fechada, na tela:
  - a pílula e o entalhe;
  - os quatro estados, o tamanho no 1366 e os três temas;
  - a forma informada ao lado nativo.

  Verificar: o e2e, as referências visuais, a tela contra o m01, o m03, o m07 e o m12, o lint e o typecheck.
- [ ] 5.4 O painel e o teclado: o painel 2+1, com o logo, os números e o "Sair" da entrada pela senha; as setas, o Enter e o Esc dentro dele.

  Verificar: o e2e, as referências visuais e a tela contra o m01 e o m08.
- [ ] 5.5 O aviso e o movimento:
  - a linha da resposta e o aviso, com o ponto de 1.400 ms (decisão 7), o corte e as larguras;
  - o abrir, a cascata e o fechar, com o reduzir movimento.

  Verificar: o e2e, as referências visuais e a tela contra o m02, o m04, o m05 e o m06.
- [ ] 5.6 A tela maior: a moldura, com a trilha e o "Esc volta", e a frase das duas opções que ainda não têm conteúdo, com "Abrir no chat".

  Verificar: o e2e e a tela contra o m08.
- [ ] 5.7 O sem conexão, a apresentação e a entrada pela senha, na tela:
  - o tom neutro, o motivo e o contato de reserva;
  - a linha de 96×4 e o "chegou às";
  - o formulário do usuário, da senha e do código.

  Verificar: o e2e e a tela contra o m09 e o m10.
- [ ] 5.8 A janela no lado nativo (decisão 7): transparente, por cima e fora da barra de tarefas; o clique que passa fora da forma; a posição no monitor principal com a escala e a troca dela.

  Verificar: os testes do Rust e a aba no `tauri dev`, com o clique ao lado dela chegando à janela de baixo.
- [ ] 5.9 O foco, a instância única, o tema, a apresentação e o atalho no lado nativo:
  - a janela da frente devolvida no Esc, e a perda do foco fechando o painel;
  - o tema, o alto contraste e o reduzir movimento, com a mudança ao vivo;
  - o `SHQueryUserNotificationState` e o Ctrl+Alt+T.

  Verificar: os testes do Rust e, no `tauri dev`, o tema trocado ao vivo e um vídeo em tela cheia encolhendo a aba.
- [ ] 5.10 O pipe do serviço (decisão 1): o servidor com a DACL e as flags, a aba que confere o processo do serviço, e quem chama pelo `ImpersonateNamedPipeClient`.

  Começa pelos testes do Rust, com o servidor falso recusado. Verificar: esses testes e o `clippy`.
- [ ] 5.11 O serviço do Windows:
  - o token do aparelho cifrado no `%ProgramData%`, com a permissão só do sistema e dos administradores;
  - a chave lida do `HKLM` sempre que aparece, com o registro, e apagada depois;
  - a configuração guardada para todas as pessoas;
  - os logs sem segredo.

  Verificar: os testes do Rust e o serviço instalado à mão neste computador, registrando o aparelho no `pnpm dev`.
- [ ] 5.12 A sessão pelo Windows entregue à aba: o pedido pelo pipe, a renovação de hora em hora e o token da pessoa cifrado pelo DPAPI dela.

  Verificar: os testes do Rust e a aba no `tauri dev` contra o `pnpm dev`, com a entrada pelo Windows.
- [ ] 5.13 A sessão pela senha entregue à aba:
  - o usuário, a senha e o código pelo pipe;
  - o token só na memória;
  - o uso informado;
  - os quatro fins: o "Sair", a tela bloqueada, a saída do Windows e os 30 minutos;
  - os dados do chat limpos ao terminar e ao abrir.

  Verificar: os testes do Rust e, com a entrada trocada pelo comando, a aba no `tauri dev` com a senha `aba123`: o "Sair" encerra a sessão no servidor.
- [ ] 5.14 A rede e o estado (decisão 10):
  - o `reqwest` com o schannel e os dois proxies;
  - os comandos da tela;
  - os eventos passados à tela, com o atraso sorteado só nos de muita gente, a releitura a cada 60 s e o sem conexão em 30 s;
  - a configuração conferida a cada 60 s sem sessão.

  Verificar: a aba no `tauri dev` contra o `pnpm dev`: a resposta no chamado chega à aba, e a API parada a deixa sem conexão.
- [ ] 5.15 O chat na tela maior (decisão 8):
  - o webview remoto sem permissão do Tauri, só em `/chat`, com o resto no navegador;
  - criado ao abrir e destruído ao fechar;
  - os dois endereços do canal (`/chat/entrar` sem o fragmento e `/chat/fechar-a-aba`), com o teste do Rust do `on_navigation`;
  - o bilhete pedido quando a sessão falta;
  - a linha da resposta abrindo o chamado, também com o chat já aberto.

  Verificar: no `tauri dev` contra o `pnpm dev`:
  - "Abrir chat" abre o chat com a sessão;
  - um link de fora abre no navegador;
  - com a conversa aberta, o Esc e uma resposta nova fazem a aba avisar.

## 6. Pacote

- [ ] 6.1 O MSI (decisão 12):
  - o fragmento do WiX, com o serviço, as três propriedades no `HKLM` (a chave `Hidden`) e o `Run`;
  - o WebView2 embutido;
  - a desinstalação de verdade, que limpa o `%ProgramData%` e o `HKLM`, e a troca de versão, que não limpa.

  Verificar: `pnpm --filter @grafite/aba build` gera o MSI. Neste computador:
  - a instalação com as propriedades conecta ao `pnpm dev`;
  - a instalação por cima, com a aba aberta: o aparelho segue com o mesmo identificador, sem precisar da chave;
  - a desinstalação, sem sobra fora do `%LOCALAPPDATA%` de cada pessoa.
- [ ] 6.2 O job `aba` do CI no `windows-2022`: o fmt, o clippy, os testes do Rust, os exemplos do cliente em Rust contra o OpenAPI gerado, o MSI como artefato, com o nome `Grafite-Aba.msi`, e a conferência de que ele não leva endereço, chave nem token. Ele passa no teste-guarda dos executores.

  Verificar: o job verde no PR rascunho e `scripts/ci/executores.test.ts`.

## 7. Fechamento

- [ ] 7.1 A documentação:
  - a linha do S8 e a exceção da seção 2.4 na spec mestre;
  - a exceção dos 340 ms no `docs/ANTISLOP.md`;
  - o runbook:
    - o MSI pelo Intune, as propriedades e a entrada por computador;
    - o comando `grafite aba`, o bloqueio e a troca da chave depois de cada onda de instalação, com onde o Intune guarda a linha de comando, e o `aba` no `COM_ACAO` e na lista dos comandos da ajuda do `apps/operacao/src/runbook.test.ts`, com o `aba chave` de três palavras;
    - o script do Intune que repõe a chave depois de restaurar um backup;
    - o sysprep das imagens, com a imagem tirada antes de a aba registrar, porque a clonada depois leva o mesmo token, o proxy sem PAC, os logs e a mudança do endereço;
    - o teto por aparelho e os downloads que ficam no perfil genérico;
    - o primeiro dia da resposta por ver, com as respostas já lidas pela web que aparecem na aba;
  - o `docs/mapa.md`, com a capacidade, a change e os termos novos;
  - os comandos no `CLAUDE.md`.

  Verificar: `openspec validate --strict` e a leitura do runbook.
- [ ] 7.2 A pilha (`e2e-pilha/caminho.spec.ts`): a aba simulada pelas rotas, com o aparelho, a pessoa do AD falso, o bilhete e o chat da aba com a sessão dele. A casca recusa essa sessão.

  Verificar: `pnpm test:e2e:pilha`.
- [ ] 7.3 A conferência numa VM Windows de testes:
  - o MSI instalado com as propriedades;
  - a entrada pelo Windows com a conta de teste do AD e o SID no filtro;
  - o usuário local;
  - a entrada pela senha com duas pessoas no mesmo computador;
  - a resposta chegando;
  - a volta da suspensão;
  - o bloqueio;
  - a desinstalação.

  O que a VM não alcançar vai para as pendências.

  Verificar: o roteiro com as fotos em `.grafite/revisoes/aba-dos-colaboradores/vm/`.
