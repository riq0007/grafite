## Why

Desde a ci-paralelo, o CI roda três jobs ao mesmo tempo na mesma máquina, e quatro esperas ficaram curtas para a máquina carregada, sem defeito nenhum no código:
- a integração passou dos 15 min do job em cinco runs seguidos, nos PRs #35, #45 e #55. Num run sem carga, a suíte da API leva uns 10 min; com outros jobs ao lado, cada pacote anda de 1,5 a 2,2 vezes mais devagar;
- o teste de desempenho da importação, que aplica uma planilha de 5.000 linhas, mediu 197,8 s no CI da `main` depois do merge do #35, e o limite dele é 180 s. A `main` ficou vermelha;
- a regressão visual passou dos 15 min do job uma vez, no CI do #35, com as esperas de 30 s da visual-sob-carga;
- o preparo do `svg.test.ts` da API, que carrega o jsdom e o DOMPurify no primeiro SVG, passou de 60 s no CI do #55. Em seguida, o `afterAll` tentou fechar o servidor que o preparo seguinte não chegou a abrir, e um segundo erro escondeu o primeiro.

No CI do próprio PR desta change (#57), mais duas esperas reprovaram com a máquina carregada:
- a regressão visual esperou os 5 s do padrão do Playwright para comparar uma captura, ainda à espera de a tela ficar parada;
- a ponta a ponta da pilha esperou 30 s pelo aviso "Foto trocada.", e a API ainda processava a primeira foto: ela carrega a biblioteca de imagens e grava as variantes em WebP.

E, no run seguinte, mais duas:
- o teste das fotos da API que entrega o SVG sanitizado passou dos 30 s: é o primeiro SVG do arquivo, que carrega o jsdom e o DOMPurify, como o preparo do `svg.test.ts`;
- a história "Menu Reaberto Pelo Teclado" do Dock confere que o menu ainda está saindo da tela logo depois da escolha, e a saída dura só 120 ms: a asserção chegou depois dela.

Cada reprovação dessas pede um novo run, segura o merge e deixa a `main` vermelha.

A change pertence ao esqueleto técnico do F0 e à seção 12.2 da spec mestre, como a testes-sob-carga, e nenhum requisito muda: o CI verifica as mesmas coisas, com tempo para a máquina carregada.

Ficam fora desta change:
- deixar a importação mais rápida, que pede uma change própria se o limite novo ficar apertado;
- quantas instâncias do executor rodam ao mesmo tempo, que é da ci-paralelo;
- as tarefas abertas da ci-paralelo e da ci-no-executor-proprio.

## What Changes

- **O limite dos jobs:** a integração e a regressão visual passam a 30 min no `ci.yml`; os outros jobs ficam com os 15 min.
- **O teste de desempenho da importação:** o limite vai a 480 s, e o tempo do teste, a 540 s, com o motivo no comentário.
- **O preparo do `svg.test.ts`:** a espera do primeiro SVG vai a 120 s, e o `afterAll` só fecha o servidor que o preparo abriu.
- **A comparação das capturas:** a espera da comparação da regressão visual vai de 5 s a 30 s.
- **A primeira foto da pilha:** a espera do aviso "Foto trocada." na ponta a ponta da pilha vai de 30 s a 120 s.
- **O SVG das fotos:** o teste das fotos que entrega o SVG sanitizado vai a 120 s, como o preparo do `svg.test.ts`.
- **O menu reaberto do Dock:** a história dura a saída do menu em 5 s, para a seta o reabrir antes do fim dela.
- **Também:** as referências do CLAUDE.md ganham o P2 e o P3 arquivados, que saíram do PR do arquivamento (#55) para ele ficar só com documentação e specs.
- **Mapa:** o `docs/mapa.md` traz a change em andamento.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

Nenhuma: as verificações a cada PR (spec plataforma-base, "Qualidade verificada antes do commit e em cada PR") continuam as mesmas, e a change declara `skip_specs: true`.

## Impact

- **CI:** `.github/workflows/ci.yml`.
- **Testes:** `apps/api/src/rotas/importacoes-aplicacao.int.test.ts`, `apps/api/src/arquivos/svg.test.ts`, `apps/api/src/rotas/fotos.int.test.ts`, `packages/ui/visual/playwright.config.ts`, `packages/ui/src/casca/Dock.stories.tsx` e `apps/web/e2e-pilha/caminho.spec.ts`.
- **Documentação:** o `CLAUDE.md` e o mapa.
