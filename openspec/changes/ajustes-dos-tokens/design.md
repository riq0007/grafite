## Context

O gerador (`packages/ui/src/tokens/gerador.ts`) faz cada tema a partir do tom, da base e do contraste. Ele move a luminosidade de cada papel até o mínimo contra os fundos em que o papel aparece. Hoje:
- **o texto secundário** precisa de 4,5:1 sobre todos os fundos de texto, a afundada entre eles. Nos temas claros, a afundada é o segundo pior fundo dele, depois do fundo da janela;
- **o fundo sutil de cada situação** é a cor do texto da situação a 15% (`TINTA_DO_ROTULO.situacao`).
  - Nos temas claros, essa cor é escura, e a tinta mais escurece a superfície do que a colore.
  - Ele sai por tema no `--cor-{situação}-fundo`, mas dois CSS o refazem com a `--tinta-rotulo` da raiz, num `color-mix`: o aviso do ambiente no campo de entrada e o item da barra;
- **a JetBrains Mono** serve tanto aos identificadores quanto às quantidades: o numeral, a contagem, o medidor, o cartucho, a tendência, o controle deslizante, a espécie número da tabela e alguns números dos módulos.

As medidas de hoje nos temas de fábrica, tiradas do próprio gerador. A distância é a menor de uma situação aos neutros, no pior dos doze pares da decisão 2, no plano do croma do OKLab e no OKLab inteiro:

| Tema | Secundário sobre a afundada | Secundário sobre a superfície | Distância no croma | Distância no OKLab inteiro |
|---|---|---|---|---|
| Grafite | 7,67:1 | 7,30:1 | 0,019 (informação) | 0,021 (informação) |
| Meia-noite | 7,69:1 | 7,31:1 | 0,013 (informação) | 0,019 (informação) |
| OLED | 9,68:1 | 9,08:1 | 0,021 (crítico e informação) | 0,022 (informação) |
| Névoa | 6,16:1 | 7,10:1 | 0,016 (atenção e informação) | 0,017 (informação) |
| Papel | 6,13:1 | 7,08:1 | 0,004 (atenção) | 0,005 (atenção) |
| Alto contraste | 8,28:1 | 10,05:1 | 0,016 (atenção) | 0,020 (ok) |

O par do achado, no Papel, é o bloco de atenção sobre a superfície ao lado do bloco neutro na superfície 2 (o `.res` do m08 da ideia 09). Os doze pares da atenção do Papel, hoje e depois da change. O E é a distância no OKLab inteiro, e o ab, só no plano do croma:

| Fundo sutil composto sobre × neutro | Hoje, E | Hoje, ab | Depois, E | Depois, ab |
|---|---|---|---|---|
| superfície × fundo da janela | 0,005 | 0,004 | 0,030 | 0,030 |
| superfície × afundada | 0,028 | 0,004 | 0,042 | 0,030 |
| superfície × superfície | 0,078 | 0,016 | 0,089 | 0,042 |
| superfície × superfície 2 (o par do achado) | 0,049 | 0,006 | 0,060 | 0,031 |
| superfície × rótulo neutro na superfície | 0,031 | 0,016 | 0,049 | 0,041 |
| superfície × rótulo neutro na superfície 2 | 0,007 | 0,007 | 0,032 | 0,032 |
| superfície 2 × fundo da janela | 0,030 | 0,014 | 0,047 | 0,038 |
| superfície 2 × afundada | 0,052 | 0,015 | 0,064 | 0,038 |
| superfície 2 × superfície | 0,103 | 0,027 | 0,112 | 0,050 |
| superfície 2 × superfície 2 | 0,073 | 0,016 | 0,083 | 0,039 |
| superfície 2 × rótulo neutro na superfície | 0,056 | 0,026 | 0,069 | 0,049 |
| superfície 2 × rótulo neutro na superfície 2 | 0,029 | 0,017 | 0,046 | 0,040 |

