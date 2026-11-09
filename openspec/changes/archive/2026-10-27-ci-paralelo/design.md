## Context

O motivo está em `proposal.md`. O ponto de partida, na branch da change `ci-no-executor-proprio`:

- **Os executores:**
  - o PC-DEV roda o executor 2.337.0 como serviço, com a conta do usuário (`.\usuario`), em `C:\actions-runner`;
  - o PC-TI está desligado;
  - os jobs pedem só `self-hosted`.
- **O que os jobs dividem na máquina:**
  - o Docker Desktop, com 10 GB e 10 CPUs desde 2026-10-13;
  - o store do pnpm, a pasta dos navegadores do Playwright e o volume `grafite-npm` da regressão visual.
- **As portas fixas:**
  - a ponta a ponta da web serve a web compilada na 4173 (`vite preview --strictPort`);
  - a ponta a ponta da pilha sobe a API na 4174 e o coletor na 4175;
  - a instalação de teste do `versao.yml` usa 80, 443, 3000, 3001, 3100, 5432 e 5433, instala serviços `grafite*` e o PostgreSQL 18, e recusa uma segunda instalação na mesma máquina;
  - os outros testes, unitários e de integração, abrem porta 0 e os contêineres do Testcontainers, com portas sorteadas.
- **O turbo:**
  - a versão é a 2.11, no modo estrito de ambiente, em que a tarefa só vê as variáveis declaradas;
  - o `test` e o `typecheck` já podem sair do cache, mas o cache fica em `.turbo/cache`, dentro do checkout, e o `actions/checkout` apaga tudo o que não é versionado a cada job;
  - nenhum run reaproveita nada.
- **Testes que leem fora do próprio pacote:**
  - em `apps/web`, o guarda do mapa lê `docs/`, `openspec/` e confere caminhos do repositório inteiro, e o teste do guia de módulos importa `docs/casca/modulos.md`;
  - em `apps/operacao`, o teste do runbook lê `docs/operacao/runbook.md`;
  - em `apps/collector`, o teste da versão importa o `package.json` da API;
  - em `packages/ui`, o teste dos derivados da marca confere os arquivos gerados na web.

## Goals / Non-Goals

**Goals:**
- Três jobs de PRs diferentes rodando ao mesmo tempo no PC-DEV, sem um reprovar o outro. Na revisão de 21/10, os jobs passaram a rodar um de cada vez, numa instância só (decisão 2).
- Nenhum resultado aprovado pelo cache que o teste reprovaria se rodasse.
- A máquina de desenvolvimento igual à de hoje: sem as variáveis, as portas e os comandos locais não mudam.

**Non-Goals:**
- Isolar as instâncias em contêineres ou em contas diferentes do Windows.
- Um cache remoto do turbo, dividido entre as máquinas.
- Escolher a instância pelo tamanho do job: a fila do GitHub distribui os jobs pelas instâncias livres.

## Decisions

### 1. As portas vêm do `.env` de cada instância

O executor lê o `.env` da própria pasta ao iniciar o serviço e passa as variáveis aos jobs. Cada instância recebe ali as suas portas:

| Instância | Pasta | `GRAFITE_E2E_PORTA` | `GRAFITE_PILHA_PORTA` (coletor na seguinte) |
|---|---|---|---|
| PC-DEV | `C:\actions-runner` | 4273 | 4274 |
| PC-DEV-2 | `C:\actions-runner-2` | 4373 | 4374 |
| PC-DEV-3 | `C:\actions-runner-3` | 4473 | 4474 |

A regra é 4173 + 100 × n. As portas padrão, 4173 e 4174, ficam para quem roda as pontas a ponta na mão, nas worktrees da estação. No primeiro CI deste PR, a ponta a ponta da instância 1, ainda sem `.env`, reprovou com "Port 4173 is already in use": uma sessão rodava a ponta a ponta numa worktree no mesmo minuto.

- **A leitura:** um módulo pequeno ao lado das configurações do Playwright da web lê as duas variáveis.
  - Sem a variável, vale o padrão.
  - Um valor que não é um inteiro entre 1024 e 65535 lança um erro que nomeia a variável e o valor recebido.
  - As duas configurações e o `e2e-pilha/subir.ts` usam esse módulo no lugar das constantes.
