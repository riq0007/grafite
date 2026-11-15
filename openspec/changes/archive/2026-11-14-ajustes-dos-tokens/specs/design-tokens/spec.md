## MODIFIED Requirements

### Requirement: Contraste verificado automaticamente

O gerador SHALL garantir, para qualquer entrada, os mínimos da WCAG 2.2 nível AA:
- 4,5:1 para texto normal;
- 3:1 para texto grande, ícones, bordas de controles, indicadores de foco e elementos gráficos.

Acima desses mínimos, o texto secundário SHALL ter pelo menos 7:1 sobre a superfície afundada, onde fica o texto de exemplo dos campos.

Uma verificação automática SHALL conferir os mínimos nas 24 combinações dos seis temas com os quatro destaques e numa varredura de entradas: matizes de 0 a 360, croma da base de 0 a 0,06 e contraste de 0 a 100. A verificação SHALL falhar a build quando alguma combinação não atender.

#### Scenario: Combinação reprovada
- **WHEN** uma mudança no gerador faz o texto secundário do tema Papel ficar abaixo de 4,5:1 contra a superfície
- **THEN** a verificação falha, indicando o tema, o destaque, o par de tokens e o contraste medido

#### Scenario: Entrada qualquer
- **WHEN** o gerador recebe um tema claro com a base de matiz 95 e croma 0,06, contraste 0 e o destaque amarelo de croma 0,2
- **THEN** o texto, o texto secundário, o texto sobre o destaque e as situações passam dos mínimos

#### Scenario: Texto de exemplo no Papel
- **WHEN** um campo vazio mostra o texto de exemplo no tema Papel
- **THEN** o texto de exemplo tem pelo menos 7:1 sobre a superfície afundada do campo

### Requirement: Situações com texto, fundo, borda e preenchimento

As situações ok, atenção, crítico e informação SHALL ter, em cada tema:
- a cor do texto e do ícone, com 4,5:1 sobre a superfície e sobre o próprio fundo sutil;
- o fundo sutil e a borda;
- o preenchimento e a cor do texto sobre ele, com 4,5:1 entre os dois.

O fundo sutil de cada situação SHALL ser a cor da situação na luminosidade 0,7 nos temas claros e 0,8 nos escuros, com o croma e a matiz dela, na tinta da situação. Onde esse croma não couber no sRGB, ele SHALL ser reduzido até caber.

A tinta SHALL ser a menor tinta inteira, de 15% a 30%, com que o fundo sutil fica a pelo menos 0,02 de cada neutro do tema no plano do croma do OKLab, só com o a e o b, sem a luminosidade. Nos temas claros, essa tinta SHALL deixar o fundo sutil também a pelo menos 0,03 de cada neutro no OKLab inteiro. Sem nenhuma, a tinta SHALL ser 30%.

A distância SHALL valer nos doze pares: o fundo sutil composto sobre a superfície e composto sobre a superfície 2, contra cada um dos seis neutros:
- o fundo da janela;
- a superfície afundada;
- a superfície;
- a superfície 2;
- o fundo do rótulo neutro composto sobre a superfície;
- o fundo do rótulo neutro composto sobre a superfície 2.

A verificação automática SHALL conferir:
- **nos seis temas de fábrica,** os doze pares, com a tinta abaixo do teto;
- **na varredura de entradas do contraste:**
  - a tinta entre 15% e 30%;
  - a tinta escolhida como a menor que passa: nenhuma tinta menor passa nos doze pares, e a de 30% sem passar só aparece quando nenhuma de 15% a 29% passa;
  - os doze pares em toda tinta abaixo do teto;
  - as entradas de base neutra com a tinta abaixo do teto.

Os componentes SHALL usar o fundo sutil do tema, sem compor a tinta de novo.

O neutro SHALL usar o texto secundário, e o fundo do rótulo neutro SHALL ser o texto secundário a 10%. A cor SHALL NOT ser o único indicador da situação.

#### Scenario: Rótulo de atenção no tema Papel
- **WHEN** um rótulo "Em manutenção" usa a situação atenção no tema Papel
- **THEN** o texto tem pelo menos 4,5:1 sobre o fundo sutil composto na superfície

