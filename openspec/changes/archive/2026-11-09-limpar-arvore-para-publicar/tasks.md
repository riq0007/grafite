## 1. Preparação

- [x] 1.1 A lista local dos termos e as pastas locais no `.gitignore` (decisões 1 e 8):
  - copiar as listas do inventário, guardado fora do repositório, para `.grafite/termos-privados/`, uma por tipo, com fim de linha LF;
  - acrescentar ao `.gitignore`, em "ferramentas locais", a pasta dos roteiros da demonstração (`/demonstracao/`) e a das worktrees do Claude Code (`.claude/worktrees/`).

  Verificar:
  - `git check-ignore -v .grafite/termos-privados/dominio.txt demonstracao .claude/worktrees` aponta o `.gitignore` nas três;
  - antes de qualquer troca, `git grep -n -i -F -f .grafite/termos-privados/<lista>.txt | wc -l` dá as contagens do inventário: domínio 46, máquinas 57, pessoa 6, ambiente 9, planta 26, fixtures 6 e links 14. As contagens são as da árvore de 09/11, com a `ci-nos-executores-do-github` já arquivada. Se a busca der outro número, o inventário é refeito antes de qualquer troca.

## 2. Os testes e as fixtures, com as expectativas juntas

- [x] 2.1 O domínio da empresa (decisão 2):
  - os testes do comando de operação (`apps/operacao/src/comando.test.ts` e `apps/operacao/src/painel/tarefas.test.ts`);
  - o das configurações do painel (`apps/painel/src/configuracoes/Configuracoes.test.tsx`);
  - o de integração dos endereços da organização (`apps/api/src/comando/organizacao.int.test.ts`), com a organização "Acme";
  - o exemplo da seção "Endereços" do runbook;
  - o cenário "Endereço acrescentado": a spec `operacao-servicos`, sincronizada pela delta desta change, e a delta arquivada da `painel-da-operacao`.

  Verificar:
  - `pnpm --filter @grafite/comando-de-operacao test` e `pnpm --filter @grafite/painel test` passam;
  - `pnpm --filter @grafite/api test:integration -- src/comando/organizacao.int.test.ts` passa;
  - a lista `dominio.txt` não acha nada.
- [x] 2.2 O nome do desenvolvedor (decisão 2):
  - os testes das iniciais e do avatar (`packages/ui/src/componentes/avatar/iniciais.test.ts` e `packages/ui/src/componentes/exibicao/Exibicao.test.tsx`);
  - as histórias que o mostram (`Exibicao.stories.tsx` e `Matriz.stories.tsx`).

  Verificar:
  - `pnpm --filter @grafite/ui test` e `pnpm test:stories` passam;
  - a lista `pessoa.txt` não acha nada;
  - no PR, a regressão visual passa sem nenhuma captura regravada.
- [x] 2.3 As séries das gravações SNMP e o telefone (decisão 4):
  - as duas gravações e o `apps/collector/src/snmp.test.ts`, juntos;
  - o `packages/domain/src/pessoas/pessoa.test.ts`.

  Verificar: `pnpm --filter @grafite/collector test` e `pnpm --filter @grafite/domain test` passam, e a lista `fixtures.txt` não acha nada.
- [x] 2.4 A planta real nos testes e no cenário (decisões 4 e 6):
  - o trecho do modelo vira a `planta-exemplo`, com medidas e posições inventadas, nos testes do mapa no domínio, na API, no banco e na web;
  - o comentário do modelo do PMG em `packages/domain/src/mapa/mapa.ts`;
  - o cenário "Planta do PMG importada": a spec `mapa-da-planta`, sincronizada pela delta desta change, e a delta arquivada do P7.

  Verificar:
  - `pnpm --filter @grafite/domain test` e `pnpm --filter @grafite/web test` passam;
  - `pnpm --filter @grafite/api test:integration -- src/rotas/mapa.int.test.ts` e `pnpm --filter @grafite/db test:integration -- src/mapa.int.test.ts` passam;
  - a lista `planta.txt` só acha a spec mestre e a change do P7, que a 3.3 trata.
- [x] 2.5 Os falsos positivos do gitleaks (decisão 5): o `gitleaks:allow` na linha de cada um dos quatro, com o motivo. O `.gitleaksignore` fica até a publicação.

  Verificar:
  - `pnpm lint` e `pnpm test` passam, e o comentário ficou na linha do valor depois do formatador;
  - o gitleaks da versão do CI (`ghcr.io/gitleaks/gitleaks:v8.30.1`) dá "no leaks found" no modo `dir`, sobre uma cópia dos arquivos versionados, tirada pelo `git ls-files` para uma pasta fora do repositório;
  - no PR, o job "Segredos no histórico" passa.

## 3. Os documentos e o arquivo das changes

- [x] 3.1 As máquinas, a conta e a VM de testes (decisões 2 e 3), nas changes arquivadas, na `ci-nos-executores-do-github` já arquivada e no mapa. Verificar: a lista `maquinas.txt` não acha nada, e o teste-guarda do mapa passa (`pnpm exec vitest run scripts/mapa.test.ts`).
- [x] 3.2 O ambiente real da empresa (decisão 3):
  - o guia do agente do GLPI e o das integrações da rede, sem a marca do antivírus, sem o diagnóstico datado da estação e sem a leitura, o local e a data da impressora;
  - a change arquivada das integrações da rede, do mesmo jeito;
  - na change arquivada do instalador, a licença do Windows Server dita como a versão da produção.

  Verificar:
  - a lista `ambiente.txt` só acha o outro nome do PMG na spec mestre, que a 3.3 trata;
  - os dois guias continuam dizendo o que fazer com o `certificate verify failed` e com a impressora que recusa o GETBULK.
