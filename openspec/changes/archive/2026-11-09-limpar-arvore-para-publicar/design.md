## Context

O motivo está na proposta. O estado de hoje, pela auditoria de 09/11 sobre os 3.637 arquivos versionados:

- **Os termos privados, por tipo:** o inventário com os valores fica fora do repositório.

| Tipo | Linhas | Arquivos | Onde |
|---|---|---|---|
| Domínio da empresa | 46 | 7 | 4 testes (39 linhas), o runbook, a spec `operacao-servicos` e uma delta arquivada |
| Máquinas, conta e VM | 57 | 19 | 51 linhas no arquivo das changes, 5 na `ci-nos-executores-do-github`, 1 no mapa |
| Nome do desenvolvedor | 6 | 4 | 2 testes e 2 histórias do avatar |
| Ambiente real da empresa | 9 | 6 | 2 guias da operação, a spec mestre e 3 arquivos de 2 changes arquivadas |
| Fatos da planta real | 26 | 11 | a spec mestre, a change do P7, a spec `mapa-da-planta`, 4 testes do mapa e um comentário |
| Séries e telefone | 6 | 4 | 2 gravações SNMP e 2 testes |
| Links privados | 14 | 13 | o arquivo das changes e a `ci-nos-executores-do-github` |

- **O que não é termo privado:**
  - as 514 linhas com IP privado, todas em faixas de exemplo;
  - os cerca de 90 nomes de pessoa dos testes, que são inventados;
  - o e-mail pessoal, que não aparece em nenhum arquivo.
- **O gitleaks** (`v8.30.1`, a versão do CI) acha 4 falsos positivos nos versionados:
  - a lista de senhas fracas;
  - o token fictício de um teste;
  - as duas chaves genéricas públicas da Microsoft.
  O `.gitleaksignore` os esconde por impressões `commit:arquivo:regra:linha`, de commits do repositório antigo.
- **As pastas locais:** a dos roteiros da demonstração e a das worktrees do Claude Code, com uma cópia velha da árvore, só são ignoradas pelo `.git/info/exclude`, que não vai para um clone novo.

Restrições:
- **Esta change também vai para o repositório público.** A proposta, este design, as tarefas, o mapa e os commits não podem citar os termos.
- **As capturas visuais exigem o Docker e levam tempo.** A troca não deve mudá-las.
- **As specs principais mudam pelas deltas,** sincronizadas no commit da tarefa que muda os testes do mesmo cenário.

## Goals / Non-Goals

**Goals:**
- Nenhum termo da lista nos arquivos versionados, em texto ou binário.
- Os testes verdes depois de cada tarefa, e as capturas visuais iguais.
- O job de segredos do CI verde no primeiro push do repositório novo.
- O arquivo das changes legível: o que aconteceu continua contado, com os nomes trocados.

**Non-Goals:**
- O repositório novo, as proteções do GitHub e a passagem do `D:\grafite`: ficam para a change seguinte.
- O histórico do Git.
- As cidades dos exemplos (decisão 6).
- Trocar os nomes, as séries, as faixas de rede e as salas dos exemplos: em 09/11 o usuário confirmou que são inventados.

## Decisions

### 1. A lista dos termos fica fora do Git

A lista vive em `.grafite/termos-privados/`, uma pasta que o `.gitignore` já ignora, com um arquivo por tipo:
- `dominio.txt`, `maquinas.txt`, `pessoa.txt`, `ambiente.txt`, `planta.txt`, `fixtures.txt` e `links.txt`;
- `amplos.txt`, só para a verificação final, com o prefixo da conta do desenvolvedor, que também acha o primeiro nome dele.

O formato:
- um termo por linha, sem linha vazia, com fim de linha LF;
- a busca é `git grep -n -i -F -f <lista>`, sem `-I`, para pegar também os binários.

Antes de trocar qualquer coisa, cada lista tem de achar as linhas do inventário. Um CR no fim de um termo faria a busca não achar nada e dar a árvore por limpa. Uma linha vazia faria a busca achar tudo.

Alternativa: a lista no próprio repositório, recusada porque publicaria os termos que a change tira.

### 2. Um substituto por coisa, igual em toda a árvore

