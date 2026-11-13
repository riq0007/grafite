## Context

O motivo está na proposta. O estado de hoje, em 09/11:

- **A árvore:**
  - a `main` do repositório antigo tem a árvore limpa pela `limpar-arvore-para-publicar`, com o CI verde;
  - a guarda dos termos confere os 3.646 arquivos versionados, com a lista do secret;
  - o gitleaks `v8.30.1` deu "no leaks found" num commit sem pai feito dessa árvore (tarefa 5.2 da change anterior).
- **Os workflows:**
  - usam só `actions/checkout`, `actions/setup-node`, `actions/setup-go`, `actions/upload-artifact` e a ação local `./.github/actions/preparar`;
  - têm dois testes-guarda, o dos executores e o da sintaxe do PowerShell, e nenhum para as ações;
  - leem um secret só, o `GRAFITE_TERMOS_PRIVADOS`;
  - declaram `permissions: contents: read` no topo, e os jobs da release pedem a escrita no próprio job;
  - nenhum usa o `pull_request_target`.
- **O CI no push da `main`:** roda tudo, sem calcular a diferença (`scripts/ci/mudancas.ts`). O primeiro push de um commit sem pai não depende de um commit anterior.
- **A versão:** a release exige que a tag seja a versão de `apps/api/package.json`. A 0.1.10 mudou quatro arquivos: as três `package.json` das aplicações e o contrato da API.
- **As tags antigas** são anotadas, com a mensagem "Grafite x.y.z".
- **O Git local:**
  - o e-mail global não é o noreply, e o repositório não tem um local;
  - a configuração local que importa é `core.autocrlf=false` e `core.eol=lf`;
  - o `.gitattributes` já força o LF.
- **Os arquivos locais que o Git ignora, fora os de build:**
  - o `.env`;
  - a `.grafite/` (arquivos, coletor, listas dos termos e túnel), com 2,5 MB;
  - a `.superpowers/`;
  - a `demonstracao/`;
  - a `.claude/worktrees/`, que não vai.

  O `.claude/launch.json` é versionado e tem uma mudança local, que nunca é commitada.
- **O banco do desenvolvimento** fica no volume `dados-db` do projeto `grafite`, que o `compose.yaml` fixa pelo `name:`. Ele não depende do nome da pasta.
- **O GitHub, no plano gratuito:** os rulesets e a busca de segredos só existem em repositório público. As configurações das Actions existem também no privado.

Restrições:
- **A change vai para o repositório público.** A proposta, este design, as tarefas e os commits não podem citar os termos privados. A guarda confere no pre-commit.
- **Cada ação para fora pede o sim do usuário:** criar o repositório, mudar a visibilidade, configurar as proteções e arquivar o antigo. O secret e as configurações da conta são do próprio usuário.
- **A pasta em uso não se renomeia.** O Windows não deixa renomear uma pasta que é a pasta de trabalho de um processo vivo, como o do Claude Code.

## Goals / Non-Goals

**Goals:**
- O repositório público começa com um commit só, sem nenhum objeto do histórico antigo, e o CI dele passa no primeiro push.
- Nenhum commit nem tag do repositório novo leva um e-mail pessoal.
- As proteções valem logo depois da troca para público, e cada uma é conferida pela leitura de volta.
- O `D:\grafite` passa a ser um clone do repositório novo, com a mesma memória do Claude Code e o mesmo banco do desenvolvimento.
- A 0.1.11 sai do repositório novo, com os pacotes baixáveis sem login.

**Non-Goals:**
- Provar as proteções violando-as, por exemplo com um push forçado de teste. A leitura de volta das regras ativas basta, e um push forçado vai contra as regras de trabalho.
- Mudar os workflows. Eles já servem ao repositório público.
- Apagar a pasta antiga ou o repositório antigo. Os dois ficam, e só o usuário decide apagá-los.

## Decisions

### 1. O commit único sai de uma pasta descartável, que recebe só ele

Os passos:
1. Num índice temporário do repositório antigo, a árvore da `main` sem o `.gitleaksignore` vira uma árvore nova (`read-tree`, `rm --cached` e `write-tree`).
2. O `commit-tree` faz o commit sem pai, com o autor e o committer `riq0007 <182831779+riq0007@users.noreply.github.com>`.
3. Uma referência temporária aponta o commit.
4. Uma pasta descartável, fora do `D:\grafite`, com um repositório vazio, busca só essa referência. O fetch traz apenas os objetos alcançáveis do commit, que não tem pai.
5. A referência temporária é apagada.

