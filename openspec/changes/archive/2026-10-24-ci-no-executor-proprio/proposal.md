## Why

Desde 2026-10-13, os executores hospedados do GitHub Actions não iniciam nenhum job neste repositório: a cobrança da conta barra cada execução antes do primeiro passo, e os PRs ficaram sem o CI que a spec mestre exige a cada PR (seção 12.2). A tentativa de levar o CI ao GitLab esbarrou na verificação de identidade e nos minutos pagos de lá. O usuário registrou dois executores próprios no repositório, dois Windows, e decidiu: o CI roda neles, com `runs-on: self-hosted`, e o GitLab sai.

A change pertence ao esqueleto técnico do F0, que criou o CI, e à seção 12.2 da spec mestre. Ela não implementa nenhum subprojeto da seção 3.2, e nenhum requisito muda: o CI verifica as mesmas coisas, noutro lugar.

Ficam fora desta change:
- executores Linux ou em contêiner: os dois registrados são Windows;
- rodar mais de um job ao mesmo tempo além dos executores registrados;
- mudar a release: ela continua no `versao.yml`, com o mesmo `gh release create`, agora num executor próprio.

## What Changes

- **Os workflows do GitHub** (`ci.yml` e `versao.yml`) passam ao executor próprio preparado, `runs-on: [self-hosted, instalacao]`, com os mesmos jobs, nomes e comandos.
- **Passos que rodam no Windows dos executores:**
  - o bash dos passos é o Git Bash, posto à frente no caminho pela ação de preparo, porque o `bash` do Windows pode ser o do WSL;
  - os passos da instalação, que eram do PowerShell 7, rodam no Windows PowerShell 5.1, o que os executores têm;
  - os jobs que sobem contêineres conferem antes se o Docker está no ar e dizem isso em texto.
- **A instalação num Windows de verdade** limpa o que instalou antes de começar e depois de terminar: os serviços do Grafite, o PostgreSQL 18 que ela mesma instalou, a pasta `C:\Grafite`, o segundo destino do backup, as linhas do `hosts`, a raiz confiável e as regras do firewall. O executor é uma estação de desenvolvimento, e as portas da instalação são as do `pnpm dev`. Com uma porta ocupada, ela para antes de mudar qualquer coisa e diz qual porta liberar.
- **A busca de segredos** roda o gitleaks pelo Docker do executor, sobre o histórico do commit verificado. O token fictício de um teste do P2a entra no `.gitleaksignore`, com o motivo.
- **O `.gitlab-ci.yml` sai**, e o remoto do GitLab deixa de ser usado.
- **Um teste corrigido:** o teste da hora de agora em Idioma e região reprovava quando o minuto virava entre a tela abrir e a conferência.
- **Um defeito da API que o executor revelou:** o primeiro SVG enviado carregava o jsdom na linha da API e a parava por segundos, para todos; a sanitização passa a uma linha de execução própria.
- **O banco do `pnpm dev`** fica parado durante a instalação de teste, quando é ele que ocupa a 5433, e volta no fim.
- **Spec mestre e mapa:** a seção 12.2 diz onde o CI roda, e o mapa (`docs/mapa.md`) traz a change em andamento.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

Nenhuma: as verificações a cada PR (spec plataforma-base, "Qualidade verificada antes do commit e em cada PR") e o pacote da versão (spec operacao-servicos) continuam os mesmos, e a change declara `skip_specs: true`.

## Impact

- **CI:** `.github/workflows/ci.yml`, `.github/workflows/versao.yml` e `.github/actions/preparar/action.yml`; o script novo `.github/scripts/limpar-a-instalacao.ps1`; o `.gitlab-ci.yml` sai.
- **Código:** o teste de Idioma e região e a sanitização do SVG na API (`apps/api/src/arquivos/svg.ts`, com a linha dos SVG).
- **Executores:** os jobs rodam numa máquina de trabalho, com o Docker Desktop, o Git Bash e o Chocolatey dela. A instalação de teste usa as portas do `pnpm dev` enquanto roda.
- **Documentação:** a seção 12.2 da spec mestre e o mapa.
