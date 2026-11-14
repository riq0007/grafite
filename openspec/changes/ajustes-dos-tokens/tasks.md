## 1. A spec mestre e o ANTISLOP

- [x] 1.1 Antes do código, pôr as três regras na spec mestre e no ANTISLOP (design, decisões 1 a 6).
  - Na spec mestre:
    - a tipografia da 7.1, com a data sem hora na fonte da interface e os horários na mono;
    - o mínimo do `texto-2` no A.1: 7:1 sobre a `superficie-afundada`;
    - o `{situação}-fundo` no A.3: a cor da situação na luminosidade 0,7 nos temas claros e 0,8 nos escuros, na menor tinta de 15% a 30% que a leva a 0,02 dos neutros no plano do croma e, nos temas claros, a 0,03 deles no OKLab inteiro, com os neutros da decisão 2;
    - o numeral no A.7: na Instrument Sans, com algarismos tabulares.
  - No ANTISLOP:
    - o fundo sutil da situação;
    - a tipografia: a mono só nos identificadores, nos horários e no código, e o numeral, as quantidades e as datas sem hora na Instrument Sans;
    - a linha da afundada na tabela da elevação: o texto secundário com 7:1 sobre ela.

  Verificar: o `git grep -n -e "números de tabela" -e "em JetBrains Mono" -e "a cor a 15%" -e "sutil\*\*, a 15%"` nos dois arquivos não acha nada. Feito em 14/11: o `git grep` não acha nada, e a borda ficou dita como a cor do texto a 40%, porque o fundo passa a sair de outra cor.

## 2. O texto secundário sobre a afundada

- [x] 2.1 Escrever primeiro os testes:
  - na varredura do `gerador.test.ts`: o texto secundário com 7:1 sobre a afundada;
  - no `contraste-pares.ts`: os pares "texto sobre a superfície afundada", de 4,5:1, e "texto secundário sobre a superfície afundada", de 7:1;
  - no `temas.test.ts`: o texto secundário dos seis temas de fábrica.

  Ver os três falharem pela Névoa e pelo Papel (6,16 e 6,13:1) e pelas entradas claras da varredura.

  Depois, pôr a condição no texto secundário do gerador, com a constante `SECUNDARIO_NA_AFUNDADA` (design, decisão 1), e gerar de novo os tokens e o relatório (`pnpm tokens:gerar` e `pnpm tokens:contraste`).

  Verificar:
  - o `pnpm --filter @grafite/ui test` e o `pnpm tokens:verificar` passam;
  - o secundário da Névoa é `#4d4f52`, e o do Papel, `#534e47`. Os outros quatro temas não mudam;
  - o `docs/identidade/contraste.md` mostra os dois pares novos nas 24 combinações, todos aprovados.

  Feito em 14/11: os três falharam pela Névoa (6,16:1), pelo Papel (6,12:1) e por 216 entradas da varredura, as escuras no contraste 0 e as claras no 0 e no 45. O par tem o próprio mínimo, o `TEXTO_DE_EXEMPLO` do `contraste-pares.ts`, para a verificação não ler o mínimo do gerador que ela confere.

## 3. As situações longe dos neutros

- [ ] 3.1 Escrever primeiro os testes da `distancia` e da `distanciaNoCroma`, no `oklch.test.ts`:
  - 0 entre uma cor e ela mesma, nas duas;
  - entre o preto e o branco, perto de 1 na `distancia` e 0 na `distanciaNoCroma`;
  - 0 entre dois cinzas de luminosidades diferentes na `distanciaNoCroma`, porque só o croma conta;
  - perto de 0,2 entre `oklch(0,7 0,1 0)` e `oklch(0,7 0,1 180)`, nas duas, porque a luminosidade é a mesma.

  Ver falharem, porque as funções não existem. Depois, escrever as duas no `oklch.ts` (design, decisão 2).

  Verificar: o `pnpm --filter @grafite/ui test` passa.