O que se lê na tabela:
- **o par do achado** já fica a 0,049 no OKLab, e a 0,006 no croma. O bloco é só um bege mais escuro, na matiz da base do Papel (80; a atenção é 75);
- **o primeiro par** é o do aviso do ambiente no campo de entrada (`Entrada.module.css:42-54`). Ele compõe a atenção sobre a superfície, sem borda, em cima do fundo da janela, e hoje fica a 0,005 dele. Depois, a 0,030;
- **depois,** as duas distâncias sobem nos doze pares. O bloco passa a ser um âmbar claro, a 0,031 da superfície 2 no croma e a 0,060 no OKLab inteiro, e continua mais escuro que ela.

## Goals / Non-Goals

**Goals:**
- as três regras garantidas pelo gerador e conferidas nos testes, nos seis temas de fábrica e na varredura;
- nos temas escuros de fábrica, nenhuma mudança visível além da que a regra do croma pede: o fundo da informação no Grafite e na Meia-noite.

**Non-Goals:**
- mudar a afundada, a matiz e o croma das situações, a borda ou o preenchimento forte;
- tirar da mono os horários: a regra tira as quantidades, as datas sem hora e a idade da leitura;
- mudar os mockups aprovados da rodada 3.

## Decisions

### 1. O piso de 7:1 é do texto secundário, e não da afundada

O texto secundário ganha mais uma condição no gerador: 7:1 sobre a afundada. O valor fica numa constante nova, `SECUNDARIO_NA_AFUNDADA`. Ele não reusa a `TEXTO_PRINCIPAL`, que é a do texto principal sobre a superfície 2.

O 7:1 é o nível AAA da WCAG para texto normal, e ele também cobre a meta da rodada 1:
- a meta compara a mediana do contraste de uma tela com a das telas escolhidas, menos 0,5;
- essas medianas, de 7,1 a 7,7:1, são o próprio texto secundário: 7,08 no Papel sobre a superfície, e 7,30 e 7,67 no Grafite;
- com 7,02 na afundada, uma tela do Papel passa nas metas até 7,5. Nas de 7,7, faltam 0,2, e elas vêm de telas escuras.

Nos temas de fábrica, só a Névoa e o Papel mudam. Medido no protótipo da regra:

| Tema | Secundário | Fundo | Afundada | Superfície | Superfície 2 |
|---|---|---|---|---|---|
| Névoa | `#56575a` → `#4d4f52` | 5,73 → 6,51 | 6,16 → 7,01 | 7,10 → 8,07 | 6,56 → 7,46 |
| Papel | `#5b574f` → `#534e47` | 5,69 → 6,53 | 6,13 → 7,02 | 7,08 → 8,12 | 6,53 → 7,48 |

A hierarquia continua. No Papel, o texto principal fica com 18,4:1 na superfície, e o secundário passa a 8,1:1.

O piso vale para qualquer entrada, e no tema personalizado ele muda o efeito do controle de contraste (riscos).

Alternativas consideradas:
- **Clarear a afundada nos temas claros.** O poço perderia a distância da superfície. A afundada é o fundo dos campos, da trilha do medidor e da faixa de filtros. E o texto secundário continuaria com 5,7:1 sobre o fundo da janela.
- **Pôr o piso de 7:1 sobre todas as superfícies.** Nos temas escuros, o secundário tem 6,0:1 sobre o material e 6,3:1 sobre a superfície elevada. Subir os dois clarearia o secundário até perto do principal e mudaria temas que não têm o problema.

### 2. A distância é medida no plano do croma, e nos temas claros também no OKLab inteiro

O achado é de tom. O bloco de atenção do Papel se confunde com o neutro porque tem a matiz dele, e não porque tem a luminosidade dele: o par do achado fica a 0,049 no OKLab, acima dos 0,04 da primeira versão deste plano, e mesmo assim foi achado.

