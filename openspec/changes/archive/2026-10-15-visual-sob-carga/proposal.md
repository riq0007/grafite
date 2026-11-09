## Why

Com o CI em três instâncias do executor próprio na mesma máquina Windows, a regressão visual reprova PRs sem diferença nenhuma nas capturas. Antes de cada captura, a função `abrir()` espera a história aparecer no `#storybook-root` com os 5 s do padrão do `expect` do Playwright. Com o executor carregado, abrir uma história passa disso, e o teste reprova com "element(s) not found" antes de comparar a imagem:
- no CI do #35, no PC-DEV-2, a regressão visual reprovou duas vezes, com 88 e com 7 histórias, enquanto a mesma máquina gerava o pacote para Windows e rodava a pilha e a integração em outros jobs. Nas janelas das reprovações, cada teste passou de uns 2,5 s para 5 a 12 s;
- no CI do #50, no PC-DEV, reprovou do mesmo jeito, com 127 histórias;
- a reprovação da Central de notificações que a change testes-sob-carga deixou sem causa tem o mesmo sintoma: o elemento não apareceu.

Nenhuma dessas reprovações foi uma diferença de imagem: as capturas comparadas bateram com as referências. Cada reprovação pede um novo run do job e segura o merge, e com a ci-paralelo os jobs pesados rodam juntos com mais frequência.

A change pertence ao esqueleto técnico do F0 e à seção 12.2 da spec mestre, e nenhum requisito muda: a regressão visual compara as mesmas capturas, com a mesma tolerância, sem depender da carga do executor.

Ficam fora desta change:
- quantas instâncias do executor rodam ao mesmo tempo, que é da change ci-paralelo;
- a espera da comparação das capturas, que segue com os 5 s do padrão (design, decisão 2).

## What Changes

- **A espera da história:** a função `abrir()` da regressão visual espera até 30 s pelo conteúdo do `#storybook-root`, no lugar dos 5 s do padrão, com o motivo no comentário.
- **O tempo de cada teste da regressão visual:** 60 s, no lugar dos 30 s do padrão do Playwright, para caber a espera da história, a das fontes e a comparação.
- **A comparação das capturas** não muda: a mesma espera de 5 s e a mesma tolerância.
- **Mapa:** o `docs/mapa.md` traz a change em andamento.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

Nenhuma: as verificações a cada PR (spec plataforma-base, "Qualidade verificada antes do commit e em cada PR") continuam as mesmas, e a change declara `skip_specs: true`.

## Impact

- **Testes:** `packages/ui/visual/visual.spec.ts` e `packages/ui/visual/playwright.config.ts`.
- **CI:** nenhum arquivo do workflow muda; o job "Regressão visual" deixa de reprovar pela carga da máquina, e a captura que diverge da referência reprova como antes.