- [ ] 3.2 Escrever primeiro os testes da tinta:
  - **no `gerador-dados.test.ts`:**
    - **a varredura de 433 entradas** passa a ser a mesma do `gerador.test.ts`, num módulo comum dos testes (`varredura.ts`), no lugar das 97 de hoje;
    - **em cada entrada e situação:**
      - a tinta do `s.fundo` fica entre 15% e 30%;
      - abaixo do teto, os doze pares (design, decisão 2) ficam a 0,02 ou mais no plano do croma e, nos temas claros, a 0,03 ou mais no OKLab inteiro;
      - a tinta é a menor que passa: nenhuma tinta inteira menor que a escolhida, de 15% em diante, passa nos doze pares. Com isso, a de 30% sem passar só aparece quando nenhuma de 15% a 29% passa;
      - o texto tem 4,5:1 sobre o `s.fundo` composto na superfície e na superfície 2. O `s.fundo` entra no lugar dos 15% fixos das linhas 40, 41 e 56;
    - **nas entradas de base neutra** (croma 0): a tinta abaixo do teto;
    - **nos seis temas de fábrica:**
      - as tintas da tabela da decisão 3, com os doze pares nas duas distâncias;
      - a cor do texto das situações igual à de hoje;
      - nos temas escuros, os fundos de 15% iguais aos de hoje;
      - o fundo sutil composto sobre a superfície elevada a 0,02 ou mais dela e da superfície 2 no plano do croma, e o texto com 4,5:1 sobre ele (design, decisão 2);
  - **no `contraste-pares.test.ts`:** os pares dos rótulos (`contraste-pares.ts:223-235`) medidos sobre o fundo gerado de cada situação, e não sobre a constante;
  - **no `gerar.test.ts`:** o `--cor-atencao-fundo` do Papel com a fonte em 0,7 a 26%, `rgba(208, 144, 30, 0.26)`.

  Ver falharem pela atenção do Papel (0,004), pela informação da Meia-noite (0,013) e pelo fundo, que ainda é a cor do texto a 15%.

  Depois (design, decisões 3 e 4):
  - no `escalas.ts`, a `TINTA_DA_SITUACAO`, a `FONTE_DA_TINTA`, a `DISTANCIA_DOS_NEUTROS` e a `TINTA_DO_ROTULO_NEUTRO` no lugar da `TINTA_DO_ROTULO`;
  - no `gerarSituacoes`, a fonte da tinta e a busca da tinta de cada situação, com a cor do texto achada depois, contra o fundo dessa tinta;
  - os pares dos rótulos lendo o fundo de cada situação;
  - no `gerar.ts`, a `--tinta-rotulo` e o token `rotulo` do DTCG emitidos com o mínimo da `TINTA_DA_SITUACAO` até a 3.3, porque o `Entrada.module.css` e o `ItensDaBarra.module.css` ainda leem a variável;
  - os tokens e o relatório gerados de novo.

  Verificar:
  - o `pnpm --filter @grafite/ui test` e o `pnpm tokens:verificar` passam;
  - o `docs/identidade/contraste.md` mostra os pares dos rótulos aprovados, medidos sobre o fundo gerado;
  - nos temas escuros de fábrica, só o `--cor-info-fundo` do Grafite e da Meia-noite muda no `gerado/`, e a `--tinta-rotulo` continua com 15%.
- [ ] 3.3 Escrever primeiro os testes do fundo pelo token:
  - **no `gerar.test.ts`:** a `--tinta-rotulo` fora da raiz e do DTCG, e a `--tinta-rotulo-neutro` ainda neles. O primeiro falha, porque o `gerar.ts` ainda emite a variável;
  - **nas histórias, no tema Papel:** o `NoAmbienteDeTeste` do `TelaDeEntrada.stories.tsx` e o `AmbienteDeTeste` do `ItensDaBarra.stories.tsx` conferem que o fundo calculado do aviso e do item vem do `--cor-atencao-fundo`. Eles falham, porque o CSS ainda mistura a cor do texto com a `--tinta-rotulo`.

  Ver falharem. Depois (design, decisão 4):
  - a geração do CSS e do DTCG sem a `--tinta-rotulo`;
  - o aviso do ambiente no campo de entrada e o item da barra no `--cor-atencao-fundo`;
  - os tokens gerados de novo.

  Verificar:
  - o `pnpm --filter @grafite/ui test`, o `pnpm tokens:verificar` e o `pnpm test:stories` passam;
  - o `git grep -n "var(--tinta-rotulo)"` não acha nada;
  - no Storybook, no tema Papel, o aviso do ambiente e o item da barra têm o mesmo fundo do rótulo de atenção, e o aviso se distingue do fundo da janela.

## 4. As quantidades na Instrument Sans

- [ ] 4.1 A tabela. Escrever primeiro, na `TabelaComEspecies`, a história que confere a fonte: o número na fonte da interface, com algarismos tabulares, e o código na mono.

  Ver falhar. Depois (design, decisões 5 e 6):
  - o CSS da espécie número;
  - os comentários do `Tabela.tsx` (:764 e :1085), do `Tabela.module.css` (:248-250) e do `TabelaConfiguravel.stories.tsx` (:267);
  - a espécie `numero` no contrato de módulo (`docs/casca/modulos.md:758`);
  - as amostras de número das histórias das tabelas: `ValorComposto.stories.tsx` (:23, :147 e :155), `TabelaComResumo.stories.tsx` (:118, :502 e :515), `TabelaComColunasEstreitas.stories.tsx` (:62) e `TabelaConfiguravel.stories.tsx` (:109).

  Verificar: o `pnpm test:stories` passa.
