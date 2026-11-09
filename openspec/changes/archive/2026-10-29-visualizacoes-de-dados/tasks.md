## 1. As funções puras

- [x] 1.1 Escrever primeiro os testes e depois as funções dos instrumentos:
  - `posicaoNaRegua`, a posição limitada de 0 a 100%;
  - `formatarNumero`, os milhares do pt-BR e a unidade com o espaço fino;
  - `resumoDosDias`, as contagens e o texto;
  - `caminhoDaTendencia`, o caminho do SVG, com um ponto e sem pontos.

  Verificar: os testes do `dados/calculos.test.ts` passam.

## 2. Os componentes

- [x] 2.1 Escrever primeiro os testes e depois o `Medidor`:
  - o papel `meter` e os atributos;
  - o limite;
  - o sem valor.

  Verificar: o `Medidor.test.tsx` passa com "Nível do toner com o limite da regra" e "Sem valor".
- [x] 2.2 Escrever primeiro os testes e depois o `Cartucho`:
  - a placa e a letra;
  - o medido, o hachurado e o texto do sem dado e do inconsistente;
  - a estimativa.

  Verificar: o `Cartucho.test.tsx` passa com "Toner preto num tema escuro" e "Nível que a impressora não mede".
- [x] 2.3 Escrever primeiro os testes e depois a `FaixaDeDias`: as formas, a lista para o leitor de tela e o resumo. Verificar: o `FaixaDeDias.test.tsx` passa com "Dias sem backup".
- [x] 2.4 Escrever primeiro os testes e depois a `Tendencia` e a `Contagem`:
  - o SVG, o último valor, o período e o nome acessível;
  - o numeral, a capacidade com a régua e a variação em texto.

  Verificar: os testes passam com "Rostos de um controle" e "Rostos com a capacidade".

## 3. O catálogo e o fechamento

- [x] 3.1 Criar as histórias da seção Visualização de dados, nos estados de cada instrumento, e exportar os componentes no `index.ts`. Verificar: o `pnpm test:stories` passa com as histórias novas.
- [x] 3.2 Gravar as capturas novas da regressão visual. Verificar: o `pnpm test:visual` passa.
- [x] 3.3 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test` e `openspec validate visualizacoes-de-dados --strict`. Verificar: os comandos passam. Feito em 29/10: o lint, o typecheck e a validação passaram, e os testes dos dez pacotes também, com os da web rodados de novo depois que um processo do Vitest caiu sob a carga da máquina.
