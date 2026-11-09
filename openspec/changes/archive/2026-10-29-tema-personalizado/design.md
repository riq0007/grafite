## Context

O gerador da fundamentos-v3 (`packages/ui/src/tokens/gerador.ts`) é puro e não depende do Node. Ele já produz todos os papéis de cor a partir do tom, da base, do contraste e do destaque, e move a luminosidade até o mínimo da WCAG. O `gerar.ts`, porém, junta as declarações de cor (`coresDoTema`, `coresDaSituacao`, `coresDosDados` e `coresDoDestaque`) com a escrita dos arquivos, que usa o `node:fs`.

Na web, as preferências viram atributos no `<html>` (`data-theme`, `data-accent` e as variáveis `--raio-base` e `--tamanho-item-dock`), em `atributosDaInterface`. A cópia desses atributos fica no `localStorage`, e o script anti-flash do `index.html` só a copia, com uma lista fixa de nomes e valores de letras, números, ponto e hífen.

## Goals / Non-Goals

**Goals:**
- O tema e o destaque montados pelo usuário, com as mesmas garantias de contraste dos de fábrica.
- A primeira pintura certa, também com o tema personalizado.
- A leitura do contraste em números, como o usuário da TI mede.

**Non-Goals:**
- Os temas com nome da organização, para todos escolherem.
- Mudar a tipografia, o espaçamento ou os tokens que não são cor.
- Um seletor de cor livre em hexadecimal: as entradas são as do gerador, que garantem o contraste.

## Decisions

### 1. Os campos nas preferências

A aparência ganha dois campos, cada um trocado inteiro, como a ordem da tela inicial:

```ts
personalizado: { tom: 'escuro' | 'claro'; matiz: number; tingimento: number; contraste: number };
destaquePersonalizado: { matiz: number; intensidade: number };
```

O `tema` aceita `personalizado`, além dos seis, e o `destaque` aceita `personalizado`, além dos quatro. As listas `TEMAS` e `DESTAQUES` continuam as dos tokens, conferidas pelo teste da web. As escolhas da tela são `TEMAS_DA_ESCOLHA` e `DESTAQUES_DA_ESCOLHA`, com o `personalizado` no fim.

Os números são inteiros, em escalas de gente: a matiz em graus e o tingimento e a intensidade em porcentagem. A conversão para o croma do gerador fica no `@grafite/ui`:
- **o tingimento:** 100% é o croma 0,06, o máximo da base;
- **a intensidade:** 100% é o croma 0,2, acima do azul de fábrica (0,17); o gerador tira o croma que não cabe no sRGB.

O leitor de cada campo prende os números aos limites e recusa o campo inteiro quando falta um número ou o tom é desconhecido. Assim, o campo nunca fica pela metade.

**Alternativa descartada:** um campo por entrada (`matizDaBase`, `tingimento` etc.) solto na aparência. Ele misturaria camadas: a matiz da conta com o contraste da organização daria um tema que ninguém montou.

### 2. As declarações de cor fora do gerador do CSS

As funções que viram um tema em declarações (`coresDoTema`, `coresDaSituacao`, `coresDosDados` e `coresDoDestaque`) passam do `gerar.ts` para `packages/ui/src/tokens/declaracoes.ts`, sem o `node:fs`. O `gerar.ts` passa a importá-las, e o `tokens.css` sai igual, o que o `tokens:verificar` confere.

O `@grafite/ui` exporta:
- `temaPersonalizado(entrada)`: o `Tema` montado pelo `montarTema`, com o croma convertido;
- `destaquePersonalizado(tema, entrada)`: o destaque gerado para o tema;
- `variaveisDeCor(tema, destaque)`: as variáveis `--cor-*` e `--sombra-*`, sem o `color-scheme`, que vem do tema de fábrica do mesmo tom.

### 3. A aplicação no `<html>`