Por isso, a regra mede a distância no plano do croma do OKLab: a euclidiana só com o a e o b, sem a luminosidade. O limite é de 0,02. É a menor diferença que se nota no OKLab, a mesma que o CSS Color 4 usa no mapeamento de gamute. A regra pede que o tom se note sozinho, sem contar com a luminosidade.

Nos temas claros, o fundo sutil também fica a pelo menos 0,03 de cada neutro no OKLab inteiro, para o tom não ser trocado pela luminosidade. Só com o croma, a fonte clara da segunda versão deste plano chegava aos 0,02 clareando o bloco: o par do achado caía de 0,049 para 0,028 no OKLab inteiro, e em 7 dos doze pares a distância total caía. Nos temas escuros, o piso não entra. Lá a fonte é a cor do próprio texto, como hoje, e nenhum achado o pede.

As duas distâncias entram como funções novas no `oklch.ts`, ao lado da conversão que já existe: a `distancia`, no OKLab inteiro, e a `distanciaNoCroma`.

Os neutros são o que fica ao lado de um bloco de situação:
- o fundo da janela, onde fica o aviso do ambiente do campo de entrada;
- a superfície afundada, a dos campos;
- a superfície;
- a superfície 2, o fundo do bloco neutro;
- o fundo do rótulo neutro, o texto secundário a 10%, composto sobre a superfície;
- o mesmo fundo, composto sobre a superfície 2.

O fundo sutil é composto sobre a superfície e sobre a superfície 2. A distância vale nos doze pares: cada um dos dois fundos compostos contra cada um dos seis neutros.

A superfície elevada fica fora dos neutros, e a medida mostra que ela não precisa entrar. Ela é a dos blocos sobre o conteúdo, como os do Início (spec design-tokens, "Elevação em quatro superfícies"), e os rótulos ficam dentro deles.
- Nos seis temas de fábrica, o fundo sutil composto sobre a elevada fica a 0,021 ou mais dela e da superfície 2 no croma, e o texto da situação tem 4,8:1 ou mais sobre ele.
- Nos temas claros, a elevada é o branco, perto da superfície. Nos escuros, ela tem o croma da superfície 2.
- Um teste dos seis temas guarda a medida (tarefa 3.2).

Alternativas consideradas:
- **A distância no OKLab inteiro, de 0,04, contra a superfície 2 e o rótulo neutro.** Era a primeira versão deste plano.
  - O par do achado já passa nela, com 0,049.
  - Com o fundo e a afundada entre os neutros, a atenção do Papel subiria a 23%, e o bloco só ficaria um bege mais escuro.
- **O piso no OKLab inteiro também nos temas escuros.** Ele levaria o ok e o crítico dos três temas escuros de fábrica a 16% a 18%, e a informação do OLED a 18%, sem achado que o peça.
- **Afastar a matiz da atenção da base do Papel.** As matizes das situações são as mesmas em todos os temas (A.3 da spec mestre), e puxar o âmbar para o laranja o aproximaria do crítico, de matiz 25.

### 3. A fonte da tinta em 0,7 nos temas claros e 0,8 nos escuros, e a tinta de cada situação

A fonte da tinta passa a ser a cor da situação, com o croma e a matiz dela, na luminosidade 0,7 nos temas claros e 0,8 nos escuros. Onde esse croma não cabe no sRGB, a conversão de hoje (`oklchParaHex`) o reduz até caber. Em 0,7, as quatro situações cabem sem redução.

A regra foi escolhida pelo usuário em 14/11/2026, numa amostra das opções tirada dos protótipos: os quatro rótulos, os blocos ao lado do bloco neutro e o aviso do ambiente, sobre os quatro fundos, no Papel, na Névoa, no Alto contraste e na Meia-noite.
- **Nos temas escuros,** a fonte é a cor do texto das situações nos temas de fábrica, que nasce em 0,8. O fundo deles não muda onde a tinta fica em 15%.
- **Nos temas claros,** ela é uma cor média e saturada, no lugar do texto escuro. A tinta colore e ainda escurece um pouco: a atenção do Papel deixa de ser um bege mais escuro e passa a ser um âmbar claro, sem perder a diferença de luminosidade do bloco neutro.

