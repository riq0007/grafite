# design-tokens Specification

## Purpose

Definir num único lugar todos os valores visuais do Grafite (cor, tipografia, espaçamento, raio, material, movimento e densidade), com temas trocáveis em tempo de execução e contraste verificado.

## Requirements

### Requirement: Fonte única de valores visuais

Todo valor visual SHALL vir de tokens definidos num único lugar: cor, tipografia, espaçamento, raio, sombra, material, movimento e densidade. Nenhum componente ou tela SHALL declarar um valor visual fixo fora dos tokens. Uma verificação automática SHALL acusar valores fixos de cor.

#### Scenario: Alteração de um token
- **WHEN** o valor de um token semântico é alterado
- **THEN** todos os componentes que o usam passam a refleti-lo, sem edição individual

#### Scenario: Cor fixa num componente
- **WHEN** um componente declara uma cor literal fora dos tokens
- **THEN** a verificação automática falha e aponta o arquivo e a linha

### Requirement: Tokens em três camadas

Os tokens SHALL ser organizados em três camadas:
- **referência:** as entradas dos temas e dos destaques, as escalas e as cores fixas, como o branco da etiqueta;
- **sistema:** os papéis que o gerador produz (fundo, superfícies, texto, linha, destaque, situações, dados, material e outros);
- **de componente.**

Os componentes SHALL consumir apenas tokens de sistema ou de componente, nunca as entradas de referência.

#### Scenario: Troca de paleta primitiva
- **WHEN** a matiz da base do tema Papel, uma entrada de referência, muda
- **THEN** só os papéis gerados para o Papel mudam, e os componentes não precisam ser editados

### Requirement: Seis temas e quatro destaques

O sistema SHALL oferecer seis temas, gerados a partir das entradas da spec mestre (Apêndice A):
- **escuros:** Grafite, Meia-noite e OLED;
- **claros:** Névoa, Papel e Alto contraste.

O sistema SHALL oferecer também quatro destaques: Grafite, monocromático, e o azul, o verde e o laranja. O destaque de cada combinação SHALL ser gerado para o tema dela.

#### Scenario: Tema padrão
- **WHEN** nenhuma preferência foi escolhida
- **THEN** o tema aplicado é Grafite com o destaque Grafite: a ação principal em quase branco, com o texto quase preto

#### Scenario: Destaque em tema claro
- **WHEN** o usuário usa um tema claro com o destaque verde
- **THEN** é aplicado o verde gerado para aquele tema, com o texto branco sobre o preenchimento

### Requirement: Três densidades

O sistema SHALL oferecer três densidades:

| Densidade | Linha | Miniatura | Controle |
|---|---|---|---|
| Compacta | 36 px | 24 px | 32 px |
| Normal (padrão de fábrica) | 44 px | 30 px | 36 px |
| Confortável | 52 px | 36 px | 40 px |

#### Scenario: Troca de densidade
- **WHEN** a densidade muda de normal para confortável
- **THEN** a altura das linhas passa de 44 px para 52 px e a miniatura de 30 px para 36 px

#### Scenario: Conta nova
- **WHEN** uma conta entra pela primeira vez, sem ter escolhido a densidade
- **THEN** a interface usa a densidade Normal

### Requirement: Raio de borda com base ajustável

O raio SHALL derivar de uma base ajustável de 0 a 24 px (padrão de fábrica de 10 px), com a escala por tipo de elemento da spec mestre (Apêndice A.4). A forma totalmente arredondada SHALL ficar reservada a avatares, pontos e rótulos de situação, fora a exceção nomeada da aba dos chamados: a trilha, os chips, os botões, os selos e o bloco de quem pede SHALL ser cápsulas, no raio da cápsula, que também deriva da base e fica reto na base zero.

#### Scenario: Base zero
- **WHEN** a base de raio é 0
- **THEN** janelas, controles, menus, miniaturas e as cápsulas da aba ficam com cantos retos

#### Scenario: Botão com base máxima
- **WHEN** a base de raio é 24 px
- **THEN** um botão fora da aba dos chamados continua com raio menor que sua meia altura, sem virar cápsula

