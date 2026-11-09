## Context

O `pnpm test:visual` compila o Storybook no Windows e tira as capturas no contêiner oficial do Playwright, que serve o Storybook compilado a partir da pasta do pacote de UI montada nele. São 593 testes em 5 navegadores ao mesmo tempo (`fullyParallel`, com o número do padrão). Cada teste abre a história pela função `abrir()`:
- navega ao `iframe.html` da história;
- espera o primeiro elemento visível do `#storybook-root`, com o tempo do `expect`, os 5 s do padrão;
- espera a rede parar e as fontes carregarem;
- compara a captura pelo `toHaveScreenshot`, que tenta de novo até o mesmo tempo do `expect` acabar.

O teste inteiro tem os 30 s do padrão do Playwright, e o job tem 15 min no workflow. Num run sem carga, a regressão visual leva uns 6 min e cada teste, uns 2,5 s.

A change testes-sob-carga deu tempo para a carga nos testes unitários (30 s por teste) e nas esperas da Testing Library (10 s), e deixou a regressão visual de fora. O motivo desta change está na proposta.

## Goals / Non-Goals

**Goals:**
- A captura que bate com a referência passa com o executor carregado.
- A captura que diverge da referência reprova em quanto tempo reprovaria hoje.

**Non-Goals:**
- Mudar as capturas, as referências ou a tolerância da comparação.

## Decisions

### 1. A espera da história em 30 s

A função `abrir()` espera o conteúdo do `#storybook-root` por até 30 s, pelo `timeout` do próprio `toBeVisible`, com o motivo no comentário. A espera só acaba antes quando a história aparece, então a captura que passa não fica mais lenta. Os 30 s são o tempo do teste unitário na testes-sob-carga, e o teste mais lento visto no CI levou 12 s do começo ao fim.

Alternativa descartada: o tempo do `expect` na configuração, para todas as esperas. Ele vale também para o `toHaveScreenshot`: uma captura diferente da referência levaria 30 s para reprovar, e uma mudança que altera centenas de capturas passaria dos 15 min do job.

Alternativa descartada: menos navegadores ao mesmo tempo. A carga vem dos outros jobs da máquina, e a regressão visual ficaria perto dos 15 min do job.

Alternativa descartada: repetir o teste que reprova (`retries`). Isso esconde a reprovação instável e dobra o tempo da captura que diverge de verdade.

### 2. O teste em 60 s, e a comparação com os 5 s do padrão

O tempo de cada teste vai a 60 s na configuração do Playwright da regressão visual, para caber a espera da história, a da rede e das fontes e a comparação. O `toHaveScreenshot` segue com os 5 s do padrão: nos três runs reprovados, todas as reprovações foram na espera da história, e nenhuma na comparação.

## Risks / Trade-offs

- [Uma história que não abre, por erro no componente, leva 30 s para reprovar, no lugar de 5 s] → só a história que já reprovaria fica mais lenta, e o CI mostra qual.
- [Com o Storybook compilado quebrado, todas as histórias esperam 30 s] → o job reprova pelo limite de 15 min, no lugar de reprovar história a história; o log mostra a espera.
- [A carga também atrasar a comparação das capturas] → nenhum run mostrou isso; se aparecer, a espera da comparação entra numa change própria.
