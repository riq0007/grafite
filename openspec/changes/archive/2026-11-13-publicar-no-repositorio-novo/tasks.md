## 1. A árvore da publicação, no repositório antigo

- [x] 1.1 O teste-guarda das ações (decisão 4): primeiro o teste (`scripts/ci/acoes.test.ts`), com workflows de ensaio, e depois o conferidor (`scripts/ci/acoes.ts`). Ele lê os `uses:` dos workflows e das ações locais. Ele aceita `actions/*`, `github/*` e as ações do próprio repositório (`./`) e reprova o resto, dizendo o arquivo, o job e o passo.

  Verificar:
  - o teste reprova antes de o conferidor existir, pelo motivo certo, e passa depois;
  - com os workflows de hoje, o `pnpm test` passa.
- [x] 1.2 O README e o aviso de direitos (decisão 7): o `README.md` na raiz, em pt-BR e sem marketing, com:
  - o que é o Grafite e o estado dele;
  - como rodar no desenvolvimento;
  - onde estão os documentos;
  - a página das versões;
  - o aviso: "Todos os direitos reservados. O código pode ser lido, mas não copiado, modificado nem redistribuído."

  Verificar: a guarda dos termos não acha nada no arquivo, e o aviso está com as palavras da decisão do usuário.
- [x] 1.3 Os documentos dizem o repositório novo (decisões 4, 5 e 8):
  - o `CLAUDE.md`: na regra 5, o repositório público, a guarda dos termos e o e-mail noreply dos commits e das tags;
  - a spec mestre: na seção 12.1, o repositório `riq0007/grafite`, público, com o histórico anterior num repositório privado; na 12.2, o teste-guarda das ações;
  - o runbook: a página das versões (`https://github.com/riq0007/grafite/releases`) nos passos que mandam baixar da release;
  - o mapa: a change em andamento.

  Verificar: o teste-guarda do mapa passa (`pnpm exec vitest run scripts/mapa.test.ts`), e `openspec validate publicar-no-repositorio-novo --strict` passa.
- [x] 1.4 A versão 0.1.11 (decisão 9): as `package.json` da API, do coletor e do comando de operação, e o contrato da API pelo `pnpm contrato:gerar`.

  Verificar: `pnpm contrato:verificar` e `pnpm test` passam, e o diff muda os mesmos quatro arquivos da 0.1.10.
- [x] 1.5 O PR do `dev` para a `main` do repositório antigo (decisão 2), com o `.gitleaksignore` ainda na árvore. O usuário revisa o README e faz o merge.

  Verificar: os jobs do PR passam, e o CI da `main` passa depois do merge.

## 2. O commit único

- [x] 2.1 O commit único, numa pasta descartável fora do `D:\grafite` (decisões 1 e 5):
  - a árvore da `main` antiga, depois do merge da 1.5, sem o `.gitleaksignore`, por um índice temporário;
  - o commit sem pai, com o autor e o committer `riq0007 <182831779+riq0007@users.noreply.github.com>`, a mensagem em pt-BR, "Tarefa 2.1 do publicar-no-repositorio-novo." e o Co-Authored-By;
  - um repositório vazio na pasta descartável, que busca só esse commit, por uma referência temporária do repositório antigo, apagada logo depois.

  Verificar, antes de qualquer push:
  - `git rev-list --all --count` dá 1, e `git for-each-ref` mostra só a branch;
  - o número de arquivos do commit é o da `main` antiga menos um, e o `.gitleaksignore` não está entre eles;
  - `git log --format='%ae %ce'` mostra só o noreply;
  - a guarda dos termos, com a lista local, não acha nada nos arquivos do commit;
  - o gitleaks `v8.30.1` dá "no leaks found" no modo `git` (`--log-opts=HEAD`) e no modo `dir`, sobre os arquivos do commit.

## 3. O repositório novo, privado

- [x] 3.1 Com o sim do usuário, o `riq0007/grafite` criado privado e vazio (decisões 3 e 4):
  - a descrição em pt-BR;
  - sem wiki, projetos nem Issues;
  - nas Actions, só as ações do GitHub e as do dono, o token só de leitura por padrão e sem aprovar PRs.

  Verificar: a leitura de volta pela API mostra cada configuração, e o repositório não tem nenhum commit.
- [x] 3.2 O usuário (decisões 5 e 6):
  - liga, na conta do GitHub, "Keep my email addresses private" e "Block command line pushes that expose my email";
  - cadastra o secret `GRAFITE_TERMOS_PRIVADOS` no repositório novo, pela linha em PowerShell da decisão 6.

  Verificar: `gh secret list --repo riq0007/grafite` mostra o secret, e o usuário confirma as duas opções da conta.