| Coisa | Substituto |
|---|---|
| O domínio público da empresa | `acme.example`, com `grafite.acme.example` e `grafite-teste.acme.example` |
| O domínio interno | `acme.local` |
| A organização do teste | "Acme" |
| A estação do desenvolvimento e as instâncias do executor | `PC-DEV`, `PC-DEV-2`, `PC-DEV-3` e `PC-DEV-<n>` |
| O executor da rede da empresa | `PC-TI` |
| A conta local | `.\usuario` |
| A VM de testes | sem nome: "a VM de testes pedida à infraestrutura" |
| O nome completo do desenvolvedor | "Helena Matos de Osório" |
| As séries das gravações SNMP | `3100R000001` e `52J000000001` |
| O telefone | `+55 (11) 4000-0000` |
| O modelo da planta nos testes | `planta-exemplo`, de 120 × 80 m, com a "Máquina 1" |

- **O `.example`** (RFC 2606) nunca resolve. O `.local` segue os endereços internos que os testes já usam.
- **Os dois validadores de endereço aceitam os substitutos:** o do comando de operação e o da API.
- **O comando só acrescenta endereços no fim da lista,** sem ordenar. A ordem esperada nos testes não muda.
- **`PC-DEV` e `PC-TI`** mantêm o artigo masculino do texto ("o PC-DEV"). Nenhuma frase do arquivo precisa de outro ajuste.
- **O nome novo tem as iniciais HO, como o antigo.** O avatar mostra só as iniciais e não tira cor do nome, então as 24 capturas das duas histórias ficam iguais.

Alternativa: um domínio de exemplo terminado em `.com.br`, como os que a árvore já usa, recusada porque pode ser registrado por alguém.

### 3. O arquivo das changes muda só nos termos

Uma change arquivada é história. A limpeza muda nela só o termo, pelo substituto, ou tira o detalhe do ambiente, como uma data de diagnóstico, uma leitura real ou um link morto. As decisões, os números dos PRs e dos runs e as datas das decisões ficam.

Alternativas recusadas:
- **Apagar o arquivo:** o mapa e as specs apontam para ele, e a história se perde.
- **Deixar como está:** ele tem 49 das 55 linhas com os nomes das máquinas.

### 4. As fixtures que parecem reais mudam, mesmo sem confirmação

As duas séries das gravações, o telefone e o trecho do modelo da planta podem ter vindo do PMG ou da empresa. Trocar custa pouco: cada um muda no mesmo commit que os testes que o afirmam, com valores inventados no mesmo formato. Na planta, o texto "WC M" fica, porque a busca da web procura "WC".

### 5. O gitleaks: `gitleaks:allow` na linha, e o `.gitleaksignore` até a publicação

Os quatro falsos positivos ganham o comentário `gitleaks:allow` na própria linha, com o motivo.
- O comentário vale no modo `git`, o do CI, e no modo `dir`, e não depende do commit nem do número da linha. No repositório novo, ele basta.
- Conferido numa cópia dos três arquivos, no modo `dir`: sem nada, 4 achados; com o comentário, nenhum.
- O formatador pode quebrar uma linha longa e levar o comentário para outra. Por isso, a linha mais longa vira um objeto em várias linhas, com o valor sozinho na dele.

O `.gitleaksignore` fica enquanto o PR roda no repositório antigo. O CI varre o histórico inteiro do commit, e os commits antigos que trouxeram os valores, inclusive o token de antes do `versao.yml`, não têm o comentário. Sem as impressões, o job reprovaria. No repositório novo, elas não casam com nada, e o arquivo sai na change da publicação.

Alternativa: impressões sem o commit (`arquivo:regra:linha`). Recusada porque dependem do número da linha, que muda com a própria limpeza, e porque o modo `git` não foi conferido.

### 6. As cidades dos exemplos ficam, e os fatos da planta saem

As duas cidades dos exemplos aparecem em cerca de 2.450 lugares:
- 355 arquivos, com 35 specs principais;
- cerca de 140 capturas visuais.

Sozinhas, são exemplos de unidades. O que liga uma delas à empresa são os fatos da planta real: as medidas, o nome e a revisão do arquivo do PMG, as contagens do modelo e o trecho dele nos testes. Esses saem da spec mestre (seção 3.4), da change do P7, da spec `mapa-da-planta` e dos testes.

Alternativa: trocar as cidades em toda a árvore. Custo:
- uma delta para cada uma das 35 capacidades;
- as capturas regravadas;
- os identificadores sem acento nos testes.

Em 09/11 o usuário decidiu que as cidades ficam.

### 7. A seção 13.3 da spec mestre e o PMG