Para cada situação, o gerador procura a menor tinta inteira, de 15% a 30%, com que os doze pares chegam a 0,02 no croma e, nos temas claros, a 0,03 no OKLab inteiro. Sem nenhuma, a tinta fica em 30%. O gerador não lança erro nem devolve NaN, porque roda no navegador, no tema personalizado (`personalizado.ts:57-66`).

O fundo sutil não depende mais da cor do texto. Por isso, o `gerarSituacoes` acha primeiro a tinta de cada situação, e depois a cor do texto, uma vez só, com 4,5:1 sobre o fundo dessa tinta.
- O preenchimento forte e o texto sobre ele não dependem da tinta e ficam como estão.
- A tinta não sai do `gerarSituacoes`: ela vai no alfa do próprio fundo, o `--cor-{situação}-fundo`. Os pares do contraste, o CSS e o DTCG leem esse fundo.

O resultado nos temas de fábrica:

| Tema | Ok | Atenção | Crítico | Informação |
|---|---|---|---|---|
| Grafite | 15% | 15% | 15% | 17% |
| Meia-noite | 15% | 15% | 15% | 24% |
| OLED | 15% | 15% | 15% | 15% |
| Névoa | 21% | 19% | 19% | 27% |
| Papel | 21% | 26% | 23% | 23% |
| Alto contraste | 22% | 19% | 21% | 25% |

- **A menor distância** passa a 0,020 ou mais no croma em todos, e a 0,030 ou mais no OKLab inteiro nos temas claros.
- **A cor do texto das situações** não muda em nenhum tema de fábrica. O texto fica com mais de 5:1 sobre o próprio fundo.
- **Nos temas escuros,** os fundos de 15% saem iguais aos de hoje. A informação do Grafite e da Meia-noite sobe, porque a matiz dela fica perto da base azulada deles.
- **No Alto contraste,** a tinta fica de 19% a 25%, e o rótulo sobre o branco não depende só da borda.

Na varredura de 433 entradas:
- **as de base neutra,** de croma 0, chegam às distâncias sem o teto. A tinta vai até 15% nos escuros e até 26% nos claros;
- **em 114 entradas,** todas de base com croma, alguma situação fica no teto: 123 situações.
  - Em 113 delas, a matiz da base fica a até 55° da situação, e os neutros já têm o tom dela. Nas outras 10, ela fica perto da oposta, a 155° ou mais: a tinta apaga o tom do neutro de baixo e o leva ao de outro neutro.
  - Em 21, a distância no croma chega a 0,02, e só falta o piso no OKLab inteiro.
  - Das 102 que não chegam a 0,02 no croma, 59 ficam de 0,015 a 0,02. A menor fica a 0,002: a informação de uma base clara de matiz 240, croma 0,06 e contraste 100.
  - Nelas, como em toda situação, a borda e o texto dizem a situação;
- **o texto das situações** fica com 4,5:1 ou mais sobre o próprio fundo, em todas.

Alternativas consideradas:
- **Uma tinta por tema, a mesma nas quatro situações.** Era a primeira versão deste plano.
  - A mesma tinta não dá o mesmo peso. A 15%, no Papel, o ok e o crítico já ficam a 0,020 dos neutros no croma, a atenção a 0,012, e a informação a 0,009.
  - A tinta soma o tom da situação ao do neutro de baixo, e os neutros do Papel têm o bege da base em forças diferentes. A atenção, de matiz perto da base, faz do bloco sobre a superfície só um bege mais forte, perto do fundo da janela. A informação, de matiz oposta, apaga o bege da superfície 2 e a leva ao cinza da superfície. Em 0,7, nenhuma das quatro perde croma no sRGB.
  - Com uma tinta só, as quatro situações iriam a 26% no Papel, a 27% na Névoa, a 25% no Alto contraste e a 24% na Meia-noite. Com a tinta de cada situação, só muda a que precisa.