- [x] 3.3 O push do commit único, da pasta descartável, para a `main` e o `dev` do repositório novo (decisão 3).

  Verificar:
  - o repositório tem um commit, as duas branches e nenhuma tag;
  - os jobs do CI da `main` passam;
  - o passo "Termos privados" diz "Nenhum termo privado nos N arquivos conferidos.", com o N do commit.

## 4. O clone novo

- [x] 4.1 O clone em `D:\grafite-novo` (decisões 5, 8 e 11):
  - o `git clone` com `core.autocrlf=false` e `core.eol=lf`, e o `user.name` e o `user.email` noreply na configuração local;
  - o `.env`, a `.grafite/`, a `.superpowers/`, a `demonstracao/` e o `.claude/launch.json` local, copiados da pasta antiga;
  - o `pnpm install` e o `pnpm exec lefthook install`, que instala os ganchos: com a store do pnpm já cheia, o `pnpm install` não roda de novo o script do lefthook;
  - os tiques das tarefas 1.5 a 3.3, um commit por tarefa, num push só para a `main` e o `dev`.

  Verificar:
  - `git var GIT_AUTHOR_IDENT` e `git var GIT_COMMITTER_IDENT` dão o noreply;
  - a lista dos ignorados é a mesma nas duas pastas, fora os de build e a `.claude/worktrees/`;
  - `pnpm typecheck` e `pnpm test` passam, e a guarda dos termos não acha nada;
  - o CI da `main` passa depois do push.

## 5. Público e protegido

- [x] 5.1 Com o sim do usuário, o repositório vira público. Logo depois entram as proteções da decisão 4:
  - a aprovação dos PRs de fora;
  - a busca de segredos, com o bloqueio no push;
  - os rulesets da `main` e das tags `v*`.

  Verificar:
  - a leitura de volta pela API mostra cada proteção, e as regras ativas da `main` (`rules/branches/main`) trazem a remoção e a reescrita;
  - sem token, a API pública (`https://api.github.com/repos/riq0007/grafite`) responde o repositório como público;
  - um alerta da busca de segredos, se aparecer, é fechado como falso positivo, com o motivo.

## 6. A versão 0.1.11

- [x] 6.1 A tag anotada `v0.1.11`, "Grafite 0.1.11", no clone novo, na `main` com o CI verde, e a release pelo `versao.yml` (decisão 9).

  Verificar:
  - a release `v0.1.11` sai publicada, como a mais recente, com os seis arquivos;
  - sem token, os seis arquivos respondem ao download, com o código 200 no fim (`curl -sIL`);
  - o autor da tag é o noreply.

## 7. A troca da pasta e o repositório antigo

- [x] 7.1 A troca das pastas (decisão 8):
  - o roteiro da troca, conferido antes em pastas de ensaio e armado pela sessão do Claude;
  - a memória do Claude Code atualizada com o estado;
  - o usuário fecha o app do Claude, os editores e o `pnpm dev`; o roteiro troca as pastas, avisa numa janela, e o usuário abre o Claude de novo no `D:\grafite`;
  - na sessão nova, o `pnpm exec lefthook install` dentro do `D:\grafite`, porque o gancho guarda o caminho absoluto da pasta.

  Verificar, na sessão nova:
  - `git remote -v` aponta o `riq0007/grafite`, e `git log` tem só os commits do repositório novo;
  - o `.git/hooks/pre-commit` cita o `D:/grafite`, e o commit seguinte roda os ganchos;
  - o `pnpm dev` sobe com o banco do desenvolvimento de antes, com os dados que já estavam nele.
- [x] 7.2 O repositório antigo (decisão 10):
  - o usuário decide o webhook, as pré-releases de ensaio e o rascunho órfão;
  - com o sim dele, o repositório é arquivado no GitHub.

  Verificar: a API mostra o repositório antigo arquivado e privado.

## 8. Verificação

- [x] 8.1 A conferência de fora, num clone anônimo do repositório publicado, numa pasta descartável:
  - só os commits do repositório novo, todos com o e-mail noreply no autor e no committer;
  - só a tag `v0.1.11`;
  - a guarda dos termos, com a lista local, não acha nada;
  - `openspec validate publicar-no-repositorio-novo --strict` passa, e o mapa traz a change em andamento.

  Verificar: os comandos dão o esperado, e as contagens ficam registradas nesta tarefa.

  Contagens de 09/11, num clone sem login, antes do push dos últimos tiques:
  - 8 commits, todos com o e-mail noreply no autor e no committer, e nenhum dos commits do repositório anterior;
  - 4.497 objetos guardados, os mesmos que os commits alcançam;
  - uma tag só, a `v0.1.11`, anotada, com o autor no noreply;
  - a guarda dos termos, com as sete listas do CI e com as oito, não achou nada nos 3.653 arquivos.
