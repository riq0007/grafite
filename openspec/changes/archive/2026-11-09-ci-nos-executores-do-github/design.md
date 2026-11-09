## Context

O motivo está na proposta. O estado de hoje:

- **CI (`ci.yml`):** os sete jobs rodam em `[self-hosted, preparado]`, que desde 21/10 é uma instância só do PC-DEV, um job por vez. A regressão visual pede também o rótulo `docker`.
- **Ação de preparo:** é de Windows:
  - põe o Git Bash à frente no caminho;
  - roda passos em `cmd` e `powershell`;
  - guarda o cache do turbo numa pasta da máquina (`_turbo`), dividida entre os PRs e a `main`.
- **Versões (`versao.yml`):** os cinco jobs rodam em executores próprios, e os pacotes passam de um job a outro por uma pasta da máquina (`_pacotes/<run>`). Só por isso a montagem e a instalação de teste são jobs separados.
- **Instalação de teste no Windows:** muda a máquina (o PostgreSQL pelo choco, o `hosts`, serviços, regras de firewall e uma raiz confiável), e o `limpar-a-instalacao.ps1` desfaz tudo no fim.
- **Antes de 13/10:** o CI rodava no `ubuntu-latest`, e a versão no `windows-latest` e no `ubuntu-latest`, com os pacotes passando por artefatos. O pacote para Linux e a instalação de teste dele vieram depois, já no executor próprio.

Restrições:
- Os contêineres Linux só rodam nos executores Linux do GitHub. Precisam deles:
  - o PostgreSQL 18 do Testcontainers;
  - a imagem `noble` do Playwright;
  - o gitleaks;
  - o Docker dentro do Docker (dind) da instalação de teste no Linux.
- O pacote para Windows e a instalação dele precisam do Windows: o `caddy.exe`, o PowerShell 5.1, os serviços e o choco.
- Os arquivos da release continuam os mesmos (spec operacao-servicos, "Pacote da versão", e spec operacao-em-linux, "Pacote da versão para Linux").

## Goals / Non-Goals

**Goals:**
- Nenhum job depende de uma máquina da equipe.
- Cada job confere o mesmo que hoje.
- A release sai com os mesmos arquivos, e só depois das duas instalações de teste.
- Os logs, que num repositório público qualquer um lê, não mostram a senha temporária nem conexões da máquina.

**Non-Goals:**
- O repositório novo e público, a limpeza da árvore e as proteções do GitHub: ficam para a change seguinte.
- Caches entre runs: podem vir depois, se o tempo pedir.
- A regressão visual fora do contêiner.
- Um executor com o Windows Server 2019: o GitHub não o oferece mais.

## Decisions

### 1. Imagens fixadas: `ubuntu-24.04` e `windows-2022`

Os jobs pedem uma versão, e não `-latest`.
- O `ubuntu-latest` vai mudar de versão (o GitHub anunciou o 26), e isso mudaria sem PR as fontes das capturas e os pacotes do sistema. A imagem do Playwright usada na regressão visual é a `noble`, que é o 24.04.
- O `windows-2022` é o hospedado mais perto do Windows Server 2019 da produção. Quando ele sair, o job passa ao `windows-2025`.

Alternativa: `-latest`, recusada pela deriva sem PR.

### 2. O CI como era antes de 13/10, com o que entrou depois

Os sete jobs vão para o `ubuntu-24.04` e rodam em paralelo; o plano grátis permite 20 jobs ao mesmo tempo. Continuam como estão:
- o `mudancas`, que pula a integração, as pontas a ponta e a regressão visual num PR só de documentação;
- os limites de tempo;
- o artefato da pilha numa falha;
- a concorrência por ref.

Saem:
- os passos "Git Bash à frente";
- o "Docker no ar" da regressão visual;
- os comentários sobre a instância e as portas.

O Chromium volta a pedir as dependências do sistema (`playwright install --with-deps chromium`).

### 3. A ação de preparo em bash, sem cache entre runs

A ação passa a fazer só três coisas, todas em bash:
- o `setup-node` com o Node 24;
- o `corepack enable`;
- o `pnpm install --frozen-lockfile`.

