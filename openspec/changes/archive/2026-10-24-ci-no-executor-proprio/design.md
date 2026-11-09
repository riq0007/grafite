## Context

O motivo está em `proposal.md`. O ponto de partida:

- **Os workflows do GitHub:**
  - o `ci.yml` tem seis jobs no `ubuntu-latest`, preparados pela ação `.github/actions/preparar` (Node 24, o pnpm pelo corepack e o `pnpm install --frozen-lockfile`);
  - o `versao.yml`, num PR que muda a operação e na tag, monta o pacote e o instala num Windows de verdade no `windows-latest`, e na tag publica a release no `ubuntu-latest`.
- **Os executores próprios registrados no repositório** são dois Windows (`self-hosted, Windows, X64`):
  - o PC-DEV é a estação de trabalho do desenvolvimento, onde o executor roda como serviço com a conta do usuário. Ela tem o Docker Desktop, o Git para Windows, o Chocolatey e o `gh`, mas não o PowerShell 7, e o `bash` do caminho do sistema é o do WSL;
  - o PC-TI não tem o Docker, e a rede dele troca os certificados das conexões (o setup-node recusa o "self-signed certificate in certificate chain"). Ele ficou desligado no começo da change e voltou a ficar online em 2026-10-14, quando todo job que caía nele reprovou no preparo.
- **A instalação de teste** usa as portas 80, 443, 3000, 3001, 3100, 5432 e 5433, e recusa uma segunda instalação na mesma raiz. O `pnpm dev` usa a 3000, a 3100 e a 5433.
- **O primeiro pipeline no GitLab** mostrou um teste que reprova na virada do minuto e o token fictício de um teste do P2a no histórico. A integração lá falhou por outro motivo, o Docker que não enxergava as pastas do job, e esse motivo não existe no executor próprio.

## Goals / Non-Goals

**Goals:**
- Os mesmos jobs, nomes e comandos de antes, rodando nos executores próprios sem mudar o código do projeto.
- Nenhum resto da instalação de teste na estação de trabalho depois do job, nem mesmo depois de uma execução interrompida.

**Non-Goals:**
- Instalar ferramentas nos executores pelo workflow, como o PowerShell 7: o job usa o que o Windows traz.
- Isolar os jobs em contêineres ou máquinas descartáveis.

## Decisions

### 1. Os jobs no executor preparado, pelo rótulo `instalacao`

Todo job pede `runs-on: [self-hosted, instalacao]`. O rótulo `instalacao` só o PC-DEV tem, e ele é o único executor com o Docker e sem a troca dos certificados. Os jobs entram na fila dele. O `concurrency` de cada workflow continua cancelando o pipeline antigo da mesma branch.

A change começou com `runs-on: self-hosted` em todos os jobs, porque qualquer um dos dois executores serviria. O PC-TI mostrou que não: com ele online, cada job que caía nele reprovava no "Docker no ar" ou no setup-node. O rótulo prende os jobs ao executor preparado até o PC-TI ter o Docker e o certificado da rede dele, ou sair do repositório.

**Alternativas:**
- Um rótulo novo só para os executores preparados: exige mudar a configuração dos executores no repositório, e o `instalacao` já distingue o PC-DEV.
- Tirar o PC-TI do repositório: apaga o registro de um executor que o usuário pode querer preparar.

### 2. O shell de cada passo

- **Git Bash à frente no caminho:** a ação de preparo põe `C:\Program Files\Git\bin` no `GITHUB_PATH`, por um passo `cmd`, antes de tudo. O `shell: bash` dos passos seguintes passa a achar o Git Bash, e não o `bash.exe` do WSL que vem antes no caminho do sistema. Os workflows declaram `defaults.run.shell: bash`.
- **Os passos da instalação** eram do PowerShell 7 e passam ao `shell: powershell`, o Windows PowerShell 5.1, sem os recursos que só o 7 tem:
  - o arquivo de respostas é gravado em UTF-8 sem BOM pelo `[IO.File]`, porque o `utf8NoBOM` do `Out-File` só existe no 7;
  - as chamadas web usam `-UseBasicParsing`;
  - as variáveis para os passos seguintes vão ao `GITHUB_ENV` sem BOM.