#### Scenario: Bloco de atenção ao lado do bloco neutro
- **WHEN** uma tela do tema Papel mostra um bloco no fundo sutil da atenção, sobre a superfície, ao lado de um bloco neutro na superfície 2
- **THEN** os dois fundos ficam a pelo menos 0,02 de distância no plano do croma do OKLab e a pelo menos 0,03 no OKLab inteiro, e a borda e o texto também dizem a situação

#### Scenario: Aviso sobre o fundo da janela
- **WHEN** o campo de entrada mostra o aviso do ambiente no tema Papel, com o fundo sutil da atenção composto sobre a superfície, em cima do fundo da janela
- **THEN** o aviso fica a pelo menos 0,02 do fundo da janela no plano do croma do OKLab e a pelo menos 0,03 no OKLab inteiro

#### Scenario: Temas escuros de fábrica
- **WHEN** o tema é o Grafite, o Meia-noite ou o OLED
- **THEN** o ok, a atenção e o crítico ficam com a tinta de 15%, porque com ela o fundo sutil já fica a 0,02 dos neutros no plano do croma, e a distância no OKLab inteiro não entra na regra

#### Scenario: Base na matiz de uma situação
- **WHEN** o tema personalizado é claro, com a base de matiz 30 e croma 0,06, perto do crítico, e o contraste 45, e nenhuma tinta até 30% leva o fundo sutil do crítico a 0,02 dos neutros
- **THEN** a tinta do crítico fica em 30%, o texto do crítico continua com 4,5:1 sobre o fundo, e a borda e o texto dizem a situação

### Requirement: Tipografia auto-hospedada e escala definida

A interface SHALL usar Instrument Sans e JetBrains Mono, servidas pela própria aplicação, sem depender de internet. A tipografia SHALL ter uma escala definida:

| Papel | Tamanho |
|---|---|
| Legenda, o menor texto | 11 px |
| Rótulo | 12 px |
| Dado | 13 px |
| Corpo | 14 px |
| Subtítulo | 16 px |
| Título | 20 px |
| Título grande | 26 px |
| Numeral, o número de instrumento | 28 px, na Instrument Sans, com algarismos tabulares |

As quantidades SHALL usar a Instrument Sans com algarismos tabulares, com ou sem vírgula: as contagens, as medidas, os percentuais, os valores em moeda e os números das tabelas, dos medidores e dos indicadores. As datas sem hora e a idade da leitura de um valor coletado, como "há 2 min", SHALL usar a fonte da interface com algarismos tabulares. Os identificadores (patrimônio, série, IP, MAC e códigos), os horários, com ou sem a data, e o código SHALL usar a fonte monoespaçada.

#### Scenario: Servidor sem internet
- **WHEN** a aplicação roda num servidor sem acesso à internet
- **THEN** as fontes carregam normalmente

#### Scenario: Coluna numérica
- **WHEN** uma coluna mostra valores numéricos em linhas seguidas
- **THEN** os algarismos ficam alinhados verticalmente

#### Scenario: Texto do corpo
- **WHEN** uma tela mostra um parágrafo
- **THEN** ele aparece em 14 px

#### Scenario: Percentual com vírgula
- **WHEN** uma contagem mostra a disponibilidade "99,1%" no numeral
- **THEN** o número usa a Instrument Sans com algarismos tabulares, e a vírgula ocupa menos da metade da largura de um algarismo

#### Scenario: Identificador na mono
- **WHEN** a tabela mostra o patrimônio "PAT-00412" e o IP "10.20.4.37"
- **THEN** os dois usam a fonte monoespaçada

#### Scenario: Data e horário
- **WHEN** uma tela mostra a data de compra "12/03/2024" e a última coleta "14/11/2026 14:30"
- **THEN** a data usa a fonte da interface com algarismos tabulares, e a última coleta, com a hora, usa a fonte monoespaçada

#### Scenario: Idade da leitura
- **WHEN** a célula dos suprimentos mostra o nível "8%" e a idade da leitura "há 16 d"
- **THEN** os dois usam a fonte da interface com algarismos tabulares