#### Scenario: Raio de fábrica
- **WHEN** uma conta nunca mudou o raio
- **THEN** a janela tem 10 px de raio

#### Scenario: Cápsula da aba
- **WHEN** a prévia do colaborador mostra a trilha da aba, com a base de fábrica
- **THEN** cada pílula da trilha tem o raio da cápsula, maior que a meia altura dela

### Requirement: Movimento e transparência como tokens

As durações, curvas e molas de animação SHALL ser tokens. Com a preferência de movimento reduzido ativa, os deslocamentos, escalas e molas SHALL ser suprimidos e apenas as trocas de opacidade SHALL permanecer. Com a transparência reduzida, os materiais translúcidos SHALL ser substituídos por equivalentes sólidos.

#### Scenario: Movimento reduzido do sistema operacional
- **WHEN** o sistema operacional declara preferência por movimento reduzido
- **THEN** nenhum componente anima deslocamento ou escala, e as transições viram trocas de opacidade

#### Scenario: Transparência reduzida
- **WHEN** a transparência reduzida está ativa
- **THEN** menus, avisos e popovers usam o fundo sólido do material, sem desfoque

### Requirement: Troca de aparência em tempo de execução e sem flash

Tema, destaque, densidade, raio, movimento e transparência SHALL mudar em tempo de execução, sem recarregar a página. A aparência escolhida SHALL ser aplicada antes da primeira pintura, sem mostrar outro tema por um instante.

#### Scenario: Troca de tema
- **WHEN** o usuário troca de Grafite para Névoa
- **THEN** a interface muda imediatamente, sem recarregar

#### Scenario: Reabertura com tema salvo
- **WHEN** o usuário reabre a aplicação com o tema OLED salvo
- **THEN** a primeira pintura já usa o OLED, sem piscar outro tema

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

### Requirement: Temas gerados a partir de poucas entradas

Cada tema SHALL ser gerado, no espaço de cor OKLCH, a partir destas entradas:
- o tom, claro ou escuro;
- a base, com a matiz e o croma dos neutros;
- o contraste, de 0 a 100;
- opcionalmente, o fundo preto absoluto.

Cada destaque SHALL ser gerado a partir da matiz e do croma. O croma 0 é o destaque monocromático.

O gerador SHALL produzir todos os papéis de cor do tema e SHALL mover a luminosidade de cada papel, sem mudar a matiz, até o mínimo de contraste contra as superfícies em que ele aparece. Uma cor fora do sRGB SHALL perder croma até caber, com a mesma luminosidade e a mesma matiz.

#### Scenario: Mais contraste
- **WHEN** o contraste do tema Névoa sobe de 45 para 100
- **THEN** o texto secundário fica mais escuro, e as linhas ficam mais fortes

#### Scenario: Cor fora do gamute
- **WHEN** o destaque pede a matiz 145 com croma 0,25 num tema escuro
- **THEN** o gerador entrega uma cor dentro do sRGB, com a mesma matiz e a mesma luminosidade

### Requirement: Elevação em quatro superfícies

O tema SHALL ter quatro superfícies, cada uma com a sua sombra:

| Superfície | Uso | Sombra |
|---|---|---|
| Afundada | poços, como a trilha de um medidor | nenhuma |
| Padrão | o conteúdo da janela | nenhuma |
| Elevada | blocos sobre o conteúdo | uma camada curta |
| Sobreposta | menus, popovers, avisos, diálogos e a busca | a do material |

A sombra SHALL ter uma camada só. Nos temas escuros, a superfície elevada SHALL ser mais clara que a padrão.

#### Scenario: Bloco sobre o conteúdo
- **WHEN** um bloco do Início usa a superfície elevada no tema Grafite
- **THEN** ele fica mais claro que a janela, com a sombra curta

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

### Requirement: Paleta de visualização de dados

O tema SHALL ter oito cores categóricas para séries de dados, de luminosidade parecida, numa ordem que alterna o quente e o frio. Cada uma SHALL ter pelo menos 3:1 contra a superfície.

O tema SHALL ter também as tintas dos suprimentos: ciano, magenta, amarelo e preto. Cada tinta SHALL ter pelo menos 3:1 contra a superfície. O preto SHALL ser um neutro visível nos temas escuros.

