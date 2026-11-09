## 1. Portas por instância

- [x] 1.1 Escrever primeiro o teste e depois o módulo das portas dos testes da web (design, decisão 1).
  - Sem a variável, vale o padrão: 4173 para a `GRAFITE_E2E_PORTA` e 4174 para a `GRAFITE_PILHA_PORTA`.
  - Com um valor válido, vale o valor.
  - Com um valor fora de 1024–65535, ou que não é um inteiro, o erro nomeia a variável e o valor recebido.
  - Verificar: o teste reprova sem o módulo e passa com ele.
- [x] 1.2 Usar o módulo nas duas configurações do Playwright e no `e2e-pilha/subir.ts`, com o coletor na porta seguinte à da pilha, e repassar a `GRAFITE_E2E_PORTA` à `test:e2e` no `turbo.json`.
  - Verificar: `pnpm test:e2e` e `pnpm test:e2e:pilha` passam sem as variáveis.
  - Verificar: com `GRAFITE_E2E_PORTA=4273` e `GRAFITE_PILHA_PORTA=4274`, os dois passam servindo nessas portas, conferido pelo `netstat` durante o teste.

## 2. Cache do turbo

- [x] 2.1 Mover o guarda do mapa de `apps/web/src/modulos/` para `scripts/` (design, decisão 4), com a citação dele no mapa.
  - Verificar: `pnpm test` passa, com o guarda do mapa rodando pelos testes da raiz.
- [x] 2.2 Escrever primeiro o guarda das entradas em `scripts/` e depois fazê-lo passar (design, decisão 4):
  - criar os `turbo.json` de `apps/web`, `apps/operacao`, `apps/collector` e `packages/ui` com as entradas `$TURBO_ROOT$/`;
  - pôr o `tsconfig.base.json` nas `globalDependencies`.
  - Verificar: antes das declarações, o guarda reprova nomeando os testes da web, do comando de operação, da versão do coletor e dos derivados da marca.
  - Verificar: `pnpm test` passa, com o guarda e o mapa.
  - Verificar: `turbo run test --dry=json` mostra os documentos nas entradas de cada pacote.
  - Verificar: mudar só o `docs/operacao/runbook.md` muda o hash do teste de `apps/operacao` e de mais nenhum pacote.
- [x] 2.3 Pôr o cache do turbo na pasta `_turbo` da instância, pela ação de preparo, com as entradas de mais de 7 dias apagadas antes (design, decisão 3).
  - Verificar: no CI do PR, rodar de novo o mesmo commit mostra os `test` e `typecheck` dos pacotes como "cache hit".
  - Verificar: o passo dos unitários cai de cerca de 2 min para segundos.
  - Conferido em 24/10 no CI da main depois do #71 (run 40137029864), com o mesmo conteúdo do PR: o `typecheck` e o `test` com os 9 pacotes do cache ("FULL TURBO"), e o passo dos unitários em menos de 1 s.

## 3. PR só de documentação

- [x] 3.1 Escrever primeiro o teste e depois o `scripts/ci/mudancas.ts` (design, decisão 5).
  - Uma lista só com `docs/` e `openspec/` dá `codigo=false`.
  - Um arquivo fora deles, uma lista vazia ou um evento de push dão `codigo=true`.
  - Verificar: o teste reprova sem o script e passa com ele.
- [x] 3.2 Pôr o job `mudancas` no `ci.yml`.
  - Os jobs de integração, navegador, pilha e visual dependem dele e rodam só com `codigo=true`.
  - Com `codigo=false`, o resumo do run diz que foram pulados porque só a documentação e as specs mudaram.
  - Verificar: neste PR, que muda código, os seis jobs rodam.
  - Verificar: um PR de ensaio que muda só um `.md` de `docs/` mostra os quatro jobs pulados, com o motivo no resumo, e os outros verdes. Fechar o PR de ensaio sem merge.
  - Conferido em 24/10 com PRs de verdade, no lugar do PR de ensaio: no #69, que muda código, todos os jobs rodaram; no #71, só de `openspec/`, os quatro foram pulados, com o motivo no resumo do run, e os outros ficaram verdes.