Antes de qualquer push, a pasta descartável é conferida:
- um commit, nenhuma tag e nenhuma outra referência;
- o número de arquivos, que é o da `main` antiga menos um;
- os e-mails, que são só o noreply;
- a guarda dos termos e o gitleaks, nos modos `git` e `dir`, sem achado.

O push para o GitHub sai dessa pasta.

Alternativas recusadas:
- **Push direto do clone antigo:** um `--all`, um `--tags`, um `--mirror` ou o `push.followTags` publicariam o histórico ou as tags antigas. O remoto novo nunca entra no clone antigo.
- **`git archive` e `git add -A` numa pasta nova:** o `add` pula um arquivo versionado que case com o `.gitignore`. O `commit-tree` usa a árvore exata.

### 2. A árvore da publicação nasce no repositório antigo, por um PR

O teste-guarda das ações, o README, os documentos e a versão 0.1.11 entram no `dev` do repositório antigo, um commit por tarefa. Eles vão para a `main` dele por um PR, e não direto. O motivo é duplo:
- o teste-guarda é do próprio CI, que a regra do ajuste pequeno manda por PR;
- o README é o primeiro texto que o público lê, e o usuário o revisa no PR antes de ele sair.

O CI do PR tem de passar, e o merge é do usuário.

O `.gitleaksignore` fica no repositório antigo, porque o CI de lá varre o histórico, em que os falsos positivos não têm o `gitleaks:allow`. Ele sai só da árvore do commit único (decisão 1). Assim, o repositório antigo termina verde, e o novo nasce sem o arquivo.

### 3. Privado primeiro, público só com o sim e com o CI verde

A ordem:
1. O repositório nasce privado e vazio, já com as configurações das Actions (decisão 4).
2. O usuário cadastra o secret. O push da `main` sem a lista reprova o CI, como a spec pede.
3. O commit único vai para a `main` e o `dev`.
4. O CI tem de passar, ainda no privado. Ele gasta minutos da cota gratuita, o que o usuário aceitou.
5. Com o sim do usuário, o repositório vira público, e as proteções entram em seguida.

A janela entre a troca e as proteções é de minutos. Nela, o padrão do GitHub para repositório público já pede aprovação aos que contribuem pela primeira vez.

Alternativa recusada: criar já público. Um erro no commit único ficaria exposto antes de o CI conferir.

### 4. As proteções, e como cada uma é conferida

| Proteção | Configuração | Conferência |
|---|---|---|
| PR de fora | Aprovação para todos os de fora (`all_external_contributors`) | Leitura da política de aprovação |
| `main` | Ruleset com a remoção e a reescrita barradas (`deletion` e `non_fast_forward`), sem exceção | Regras ativas da `main` (`rules/branches/main`) |
| Tags `v*` | Ruleset em `refs/tags/v*`, com a remoção, a atualização e a reescrita barradas, sem exceção | Leitura do ruleset |
| Segredos | A busca de segredos e o bloqueio no push ligados | `security_and_analysis` do repositório |
| Ações | Só as do GitHub e as do dono; a ação local `preparar` é do dono | Permissões das Actions e ações escolhidas |
| Token | Só leitura por padrão, sem aprovar PRs | Permissões padrão dos workflows |
| Página | Wiki, projetos e Issues desligados | Leitura do repositório |

- **Sem exceção, nem para o dono:** uma versão com defeito vira uma versão nova, e a tag nunca se move. Numa emergência, o usuário desliga o ruleset nas configurações.
- **Sem checagens obrigatórias na `main`:** o ajuste pequeno continua indo direto para ela.
- **O `dev` fica sem ruleset,** como o usuário decidiu: as regras são da `main` e das tags.
- **As Issues ficam desligadas,** como o usuário confirmou em 09/11. O trabalho anda pelas changes, e um repositório sem canal de relato não recebe pedidos que ninguém lê. Se o usuário quiser um canal, ele liga as Issues ou o relato privado de vulnerabilidades depois, sem mudar o resto.
- **A criação de tags `v*` não é barrada.** A release nasce da tag que o usuário cria.
- **Um teste-guarda das ações** (`scripts/ci/acoes.test.ts`), como o dos executores e o da sintaxe do PowerShell, reprova no `pnpm test` um workflow ou uma ação local que use uma ação que não seja `actions/*`, `github/*` ou do próprio repositório. Ele diz o arquivo, o job e o passo. Sem ele, o erro só apareceria no GitHub, como um run recusado.

