## Why

Em 08/11/2026 o usuário decidiu publicar o Grafite num repositório novo e público, para usar de graça os executores hospedados pelo GitHub, e tirar do PC dele os executores próprios. Hoje todo o CI e o workflow das versões rodam em quatro executores próprios:
- três instâncias no PC-DEV, a estação dele, como o serviço da conta `.\usuario`, que é administradora;
- o PC-TI, numa rede da empresa, hoje desligado.

Num repositório público, o `pull_request` usa o workflow que vem no próprio PR, inclusive de um fork. Quem abre o PR escolhe o que roda e onde: rótulo e `if:` não protegem. No PC ficam:
- o `gh` autenticado com o escopo `workflow`;
- os arquivos da conta;
- o Docker;
- o job da release, com `contents: write`.

A documentação do GitHub diz que executor próprio quase nunca deve ser usado com repositório público, e os executores padrão do GitHub são grátis nele. A auditoria dessa decisão está na memória do projeto (repositorio-publico).

A change pertence ao esqueleto técnico do F0 e à seção 12.2 da spec mestre (o CI e os ambientes). Ela substitui a `ci-sem-docker`, que ia levar o CI a VMs sem Docker e fica sem objeto.

Fica fora desta change, numa change seguinte:
- a limpeza da árvore para publicar: o domínio da empresa, os nomes das máquinas e os dados reais nos documentos;
- a criação do repositório novo e público, com as proteções dele, e a passagem do `D:\grafite` para ele.

## What Changes

- **O CI nos executores do GitHub:** os sete jobs do `ci.yml` passam ao `ubuntu-24.04`, como antes de 13/10:
  - o banco de teste pelo Testcontainers, com o Docker da máquina;
  - o Chromium do Playwright com as dependências do sistema;
  - a regressão visual no contêiner do Playwright;
  - o gitleaks numa imagem de versão fixada, sobre o histórico do commit.
- **A ação de preparo em bash:**
  - sem o Git Bash à frente no caminho;
  - sem o cache do turbo numa pasta da máquina: cada job começa limpo.
- **As versões nos executores do GitHub:**
  - O pacote para Windows e a instalação de teste dele passam a um job só, no `windows-2022`, o hospedado mais perto do Windows Server 2019 da produção.
  - O pacote para Linux e a instalação de teste dele passam a outro job só, no `ubuntu-24.04`.
  - Na tag, cada um sobe os arquivos para a release em rascunho depois de instalar com sucesso, e o último job a publica.
  - Nada passa mais por uma pasta da máquina.
- **Sem executor próprio:**
  - os quatro executores saem do repositório no GitHub;
  - as três instâncias saem do PC: o serviço e as pastas com as credenciais;
  - saem do repositório o roteiro que registrava um executor e o que desfazia a instalação de teste na máquina.
- **A sintaxe dos passos em PowerShell conferida no `pnpm test`:** no primeiro run do PR, um passo do Windows com `"$LASTEXITCODE: ..."` só falhou no GitHub, porque o actionlint não olha o PowerShell. Um teste-guarda passa cada passo em PowerShell dos workflows pelo parser e recusa num passo do 5.1 a sintaxe que só o PowerShell 7 aceita.
- **A `ci-sem-docker` arquivada como substituída:**
  - o banco de teste por um PostgreSQL instalado (`GRAFITE_TESTE_PG_BIN`), já pronto, continua para quem roda a integração sem Docker;
  - a tarefa do rótulo `docker` e a conferência no CI deixam de valer.
- **Documentação:**
  - o runbook perde a seção do executor numa VM;
  - a spec mestre, o mapa e o CLAUDE.md passam a dizer que o CI roda nos executores do GitHub.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `plataforma-base`: o CI e as versões rodam só em executores descartáveis do GitHub, e nenhum executor próprio fica ligado ao repositório. Assim, nenhum PR, nem de fork, roda código numa máquina da equipe.

## Impact

- **CI:**
  - `.github/workflows/ci.yml`;
  - `.github/workflows/versao.yml`;
  - `.github/actions/preparar/action.yml`;
  - `.github/scripts/registrar-executor.ps1` e `.github/scripts/limpar-a-instalacao.ps1`, que saem.
- **GitHub:** os executores PC-DEV, PC-DEV-2, PC-DEV-3 e PC-TI saem do repositório.
- **PC do usuário:** os serviços e as pastas `C:\actions-runner`, `C:\actions-runner-2` e `C:\actions-runner-3`.
- **Documentação:**
  - `docs/operacao/runbook.md`;
  - `docs/superpowers/specs/2026-09-24-grafite-design.md`, seção 12.2;
  - `docs/mapa.md`;
  - `CLAUDE.md`.
- **OpenSpec:** a `ci-sem-docker`, arquivada como substituída.
- **Custo:**
  - no repositório público, os executores padrão não custam nada;
  - enquanto a validação rodar no repositório privado anterior, os jobs gastam os minutos da cota grátis da conta, e os do Windows contam em dobro.