Toda série e toda tinta SHALL vir com o nome em texto, no rótulo direto ou na legenda.

#### Scenario: Tinta preta no tema OLED
- **WHEN** o nível do toner preto aparece no tema OLED
- **THEN** a barra usa a tinta preta do tema, com pelo menos 3:1 contra a superfície, e o nome "Preto" aparece ao lado

#### Scenario: Amarelo num tema claro
- **WHEN** o nível do toner amarelo aparece no tema Névoa
- **THEN** a barra usa a tinta amarela do tema, com pelo menos 3:1 contra a superfície

### Requirement: Tema e destaque personalizados em tempo de execução

O tema e o destaque personalizados SHALL ser gerados no navegador pelo mesmo gerador dos temas de fábrica, com as mesmas garantias de contraste, e SHALL ser aplicados como variáveis no `<html>`. Por baixo deles SHALL valer o tema de fábrica do mesmo tom (o Grafite, no escuro, e o Névoa, no claro), para os tokens que não são cor.

O tema e o destaque personalizados SHALL valer desde a primeira pintura, pela cópia do navegador. O script anti-flash SHALL aceitar só as variáveis de cor e de sombra, com valores feitos de números, cores em hexadecimal e `rgb()` ou `rgba()`, e SHALL ignorar as outras.

#### Scenario: Reabertura com o tema personalizado
- **WHEN** o usuário reabre a aplicação com o tema personalizado claro, na matiz 80, salvo
- **THEN** a primeira pintura já usa esse tema, sem piscar o Grafite

#### Scenario: Volta a um tema de fábrica
- **WHEN** o usuário troca o tema Personalizado pelo Névoa, com o destaque azul
- **THEN** nenhuma variável do tema personalizado fica no `<html>`, e a interface usa o Névoa com o azul gerado para ele

#### Scenario: Valor estranho na cópia
- **WHEN** a cópia do navegador traz uma variável de cor com `url(` no valor
- **THEN** o anti-flash ignora essa variável e aplica as demais

### Requirement: Cores da aba

O tema SHALL ter as cores da aba dos chamados, na prévia do colaborador e na própria aba, feitas na matiz da informação, com a luminosidade e o croma dos mockups aprovados:
- o fundo, na luminosidade 0,42 e no croma 0,16;
- o fundo 2, das pílulas da trilha, em 0,34 e 0,13;
- o bloco de quem pede, em 0,49 e 0,165;
- o texto, em 0,985 e 0,012;
- o contorno da moldura e dos ícones, em 0,8 e 0,1 nos temas escuros e, nos claros, o próprio fundo;
- a atenção da aba, dos selos, na matiz da atenção, em 0,8 e 0,145, com o texto sobre ela em 0,2 e 0,04.

Onde a cor não couber no sRGB, cada canal SHALL ser cortado no limite, como o navegador mostrou o mockup aprovado, e não com o croma reduzido das outras cores do tema: o fundo fica em #004f9d e o bloco em #0064b6.

A verificação automática SHALL conferir, nas 24 combinações dos temas com os destaques e na varredura de entradas do contraste:
- o texto da aba com 4,5:1 sobre o fundo, sobre o fundo pressionado, sobre o fundo 2, sobre o bloco e sobre o bloco pressionado;
- o texto sobre a atenção da aba com 4,5:1;
- o contorno com 3:1 contra a superfície, a superfície 2 e a elevada.

#### Scenario: Faixa da aba no tema Papel
- **WHEN** a prévia do colaborador mostra a faixa da aba no tema Papel
- **THEN** o texto da aba tem pelo menos 4,5:1 sobre o fundo da aba, e a moldura, no próprio fundo, tem pelo menos 3:1 contra a superfície elevada

#### Scenario: Ícone do tipo num tema escuro
- **WHEN** a grade dos tipos mostra o ícone de um tipo no tema Grafite
- **THEN** o ícone, no contorno da aba, tem pelo menos 3:1 contra a superfície 2

#### Scenario: Tema personalizado
- **WHEN** a conta usa um tema personalizado claro
- **THEN** a aba tem as cores dos temas claros, com o contorno no próprio fundo
