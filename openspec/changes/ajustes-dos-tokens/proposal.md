## Why

A revisão final da rodada 3 dos mockups (13/11/2026, `revisao/relatorio-final.md`) achou três pontos nos tokens, que precisam valer antes das changes que levam os mockups ao código:
- **O texto secundário sobre a superfície afundada:** na Névoa e no Papel, ele tem 6,1:1. É onde fica o texto de exemplo de todos os campos. Passa no AA, mas fica abaixo da meta da rodada 1: a mediana do contraste das telas escolhidas, de 7,1 a 7,7:1 em 14 das 21 ideias, menos 0,5.
- **O tom das situações perto do neutro:** no Papel, o bloco da reserva em atenção (o Foco das 14:30, no m08 da ideia 09) quase se confunde com o bloco neutro ao lado.
  - O bloco é só um bege mais escuro. Ele fica a 0,049 do bloco neutro no OKLab, mas a 0,006 no plano do croma, sem a luminosidade.
  - Sobre o fundo da janela, como no aviso do ambiente do campo de entrada, a distância no croma é de 0,004.
  - Nos outros temas de fábrica, a menor distância no croma vai de 0,013 (a informação da Meia-noite) a 0,021.
- **A vírgula da JetBrains Mono:** ela ocupa uma casa inteira, e o "99,1%" do numeral aparece como "99 , 1%".

Esta change segue o subprojeto D1 · Linguagem visual v3 da spec mestre, nos tokens, como a `fundamentos-v3`. Ficam fora dela:
- **o quarto achado da revisão,** o aviso âmbar da aba sobre o conteúdo azul. A regra entra no ANTISLOP com a aba, na `aba-dos-colaboradores` (S8);
- **a matiz e o croma das situações, a borda a 40% e o preenchimento forte,** que não mudam;
- **os horários, os identificadores e o código,** que continuam na mono;
- **os mockups da `.grafite/propostas-11-11`,** que ficam como foram aprovados.

## What Changes

- **O texto secundário com 7:1 sobre a superfície afundada:** o gerador move o texto secundário, em qualquer tema, até 7:1 sobre a afundada.
  - Na Névoa e no Papel, o contraste dele sobe de 6,1 para 7,0:1 na afundada e de 7,1 para 8,1:1 na superfície.
  - Os temas escuros e o Alto contraste de fábrica já passam e não mudam.
  - No tema personalizado claro, o secundário fica no piso do contraste 0 até perto de 68, e o controle de contraste deixa de mudá-lo nessa faixa. No escuro, abaixo de uns 29, ele clareia.
- **As situações longe dos neutros:** o fundo sutil passa a ser a cor da situação na luminosidade 0,7 nos temas claros e 0,8 nos escuros, com a menor tinta de 15% a 30% que o leva a 0,02 dos neutros do tema no plano do croma do OKLab. Nos temas claros, a tinta também o leva a 0,03 dos neutros no OKLab inteiro, para o tom não ser trocado pela luminosidade.
  - A regra foi escolhida pelo usuário em 14/11/2026, numa amostra das opções.
  - Os neutros são o fundo da janela, a afundada, a superfície, a superfície 2 e o rótulo neutro.
  - A tinta é de cada situação. Nos temas claros de fábrica, ela vai de 19% a 27%.
  - Nos temas escuros de fábrica, o fundo fica como está, fora o da informação do Grafite (17%) e da Meia-noite (24%).
  - O texto de cada situação continua com 4,5:1 sobre o próprio fundo, e as cores do texto não mudam nos temas de fábrica.
  - No tema personalizado com a base perto da matiz de uma situação, a tinta dela para em 30%.
- **O fundo da situação só pelo token do tema:** como a tinta passa a ser de cada situação, sai a variável `--tinta-rotulo` e o token `rotulo` do DTCG.
  - O aviso do ambiente no campo de entrada e o item da barra superior compunham o fundo da atenção com essa variável. Eles passam a usar o `--cor-atencao-fundo`, que já vem do tema.
  - A `--tinta-rotulo-neutro` fica.
  - Nada fora do repositório usa a variável.
- **As quantidades na Instrument Sans:** o numeral e todo número que é quantidade passam da JetBrains Mono para a Instrument Sans, com os algarismos tabulares.
  - Quantidade é contagem, medida, percentual, moeda e os números das tabelas.
  - A data sem hora fica na fonte da interface, com os algarismos tabulares. Na tabela dos ativos, ela sai da mono, como já é nas outras tabelas.
  - A mono fica com os identificadores, os horários e o código.
- **A spec mestre e o ANTISLOP:** passam a dizer as três regras.
  - Na spec mestre: a tipografia (7.1 e A.7), os papéis do tema (A.1) e as situações (A.3).
  - No ANTISLOP: as seções da situação, da tipografia e da elevação.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `design-tokens`: muda em três pontos.
  - O contraste verificado ganha o 7:1 do texto secundário sobre a afundada.
  - As situações ganham a fonte da tinta, a tinta de cada situação e a distância dos neutros no plano do croma e, nos temas claros, no OKLab inteiro.
  - A tipografia põe o numeral e as quantidades na Instrument Sans, com algarismos tabulares, e diz a fonte da data.
- `componentes-base`: a espécie número da tabela passa para a fonte da interface, com algarismos tabulares.
- `cadastro-de-ativos`: os números e as datas da tabela dos ativos saem da mono. Os identificadores e o momento, com a hora, ficam nela.

## Impact

- **`packages/ui/src/tokens`:**
  - o gerador: o texto secundário e a tinta das situações;
  - as distâncias no OKLab, a inteira e a do plano do croma;
  - as constantes da tinta, os pares do contraste, a geração do CSS e do DTCG e os testes;
  - o `gerado/` e o `docs/identidade/contraste.md`, gerados de novo.
- **`packages/ui/src`:**
  - o CSS da contagem, do medidor, do cartucho, da tendência, do controle deslizante, da espécie número da tabela e da contagem do "O que resolver agora";
  - o CSS do aviso do ambiente no campo de entrada, do item da barra e da página Fundamentos;
  - as histórias que conferem a fonte e as amostras de número das histórias das tabelas.
- **`packages/domain/src/ativos/colunas.ts`:** a espécie das colunas de inteiro, decimal, moeda, número coletado e data, sem a mono.
- **`apps/web`:** a espécie das colunas na tabela dos ativos, os números dos suprimentos, a latência da disponibilidade, a leitura do contraste em Ajustes e os rostos dos backups do Control iD.
- **A documentação:** `docs/superpowers/specs/2026-09-24-grafite-design.md` e `docs/ANTISLOP.md`.
- **A regressão visual:** as referências dos temas claros, da informação do Grafite e da Meia-noite, e das telas com números.