- **O turbo:** a ponta a ponta da web roda pelo turbo, no modo estrito, e o `turbo.json` repassa a `GRAFITE_E2E_PORTA` à tarefa `test:e2e` (`passThroughEnv`). A da pilha roda pelo `pnpm --filter` e já vê o ambiente.

**Alternativa:** cada teste sortear uma porta livre. A configuração do Playwright é avaliada de novo em cada processo de teste, e cada um sortearia uma porta diferente da do servidor. Também seria preciso passar a porta sorteada ao `vite preview` e ao coletor.

**Alternativa:** as variáveis no `ci.yml`. O workflow não sabe em que instância o job caiu antes de começar, e a porta é da instância, não do job.

### 2. Os jobs nas instâncias preparadas, e a instalação de teste numa só por máquina

Dois rótulos dividem os jobs:
- **`preparado`:** os jobs do CI, o "Pacote para Windows" e a "Release" passam a `runs-on: [self-hosted, preparado]`. O rótulo vai para as três instâncias do PC-DEV, que têm o Docker, o Git Bash e as portas no `.env`, e, desde a revisão de 21/10, fica só na primeira. O PC-TI voltou a ficar online sem o Docker e atrás de um proxy que troca os certificados, e todo job que caía nele reprovava no preparo. Por isso a `main` pôs os jobs no rótulo `instalacao`, a única coisa que só o PC-DEV tinha. Com três instâncias, esse rótulo deixa de servir: ele levaria as três à instalação de teste. O PC-TI recebe o `preparado` quando for preparado.
- **`instalacao`:** o job "Instalação num Windows" do `versao.yml` fica em `runs-on: [self-hosted, instalacao]`. O rótulo vai para a primeira instância de cada máquina: o PC-DEV agora, e o PC-TI quando voltar.

Duas instalações nunca se cruzam na mesma máquina. Isso mantém a decisão da change `ci-no-executor-proprio` de que a instalação roda em qualquer máquina preparada, e não em qualquer executor.

**A passagem:** os runs criados antes do merge pedem `[self-hosted, instalacao]` e continuam só na primeira instância. Os novos, com o `ci.yml` desta change no commit de merge do PR, se espalham pelas três. Por isso o rótulo `preparado` vai para a primeira instância antes do merge, senão os jobs novos ficam sem executor.

