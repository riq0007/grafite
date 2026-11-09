## Why

O CI de um PR leva cerca de 66 minutos do início ao fim, mas só uns 20 são de trabalho. No último run verde (`claude/escolhas-a-vista`), os seis jobs somaram 19 min 40 s, e o resto foi fila. Só o PC-DEV está online (o PC-TI está desligado), e ele roda um job por vez, de todos os PRs. Com dois ou três PRs abertos, cada um espera os jobs dos outros.

A máquina aguenta mais de um job ao mesmo tempo: são 6 núcleos e 12 threads, 16 GB de RAM, e o Docker agora com 10 GB. O usuário decidiu registrar 3 instâncias do executor nela. Elas só funcionam juntas se três coisas mudarem:
- as portas fixas dos testes de navegador;
- a instalação de teste, que não pode rodar duas vezes na mesma máquina;
- o trabalho repetido em cada run.

A change pertence ao esqueleto técnico do F0, que criou o CI, e à seção 12.2 da spec mestre. Ela não implementa nenhum subprojeto da seção 3.2. Ela depende da change `ci-no-executor-proprio` (PR #30), que levou o CI aos executores próprios, e parte da branch dela.

Ficam fora desta change:
- mais de 3 instâncias no PC-DEV: com 6 jobs pesados, a memória acaba e os testes de desempenho da integração reprovam por falta de CPU;
- religar o PC-TI, que depende de acesso àquela máquina;
- acelerar os testes por dentro, como um PostgreSQL único para toda a integração ou a imagem própria da regressão visual;
- mudar o que cada job verifica.

## What Changes

- **Portas dos testes por instância:**
  - a ponta a ponta da web lê a porta de `GRAFITE_E2E_PORTA`, com 4173 por padrão;
  - a ponta a ponta da pilha lê a sua de `GRAFITE_PILHA_PORTA`, com 4174 por padrão, e o coletor usa a seguinte;
  - um valor inválido para o teste antes de começar e diz qual variável corrigir;
  - cada instância recebe as suas portas pelo `.env` da pasta do executor, e sem a variável tudo fica como hoje.
- **Os jobs só nas instâncias preparadas, e a instalação de teste numa só por máquina:**
  - os jobs do CI, o pacote e a release pedem o rótulo `preparado`, que as três instâncias do PC-DEV têm e que, desde 21/10, fica só na primeira, com os jobs um de cada vez (design, decisão 2). O PC-TI, que voltou a ficar online sem o Docker e atrás de um proxy que troca os certificados, não o tem até ser preparado;
  - o job "Instalação num Windows" do `versao.yml` pede o rótulo `instalacao`, que só a primeira instância do PC-DEV tem.
- **Cache do turbo entre os runs:**
  - a ação de preparo põe o cache do turbo numa pasta da instância, fora do checkout, que o `actions/checkout` não apaga, e tira do cache o que passou de 7 dias;
  - a checagem de tipos e os testes unitários de um pacote sem mudança passam a sair do cache.
- **Entradas dos testes declaradas:** um teste que lê arquivos fora do próprio pacote declara esses arquivos nas entradas do turbo do pacote, para o cache não aprovar um teste que mudaria de resultado:
  - o guia de módulos (`docs/casca/modulos.md`) no teste da web;
  - o runbook no teste do comando de operação;
  - o `package.json` da API no teste da versão do coletor;
  - os derivados da marca no teste da UI.
  O teste-guarda do mapa lê o repositório inteiro e passa da web para os testes da raiz (`scripts/`), que rodam sempre. Um teste novo na raiz reprova o pacote que lê fora dele sem declarar.
- **Jobs pesados pulados em PR só de documentação:**
  - um job curto lista o que o PR muda;
  - quando tudo está em `docs/` e `openspec/`, os jobs de integração, navegador, pilha e visual são pulados, com o motivo dito no resumo do job;
  - lint, tipos, unitários (que guardam o mapa e os documentos) e a busca de segredos rodam sempre;
  - no push na `main`, tudo roda.
- **Script para registrar uma instância:**
  - `.github/scripts/registrar-executor.ps1` monta a pasta da instância a partir do runner oficial, numa versão fixada e com o hash conferido;
  - ele pede o token de registro pelo `gh`, sem mostrá-lo, grava o `.env` com as portas da instância e instala o serviço com a conta do usuário;
  - com `-Ensaio`, ele só diz o que faria.
- **Spec mestre e mapa:** a seção 12.2 diz como as instâncias dividem a máquina, e o mapa traz a change em andamento.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `plataforma-base`: o requisito "Qualidade verificada antes do commit e em cada PR" passa a dispensar a integração, a ponta a ponta e a regressão visual num PR que só muda documentação e specs. Lint, tipos, unitários e a busca de segredos continuam em todo PR.

## Impact

- **CI:**
  - `.github/workflows/ci.yml`, com o job das mudanças e as condições dos jobs pesados;
  - `.github/workflows/versao.yml`, com os rótulos do pacote, da instalação e da release;
  - `.github/actions/preparar/action.yml`, com o cache do turbo;
  - o script novo `.github/scripts/registrar-executor.ps1`.
- **Código e configuração:**
  - as configurações do Playwright da web e o módulo das portas dos testes;
  - o `turbo.json`, com as dependências globais e a variável da porta repassada à ponta a ponta;
  - os `turbo.json` dos pacotes que leem fora deles;
  - o teste-guarda do mapa, que muda de lugar;
  - o teste novo das entradas declaradas;
  - o classificador das mudanças em `scripts/ci/`.
- **Executores:**
  - duas instâncias novas no PC-DEV (`C:\actions-runner-2` e `C:\actions-runner-3`), registradas pelo usuário com o script;
  - o rótulo `preparado` nas três, e o `instalacao` só na primeira; desde 21/10, o `preparado` também fica só na primeira.
- **Documentação:** a seção 12.2 da spec mestre e o mapa.