- [ ] 4.2 Os dados. Escrever primeiro as histórias que conferem a fonte:
  - uma contagem de "99,1%" em que a vírgula tem menos da metade da largura de um algarismo;
  - o número do medidor, do cartucho, da tendência e do controle deslizante na fonte da interface.

  Ver falharem. Depois, o CSS da contagem, do medidor, do cartucho, da tendência, do controle deslizante, da contagem do "O que resolver agora" e da página Fundamentos (design, decisões 5 e 6).

  Verificar: o `pnpm test:stories` passa.
- [ ] 4.3 Os módulos. Escrever primeiro os testes:
  - **no `colunas.test.ts` do domínio:**
    - o inteiro, o decimal, a moeda e o número coletado com a espécie número e sem a mono. A linha 438, que espera `mono: true` nos suprimentos, passa a esperar a espécie número;
    - a data com a espécie data e sem a mono;
    - o IP, o MAC e o momento ("Cadastrado em" e "Atualizado em") com a mono;
  - **no `TabelaDosAtivos.test.tsx`:** a célula de número sem o `data-mono` e na espécie número, e a de data na espécie data;
  - **no `Suprimentos.test.tsx` e no `Disponibilidade.test.tsx`:** o nível, as páginas e a latência com a classe `numero`.

  Ver falharem. Depois (design, decisão 6):
  - a espécie, opcional, na `ColunaDaTabela` do domínio (`visoes.ts:101-123`) e no `Pick` do `colunas.ts:51`. Os literais que montam a coluna sem ela ficam como estão;
  - a espécie no `colunas.ts` (linhas 65 a 68 e 149);
  - a `TabelaDosAtivos` passando a espécie à `<Coluna>`;
  - os suprimentos e a latência, e o trecho dos suprimentos no contrato de módulo (`docs/casca/modulos.md:1933` e `:1955`);
  - a leitura do contraste em Ajustes e os rostos dos backups do Control iD;
  - a varredura dos usos da `--fonte-mono` e da classe `mono` que sobraram, conferindo que neles só ficam identificadores, horários e código.

  Verificar: o `pnpm test` e o `pnpm typecheck` passam, e a lista dos usos da mono que ficaram vai na mensagem à revisora.

## 5. Fechamento

- [ ] 5.1 Regravar as referências da regressão visual que mudaram. Antes, apagar as das histórias nos temas claros e as do Grafite e da Meia-noite que mostram a situação de informação (design, riscos).

  Conferir as imagens de diferença:
  - nos temas claros, o texto secundário e o fundo das situações;
  - no Grafite e na Meia-noite, o fundo da informação;
  - em todos os temas, os números na Instrument Sans.

  Verificar: o `pnpm test:visual` passa.
- [ ] 5.2 Conferir no `pnpm dev`, com a conta de revisão:
  - **no Papel e na Névoa:**
    - o texto de exemplo de um campo;
    - um rótulo de atenção ao lado de um rótulo neutro;
    - o aviso do ambiente no campo de entrada, sobre o fundo da janela;
    - a contagem de um indicador com vírgula;
    - a coluna de número, a de data e a dos suprimentos na tabela dos ativos, com a dos suprimentos também estreita;
  - **no Alto contraste:** um rótulo de cada situação sobre a superfície, e o aviso do ambiente;
  - **no Personalizado, com o contraste 0, no claro e no escuro:** o texto de exemplo de um campo;
  - **no Grafite e na Meia-noite:** que só o fundo da informação muda.

  Verificar:
  - na página, o secundário mede 7:1 ou mais sobre o campo, também no Personalizado;
  - a fonte calculada (`getComputedStyle`) de uma célula dos suprimentos e da coluna de número é a Instrument Sans, com os algarismos tabulares, e a da data também;
  - a coluna estreita dos suprimentos termina em reticências, sem quebrar a célula;
  - as capturas das telas.
- [ ] 5.3 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:stories`;
  - `pnpm test:e2e`;
  - `pnpm tokens:verificar`;
  - `pnpm tokens:contraste`, sem mudar o relatório;
  - `openspec validate ajustes-dos-tokens --strict`.

  Verificar: os comandos passam.