O turbo usa o cache dele dentro do checkout, que morre com a máquina. Assim, nenhum resultado de um PR chega a outro run (spec plataforma-base, "Executores do CI"). O requisito de reaproveitar só o que não mudou passa a valer trivialmente, porque nada é reaproveitado.

Alternativa: `actions/cache`, que separa os caches por branch e seria seguro. Fica para depois, se o tempo dos jobs pedir.

### 4. O banco de teste pelo Testcontainers

A integração e a pilha usam o Docker da máquina do GitHub. O passo "Banco de teste no ar" passa a só conferir o Docker. O modo `GRAFITE_TESTE_PG_BIN` continua no código para quem roda a integração sem Docker, mas sai do CI.

### 5. O gitleaks fixado em versão

O job roda a imagem oficial na versão `v8.30.1`, a que já está em uso, sobre o histórico do commit verificado (`--log-opts=HEAD`), com a pasta em `$GITHUB_WORKSPACE`.

Alternativa: `:latest`, recusada porque uma mudança da imagem mudaria o CI sem PR.

### 6. As versões: um job por plataforma, com a release em rascunho

Cada job do GitHub roda numa máquina nova, e a pasta `_pacotes` deixa de existir. Por isso:

- **Um job por plataforma:** montar o pacote, montar o de versão maior e instalar de teste ficam num job só.
  - Windows: "Pacote e instalação no Windows", no `windows-2022`.
  - Linux: "Pacote e instalação no Linux", no `ubuntu-24.04`.
  - Assim, o tar de cerca de 412 MB não precisa virar artefato. O armazenamento de artefatos do plano grátis é de 500 MB, dividido com o Packages.
- **Release em rascunho:** na tag, e no ensaio manual, um primeiro job ("Rascunho da release", `ubuntu-24.04`) cria a release como rascunho.
  - Cada job de plataforma sobe os arquivos dele ao rascunho só depois de a instalação de teste dele passar.
  - O job "Release" publica o rascunho, ou o marca como pré-lançamento no ensaio.
  - Se algo falha, o job "Descartar o rascunho" apaga o rascunho pelo id, nunca pela tag, porque uma tag pode ser também a de uma release publicada.
- **Nos PRs** que mudam a operação, as imagens ou o pacote, os dois jobs montam e instalam, sem release.

Alternativas recusadas:
- **Artefatos:** pelo tamanho e pela cota.
- **Um job só para as duas plataformas:** impossível, porque os sistemas são diferentes.

### 7. A instalação de teste no Windows numa máquina nova

A instalação passa a ser a de um servidor recém-chegado, o caminho do atalho de instalação:
- **O Node:** a imagem do GitHub traz um Node em `C:\Program Files\nodejs`, de outra versão. O `preparar-servidor.ps1` acharia esse Node primeiro e pararia. O job o desinstala antes, e o atalho instala o Node 24 pelo instalador oficial fixado, como num servidor novo.
- **A porta 80:** o IIS da imagem a ocupa. O job para o W3SVC antes, como fazia o `versao.yml` de antes de 13/10.
- **O PostgreSQL 18 da produção:** vem pelo choco, como hoje, com uma nova tentativa quando o feed responde 503.
- **Sem limpeza:** a máquina é descartada. Saem o `limpar-a-instalacao.ps1` e as marcas que ele usava.
- **Logs públicos:**
  - a senha temporária da primeira conta aparece como `<oculta>`, como no Linux;
  - o diagnóstico de rede numa falha mostra só as portas locais e os processos, sem os endereços remotos.

### 8. A instalação de teste no Linux

O dind privilegiado e a conferência continuam como hoje. O que muda:
- o `$RUNNER_TEMP` toma o lugar do `cygpath`;
- o `docker build` passa a ter `--pull`, para as imagens base virem do registro e nunca de uma etiqueta local;
- o cache das camadas começa frio a cada run.

### 9. Os executores próprios saem

Depois da release 0.1.10, que ainda roda neles:
- **No GitHub:** os quatro executores saem pela API (`DELETE /repos/{dono}/{repo}/actions/runners/{id}`).
- **No PC:** em cada pasta `C:\actions-runner*`, o `config.cmd remove`, com o token de remoção, tira o registro e o serviço. Depois as pastas, que guardam as credenciais, são apagadas.
- **No PC-TI:** ele sai só do GitHub. O serviço daquela máquina deixa de conectar, e quem tiver acesso a ela o desinstala.