- **A fonte em 0,8 nos dois tons, só com o croma.** Era a segunda versão deste plano. A tinta clara chega ao croma clareando o bloco: no Papel, a atenção a 22% ficava a 0,028 da superfície 2 no OKLab inteiro, contra 0,049 hoje. No Alto contraste, a tinta a 15% quase sumia sobre o branco, e o rótulo dependia só da borda.
- **A tinta da cor do texto, como hoje, subindo até a distância.** Nos temas claros, o texto é escuro. A tinta escurece o fundo e obriga a escurecer o texto: no Papel, a atenção só chegaria a 0,02 no croma com 33%, acima do teto, e o texto dela passaria de `#7b5100` a `#684500`.
- **As outras opções da amostra:** a cor do texto com 0,04 no OKLab inteiro, e a fonte em 0,8 com 0,03 no croma.

### 4. O fundo da situação só pelo token do tema

A tinta passa a ser de cada situação, em cada tema. Por isso, saem a `--tinta-rotulo` da raiz e o token `rotulo` do DTCG.

Os dois usos da variável passam ao token do tema, com a mesma conta da mistura de hoje no sRGB:
- **o aviso do ambiente** (`Entrada.module.css`), que compunha a atenção sobre a superfície, passa a `background-color: var(--cor-superficie)` e `background-image: linear-gradient(var(--cor-atencao-fundo), var(--cor-atencao-fundo))`, nas propriedades longas, porque a imagem calculada do atalho `background:` traz o `none` da última camada, e a história do aviso compara a imagem com o gradiente;
- **o item da barra** (`ItensDaBarra.module.css`), que compunha sobre o transparente, passa a `var(--cor-atencao-fundo)`.

Os pares do contraste dos rótulos (no `PARES` do `contraste-pares.ts`) passam a ler o fundo gerado de cada situação, e não a constante.

A `TINTA_DO_ROTULO` do `escalas.ts` dá lugar às constantes da regra:
- a `TINTA_DA_SITUACAO`, de 15% a 30%, para a busca;
- a `FONTE_DA_TINTA`, com a luminosidade da fonte: 0,7 nos temas claros e 0,8 nos escuros;
- a `DISTANCIA_DOS_NEUTROS`, com os 0,02 no croma e os 0,03 no OKLab inteiro, só dos temas claros;
- a `TINTA_DO_ROTULO_NEUTRO`, de 10%, que fica com a `--tinta-rotulo-neutro`, porque o neutro não muda.

Até a tarefa 3.3, o `gerar.ts` segue emitindo a `--tinta-rotulo` e o token `rotulo`, com o mínimo da `TINTA_DA_SITUACAO` (15%, o valor de hoje), porque os dois CSS ainda leem a variável.

O tema personalizado já leva o `--cor-{situação}-fundo` nas variáveis de cor. Ele segue a regra sem mudança no script anti-flash.

### 5. A quantidade vai na Instrument Sans com algarismos tabulares

A regra é pelo que o número é, e não pelo valor dele. Toda quantidade fica na Instrument Sans, com `font-variant-numeric: tabular-nums`, com ou sem vírgula. Uma regra pela vírgula trocaria a fonte de linha para linha na mesma coluna ("12" e "12,5").

A fonte tem os algarismos tabulares. Conferido nos arquivos do `@fontsource/instrument-sans`, no subconjunto latino, nos pesos 400 e 600:
- a fonte tem o recurso `tnum`;
- com ele, os dez algarismos ficam com 600 unidades, a mesma largura dos da mono;
- a vírgula e o ponto ficam com 255 a 275 unidades, menos da metade de um algarismo. Na mono, eles ocupam as 600.

