## 1. O CI no executor próprio

- [x] 1.1 Levar o `ci.yml` aos executores próprios (design, decisões 1, 2, 3 e 5): `runs-on: self-hosted` e `defaults.run.shell: bash` nos seis jobs; a ação de preparo põe o Git Bash à frente no caminho e roda o corepack e o `pnpm install` pelo PowerShell; o Docker conferido antes dos jobs com contêineres; o gitleaks pelo Docker do executor, sobre o histórico do commit; o token fictício do teste dos coletores no `.gitleaksignore`; o teste da hora de agora que reprovava na virada do minuto; e o `.gitlab-ci.yml` fora. Verificar: o gitleaks local sobre o histórico da branch não acha nada, o teste de Idioma e região passa, e o CI do PR passa nos seis jobs no executor próprio.

## 2. A versão no executor próprio

- [x] 2.1 Escrever o `.github/scripts/limpar-a-instalacao.ps1` (design, decisão 4) e testá-lo com o PowerShell 5.1 numa máquina sem a instalação, onde ele termina sem mudar nada, e com as marcas falsas de uma instalação, numa pasta de teste. Verificar: as duas execuções terminam com o código 0 e dizem em texto o que tiraram.
- [x] 2.2 Levar o `versao.yml` aos executores próprios: `runs-on: [self-hosted, instalacao]` nos três jobs, os passos da instalação no PowerShell 5.1 (decisão 2), a conferência das portas e do PostgreSQL antes de instalar, as marcas do que o job criou, e a limpeza antes e depois. Verificar: no CI do PR, o pacote é montado, a instalação passa em todas as conferências, e o executor fica sem nenhum serviço `grafite*`, sem o `C:\Grafite` e sem o PostgreSQL 18 depois do job. Depois, a ci-paralelo passou os jobs que não instalam ao rótulo `preparado` (design dela, decisão 2), e só a instalação ficou no `instalacao`.

- [x] 2.3 Escrever primeiro o teste e depois a sanitização do SVG numa linha de execução própria (design, decisão 6), que o executor próprio revelou parando a API no primeiro SVG. Verificar: o teste da linha reprova sem ela, com o jsdom carregado na linha principal, e passa com ela; os testes das imagens e dos SVG passam; e o maior atraso do laço de eventos no primeiro SVG cai de segundos para milissegundos.
- [x] 2.4 Prender os jobs dos dois workflows ao executor preparado, pelo rótulo `instalacao` (design, decisão 1), quando o PC-TI voltou a ficar online sem o Docker e com a troca dos certificados. Verificar: os jobs do PR rodam só no PC-DEV, e nenhum reprova no preparo nem no "Docker no ar".

## 3. Fechamento

- [x] 3.1 A seção 12.2 da spec mestre diz que o CI roda nos executores próprios do repositório, Windows, e o mapa (`docs/mapa.md`) traz a change em andamento. Verificar: `pnpm test` passa, com o teste-guarda do mapa.
- [x] 3.2 Conferir as verificações: `pnpm lint` e `openspec validate ci-no-executor-proprio --strict` sem erros, e o CI do PR verde nos dois workflows. Verificar: os comandos passam, e o PR fica com todos os jobs verdes.
