## Why

A conferência da `ajustes-dos-tokens` no `pnpm dev`, em 14/11/2026, achou dois defeitos de encaixe nos suprimentos das impressoras. Os dois vêm de antes daquela change:
- **Na tabela dos ativos:** o medidor compacto da coluna Suprimentos cobre o número do menor nível, e o "8%" fica ilegível. A régua do medidor tem 64 px de mínimo, e a caixa dele na célula tem 40 px, desde a `suprimentos-rostos-e-backups`. O catálogo não pegou o defeito, porque a história "Larguras Que A Coleta Pede" põe um `span` vazio de 40 px no lugar do medidor.
- **Na ficha da impressora:** embaixo dos cartuchos, os rótulos "Desatualizado" de dois cartuchos vizinhos encostam um no outro. A coluna de cada cartucho tem 112 px, e o rótulo é mais largo que ela.

O usuário escolheu, num cartão de 14/11, o ajuste próprio: um conserto pequeno, com change e teste próprios, logo depois da `ajustes-dos-tokens` e antes das histórias instáveis e das outras 23 changes da rodada 3.

Esta change segue o subprojeto D1 · Linguagem visual v3 da spec mestre, nos instrumentos, como a `suprimentos-rostos-e-backups`, que pôs o medidor na coluna da lista e os cartuchos na ficha. Ficam fora dela:
- **a célula dos suprimentos do mockup r3-01,** com a barra simples de 84 px e o percentual em peso forte, que vem com a change da tabela por tipo da rodada 3;
- **os três arcos da ficha do mockup r3-04,** sem rótulo por cartucho, que vêm com a change da ficha;
- **a largura de fábrica da coluna Suprimentos,** de 340 px. Ela é medida de novo com o medidor de verdade e só muda se a sobra passar do limite da história.

## What Changes

- **O medidor compacto cabe em 40 px:** a régua do tamanho compacto passa a ter 40 px de mínimo, no lugar dos 64 px dos outros tamanhos.
  - Na célula dos suprimentos, a régua fica dentro da caixa de 40 px e acaba antes do número, nas três densidades.
  - O medidor normal e o grande não mudam.
- **Os cartuchos com a leitura velha:** a coluna de cada cartucho passa a ter pelo menos 112 px e cresce até caber o "Desatualizado".
  - A descrição continua quebrando em 112 px, e a coluna com a leitura em dia fica como está.
  - A idade e o rótulo ficam um embaixo do outro, centrados embaixo do cartucho.
  - O rótulo de um cartucho fica dentro da coluna dele, e o espaço entre os cartuchos separa os rótulos vizinhos.
- **O medidor de verdade no catálogo:** a história nova do medidor compacto numa caixa de 40 px confere que a régua acaba antes do número. Na "Larguras Que A Coleta Pede", o `span` vazio dá lugar ao `Medidor`.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `visualizacao-de-dados`: o medidor ganha o tamanho compacto, cuja régua cabe numa caixa de 40 px.
- `impressoras-por-snmp`: muda em dois pontos.
  - Na coluna dos suprimentos, o medidor fica antes do número, sem cobri-lo.
  - No painel Suprimentos, a idade e o "Desatualizado" de cada cartucho ficam embaixo dele, sem encostar nos do cartucho ao lado.

## Impact

- **`packages/ui/src/componentes/dados`:** o mínimo da régua compacta, no `Medidor.module.css`, e a história nova, no `Dados.stories.tsx`.
- **`packages/ui/src/componentes/tabela/ValorComposto.stories.tsx`:** o `Medidor` no lugar do `span` vazio, com a sobra medida de novo.
- **`apps/web/src/modulos/ativos`:** a coluna do cartucho e a idade com o rótulo embaixo dele, no `Ativos.module.css` e no `suprimentos.tsx`.
- **`apps/web/e2e/coleta.spec.ts`:** a régua antes do número na célula e os rótulos dos cartuchos com a leitura velha.
- **`docs/casca/modulos.md`:** a ficha em "Vários itens" passa a descrever os cartuchos, com a idade e o "Desatualizado" embaixo de cada um.
- **A `Contagem`:** ela também usa o medidor compacto, e o mínimo da régua cai de 64 para 40 px. Nas telas de hoje, a régua dela ocupa a largura do bloco, maior que 64 px, e nada muda. A regressão visual confere.
- Nada muda na API, no banco, no contrato e nos tokens.