- **Comandos externos no PowerShell 5.1:** o executor roda cada passo com `$ErrorActionPreference = 'stop'`, e o 5.1 transforma em erro o que um programa escreve na saída de erro. Por isso os passos com programas externos começam com `$ErrorActionPreference = 'Continue'` e conferem o `$LASTEXITCODE` de cada programa.
- **O texto dos passos em UTF-8:** o executor grava o script de cada passo sem BOM, e o 5.1 o lê como ANSI, o que truncava os acentos das mensagens. O job da instalação usa um shell próprio, que lê o script como UTF-8, escreve em UTF-8, para no primeiro erro e sai com o código do último programa, como o `powershell` do executor.

### 3. Docker no ar antes de subir contêineres

Os jobs de integração, da pilha, da regressão visual e dos segredos começam com `docker info`. Sem o Docker, o passo falha dizendo "O Docker não está no ar neste executor: abra o Docker Desktop.", em vez de um erro do Testcontainers no meio dos testes.

### 4. A instalação de teste limpa o que instalou

Um script em `.github/scripts/limpar-a-instalacao.ps1` desfaz a instalação. Ele roda antes de instalar, para retomar depois de uma execução interrompida, e no fim do job, com `if: always()`. Ele mexe só no que o job criou: o job grava a pasta das marcas, `C:\Grafite-do-ci`, antes de instalar qualquer coisa, e sem ela o script não muda nada. Com ela:

| O quê | Como |
|---|---|
| Os serviços `grafite`, `grafite-teste`, `grafite-coletor`, `grafite-proxy` e `grafite-postgresql-teste` | parados e apagados, pelos nomes do layout da operação |
| O PostgreSQL 18 da produção | desinstalado pelo Chocolatey, com a pasta dele, só com a marca de que o job o instalou |
| `C:\Grafite` e o segundo destino do backup | apagados; o segundo destino só pela marca |
| As linhas de `grafite.localhost` e `grafite-teste.localhost` no `hosts` | tiradas, e só elas |
| A raiz confiável do proxy | tirada do repositório da máquina pela impressão digital gravada na marca |
| As regras "Grafite HTTP" e "Grafite HTTPS" do firewall | apagadas pelo nome |
| O banco do `pnpm dev`, quando o job o parou | religado pelo Docker, pela marca, depois que o PostgreSQL do teste saiu da 5433 |

Antes de instalar, o job confere:
- **as portas:** com 80, 443, 3000, 3001, 3100, 5432 ou 5433 ocupadas, ele para antes de mudar qualquer coisa e diz quais portas e que o `pnpm dev` usa a 3000, a 3100 e a 5433. A exceção é o banco do `pnpm dev`: o Docker Desktop o religa ao abrir, e ele fica na 5433 mesmo com o `pnpm dev` parado. Quando a 5433 é a única ocupada, e por esse contêiner (o serviço `db` do projeto `grafite` do Compose), o job grava a marca e o para, e a limpeza do fim o religa;
- **o que não é dele:** com um PostgreSQL 18, um `C:\Grafite`, um serviço do Grafite ou o segundo destino do backup que já existiam sem as marcas, ele para, porque não sabe a senha nem pode apagar o que outra pessoa instalou.

O executor de hoje não tem o IIS. Se um executor o tiver ocupando a porta 80, o job para com a porta no texto, em vez de desligar o IIS como fazia na máquina descartável do GitHub.

### 5. A busca de segredos pelo Docker do executor

