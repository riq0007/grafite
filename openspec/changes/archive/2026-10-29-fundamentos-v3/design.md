## Context

Os tokens estão em `packages/ui/src/tokens`. A camada 1, `primitivos.ts`, é a paleta escrita à mão. A camada 2 tem:
- `temas.ts`: 15 cores por tema, nos seis temas;
- `destaques.ts`: os quatro destaques, em duas variações por tom, e as situações em três variações.

O `gerar.ts` escreve o `tokens.css`, com blocos `[data-theme]` e `[data-theme][data-accent]`, mais o `variaveis.ts` e o DTCG. O `contraste-pares.ts` lista os pares de cores que precisam passar, e o `relatorio-contraste.ts` grava as 24 combinações em `docs/identidade/contraste.md`.

Os componentes e as telas usam só as variáveis `--cor-*`, `--texto-*`, `--raio-*` e as outras. Os mais usados são:

| Variável | Usos |
|---|---|
| `--cor-texto-2` | 166 |
| `--cor-texto` | 115 |
| `--cor-linha` | 77 |
| `--cor-superficie` | 32 |

Trocar o valor de uma variável muda a interface inteira sem editar os componentes.

As preferências (`packages/domain/src/preferencias`) guardam o tema, o destaque, a densidade e o raio. A web aplica tudo no `<html>` como atributos, e o anti-flash do `index.html` faz o mesmo antes da primeira pintura.

## Goals / Non-Goals

**Goals:**
- Cada tema sai de poucas entradas, com o contraste garantido por construção, e não por conferência depois.
- Uma paleta própria do Grafite: neutros com a matiz da base, o destaque monocromático de fábrica e as cores com papel definido.
- Os papéis que faltam para as próximas etapas:
  - a elevação;
  - as situações com fundo, borda e preenchimento;
  - a paleta de dados e as tintas dos suprimentos;
  - o numeral e a legenda.
- Nenhum componente editado nesta change: tudo muda pelas variáveis.

**Non-Goals:**
- Redesenhar os componentes, a casca ou as telas, que ficam para as próximas changes do D1.
- Dar ao usuário a escolha do tema personalizado, que fica para a change do controle do usuário.
- Trocar as fontes ou a escala de tamanhos que já existe.

## Decisions

### 1. OKLCH como espaço de geração

O gerador trabalha em OKLCH (luminosidade, croma e matiz) e entrega hexadecimal sRGB.

O OKLCH é perceptualmente uniforme: um amarelo e um azul com a mesma luminosidade parecem igualmente claros. É isso que deixa gerar um tema a partir da matiz sem ajuste à mão, como a Linear faz com o LCH e o Material 3 com o HCT. Ele é também o espaço de cor do CSS (`oklch()`), e a conversão é curta, sem dependência.

A saída em hexadecimal mantém o `contraste.ts` de hoje, a WCAG 2.2 sobre sRGB, e o CSS legível em qualquer navegador.

**Fora do gamute:** a cor que cai fora do sRGB perde croma, por busca binária, até entrar. A luminosidade e a matiz ficam iguais.

As alternativas eram:
- **HSL:** a luminosidade dele não é a percebida, e o amarelo com 50% fica muito mais claro que o azul.
- **HCT do Material:** dependeria de uma biblioteca e de um modelo de aparência que não usamos.

### 2. Cinco entradas por tema e por destaque

```ts
interface EntradaDoTema {
  tom: 'escuro' | 'claro';
  base: { matiz: number; croma: number }; // croma de 0 a 0,06
  contraste: number; // de 0 a 100
  oled?: boolean; // fundo preto absoluto
}

interface EntradaDoDestaque {
  matiz: number;
  croma: number; // 0 é o destaque monocromático
}
```

Para cada papel, o gerador tem uma luminosidade-alvo, que depende do tom e cresce com o contraste (decisão 3). Em seguida, `garantirContraste(cor, fundos, mínimo)` move a luminosidade, na direção que se afasta dos fundos, até o mínimo contra todos eles. A busca é binária, com no máximo 30 passos.

Os mínimos são os de hoje:
- **4,5:1** para o texto;
- **3:1** para a borda de controle, o foco, os ícones e os elementos gráficos.

O texto principal mira 7:1, para sobrar folga com as camadas de hover.

### 3. Os papéis e as luminosidades-alvo

As luminosidades da tabela valem com o contraste em 0 e em 100. Entre os dois, a interpolação é linear.

