## 1. O medidor compacto

- [x] 1.1 Escrever primeiro os testes da régua compacta (design, decisões 1 e 3):
  - a história "Medidor compacto numa caixa de 40 px", no `Dados.stories.tsx`, com a marca `captura`: nas três densidades, a régua acaba dentro da caixa e antes do "8%";
  - no `coleta.spec.ts`, a régua do menor nível acaba antes do "8%" na tabela dos ativos.

  Ver os dois falharem pela régua de 64 px, que passa 24 px da caixa.

  Depois, pôr o `min-width: 40px` na régua do tamanho compacto, no `Medidor.module.css`.

  Verificar:
  - o `pnpm test:stories` e o `pnpm test:e2e` passam;
  - o `pnpm --filter @grafite/ui test` passa, com o `Medidor.test.tsx`.

  Feito em 14/11:
  - **antes do conserto:** a história reprovou com "expected 64 to be less than or equal to 40". No e2e, a régua acabava em 745,5 px, e o "8%" começava em 729,5: eram 16 px por cima do número, os 24 que passam da caixa menos os 8 do espaço da parte fixa;
  - **com o `min-width: 40px` no compacto:** os dois passaram;
  - **a verificação:**
    - o `pnpm --filter @grafite/ui test` (2.151 testes), o `pnpm lint` e o `pnpm typecheck` passaram;
    - o `pnpm test:e2e` passou, com 192 testes na web e 7 no painel;
    - o `pnpm test:stories` deu 607 de 608. A que reprovou foi a "Tabela com prévia › Pagina Seguinte", uma das histórias instáveis sob carga, presa ao relógio. Sozinha, ela passou nos 3 testes do arquivo.

- [x] 1.2 Na "Larguras Que A Coleta Pede", pôr o `Medidor` compacto na caixa de 40 px, no lugar do `span` vazio (design, decisão 3).
  - Medir de novo a sobra das colunas no Windows e no contêiner do Playwright, com o `.grafite/revisao/medir-larguras-da-coleta.mjs`.
  - Ajustar o comentário da história. Se a sobra mudar, ajustar também as larguras e o limite, pela spec componentes-base.

  Verificar:
  - o `pnpm test:stories` passa;
  - a sobra dos Suprimentos fica a mesma da 4.4 da `ajustes-dos-tokens`: 17 px no Windows e 25 no Linux.

  Feito em 14/11:
  - o medidor da história é o compacto do toner preto a 100%, sem o número e sem as marcas, na caixa `inline-block` de 40 px, como a `.medidorNaCelula` da web. Ele aparece também na "Cabeçalhos na largura de fábrica", que usa o mesmo conteúdo;
  - a sobra, medida no catálogo compilado, ficou a mesma da 4.4:
    - no Windows, 22 px na Disponibilidade, 17 no Control iD, 17 nos Suprimentos e 4 nas Páginas;
    - no contêiner do Playwright 1.63.0, 25, 19, 25 e 4;
  - as larguras e o limite de 30 px ficam, e o comentário diz que os Suprimentos foram medidos com o medidor de verdade;
  - o `pnpm test:stories` passou nos 608 testes, com os 4 do `ValorComposto.stories.tsx`, e o Biome e o typecheck do ui passaram.

## 2. Os cartuchos na ficha

- [x] 2.1 Escrever primeiro, no `coleta.spec.ts`, o teste dos cartuchos com a leitura velha (design, decisões 2 e 3):
  - o `comSuprimentos` passa a receber o momento da leitura dos suprimentos, nos itens e no menor, com os 3 minutos de hoje como padrão. A resposta do SNMP e o resto do painel ficam com os 3 minutos;
  - com as leituras dos suprimentos de 16 dias atrás, embaixo de cada cartucho aparecem a descrição, "há 16 d" e "Desatualizado";
  - na lista "Níveis dos suprimentos", cada rótulo fica dentro da coluna do seu cartucho, e as duas colunas não se sobrepõem.

  Ver o teste falhar pelo rótulo fora da coluna: ele é mais largo que os 112 px dela. A conferência das colunas já passa hoje e guarda o conserto.

  Depois:
  - no `Ativos.module.css`, trocar a largura do `.suprimento` pelo `min-inline-size: 112px`, pôr o `max-inline-size: 112px` na descrição dentro dele e criar a classe da idade com o rótulo, uma grade centrada;
  - no `suprimentos.tsx`, pôr a classe nova no lugar da `.disponibilidade`, embaixo do cartucho.

  Verificar:
  - o `pnpm test:e2e` passa;
  - o `pnpm --filter @grafite/web test` passa, com o `FichaDoAtivo.test.tsx` e o `Suprimentos.test.tsx`.

  Feito em 14/11:
  - **antes do conserto:** o teste reprovou com o rótulo do toner acabando em 609,8 px e a coluna em 593,8. O "Desatualizado" passava 16 px da coluna de 112;
  - **o conserto:** o `.suprimento` ficou com o `min-inline-size: 112px`, e a descrição, com o `max-inline-size: 112px` dentro dele. A regra da descrição veio depois da geral, como o Biome pede. A classe `.idadeDoSuprimento`, uma grade centrada, entrou no lugar da `.disponibilidade` embaixo do cartucho. Pela spec, o teste confere também que a idade e o rótulo ficam no centro da coluna, um embaixo do outro;
  - **a verificação:**
    - o `coleta.spec.ts` passou nos 11 testes;
    - o `pnpm --filter @grafite/web test` passou nos 1.893;
    - o `pnpm test:e2e` inteiro ficou para o fim da change, no CI, pelo modo enxuto que o usuário escolheu em 14/11.

- [x] 2.2 Em "Vários itens", no `docs/casca/modulos.md`, fazer a linha da ficha descrever os cartuchos, com a descrição, a idade e o "Desatualizado" embaixo de cada um (design, decisão 4).

  Verificar: o `pnpm --filter @grafite/web test` passa, com o `documentacao.test.ts`.

  Feito em 14/11: a linha da ficha descreve os cartuchos, com a tinta, a estimativa e, embaixo de cada um, a descrição, a idade e o "Desatualizado". Os contadores ficam numa lista. Pelo modo enxuto, rodou só o `documentacao.test.ts`, que passou nos 15 testes.

## 3. A conferência

- [ ] 3.1 Rodar a regressão visual (`node scripts/visual.ts`) e regravar só as referências que mudam: a da história nova e, se mudar, a de uma `Contagem` ou de um medidor compacto (design, riscos).

  Verificar: o `node scripts/visual.ts` passa, e o motivo de cada referência regravada fica na nota da tarefa.

- [ ] 3.2 Conferir no `pnpm dev`, com a conta de revisão:
  - na tabela dos ativos, a régua do menor nível acaba antes do número, nas três densidades;
  - na ficha da impressora de teste, lida há 16 dias, cada "Desatualizado" fica embaixo do seu cartucho, sem encostar no do lado.

  Verificar: as medidas do roteiro e as capturas das duas telas, na pasta da revisão.

- [ ] 3.3 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:stories`;
  - `pnpm test:e2e`;
  - `openspec validate ajuste-do-medidor --strict`.

  Verificar: os comandos passam.