O repositório ainda é privado, então até a publicação ninguém de fora alcança o PC. Os executores saem antes do merge para que o PC deixe de rodar qualquer job. Até o merge, a `main` fica sem CI, e o PR desta change já roda nos executores do GitHub, porque o `pull_request` usa o workflow do próprio PR.

Saem também do repositório:
- o `registrar-executor.ps1`;
- a seção "Executor do CI numa VM" do runbook.

### 10. A `ci-sem-docker` arquivada como substituída

Ela foi arquivada com as tarefas 2.2 (o rótulo `docker`) e 3.2 (a conferência no PR) marcadas como não aplicáveis, com o motivo no `tasks.md` dela. O banco de teste por um PostgreSQL instalado, que ela entregou, continua.

### 11. A sintaxe dos passos em PowerShell conferida no `pnpm test`

No primeiro run do PR, o passo do choco do job do Windows tinha `"$LASTEXITCODE: nova tentativa"`. O PowerShell lê isso como uma variável com unidade, como o `$env:`, e o passo nem rodou. O actionlint confere o YAML e o bash dos passos, mas não o PowerShell. Um teste-guarda (`scripts/ci/powershell.test.ts`) passa a conferir o que segue.
- **Os passos:** os de cada workflow cujo shell é o `powershell` ou o `pwsh`. O shell vem do passo, do `defaults` do job ou do `defaults` do workflow. O YAML é lido pelo pacote `yaml`, que já vinha no lockfile como dependência indireta e passa a ser declarado na raiz. As expressões `${{ }}` viram uma variável antes do parser, porque o Actions as troca por texto antes de rodar o passo.
- **O parser:** o `[System.Management.Automation.Language.Parser]`, num processo só para todos os passos. No Windows é o `powershell.exe` 5.1, e no Linux é o `pwsh`, que as imagens do GitHub trazem. Sem nenhum dos dois, o teste não roda.
- **O 5.1 conferido no Linux:** o parser do 7 aceita o `&&`, o `||`, o `??`, o `?.` e o ternário. Num passo do 5.1, esses tokens reprovam também.

Alternativa: o PSScriptAnalyzer, recusado porque é um módulo a baixar e confere o estilo, além da sintaxe.

## Risks / Trade-offs

- **[Os executores do GitHub não aceitarem jobs no repositório privado anterior, como em 13/10, pela cobrança da conta]** → O usuário diz que não há pendência. Se acontecer, a validação passa ao repositório novo e público, na change seguinte.
- **[No privado, os minutos do Windows contam em dobro]** → A validação é por poucos runs, e o `versao.yml` só roda nos PRs com o filtro de caminhos.
- **[O Windows Server 2022 difere do 2019 da produção]** → A instalação no 2019 foi conferida à mão pelo usuário na VM. O CI cobre o 2022.
- **[As imagens do GitHub mudam toda semana]** → As versões são fixadas. Uma falha do ambiente pede `gh run rerun --failed`.
- **[Os jobs ficam mais lentos sem cache]** → Aceito, porque os jobs rodam em paralelo. O tempo de cada um é medido, e o `actions/cache` vem depois se for preciso.
- **[Um rascunho órfão da release depois de uma falha]** → O job de descarte o apaga pelo id.
- **[Os logs do Windows mostravam a senha temporária e o `netstat`]** → Os dois mudam, pela decisão 7.

## Migration Plan

1. Esperar a release 0.1.10 terminar no executor próprio (run 42546191702).
2. Tirar os quatro executores do GitHub e as três instâncias do PC (decisão 9).
3. Abrir o PR com a migração. O `ci.yml` do PR roda nos executores do GitHub, e o `versao.yml` também roda, pelo filtro de caminhos. Consertar até tudo ficar verde.
4. Fazer o ensaio da release pelo `workflow_dispatch` na branch do PR, que cria o rascunho, sobe os arquivos e publica o pré-lançamento "Ensaio". Depois, apagar o ensaio.
5. O usuário faz o merge. A versão seguinte sai pela tag, nos executores do GitHub.

**Volta:** reverter o PR. Os executores próprios precisariam ser registrados de novo, pelo roteiro que fica no histórico do git.