- [x] 3.3 A spec mestre e a change do P7 (decisões 6 e 7):
  - a planta do mapa 3D sem a cidade, na seção 3.4;
  - os fatos da planta real fora da proposta, do design e das tarefas do P7;
  - o PMG sem o outro nome interno, na seção 1;
  - a seção 13.3 genérica, com o título mantido.

  Verificar: as listas `planta.txt` e `ambiente.txt` não acham nada, e o teste-guarda do mapa passa.
- [x] 3.4 Os links para fora do repositório (decisão 3):
  - o repositório anterior, privado, sem link e sem o comando da API dele;
  - a página dos desenhos aprovados, sem o endereço.

  Verificar: a lista `links.txt` não acha nada.

## 4. A guarda dos termos (decisão 9)

- [x] 4.1 Escrever primeiro o teste do conferidor (`scripts/termos-privados.test.ts`), com termos de ensaio, e depois o conferidor (`scripts/termos-privados.ts`). O teste cobre:
  - o termo achado sem diferença de caixa e de acento, num arquivo de texto e num binário;
  - a saída só com o arquivo e o número do termo, nunca com o termo nem a linha;
  - a falta da lista, que diz que não conferiu e não reprova;
  - a falta da lista no push da branch principal, que reprova.

  Verificar:
  - o teste reprova antes do conferidor existir, pelo motivo certo, e passa depois;
  - `node scripts/termos-privados.ts`, com a lista local, não acha nada.
- [x] 4.2 O passo "Termos privados" no job "Segredos no histórico" do `ci.yml`, com a lista no secret `GRAFITE_TERMOS_PRIVADOS`, e o comando `termos` no pre-commit do `lefthook.yml`, com a lista local. O usuário cadastra o secret.

  Verificar:
  - os testes-guarda dos workflows (`scripts/ci/executores.test.ts` e `scripts/ci/powershell.test.ts`) passam;
  - no PR, o passo roda e passa;
  - com um termo de ensaio na lista local, o pre-commit recusa um arquivo que o tem e diz só o arquivo e o número.

## 5. Verificação

- [x] 5.1 O mapa traz a change em andamento, e as verificações completas passam:
  - `pnpm lint`, `pnpm typecheck` e `pnpm test`;
  - `pnpm test:integration`, `pnpm test:stories` e `pnpm test:e2e`;
  - `openspec validate limpar-arvore-para-publicar --strict`.

  Verificar: os comandos passam, e o PR fica com todos os jobs verdes, com a regressão visual sem nenhuma captura regravada.
- [x] 5.2 O gitleaks como o CI do repositório novo vai rodar: num clone descartável, fora do `D:\grafite`, um commit sem pai feito da árvore do `HEAD` (`git commit-tree HEAD^{tree}`), varrido por `gitleaks git --log-opts=HEAD` na imagem `v8.30.1`. Verificar: "no leaks found".
  - Em 09/11, a árvore do `HEAD` virou um commit sem pai, com o autor no e-mail `noreply`. O `gitleaks git` deu "1 commits scanned" e "no leaks found", em 31,3 MB.
  - No modo `dir`, sobre os 3.646 arquivos versionados copiados para fora do repositório, também deu "no leaks found". Os quatro falsos positivos saem só pelo `gitleaks:allow`.
- [x] 5.3 A busca final na árvore inteira, tipo por tipo, com os binários:
  - cada lista de `.grafite/termos-privados/`, inclusive a `amplos.txt`, não acha nada (`git grep -n -i -F -f <lista>`, sem `-I`);
  - nenhum e-mail pessoal: `git grep -n -i -E "@(gmail|hotmail|outlook|yahoo|live|icloud)\."` não acha nada;
  - nenhuma pasta de usuário além dos exemplos dos testes: `git grep -n -i -E 'Users[\\/]'` só acha `ana`, `ti` e `Public`;
  - nenhum link para um repositório privado nem para uma página do Claude;
  - os IPs privados só nas faixas de exemplo do inventário.

  Verificar: as buscas não acham nada fora do esperado, e as contagens ficam registradas nesta tarefa.

  Contagens de 09/11, na árvore com as tarefas 1.1 a 4.2:
  - as oito listas, inclusive a `amplos.txt`, que achava 54 linhas antes da limpeza: 0 cada uma;
  - e-mails pessoais: 0;
  - pastas de usuário: só `Users\Public`, 4 vezes;
  - links para o repositório anterior ou para uma página do Claude: 0;
  - IPs fora das faixas privadas, de documentação e de loopback: 33 textos, e nenhum é um endereço. São pedaços de OIDs do SNMP (`1.3.6.1…`), versões de navegador nos user agents (`114.0.0.0`, `129.0.0.0`, `130.0.0.0`) e o DNS público `8.8.8.8`.