### 5. O e-mail noreply em três lugares

- **No commit único:** pelas variáveis do `commit-tree` (decisão 1).
- **No clone novo:** `user.name` e `user.email` na configuração local. Ela vale para os commits e para o autor das tags anotadas. O global fica como está, para os outros projetos.
- **Na conta:** "Keep my email addresses private" e "Block command line pushes that expose my email", que o usuário liga. Com elas, o GitHub recusa um push que traga o e-mail pessoal.

### 6. O secret no repositório novo, pelo comando testado

O usuário roda a linha em PowerShell 5.1 da change anterior, com o `--repo riq0007/grafite`. Em 09/11 a linha foi conferida: os 30 termos chegaram iguais, na ordem do conferidor, com o `$OutputEncoding` em UTF-8. Sem ele, os acentos viram `?`, e a guarda fica cega a esses termos sem reprovar nada.

### 7. O README e o aviso de direitos

O README fica curto, em pt-BR e sem marketing:
- o que é o Grafite, pela primeira frase do `CLAUDE.md`, e o estado dele: em uso interno, preparado para várias organizações;
- como rodar no desenvolvimento, com os requisitos e o `pnpm install` e o `pnpm dev`, e o `CLAUDE.md` para o resto;
- onde estão os documentos: o mapa, a spec mestre, o runbook e as changes;
- a página das versões.

Não há arquivo de licença. O aviso, na decisão do usuário: "Todos os direitos reservados. O código pode ser lido, mas não copiado, modificado nem redistribuído."

### 8. A pasta `D:\grafite`: clone ao lado e troca com o Claude Code fechado

**O clone novo** vai para `D:\grafite-novo`:
- com `core.autocrlf=false` e `core.eol=lf` já no `clone`;
- com o e-mail noreply na configuração local;
- com os arquivos locais da pasta antiga copiados: o `.env`, a `.grafite/`, a `.superpowers/`, a `demonstracao/` e o `.claude/launch.json` local;
- com o `pnpm install` e o `pnpm exec lefthook install`. Com a store do pnpm já cheia, o `pnpm install` reaproveita o build do lefthook e não roda de novo o script que instala os ganchos no `.git` do projeto novo.

O gancho guarda o caminho absoluto do lefthook, com o nome da pasta. Depois da troca, o `pnpm exec lefthook install` roda de novo dentro do `D:\grafite`.

Ali rodam os tipos, os unitários e a guarda. O `pnpm dev` não roda: o projeto do compose tem o mesmo nome, e ele disputaria o banco com a pasta antiga.

**A troca** sai da sessão do Claude, sem o usuário rodar nada no terminal (pedido dele em 13/11/2026). O app e a própria sessão prendem as duas pastas: a pasta atual do Claude Code, dos servidores MCP e dos terminais do app, e os vigias de arquivos. Por isso a troca só corre com o app fechado. A sessão arma um roteiro em PowerShell, fora das duas pastas, que espera o app, os editores e o `pnpm dev` soltarem as pastas, por até uma hora. Então ele para o banco do desenvolvimento e renomeia o `D:\grafite` para `D:\grafite-antigo` e o `D:\grafite-novo` para `D:\grafite`. Ele para no primeiro erro, desfaz a primeira troca se a segunda falhar e não apaga nada. No fim, avisa numa janela e oferece abrir o Claude de novo. O roteiro é conferido antes em pastas de ensaio.

O caminho fica o mesmo, então a memória do Claude Code, que é da pasta, segue igual. A sessão nova continua pelas tarefas.

Alternativa recusada: trocar o remoto do `D:\grafite` e mover as branches para o commit novo. Os objetos e as tags antigas continuariam na pasta, a um `--tags` de distância do repositório público.

### 9. A versão 0.1.11

- **A troca de versão** muda os mesmos quatro arquivos da 0.1.10, com o contrato gerado pelo `pnpm contrato:gerar`. Ela entra no repositório antigo (decisão 2), e o commit único já nasce na 0.1.11.
- **A tag anotada `v0.1.11`,** com a mensagem "Grafite 0.1.11", sai do clone novo. Ela vem depois das proteções e de um CI verde na `main`: a release só sai de uma `main` verde.
- **O `versao.yml` não muda.** O rascunho, as duas instalações de teste e a publicação com os seis arquivos funcionam no repositório novo como no antigo.