`atributosDaInterface` continua a fonte única. Com o tema ou o destaque personalizado:
- **o `data-theme`:** vai para o tema de fábrica do mesmo tom (`grafite` ou `nevoa`), que dá o `color-scheme` e os tokens que não são cor;
- **o `data-accent`:** vai para o `grafite` quando o destaque é o personalizado;
- **as variáveis:** as de cor do tema personalizado, com o destaque que vale, ou só as do destaque personalizado, sobre um tema de fábrica, entram no mapa.

Com um tema de fábrica e um destaque de fábrica, o mapa não tem variável de cor.

O `aplicar` passa a tirar do `<html>` as variáveis de cor e de sombra que saíram do mapa, além dos nomes fixos. O estilo em linha vence os seletores de atributo, e o tema de fábrica fica por baixo.

O cálculo custa alguns milissegundos (a busca binária do gerador). Ele é guardado pela entrada, como o `destaqueDoTema` guarda os de fábrica, e o arraste do controle não o repete para o mesmo valor.

### 4. O anti-flash com as cores

O script do `index.html` ganha uma segunda regra, ao lado da lista fixa:
- **o nome:** `--cor-` ou `--sombra-`, seguido de letras minúsculas, números e hífen;
- **o valor:** números, `#`, espaço, vírgula, ponto, `%`, hífen, parênteses e letras, sem `url(`, sem `var(` e sem `expression(`.

O valor do tema gerado é sempre hexadecimal, `rgba()` ou a lista de sombras, e os dois cabem nessa regra. O teste do anti-flash roda o próprio script do `index.html`, como hoje.

### 5. A seção Aparência

- **O tema Personalizado:** é a última opção do grupo dos temas, num grupo próprio, com a amostra pintada pelas variáveis geradas. Escolhido, abre abaixo dele o construtor:
  - o tom, num controle segmentado (Escuro e Claro);
  - a matiz, com a trilha pintada das matizes na luminosidade do tom, num croma que deixa a matiz à vista: o croma dos cinzas, de até 0,06, pintaria uma trilha quase cinza;
  - o tingimento;
  - o contraste.
- **O destaque Personalizado:** é a última opção dos destaques. Escolhido, abre a matiz, com a trilha das matizes na luminosidade do destaque, e a intensidade.
- **A leitura do contraste:** fica embaixo, numa linha, como "Texto 15,2:1 · Secundário 7,9:1 · Destaque 4,1:1", calculada sobre a superfície do tema que vale.

### 6. O lápis no contraste

O número do contraste ganha a dureza do lápis de grafite, a marca do produto:

| Contraste | Lápis |
|---|---|
| 0 a 19 | 2H |
| 20 a 34 | H |
| 35 a 54 | HB |
| 55 a 69 | B |
| 70 a 84 | 2B |
| 85 a 100 | 4B |

O padrão, 45, cai no HB, o lápis comum. O texto à vista é "HB · 45", e o leitor de tela anuncia "HB, 45 de 100". A função `lapisDoContraste(valor)` fica no `@grafite/ui`, com o teste das faixas.

### 7. O controle deslizante

O `ControleDeslizante` ganha:
- **a unidade grau:** "265°";
- **o texto do valor:** `textoDoValor?: (valor) => string` para o texto à vista, e `textoParaLeitor?: (valor) => string` para o `aria-valuetext`;
- **a trilha pintada:** `trilha?: string`, um gradiente CSS feito pelo `@grafite/ui`, como `trilhaDasMatizes(l, c)`, que pinta a trilha no lugar do preenchimento.

## Risks / Trade-offs

**Um tema de cores estranhas.** A matiz e o tingimento podem dar cinzas esverdeados que ninguém da organização escolheria. O contraste continua garantido, e o tema é só da conta. Restaurar os padrões da seção volta tudo.

**O anti-flash mais aberto.** A regra das cores aceita mais caracteres que a lista fixa. Ela continua presa aos nomes de cor e de sombra, e recusa as funções que carregam recursos. A cópia é escrita só pelo próprio app.

## Migration Plan

Nada a migrar: os campos novos têm padrão de fábrica, e as preferências salvas sem eles continuam valendo.

## Open Questions

Nenhuma.