Os algarismos continuam alinhados na coluna, e o número continua à direita na espécie número. Com o mesmo número de casas, a vírgula cai no mesmo lugar.

A data sem hora fica na fonte da interface, com os algarismos tabulares, como a espécie data da tabela base já faz.

A mono fica com o que se lê caractere por caractere:
- os identificadores: patrimônio, série, IP, MAC, CNPJ, matrícula, os códigos e os números de chamado, de ordem e de solicitação;
- os horários, com ou sem a data;
- o código: o log, o comando, o PEM, os códigos de recuperação e o valor do cofre.

### 6. Onde a fonte muda

| Onde | O que mostra | Depois |
|---|---|---|
| Contagem | o número e a capacidade | Instrument Sans tabular |
| Medidor | o número | Instrument Sans tabular |
| Cartucho | o nível | Instrument Sans tabular. A placa, com a letra da tinta, fica na mono |
| Tendência | o último valor | Instrument Sans tabular |
| Controle deslizante | o valor | Instrument Sans tabular |
| Tabela, espécie número | o valor | Instrument Sans tabular |
| "O que resolver agora" | a contagem do título | Instrument Sans tabular |
| Página Fundamentos | a amostra do numeral, os níveis das tintas e as contagens das situações | Instrument Sans tabular |
| Histórias das tabelas | as amostras das células dos suprimentos: `ValorComposto.stories.tsx` (:23, :147 e :155), `TabelaComResumo.stories.tsx` (:118, :502 e :515), `TabelaComColunasEstreitas.stories.tsx` (:62) e `TabelaConfiguravel.stories.tsx` (:109) | sem a mono |
| Comentários | os que dizem que o número fica na mono: `Tabela.tsx` (:764 e :1085), `Tabela.module.css` (:248-250) e `TabelaConfiguravel.stories.tsx` (:267) | a fonte da interface |
| Contrato de módulo (`docs/casca/modulos.md`) | a espécie `numero` (:758) e o trecho dos suprimentos (:1933 e :1955) | a fonte da interface com algarismos tabulares, e a classe `numero` no trecho, como no `suprimentos.tsx` |
| Colunas dos ativos (`colunas.ts`) | o inteiro, o decimal e a moeda (linhas 65 a 67) e o número coletado (linha 149), que faz as colunas dos suprimentos e do total de páginas | a espécie número, sem a mono |
| Colunas dos ativos (`colunas.ts`) | a data (linha 68) | a espécie data, sem a mono. O momento, "Cadastrado em" e "Atualizado em" (linhas 279 e 280), fica na mono, porque tem a hora |
| Prévia do ativo (`PreviaDoAtivo.tsx:63`, no `QuickLook`) | o número e a data, que seguem a `mono` da coluna | a fonte da interface. O valor de todo campo da prévia ganha os algarismos tabulares (`QuickLook.module.css`), como a célula da tabela |
| Suprimentos (`suprimentos.tsx`) | o nível e as páginas, na célula e nos contadores da ficha | a classe `numero` no lugar da `mono` |
| Disponibilidade (`disponibilidade.tsx`) | a latência | a classe `numero` no lugar da `mono` |
| Idade da leitura (`IdadeDaLeitura`, em `disponibilidade.tsx`) | a idade da última leitura, como "há 16 d", na disponibilidade, nos suprimentos e no Control iD, na tabela e na ficha | a classe `numero` no lugar da `mono`. Vale o mesmo para as amostras da idade nas histórias das tabelas (`ValorComposto.stories.tsx`, :18 e :125, e `TabelaComColunasEstreitas.stories.tsx`, :56 e :151) e para o contrato de módulo (`docs/casca/modulos.md:1819`) |
| Ajustes, Aparência | a leitura do contraste ("Texto 15,2:1") | Instrument Sans tabular |
| Backups do Control iD no Início | os rostos | Instrument Sans tabular |

