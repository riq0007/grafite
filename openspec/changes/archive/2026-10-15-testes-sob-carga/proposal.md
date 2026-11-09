## Why

Desde que o CI passou aos executores próprios, três instâncias rodando na mesma máquina Windows, testes reprovam PRs sem defeito nenhum no código:
- os testes do coletor estouram os 5 s do padrão do Vitest quando o executor está carregado: o que sobe o processo do coletor e o primeiro de `app.test.ts`, que monta o Fastify a frio, passaram dos 5 s em quatro PRs no mesmo dia (#40, #43, #46 e #47);
- o teste "com o código errado, os códigos não mudam", de `dois-passos-da-conta`, compara os códigos de recuperação lidos sem `ORDER BY`, numa lista com a ordem do banco, e reprovou no #39 com os mesmos dez códigos em outra ordem;
- com o `pnpm test` dos nove pacotes rodando ao lado dos jobs do CI, na mesma máquina, os testes da partida da API passam do limite de 15 s do processo, o teste do contrato da API passa dos 5 s, e também os derivados da marca, na UI, e as telas dos modelos e das visões, na web;
- com as três instâncias do executor no ar, a espera de 1 s da Testing Library não bastou: no CI do #35, no PC-DEV-2, o `Modelos.test.tsx` não achou a tabela dos modelos ("Unable to find role=\"grid\" and name \"Modelos\"");
- a história "Busca Com Sugestoes De Fora", do catálogo, digita "ana.s", acha "Ana Souza" na lista e confere na hora que "Anabela Reis" não está nela. A API simulada responde 400 ms depois de cada tecla, e com o executor carregado a digitação fica lenta: a resposta para "ana", com as duas, chega antes da de "ana.s", e a conferência pega a lista do meio. Ela reprovou assim no CI do #52.

Cada reprovação dessas pede um novo run do job e segura o merge. A change pertence ao esqueleto técnico do F0 e à seção 12.2 da spec mestre, e nenhum requisito muda: o CI verifica as mesmas coisas, sem depender da carga do executor nem da ordem em que o banco devolve as linhas.

Ficam fora desta change:
- o teste de desempenho da tabela dos ativos, cujo p95 passa dos 300 ms com o executor carregado: o limite é do requisito, e a carga do executor é da change ci-paralelo;
- a regressão visual da Central de notificações, que reprovou uma vez sem achar o elemento: ainda sem a causa;
- quantas instâncias do executor rodam ao mesmo tempo, que é da change ci-paralelo.

## What Changes

- **O tempo limite dos testes unitários:** o `testTimeout` de 30 s, como o do pacote da operação, no `vitest.config.ts` novo do coletor, no da API, no da web e no projeto unitário da UI.
- **O limite do processo nos testes da partida da API:** 60 s, como o do comando da operação, no lugar dos 15 s.
- **As esperas da Testing Library na web:** o `findBy` e o `waitFor` esperam até 10 s, no lugar de 1 s, pelo arquivo de preparo dos testes da web, e o teste do resumo da linha deixa a espera própria de 3 s.
- **A história da busca com sugestões de fora** espera a lista da última resposta antes de conferir que "Anabela Reis" não está nela.
- **A comparação dos códigos de recuperação** independe da ordem: os identificadores lidos são comparados ordenados.
- **Mapa:** o `docs/mapa.md` traz a change em andamento.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

Nenhuma: as verificações a cada PR (spec plataforma-base, "Qualidade verificada antes do commit e em cada PR") continuam as mesmas, e a change declara `skip_specs: true`.

## Impact

- **Testes:** `apps/collector/vitest.config.ts` (novo), `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts`, `packages/ui/vitest.config.ts`, `apps/api/src/servidor.test.ts`, `apps/api/src/rotas/dois-passos-da-conta.int.test.ts`, `apps/web/src/teste/preparar.ts`, `apps/web/src/modulos/ativos/tabela/PreviaEResumo.test.tsx` e `packages/ui/src/componentes/campo/Campos.stories.tsx`.
- **CI:** nenhum arquivo do workflow muda; os jobs "Lint, tipos, unitários e contratos", "Integração com PostgreSQL real" e "Catálogo e ponta a ponta" deixam de reprovar por essas causas.