O gitleaks roda na imagem dele, com a pasta do checkout montada pelo caminho do Windows (`pwd -W`) e o `MSYS_NO_PATHCONV=1`, para o Git Bash não reescrever o `/repo`. A pasta entra no `safe.directory` do git dentro do contêiner, porque o dono dela é o usuário do Windows.

A varredura vai pelo histórico inteiro do commit verificado (`--log-opts=HEAD`), e não por todas as branches que o checkout traz: o achado de um PR deixa de reprovar o pipeline de outro, que não tem aquele commit nem o `.gitleaksignore` que o explica. Na `main`, o histórico do commit é o da `main` inteira.

**Alternativa:** o executável do gitleaks baixado no job. O Docker já é exigido pelos outros jobs, e a imagem fixa a versão pela tag.

### 6. O SVG fora da linha da API

A ponta a ponta da pilha reprovou no executor próprio: a conta de Bruno perdeu a Administração da tela logo depois que a administradora trocou a foto dele. A causa estava na API, e não no teste:
- a foto era um SVG, e o primeiro SVG carrega o jsdom e o DOMPurify;
- a carga é síncrona e, no Windows, levou 16 s com os arquivos frios e 1,4 s com eles no cache. A API ficou parada esse tempo todo, para todos;
- a página de Bruno conferiu a sessão nesse meio-tempo, porque a foto é da conta dele. Ela esperou os 5 s da validação, deu a sessão por desconhecida e abriu a casca sem as permissões.

Em produção, o primeiro SVG enviado depois de cada partida faria o mesmo com quem estivesse usando o Grafite.

A sanitização passa a uma linha de execução própria do Node (`worker_threads`), a linha dos SVG:
- ela nasce com o primeiro SVG e fica para os seguintes;
- ela segura o processo só enquanto há um SVG esperando;
- quando ela para, os pedidos dela falham, e o SVG seguinte começa outra.

O laço de eventos da API fica livre durante a carga e durante a leitura de um SVG grande. O teste da linha confere que o jsdom não entra na memória da linha principal.

**Alternativa:** carregar o jsdom na partida da API. A partida ficaria até 16 s mais lenta, e um SVG grande ainda pararia a API enquanto é lido.

## Risks / Trade-offs

- **[Os jobs disputam a estação de trabalho]** → A instalação usa as portas do `pnpm dev` enquanto roda e para antes de tudo se elas estiverem ocupadas. O `pnpm dev` aberto no meio do job religaria o banco na 5433 e tiraria a porta da instância do teste: com a pasta das marcas do job (`C:Grafite-do-ci`) presente, ele para antes de subir o banco e diz para rodá-lo de novo depois do job, ou, sem job rodando, como desfazer a instalação anterior. Os outros jobs usam portas próprias ou aleatórias. A memória do projeto avisa a sessão de trabalho para conferir os jobs em andamento antes de rodar suítes pesadas na mesma máquina.
- **[Um job por vez]** → Com os jobs presos ao PC-DEV, os jobs de um PR rodam um depois do outro nele, e o PR leva mais tempo para ficar verde. As instâncias a mais do executor no PC-DEV, da change ci-paralelo, precisam do rótulo dos jobs para ajudar.
- **[O script de limpeza erra o alvo]** → Ele só apaga pelos nomes fixos do layout e pelas marcas que o próprio job gravou, e nunca por coringa fora do prefixo `grafite`.
- **[Caminhos longos do Windows]** → A pasta do executor é mais funda que a do repositório local. Se o `pnpm install` esbarrar no limite de 260 caracteres, o job mostra o caminho, e o limite se resolve na configuração do Windows do executor.

## Migration Plan

- O `.gitlab-ci.yml` e o remoto do GitLab saem.
- Os workflows mudam pela branch desta change, e o próprio PR dela roda nos executores próprios, inclusive a instalação, porque o PR muda o `versao.yml`.
- **Volta:** trocar o `runs-on` de volta para os executores hospedados, quando a cobrança da conta for resolvida.
