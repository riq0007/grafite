## Why

A change visual-sob-carga deu 30 s à espera da história na regressão visual, mas o CI do #45 mostrou mais duas reprovações pela carga do executor, sem defeito no código:
- na regressão visual, a captura "Identidade/Marca › Versoes · nevoa · 2560" passou dos 5 s do `toHaveScreenshot` esperando o elemento ficar estável, sem diferença de imagem. É o risco que o design da visual-sob-carga deixou registrado;
- no catálogo, a história "Muitas Abas Numa Faixa Estreita" espera a última aba entrar na faixa pelo `waitFor`, com 1 s, o padrão da Testing Library. Com a máquina carregada, a rolagem não terminou a tempo: a borda da aba ficou em 315,86 px, e o limite era 301. A testes-sob-carga passou essa espera a 10 s só nos testes da web.

Os dois jobs rodaram no PC-DEV enquanto o PC-DEV-2 e o PC-DEV-3 rodavam o CI do #35. Cada reprovação dessas pede um novo run e segura o merge.

A change pertence ao esqueleto técnico do F0 e à seção 12.2 da spec mestre, e nenhum requisito muda: o catálogo e a regressão visual verificam as mesmas coisas, sem depender da carga do executor.

Ficam fora desta change:
- a espera da comparação das capturas, que segue com os 5 s do padrão: a estabilidade passa a ser esperada antes dela (design, decisão 1);
- quantas instâncias do executor rodam ao mesmo tempo, que é da change ci-paralelo.

## What Changes

- **A estabilidade antes da captura:** a função `abrir()` da regressão visual espera, por até 30 s, a história ficar estável, antes da comparação, que segue com os 5 s.
- **As esperas do catálogo:** o `waitFor` e os `findBy` das histórias esperam até 10 s, no lugar de 1 s, pelo preparo dos testes do catálogo, e cada história tem 30 s, como os testes unitários.
- **Mapa:** o `docs/mapa.md` traz a change em andamento.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

Nenhuma: as verificações a cada PR (spec plataforma-base, "Qualidade verificada antes do commit e em cada PR") continuam as mesmas, e a change declara `skip_specs: true`.

## Impact

- **Testes:** `packages/ui/visual/visual.spec.ts`, `packages/ui/.storybook/vitest.setup.ts` e `packages/ui/vitest.config.ts`.
- **CI:** nenhum arquivo do workflow muda; os jobs "Regressão visual" e "Catálogo e ponta a ponta" deixam de reprovar por essas esperas.