A coluna da tabela dos ativos ganha a espécie, `numero` ou `data`, na definição do domínio (`ColunaDaTabela`). A `TabelaDosAtivos` a passa à `<Coluna>`, como as outras tabelas, e a célula segue a espécie. A `mono` fica para os identificadores e o momento.

Sem a espécie, a célula perderia os algarismos tabulares. A tabela dos ativos é virtualizada (`TabelaDosAtivos.tsx:723`), e as células dela não são `td`: o `td` do `base.css:27-31` não vale ali. Hoje, os algarismos tabulares vêm do `[data-mono]` (`Tabela.module.css:242-245`), que põe a célula inteira na mono. Só tirar a `mono` deixaria os números sem o alinhamento. A espécie número os leva ao `.conteudoNumero`, com os algarismos tabulares, e a data, ao `.conteudoData`.

Cuidados:
- **a `especie` entra opcional na `ColunaDaTabela`** (`visoes.ts:101-123`).
  - Os literais que montam a coluna sem ela, no `visoes.test.ts:32` e no `useEstadoDaTabela.test.tsx:21`, continuam valendo.
  - A `ColunaDosAtivos`, que a estende, segue nos usos dela: os testes da tabela dos ativos, o `e2e/api-dos-ativos.ts` e o `apps/api/src/ativos/colunas.ts`.
  - No `colunas.ts` do domínio, o `Pick` da linha 51 ganha a `especie`;
- **a célula composta dos suprimentos** passa a ficar dentro do `.conteudoNumero`, que é `display: block` (`Tabela.module.css:252-257`), numa tabela que corta com reticências (:223-226). A tarefa 5.2 confere a coluna estreita.

A idade da leitura entrou nesta decisão em 14/11, na conferência da 5.2, porque o usuário pediu que ela ficasse igual aos mockups. Nos mockups da rodada 3, a idade da leitura de um valor coletado sai sempre na fonte da interface:
- "toner 8%, lido há 13 d", em r3-03, m11;
- "Desatualizada · há 13 d", "Lido há 13 dias" e "leitura há 13 dias", em r3-03 e r3-04.

Na fonte da interface, a idade fica mais estreita. Na história "Larguras Que A Coleta Pede", a sobra das larguras de fábrica muda assim:
- no Windows, sobe de até 9 px para até 22 px;
- no Linux, sobe de até 14 px para até 25 px.

As larguras ficam como estão, porque a spec pede ao menos 210 px na Disponibilidade, e o limite da sobra sobe de 20 para 30 px. A dos Suprimentos, que a spec não prende, volta a ser medida no ajuste do medidor, a change seguinte, que põe o medidor de verdade na história.

Nesta change, as outras idades no `<time className="mono">` ficam como estão:
- a do alerta, na tabela e na ficha;
- a das solicitações e a das ordens, na ficha do ativo;
- a do "O que resolver agora".

O motivo é que a tela de cada uma é refeita pela change do mockup dela, e é essa change que decide a fonte. Os mockups quase sempre põem essas idades na fonte da interface, como o "Alerta aberto · há 5 min" da ficha (r3-04) e as idades dos chamados (r3-16). A exceção é a lista de reservas (r3-13), que põe na mono a idade de uma coluna de tabela.

Ficam na mono:
- os horários: o `<time className="mono">` com a hora, como o momento do alerta no histórico e o horário da notificação, o relógio da barra e a grade das salas;
- as outras idades, no `<time className="mono">`, até a change da tela de cada uma;
- os identificadores e o código, como na decisão 5;
- as classes `mono` do painel da operação, que mostram nomes, destinos e endereços;
- a etapa do carregamento.

A classe `numero` já existe no `base.css`, com os algarismos tabulares, e herda a fonte da interface.

