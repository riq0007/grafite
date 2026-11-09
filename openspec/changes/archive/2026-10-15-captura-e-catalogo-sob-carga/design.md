## Context

Na regressão visual, a função `abrir()` espera até 30 s a história aparecer, desde a visual-sob-carga, e depois a rede parar e as fontes carregarem. Em seguida, o `toHaveScreenshot` tira a captura do elemento:
- rola o elemento para a vista e espera ele ficar estável, com a mesma caixa em dois quadros seguidos;
- tira capturas até duas seguidas baterem e compara a última com a referência;
- tenta de novo até o tempo do `expect`, os 5 s do padrão, acabar.

Com a máquina carregada, só a espera da estabilidade passou dos 5 s uma vez.

No catálogo, o projeto "catalogo" do Vitest roda cada história no Chromium, com o `.storybook/vitest.setup.ts` como arquivo de preparo. As histórias usam o `waitFor` e os `findBy` do `storybook/test`, que traz a própria Testing Library, com a espera de 1 s do padrão. O projeto não tem `testTimeout`, e fica com os 15 s do padrão do Vitest no navegador. A web já espera 10 s pela Testing Library e dá 30 s a cada teste (testes-sob-carga, decisões 1 e 2).

O motivo desta change está na proposta.

## Goals / Non-Goals

**Goals:**
- A captura não reprova por esperar o elemento ficar estável com a máquina carregada.
- As histórias do catálogo esperam a tela com a mesma folga dos testes da web.

**Non-Goals:**
- Mudar o tempo da comparação das capturas ou o que as histórias verificam.

## Decisions

### 1. A estabilidade esperada antes da captura

A função `abrir()` chama o `scrollIntoViewIfNeeded`, com 30 s, na raiz da história, depois das fontes. No Playwright, ele espera o elemento ficar estável, a mesma verificação que a captura do elemento faz, e rola o elemento para a vista, o que a captura também faria. Com o elemento estável, a verificação da captura passa na hora, e os 5 s do `toHaveScreenshot` ficam para a comparação.

Alternativa descartada: o tempo do `toHaveScreenshot` maior. Ele tenta de novo até o tempo acabar, e a captura que diverge da referência levaria esse tempo inteiro para reprovar. Foi por isso que a visual-sob-carga manteve os 5 s.

Alternativa descartada: repetir o teste que reprova. Isso esconde a reprovação instável e dobra o tempo da captura que diverge de verdade.

### 2. As esperas do catálogo em 10 s, e cada história em 30 s

O preparo dos testes do catálogo passa a espera da Testing Library a 10 s pelo `configure` do `storybook/test`, a mesma instância que as histórias importam. A espera só acaba antes quando o que a história procura aparece. O projeto "catalogo" ganha `testTimeout: 30_000`, para caber a história que espera mais de uma coisa. São os mesmos valores da web.

Alternativa descartada: a espera maior só na história das abas. A carga atrasa qualquer história, como a testes-sob-carga viu na web.

Alternativa descartada: o `configure` no `preview.tsx`. Ele mudaria também o Storybook aberto à mão, e a folga é para os testes no executor carregado.

## Risks / Trade-offs

- [Uma história que procura o que nunca aparece leva 10 s para reprovar, no lugar de 1 s] → só a história que já reprovaria fica mais lenta.
- [A história estável fica instável de novo antes da captura] → a captura ainda confere a estabilidade com os 5 s dela; nenhum run mostrou o elemento mudar depois de estável.
- [Uma história que nunca fica estável leva 30 s para reprovar] → só a história que já reprovaria fica mais lenta.