| Papel | Escuro | Claro | Mínimo garantido |
|---|---|---|---|
| `fundo` (atrás da janela) | 0,165 → 0,115 | 0,935 → 0,905 | — |
| `superficieAfundada` | 0,185 → 0,145 | 0,955 → 0,935 | — |
| `superficie` (a janela) | 0,205 → 0,175 | 0,995 → 1 | — |
| `superficie2` (controles e blocos) | 0,24 → 0,22 | 0,972 → 0,962 | — |
| `superficieElevada` | 0,255 → 0,235 | 1 | — |
| `materialSolido` (sobreposta) | 0,27 → 0,25 | 0,985 | — |
| `texto` | 0,93 → 0,99 | 0,2 → 0,08 | 7:1 sobre `superficie2` |
| `texto2` | 0,72 → 0,82 | 0,48 → 0,36 | 4,5:1 sobre `superficie2` com a camada de pressionado |
| `bordaControle` | 0,5 → 0,6 | 0,65 → 0,55 | 3:1 sobre `superficie2` |
| `linha` e `linhaForte` | branco a 7% → 12% e a 13% → 21% | preto a 8% → 14% e a 14% → 24% | — |

- O croma dos neutros é o da base, reduzido nos extremos de luminosidade, onde ele quase não aparece, para não tingir o texto.
- Com `oled`, o fundo e a afundada são o preto absoluto.
- Os materiais translúcidos da barra e das camadas sobrepostas usam a mesma cor da `superficie`, com a opacidade de hoje.

### 4. Os pontos de partida

**Temas:**

| Tema | Tom | Base (matiz, croma) | Contraste |
|---|---|---|---|
| Grafite | escuro | 265, 0,006 | 45 |
| Meia-noite | escuro | 262, 0,03 | 45 |
| OLED | escuro, `oled` | 0, 0 | 70 |
| Névoa | claro | 260, 0,006 | 45 |
| Papel | claro | 80, 0,016 | 45 |
| Alto contraste | claro | 0, 0 | 100 |

**Destaques:**

| Destaque | Matiz | Croma |
|---|---|---|
| Grafite | — | 0 |
| Azul | 258 | 0,17 |
| Verde | 155 | 0,14 |
| Laranja | 55 | 0,16 |

Os valores do Apêndice A deixam de ser a fonte. A spec mestre passa a apontar para o gerador e para esta tabela.

### 5. O destaque monocromático de fábrica

O destaque de fábrica passa do azul ao Grafite, com croma 0:
- **No escuro:** o preenchimento fica quase branco, com o texto quase preto.
- **No claro:** o preenchimento fica quase preto, com o texto branco.
- **O texto do destaque** é o próprio texto do tema.
- **O foco** usa o destaque, que tem pelo menos 3:1 contra as superfícies.

Os motivos:
- A contenção da Kimi e da Anthropic deixa as cores para o que tem significado. O verde, o âmbar e o vermelho das situações e as tintas dos suprimentos passam a ser as únicas cores na tela.
- O azul de destaque se confundia com o azul da informação (ANTISLOP, seção 12).
- O botão azul é a marca mais forte da interface genérica de SaaS (ANTISLOP, seção 3).

Quem já escolheu o azul continua com ele, porque a preferência salva vale.

Para um destaque com croma, o gerador busca duas cores:
- **o preenchimento:** com pelo menos 4,5:1 contra a cor do texto sobre ele, que é o branco ou o quase preto, o que der mais contraste, e com 3:1 contra a superfície;
- **o texto do destaque:** com 4,5:1 contra a `superficie2`.

O hover e o pressionado continuam a sair do `estadosDoDestaque`.

### 6. Elevação em quatro superfícies

Os nomes vêm da Atlassian, e cada superfície tem a sua sombra:

| Superfície | Para quê | Sombra |
|---|---|---|
| Afundada | poços: o fundo da faixa de filtros, a trilha dos medidores, o campo de busca da barra | nenhuma |
| Padrão (`superficie`) | o conteúdo da janela | nenhuma |
| Elevada | blocos sobre o conteúdo, como os cartões do Início e as fichas | `--sombra-elevada`: uma camada só, curta |
| Sobreposta (`materialSolido` e o material) | menus, popovers, avisos, diálogos e a busca | `--sombra-sobreposta`: a `--sombra-material` de hoje |

No escuro, a superfície elevada é mais clara que a padrão, e a sombra quase não aparece. No claro, ela é branca, com a sombra curta. Uma camada só de sombra segue o ANTISLOP, seção 16.

### 7. Situações completas

Cada situação tem uma matiz e um croma fixos:

| Situação | Matiz | Croma |
|---|---|---|
| ok | 150 | 0,14 |
| atenção | 75 | 0,14 |
| crítico | 25 | 0,17 |
| informação | 245 | 0,12 |