- **A seção 13.3** cita os arquivos e as chaves que o PMG versionava. O PMG foi desligado, e a lição já está na 13.2. O título fica, porque o mapa cita a seção 13, e o texto fica genérico.
- **O PMG** perde o segundo nome, interno, na seção 1. O nome PMG fica no resto: é o sistema que o Grafite substitui.

### 8. As pastas locais no `.gitignore`

A pasta dos roteiros da demonstração e a das worktrees do Claude Code entram no `.gitignore`, em "ferramentas locais". Assim, um clone novo também as ignora, e um `git add -A` não as leva.

### 9. A guarda dos termos

Um conferidor (`scripts/termos-privados.ts`) lê a lista de `GRAFITE_TERMOS_PRIVADOS` ou de `.grafite/termos-privados/` e procura cada termo nos arquivos de `git ls-files`, em texto e nos binários, sem diferença de caixa nem de acento.
- **Ele diz** só o arquivo e o número do termo na lista, nunca o termo nem a linha. O log de um repositório público fica sem o termo, mesmo que o GitHub não o mascare.
- **No CI:** é um passo do job "Segredos no histórico", com a lista no secret. Num PR de fork, sem o secret, ele diz que não conferiu. No push da branch principal, a falta do secret reprova.
- **No pre-commit:** é um comando do `lefthook.yml`, com a lista local. Sem a lista, ele diz que não conferiu.

Alternativas recusadas:
- **Regras próprias no gitleaks:** a configuração, com os termos, seria pública.
- **Os termos guardados em hash:** termos curtos se descobrem por força bruta, e o hash não acha um termo dentro de uma palavra.


### 10. A ordem e os commits

1. A lista local e as pastas no `.gitignore`.
2. Os testes e as fixtures, um tipo por tarefa.
3. Os documentos e o arquivo.
4. A guarda.
5. A verificação.

Cada tarefa é um commit `tipo(escopo): assunto`, com "Tarefa X.Y do limpar-arvore-para-publicar." no corpo. Os testes ficam verdes depois de cada uma. As mensagens dos commits também não citam os termos.

## Risks / Trade-offs

- **[A lista com CR ou com linha vazia]** → A tarefa 1.1 conta antes de trocar: as contagens têm de bater com as do inventário.
- **[Um termo que o inventário não achou]** → Ficam como rede:
  - o gitleaks;
  - as buscas genéricas da tarefa 5.3 (e-mails pessoais, pastas de usuário, links privados, IPs fora das faixas de exemplo);
  - as imagens conferidas à mão;
  - a guarda, desde esta change.
- **[O formatador tira o `gitleaks:allow` da linha]** → A tarefa 2.5 roda o gitleaks depois do `pnpm lint`.
- **[A troca muda uma captura visual]** → O nome novo tem as mesmas iniciais, e nenhuma história mostra o domínio. A regressão visual do PR roda sem `--atualizar`. Uma captura reprovada é sinal de troca errada.
- **[O histórico vazar na publicação]** → Fica para a change seguinte: o commit novo nasce sem pai, da árvore da `main`, com o autor no e-mail `noreply`, e nunca sai um push do clone antigo com `--all`, `--mirror` ou `--tags`.
- **[A guarda escrever um termo num log público]** → Ela só escreve o arquivo e o número do termo.
- **[Mexer no arquivo muda a história das decisões]** → Só o termo muda. O diff do PR mostra cada troca.

## Migration Plan

1. O ponto de partida: os PRs #75 e #76 entraram, e a `ci-nos-executores-do-github` está arquivada.
2. Montar a lista local a partir do inventário, guardado fora do repositório.
3. Fazer as tarefas em ordem no `dev`, um commit por tarefa, e abrir o PR do `dev` para a `main` no repositório antigo, com o CI verde.
4. O usuário faz o merge. A change é arquivada, com a coluna "Muda junto com" do mapa recalculada.
5. Depois, a change da publicação: o commit único da `main` limpa, já sem o `.gitleaksignore`, o repositório novo, as proteções e a passagem do `D:\grafite`.

**Volta:** reverter o PR. Fora do repositório só ficam a lista local e, com a guarda, o secret.

## Open Questions

Nenhuma. Em 09/11 o usuário decidiu:
- os nomes de pessoa, as séries, as faixas de rede e as salas dos exemplos são inventados e ficam;
- as cidades dos exemplos ficam, e saem só os fatos da planta real;
- a guarda dos termos entra nesta change.