## Risks / Trade-offs

- **[O secundário dos temas claros e a informação do Grafite mudam pouco, e a regressão visual pode não reprovar a captura]** → O `--atualizar` só regrava a captura que reprova, e a informação do Grafite vai só de 15% para 17%. Nos temas escuros, a troca da fonte de um número curto, como o "2" do saldo na tabela das espécies, também pode ficar abaixo da tolerância. Antes do `--atualizar`, uma rodada de detecção com o `threshold: 0` do `toHaveScreenshot`, só no `playwright.config.ts` local e desfeita depois, reprova qualquer pixel diferente. Ela acha todas as capturas que mudaram, mesmo as de uma história que mostra a informação por dentro de outro componente, e deixa a imagem de diferença de cada uma. Apagar as referências por uma lista feita à mão deixaria escapar essas histórias, e a captura regravada do zero não teria a imagem de diferença para conferir. A informação dos outros quatro temas não aparece em nenhuma captura: as histórias saem só no Grafite e na Névoa, e a página-matriz, a única captura desses quatro, não tem o rótulo dela. A matriz o ganha na tarefa 5.1, e a regressão passa a cobrir a informação nos seis temas.
- **[O piso do secundário muda o efeito do controle de contraste no tema personalizado]** → O controle é do usuário (spec ajustes-do-sistema).
  - No claro, o alvo do secundário é L 0,52 − 0,14k, e o piso, L ≈ 0,434 − 0,014k. Do contraste 0 até perto de 68, o secundário fica no piso: o controle muda o texto principal, as bordas e o resto, mas não ele. Antes, ele ia de L 0,52 a 0,43 nessa faixa.
  - No escuro, abaixo de uns 29, o secundário clareia. No contraste 0, ele passa de 5,9:1 para 7:1 sobre a afundada, de L 0,66 para uns 0,70.
  - "Os temas escuros não mudam" só vale para os de fábrica. A tarefa 5.2 confere o Personalizado no contraste 0, no claro e no escuro.
- **[No tema personalizado com base de croma, o fundo de uma situação fica no teto]** → A base com a matiz perto da situação, ou perto da oposta, já leva os neutros ao tom do fundo, e nenhuma tinta até 30% o separa deles. A borda e o texto dizem a situação, e o texto continua com 4,5:1 sobre o fundo.
- **[O fundo muda o desenho dos rótulos e dos blocos nos temas claros, e os mockups aprovados mostram a tinta escura]** → O usuário escolheu a regra olhando a amostra das opções, nos temas claros e na Meia-noite. Os rótulos e os blocos ficam com mais cor, numa tinta de 19% a 27%. A regressão visual os mostra, e a tarefa 5.2 confere o Papel, a Névoa e o Alto contraste no app.
- **[O numeral perde o desenho de instrumento da mono]** → O desenho fica no peso forte, nos algarismos tabulares e na unidade em texto secundário. A largura dos algarismos é a mesma da mono, e nada muda de lugar.
- **[Um número de quantidade fica na mono num módulo fora da lista]** → A tarefa varre os usos da `--fonte-mono` e da classe `mono`, e a revisora confere a lista da decisão 6.
- **[O tema personalizado salvo no navegador pinta uma vez com o secundário e o fundo antigos]** → A cópia do navegador é gravada de novo quando o app aplica as preferências. A diferença dura até a primeira carga, uma vez só.
- **[A busca da tinta custa no navegador]** → São até 16 tintas por situação, com os doze pares, e a cor do texto é achada uma vez. No protótipo, o tema inteiro, com o piso e as tintas, sai em cerca de 4 ms no Node.

## Migration Plan

Não há dado a migrar. O CSS e o DTCG saem do gerador (`pnpm tokens:gerar`), e o tema personalizado é gerado no navegador pelo mesmo código. Para voltar atrás, basta reverter os commits da change e gerar os tokens de novo.