O neutro é o `texto2`. O gerador dá a cada situação, por tema:
- `--cor-{situação}`: o texto e o ícone, com 4,5:1 sobre a `superficie2` e sobre o próprio fundo sutil;
- `--cor-{situação}-fundo`: a cor a 15%, a tinta do rótulo de hoje, para o fundo do rótulo e das faixas;
- `--cor-{situação}-borda`: a cor a 40%, para o contorno do rótulo;
- `--cor-{situação}-forte` e `--cor-sobre-{situação}`: o preenchimento e o texto sobre ele, com 4,5:1 entre os dois.

O Alto contraste mantém as situações mais escuras de hoje, que o gerador alcança com o contraste em 100.

### 8. Paleta de dados

**As oito cores categóricas** (`--cor-serie-1` a `--cor-serie-8`) têm as matizes 258, 55, 175, 340, 125, 25, 210 e 85, nessa ordem. A ordem alterna o quente e o frio, para separar as séries vizinhas.

A luminosidade é parecida: 0,72 no escuro e 0,56 no claro. Cada uma tem pelo menos 3:1 contra a `superficie`, o mínimo da WCAG para elementos gráficos (1.4.11).

A cor nunca vem sozinha: toda série tem o rótulo direto ou a legenda (ANTISLOP, seções 12 e 31).

**As tintas dos suprimentos** (`--cor-tinta-ciano`, `--cor-tinta-magenta`, `--cor-tinta-amarelo` e `--cor-tinta-preto`) identificam o cartucho:
- o ciano tem a matiz 220, o magenta a 350 e o amarelo a 95;
- o preto é um neutro, porque o preto de verdade sumiria nos temas escuros;
- cada tinta tem 3:1 contra a `superficie`, e por isso o amarelo vira um mostarda nos temas claros.

O nome da cor e o nível vão sempre em texto, ao lado.

### 9. Numeral e legenda

| Papel | Variável | Medida | Para quê |
|---|---|---|---|
| Numeral | `--texto-numeral` | 28 px | o número de instrumento dos medidores e dos indicadores, em JetBrains Mono, com algarismos tabulares e o peso forte |
| Legenda | `--texto-legenda` | 11 px | as marcas das escalas e as notas dos gráficos, sempre em `--cor-texto-2` |

A escala de hoje (12, 13, 14, 16, 20 e 26 px) não muda.

### 10. Raio de fábrica de 10 px

A base de fábrica passa de 12 para 10 px:
- a janela fica com 10 px;
- o controle, com 5,8 px;
- o menu, com 8,5 px.

O acabamento fica mais próximo de um instrumento de precisão. A faixa ajustável continua de 0 a 24 px.

### 11. Os nomes das variáveis

As variáveis de hoje mantêm o nome e mudam só de valor. As novas são:
- `--cor-superficie-afundada` e `--cor-superficie-elevada`;
- `--sombra-elevada` e `--sombra-sobreposta`;
- as situações completas (decisão 7);
- `--cor-serie-1` a `--cor-serie-8` e `--cor-tinta-*`;
- `--texto-numeral` e `--texto-legenda`.

A `--sombra-material` continua, como apelido da sobreposta.

### 12. O sistema documentado como os de referência

O ANTISLOP v3 abre com quatro princípios, cada um com a pergunta que o confere:
- **Precisão de prancheta:** linhas finas, alinhamento e números de instrumento, como num desenho técnico.
- **O dado antes da decoração:** a cor serve à situação e ao dado.
- **Calma por padrão, ênfase por exceção:** um destaque só por tela.
- **O usuário ajusta, o sistema garante:** a escolha é dele, e o contraste é do gerador.

O ANTISLOP v3 descreve também as três camadas, o gerador e as regras novas de cor, elevação, dados e tipografia.

O catálogo ganha a seção Fundamentos, com as páginas de cor, elevação, situações, dados e tipografia, como as seções de fundamentos do Material, do Fluent e do Carbon.

## Risks / Trade-offs

- **Todas as capturas da regressão visual mudam.** Elas são regravadas numa tarefa própria, conferidas por amostra nos dois temas da regressão.
- **Mudar de destaque de fábrica muda o foco e a seleção de quem não escolheu nada.** O foco continua com 3:1 garantido. A seleção da tabela e das escolhas passa a ser neutra, com a marca lateral, que vem na change dos componentes.
- **A mesma cor alvo pode cair fora do gamute em matizes extremas.** A perda de croma resolve, e o teste varre as matizes de 0 a 360 em passos de 15.
- **O amarelo nos temas claros vira mostarda.** É o preço dos 3:1, e o nome da tinta vai sempre em texto.

## Migration Plan

Nada a migrar no banco. A preferência salva vale como está. Os padrões de fábrica novos alcançam quem nunca escolheu, e a cópia do navegador aplica o que estiver salvo.

## Open Questions

Nenhuma.
