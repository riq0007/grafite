## MODIFIED Requirements

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

### Requirement: Raio de borda com base ajustável

O raio SHALL derivar de uma base ajustável de 0 a 24 px (padrão de fábrica de 10 px), com a escala por tipo de elemento da spec mestre (Apêndice A.4). A forma totalmente arredondada SHALL ficar reservada a avatares, pontos e rótulos de situação.

#### Scenario: Base zero
- **WHEN** a base de raio é 0
- **THEN** janelas, controles, menus e miniaturas ficam com cantos retos

#### Scenario: Botão com base máxima
- **WHEN** a base de raio é 24 px
- **THEN** um botão continua com raio menor que sua meia altura, sem virar cápsula

#### Scenario: Raio de fábrica
- **WHEN** uma conta nunca mudou o raio
- **THEN** a janela tem 10 px de raio

### Requirement: Contraste verificado automaticamente

O gerador SHALL garantir, para qualquer entrada, os mínimos da WCAG 2.2 nível AA:
- 4,5:1 para texto normal;
- 3:1 para texto grande, ícones, bordas de controles, indicadores de foco e elementos gráficos.

Uma verificação automática SHALL conferir os mínimos nas 24 combinações dos seis temas com os quatro destaques e numa varredura de entradas: matizes de 0 a 360, croma da base de 0 a 0,06 e contraste de 0 a 100. A verificação SHALL falhar a build quando alguma combinação não atender.

#### Scenario: Combinação reprovada
- **WHEN** uma mudança no gerador faz o texto secundário do tema Papel ficar abaixo de 4,5:1 contra a superfície
- **THEN** a verificação falha, indicando o tema, o destaque, o par de tokens e o contraste medido

#### Scenario: Entrada qualquer
- **WHEN** o gerador recebe um tema claro com a base de matiz 95 e croma 0,06, contraste 0 e o destaque amarelo de croma 0,2
- **THEN** o texto, o texto secundário, o texto sobre o destaque e as situações passam dos mínimos

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
| Numeral, o número de instrumento | 28 px, em JetBrains Mono |

Números em tabelas, medidores e indicadores SHALL usar algarismos tabulares. Identificadores (patrimônio, série, IP, MAC, horários) SHALL usar a fonte monoespaçada.

#### Scenario: Servidor sem internet
- **WHEN** a aplicação roda num servidor sem acesso à internet
- **THEN** as fontes carregam normalmente

#### Scenario: Coluna numérica
- **WHEN** uma coluna mostra valores numéricos em linhas seguidas
- **THEN** os algarismos ficam alinhados verticalmente

#### Scenario: Texto do corpo
- **WHEN** uma tela mostra um parágrafo
- **THEN** ele aparece em 14 px

## ADDED Requirements

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

O neutro SHALL usar o texto secundário. A cor SHALL NOT ser o único indicador da situação.

#### Scenario: Rótulo de atenção no tema Papel
- **WHEN** um rótulo "Em manutenção" usa a situação atenção no tema Papel
- **THEN** o texto tem pelo menos 4,5:1 sobre o fundo sutil composto na superfície

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