### 10. O repositório antigo: as decisões do usuário e depois o arquivo

Antes de arquivar, o usuário decide o que ainda está no repositório antigo:
- um webhook;
- as pré-releases de ensaio;
- um rascunho órfão de release.

Um repositório arquivado é só de leitura, e mexer nessas coisas depois pede desarquivá-lo.

"Fica privado como arquivo" é lido como o arquivamento do GitHub: o repositório continua privado e para de aceitar push. A operação se desfaz pelas configurações.

### 11. A ordem e os commits

- **As tarefas 1.1 a 1.4** são commits no `dev` do repositório antigo, um por tarefa. O tique de cada uma vai no próprio commit.
- **As tarefas 1.5 a 3.3** terminam fora de um clone do repositório novo. A 1.5 termina com o merge do PR. Os tiques delas entram no clone novo logo que ele existe (tarefa 4.1), um commit por tarefa.
- **Daí em diante,** cada tarefa é um commit no clone novo. Cada push na `main` roda o CI inteiro, então os tiques vão juntos, num push por etapa.
- **O commit único** leva "Tarefa 2.1 do publicar-no-repositorio-novo." no corpo.

## Risks / Trade-offs

- **[O histórico ou as tags antigas irem para o repositório público]** → O remoto novo nunca entra no clone antigo. O push sai da pasta descartável, conferida antes: um commit, nenhuma tag.
- **[Um commit com o e-mail pessoal]** → O e-mail fica na configuração local do clone e nas configurações da conta. A verificação final lista os e-mails do clone anônimo.
- **[O primeiro CI do repositório novo reprova]** → A árvore é a da `main` antiga com o CI verde, menos o `.gitleaksignore`, cuja falta o gitleaks confere antes. Se reprovar mesmo assim, o conserto é um segundo commit, ainda no privado.
- **[A busca de segredos abrir alerta para os falsos positivos conhecidos]** → Cada alerta fecha como falso positivo, com o motivo do `gitleaks:allow`. O bloqueio no push não confere o que já está no repositório.
- **[A troca da pasta falhar porque algum processo a segura]** → A linha para no primeiro erro, sem apagar nada. O usuário fecha o que segura a pasta e roda de novo.
- **[Um arquivo local ficar para trás]** → A pasta antiga fica renomeada, com tudo. A lista dos ignorados das duas pastas é comparada antes da troca.
- **[A release da 0.1.11 falhar]** → Uma falha passageira se resolve com a nova tentativa dos jobs que falharam, e o rascunho de antes é apagado pelo `versao.yml`. Um defeito no código vira a 0.1.12, porque a tag não se move.
- **[A sessão do Claude Code acabar na troca]** → A memória é atualizada antes. A sessão nova, no mesmo caminho, continua pelas tarefas.

## Migration Plan

1. O ponto de partida: a `limpar-arvore-para-publicar` está arquivada, e a `main` antiga está verde no e4c06027.
2. As tarefas 1.x no repositório antigo, com o PR do `dev` para a `main` e o CI verde. O usuário faz o merge.
3. O commit único, conferido na pasta descartável.
4. O repositório privado, o secret, o push e o CI verde.
5. O clone novo em `D:\grafite-novo`, com os tiques pendentes.
6. Com o sim do usuário, o repositório vira público, e as proteções entram em seguida.
7. A tag `v0.1.11` e a release.
8. A troca das pastas pelo usuário. As decisões sobre o repositório antigo, e o arquivamento dele.
9. A verificação final, de fora, e o arquivamento da change no repositório novo.

**Volta:**
- **antes do passo 6:** o repositório privado pode ser apagado, com o sim do usuário, e o trabalho segue no antigo;
- **depois do passo 6:** o repositório volta a privado pelas configurações;
- **a pasta antiga** volta ao nome dela com a mesma linha, invertida.

## Open Questions

Nenhuma. As decisões que ficam com o usuário durante a aplicação, sem mudar o plano, estão na tarefa 7.2: o que fazer com o webhook, com as pré-releases de ensaio e com o rascunho órfão do repositório antigo.