## 4. Instâncias

- [x] 4.1 Levar o job "Instalação num Windows" ao rótulo `instalacao` (design, decisão 2) e pôr o rótulo no PC-DEV pela API, com a confirmação do usuário.
  - Verificar: `gh api .../actions/runners` mostra o rótulo só no PC-DEV.
  - Verificar: o `versao.yml` do PR roda a instalação nele.
- [x] 4.2 Levar os jobs do CI, o pacote e a release ao rótulo `preparado` (design, decisão 2), no merge da `main`, que pôs todos os jobs no `instalacao`, e pôr o rótulo no PC-DEV pela API.
  - Verificar: `gh api .../actions/runners` mostra o `preparado` e o `instalacao` no PC-DEV, e nenhum dos dois no PC-TI.
  - Verificar: o CI do PR roda nos executores com o `preparado`, e a instalação de teste, no com o `instalacao`.
- [x] 4.3 Escrever o `.github/scripts/registrar-executor.ps1` (design, decisão 6).
  - A versão do runner é fixada com o SHA-256 da release.
  - O `-Ensaio` não muda nada.
  - Com `-Numero 1`, o script só grava o `.env` da instância que já existe e reinicia o serviço dela, sem reiniciar no meio de um job.
  - Verificar: no PowerShell 5.1, `-Numero 2 -Ensaio` diz a pasta `C:\actions-runner-2`, o nome `PC-DEV-2`, os rótulos, com o `preparado`, e o `.env` com 4373 e 4374, sem pedir token nem senha e sem criar a pasta.
  - Verificar: `-Numero 1 -Ensaio` diz a pasta `C:\actions-runner` e o `.env` com 4273 e 4274, sem registrar nada.
  - Verificar: sem elevação, o script para dizendo que precisa de administrador.
- [x] 4.4 O usuário roda o script como administrador com `-Numero 1`, `-Numero 2` e `-Numero 3`.
  - Verificar: `gh api .../actions/runners` mostra as três instâncias do PC-DEV online, com o `preparado`.
  - Verificar: o `.env` de cada uma tem as portas da sua linha na tabela da decisão 1.
  - Conferido em 27/10, depois do `-Numero 1`: as três instâncias online, com o `preparado` só no PC-DEV, como a 4.5 deixou, e o `.env` de cada uma com as portas da tabela. O serviço da primeira reiniciou um segundo depois de gravar o `.env`.
- [x] 4.5 Deixar o rótulo `preparado` só no PC-DEV, tirando-o do PC-DEV-2 e do PC-DEV-3 pela API, a pedido do usuário em 21/10 (design, decisão 2, revisão).
  - Atualizar antes a seção 12.2 da spec mestre, o mapa e o comentário do `ci.yml`: o CI roda numa instância só, um job de cada vez.
  - Verificar: `gh api .../actions/runners` mostra o `preparado` só no PC-DEV, e as três instâncias online.

## 5. Fechamento

- [x] 5.1 Atualizar a documentação:
  - a seção 12.2 da spec mestre diz que o PC-DEV roda três instâncias, com as portas por instância, a instalação numa só e os jobs pesados pulados em PR só de documentação;
  - o mapa (`docs/mapa.md`) traz a change em andamento.
  - Verificar: `pnpm test` passa, com o guarda do mapa.
- [x] 5.2 Conferir com uma instância (design, decisão 2, revisão de 21/10), no próximo PR com código.
  - Verificar: todos os jobs rodam no PC-DEV, um de cada vez, verdes sem rerun e sem porta ocupada.
  - Anotar no PR o tempo do início ao fim e o de cada job.
  - Feito no #65 (P4d · Solicitações), em 22/10: os sete jobs no PC-DEV, um de cada vez, verdes na primeira tentativa, em 25 min 56 s, com a integração no mais longo, 9 min 17 s; os tempos estão no comentário do PR.
- [x] 5.3 Conferir as verificações: `pnpm lint`, `pnpm typecheck` e `openspec validate ci-paralelo --strict` sem erros, e o CI do PR verde nos dois workflows.