**Revisão de 21/10, a pedido do usuário:** o `preparado` fica só na primeira instância do PC-DEV, e os jobs do CI rodam um de cada vez.
- **Por quê:** com três jobs ao mesmo tempo, mais o Docker, o Defender e o uso da estação, a disputa pela máquina estourava os tempos. No PR da P4c (#64), a integração levou 26,5 min, contra 8,5 sem carga. Os testes de desempenho, as histórias e a pilha só passaram no rerun, no PR e de novo no merge.
- **O custo:** o CI de um PR fica mais longo, perto da soma dos jobs, uns 40 min sem carga, e sem os reruns.
- **A volta ao paralelo:** a segunda e a terceira instâncias ficam registradas, com as portas no `.env`, sem o rótulo. Basta devolver o `preparado` a elas pela API, ou registrá-las de novo com o script da decisão 6, que já põe o rótulo.

**Alternativa:** um `concurrency` global para a instalação. Ele serializaria as instalações de máquinas diferentes, sem necessidade, e não impediria uma instalação de cair numa instância cuja máquina já tem outra.

### 3. O cache do turbo fora do checkout, por instância

A ação de preparo grava no `GITHUB_ENV` a `TURBO_CACHE_DIR` apontando para `<pasta _work da instância>\_turbo`, ao lado do checkout e fora dele. Antes, ela apaga do cache as entradas com mais de 7 dias.

Cada instância tem o seu cache:
- nenhuma escrita concorrente na mesma pasta;
- o cache some junto com a pasta, se a instância for removida.

O preço é cada instância esquentar o próprio cache.

**Alternativa:** uma pasta dividida pelas três. O ganho seria maior, mas o turbo local não promete escritas concorrentes seguras na mesma pasta.

**Alternativa:** o `clean: false` do `actions/checkout`. Ele deixaria também o `node_modules` e os restos de builds anteriores, que o CI precisa limpos.

### 4. As entradas dos testes declaradas no pacote

Cada pacote cujo teste lê fora dele ganha um `turbo.json` próprio (`extends: ["//"]`), com as entradas da tarefa `test` como `$TURBO_DEFAULT$` mais os arquivos lidos, por `$TURBO_ROOT$/...`:

- **`apps/web`:** `docs/casca/modulos.md`.
- **`apps/operacao`:** `docs/operacao/runbook.md`.
- **`apps/collector`:** `apps/api/package.json`, cuja versão o teste da versão do coletor compara com a dele.
- **`packages/ui`:** os arquivos gerados que o teste dos derivados confere fora do pacote, tirados da lista de `arquivosDaMarca()`.

O `turbo.json` da raiz ganha `globalDependencies: ["tsconfig.base.json"]`, que todo pacote estende na checagem de tipos.

O guarda do mapa lê o repositório inteiro, porque confere que cada caminho citado existe. Declarar essas entradas tiraria a web do cache em todo PR, já que todo PR muda `openspec/`. Por isso ele passa de `apps/web/src/modulos/mapa.test.ts` para `scripts/`, cujos testes rodam pelo `vitest run --dir scripts`, fora do turbo e sempre.

**O guarda das entradas:** um teste novo em `scripts/` percorre os testes de `apps/` e `packages/`.
- Ele procura leituras que saem do pacote: um caminho com `docs/`, `openspec/` ou `pnpm-workspace.yaml`, ou um import relativo que sobe acima da pasta do pacote.
- Para cada pacote com uma delas, ele exige um `turbo.json` com entradas `$TURBO_ROOT$/` na tarefa `test`.
- A reprovação nomeia o arquivo do teste e o pacote.

É uma heurística: ela pega o padrão que o repositório usa, e não qualquer leitura possível.

**Alternativa:** tirar o `test` do cache e guardar só o `typecheck`. Isso deixaria de fora a maior parte do ganho: os unitários levam 2 min 17 s, e a checagem de tipos, 31 s.

### 5. O filtro dos PRs só de documentação

Um job `mudancas`, curto, decide se o código mudou:
- **Preparo:** ele faz o checkout com `fetch-depth: 2` e o Node 24, sem o `pnpm install`.
- **A lista:** num PR, o checkout é o commit de merge, e `git diff --name-only HEAD^1 HEAD` dá exatamente o que o PR muda em relação à base.
- **A classificação:** `scripts/ci/mudancas.ts` lê a lista e responde `codigo=true` quando algum arquivo está fora de `docs/` e de `openspec/`.
  - Uma lista vazia ou um erro ao listar contam como `codigo=true`: na dúvida, roda tudo.
  - Num push, a saída é sempre `codigo=true`.
- **Os jobs pesados:** integração, navegador, pilha e visual ganham `needs: mudancas` e `if: needs.mudancas.outputs.codigo == 'true'`.
- **O motivo:** quando o código não mudou, o job `mudancas` escreve no resumo do run que os quatro foram pulados porque só a documentação e as specs mudaram.
- **Os jobs leves:** `verificacoes` e `segredos` não dependem dele.

`docs/` e `openspec/` não entram em nenhuma compilação. O único arquivo da web ou da UI fora de teste que cita `docs/` é um comentário (`Marca.tsx`).

**Alternativa:** `paths-ignore` no gatilho. Ele tira o run inteiro, inclusive o lint e os unitários, que guardam o mapa e os documentos.

**Alternativa:** uma ação de terceiros como a `dorny/paths-filter`. O repositório só usa as ações oficiais, e a regra cabe num script testado.

### 6. O registro de uma instância por script

O `.github/scripts/registrar-executor.ps1` roda no Windows PowerShell 5.1, como administrador, com `-Numero <n>` (2 ou mais):

1. **Confere o ambiente:** a elevação, o `gh` autenticado com acesso de administrador ao repositório e a pasta `C:\actions-runner-<n>` ainda vazia. Se algo faltar, para antes de mudar qualquer coisa e diz o quê.
2. **Monta a pasta:** baixa o runner oficial do GitHub na versão fixada no script e confere o SHA-256 publicado na release. Com o hash diferente, apaga o download e para.
3. **Grava o `.env`:** as portas da decisão 1 para a instância `n`, em UTF-8 sem BOM.
4. **Registra:** pede o token de registro pelo `gh api -X POST .../actions/runners/registration-token` e o passa direto ao `config.cmd`, sem mostrá-lo.
   - O nome é `PC-DEV-<n>`, com os rótulos `self-hosted,Windows,X64,preparado`.
   - O serviço roda com a conta de quem roda o script. A senha é pedida pelo `Read-Host -AsSecureString` e vai só ao `config.cmd`.
5. **Confere:** lê o executor pela API e diz em texto se ficou online.

Os rótulos `preparado` e `instalacao` da primeira instância são postos à parte, uma vez, pela API (`POST .../runners/<id>/labels`).

**A instância que já existe:** com `-Numero 1`, o script só grava o `.env` em `C:\actions-runner` e reinicia o serviço dela, para o executor ler as portas. Antes, ele confere a elevação e que o serviço existe. Se um job estiver rodando nela, o script para e diz que vai esperar o job terminar, porque reiniciar o serviço derrubaria o job.

**Sem efeito, com `-Ensaio`:** o script diz o que faria: a pasta, o nome, os rótulos, as portas e o conteúdo do `.env`. Ele não baixa, não registra e não pede o token nem a senha.

**A mesma conta do usuário:** o serviço precisa do Docker Desktop, que só atende quem está no grupo `docker-users`. A instância atual já roda assim.

**Alternativa:** registrar à mão. São seis passos por instância, com o hash e as portas fáceis de errar, e um script pode ser revisado no PR.

## Risks / Trade-offs

- **Testes de desempenho com a CPU disputada:** os p95 da integração já reprovaram no CI por CPU.
  - Mitigação: a verificação final roda três PRs ao mesmo tempo.
  - Resultado: o PR da P4c reprovou por CPU, no PR e no merge, e os jobs passaram a uma instância só (decisão 2, revisão de 21/10).
  - Se o p95 reprovar só nessa condição, a integração ganha um rótulo próprio numa instância só, como a instalação. Isso fica registrado, sem entrar agora.
- **Unitários com o limite de 5 s sob carga:** com o job da instalação rodando e o turbo testando todos os pacotes de uma vez, dois testes que passam sozinhos em menos de 1 s estouraram os 5 s do vitest. Foram o cadastro do segredo na web e o encerramento do coletor sem configuração. Cada vitest abre uma linha por thread, e três instâncias juntas pedem mais linhas do que a máquina tem.
  - Mitigação: a verificação final mostra se isso se repete.
  - Se se repetir, limitar as linhas do vitest por instância pelo `.env` entra numa change própria.
- **Memória:** três jobs com contêineres e o Chromium podem passar dos 10 GB do Docker e dos 16 GB da máquina.
  - Mitigação: a mesma verificação acompanha a memória livre.
  - O limite fica em 3 instâncias, e reduzir para 2 é tirar um serviço.
- **O cache aprovar o que não deveria:** um teste novo pode ler fora do pacote de um jeito que o guarda das entradas não reconhece.
  - Mitigação: o guarda cobre os padrões do repositório.
  - O push na `main` roda com o cache igual, então um `--force` manual do turbo resolve qualquer dúvida num run.
- **Instâncias dividindo o store do pnpm, os navegadores do Playwright e o cache do npm:** os três são feitos para instalações concorrentes, com travas próprias.
  - Uma atualização do Playwright cai na primeira instância que a instalar, e as outras esperam a trava.
- **O PC-DEV é a estação de trabalho:** com três jobs, o uso local fica mais lento.
  - Mitigação: o `.wslconfig` deixa 2 threads e uns 6 GB para o Windows.
  - Parar uma instância é parar o serviço dela.

## Migration Plan

1. **O merge do PR #30** (`ci-no-executor-proprio`) vem antes. Esta change parte da branch dele, e o PR dela vai para a `main`, com a ordem dita na descrição.
2. **O código primeiro:** as portas, o cache, o filtro e o rótulo da instalação entram e passam no CI com a instância única.
3. **Os rótulos `instalacao` e `preparado`** vão para o PC-DEV antes do merge, senão os jobs ficam sem executor.
4. **As instâncias 1, 2 e 3:** o usuário roda o script com `-Numero 1`, que só dá as portas à instância que já existe, e depois com `-Numero 2` e `-Numero 3`.
5. **Voltar atrás:** para cada instância, `config.cmd remove` com um token de remoção, e a pasta apagada. Sem elas, o CI volta a uma fila só, sem nenhuma outra mudança.
