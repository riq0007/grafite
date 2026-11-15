## 1. O medidor compacto

- [ ] 1.1 Escrever primeiro os testes da régua compacta (design, decisões 1 e 3):
  - a história "Medidor compacto numa caixa de 40 px", no `Dados.stories.tsx`, com a marca `captura`: nas três densidades, a régua acaba dentro da caixa e antes do "8%";
  - no `coleta.spec.ts`, a régua do menor nível acaba antes do "8%" na tabela dos ativos.

  Ver os dois falharem pela régua de 64 px, que passa 24 px da caixa.

  Depois, pôr o `min-width: 40px` na régua do tamanho compacto, no `Medidor.module.css`.

  Verificar:
  - o `pnpm test:stories` e o `pnpm test:e2e` passam;
  - o `pnpm --filter @grafite/ui test` passa, com o `Medidor.test.tsx`.

- [ ] 1.2 Na "Larguras Que A Coleta Pede", pôr o `Medidor` compacto na caixa de 40 px, no lugar do `span` vazio (design, decisão 3).
  - Medir de novo a sobra das colunas no Windows e no contêiner do Playwright, com o `.grafite/revisao/medir-larguras-da-coleta.mjs`.
  - Ajustar o comentário da história. Se a sobra mudar, ajustar também as larguras e o limite, pela spec componentes-base.

  Verificar:
  - o `pnpm test:stories` passa;
  - a sobra dos Suprimentos fica a mesma da 4.4 da `ajustes-dos-tokens`: 17 px no Windows e 25 no Linux.

## 2. Os cartuchos na ficha

- [ ] 2.1 Escrever primeiro, no `coleta.spec.ts`, o teste dos cartuchos com a leitura velha (design, decisões 2 e 3):
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

- [ ] 2.2 Em "Vários itens", no `docs/casca/modulos.md`, fazer a linha da ficha descrever os cartuchos, com a descrição, a idade e o "Desatualizado" embaixo de cada um (design, decisão 4).

  Verificar: o `pnpm --filter @grafite/web test` passa, com o `documentacao.test.ts`.

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
