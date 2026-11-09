## 1. Os executores próprios

- [x] 1.1 Depois da release 0.1.10 (run 42546191702), tirar os executores (design, decisão 9):
  - no GitHub, os quatro, pela API;
  - no PC, as três instâncias, com o `config.cmd remove`, e as pastas delas.

  Verificar:
  - a API dos executores do repositório anterior não lista nenhum;
  - `Get-Service actions.runner.*` não acha nenhum serviço;
  - as pastas `C:\actions-runner*` não existem.

## 2. O CI nos executores do GitHub

- [x] 2.1 Escrever primeiro o teste-guarda dos workflows (`scripts/ci/executores.test.ts`). Ele reprova um `runs-on` com executor próprio e um fora das imagens fixadas (decisão 1). Verificar: ele reprova nos workflows de hoje, apontando cada job.
- [x] 2.2 A ação de preparo em bash, sem o cache da máquina, e o `ci.yml` no `ubuntu-24.04` (decisões 2 a 5):
  - o Chromium com as dependências do sistema;
  - o banco de teste pelo Docker;
  - o gitleaks `v8.30.1` em `$GITHUB_WORKSPACE`.

  Verificar:
  - o caso do `ci.yml` no teste-guarda passa;
  - o `pnpm lint` passa;
  - o `pnpm test` passa, fora o caso do `versao.yml` no teste-guarda, que a 2.3 resolve.
- [x] 2.3 O `versao.yml` com um job por plataforma (decisão 6):
  - o rascunho da release na tag e no ensaio;
  - o envio dos arquivos de cada plataforma só depois da instalação de teste dela;
  - a publicação;
  - o descarte do rascunho pelo id numa falha.

  Verificar: o teste-guarda passa em todos os workflows.
- [x] 2.4 A instalação de teste no Windows numa máquina nova (decisão 7):
  - o Node da imagem desinstalado;
  - o IIS parado;
  - o choco com nova tentativa;
  - sem a limpeza;
  - a senha temporária como `<oculta>`;
  - o diagnóstico de rede só com as portas locais.

  Verificar: no PR, o job do Windows instala do zero e confere a saúde, o backup, a atualização e a volta.
- [x] 2.5 A instalação de teste no Linux no `ubuntu-24.04` (decisão 8): o `$RUNNER_TEMP` no lugar do `cygpath` e o `docker build --pull`. Verificar: no PR, o job do Linux instala do zero e confere a saúde, o backup, a atualização e a volta.
- [x] 2.6 O teste-guarda da sintaxe dos passos em PowerShell (`scripts/ci/powershell.test.ts`, decisão 11). Começar pelos casos do `$LASTEXITCODE:` e do `??` num passo do 5.1. Verificar: o teste reprova os dois casos e passa nos workflows de hoje.

## 3. A validação nos executores do GitHub

- [x] 3.1 Abrir o PR do `dev` para a `main` e consertar até o CI e o `versao.yml` ficarem verdes nos executores do GitHub. Verificar: o run do PR mostra cada job no `ubuntu-24.04` ou no `windows-2022`, e todos verdes. (PR #75, cabeça `aba47cdc`: os sete jobs do CI e os dois de plataforma verdes, o do Windows em 19 min no `windows-2022`.)
- [x] 3.2 O ensaio da release pelo `workflow_dispatch` na branch do PR (`gh workflow run versao.yml --ref dev -f versao=<a versão da API>`) e, depois, o ensaio apagado.
  - **Primeiro ensaio** (run 42570205966): o download do WinSW respondeu 504 no job do Windows. O rascunho foi descartado pelo id, sem sobrar, e o `curl` ganhou as novas tentativas (PR #76).
  - **Segundo ensaio** (run 42571360059): a pré-release "Ensaio 0.1.10 (113)" saiu com os seis arquivos e foi apagada depois, junto com a tag.

  Verificar: a pré-release "Ensaio" sai com os seis arquivos:
  - o zip, o `.sha256` dele e o `Instalar-Grafite.cmd`;
  - o tar, o `.sha256` dele e o `instalar.sh`.

  Nenhum rascunho fica para trás.

## 4. Fechamento

- [x] 4.1 Tirar do repositório:
  - o `registrar-executor.ps1` e o `limpar-a-instalacao.ps1`;
  - a seção "Executor do CI numa VM" do runbook;
  - a espera do `pnpm dev` pela instalação de teste do CI na mesma máquina, que apontava para o `limpar-a-instalacao.ps1`.

  Atualizar:
  - a seção 12.2 da spec mestre;
  - o CLAUDE.md;
  - o mapa, com a change em andamento.

  Verificar: o teste-guarda do mapa passa, e `git grep -n self-hosted` só acha, fora das changes, os casos que o teste-guarda dos workflows recusa.
- [x] 4.2 Arquivar a `ci-sem-docker` como substituída, com as tarefas 2.2 e 3.2 dela marcadas como não aplicáveis e o motivo no `tasks.md` (decisão 10). Verificar: o `openspec list` não a mostra mais, e o mapa a traz no arquivo.
- [x] 4.3 Conferir as verificações e o PR:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `openspec validate ci-nos-executores-do-github --strict`.

  Verificar: os comandos passam, e o PR fica com todos os jobs verdes. (Na `main` do merge do PR #75, os quatro passam, com os 10 pacotes e os 76 testes de `scripts/`. O PR #75 entrou com os nove jobs verdes, e o #76 traz o fim da change.)
