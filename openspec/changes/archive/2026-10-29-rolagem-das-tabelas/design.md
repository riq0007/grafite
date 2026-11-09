## Context

A célula da tabela base não quebra a linha (`white-space: nowrap`), e a `.rolagem` em volta da tabela rola nos dois sentidos, para nada ser cortado. Quando a tabela passa da largura, a borda direita da área corta a coluna do meio, e nada diz que há mais.

A janela já resolve o mesmo problema na vertical: a `RolagemDaJanela` marca `data-mais-acima` e `data-mais-abaixo` e esmaece a borda com uma máscara, que deixa a barra de rolagem de fora.

## Goals / Non-Goals

**Goals:**
- Mostrar, na borda, que a tabela continua para o lado.
- Usar o mesmo desenho da faixa esmaecida da janela.

**Non-Goals:**
- Mudar a largura das colunas, quebrar a linha ou esconder ações num menu.
- Fixar a coluna das ações na borda.
- A tabela virtualizada, em que a própria grade rola, por dentro da área.

## Decisions

### 1. As marcas da borda

A `Tabela` mede a `.rolagem` dela ao montar, ao rolar e quando a área ou a tabela mudam de tamanho, num quadro de animação, como a `RolagemDaJanela`:
- `data-mais-a-esquerda`, quando `scrollLeft > 1`;
- `data-mais-a-direita`, quando `scrollLeft + clientWidth < scrollWidth - 1`.

As marcas vão direto no elemento, sem desenhar o React de novo a cada rolagem. No layout da direita para a esquerda, o `scrollLeft` é negativo; o app é só pt-BR, e a medida usa o valor absoluto.

### 2. A máscara

Com uma das marcas, a `.rolagem` ganha uma máscara em camadas:
- **em cima:** o degradê na horizontal, transparente na borda marcada, numa faixa de `--esp-8`, e opaco no resto;
- **nas barras:** uma camada opaca na altura da barra de rolagem de baixo (`--altura-da-barra`) e outra na largura da barra do lado, na tabela de altura máxima (`--largura-da-barra`), medidas como a barra da janela; elas não esmaecem.

A máscara lê só a opacidade, e o degradê usa `currentColor`, opaco em todos os temas, como na janela. Sem marca, não há máscara. Não há animação: a borda muda com a rolagem.

## Risks / Trade-offs

**A máscara esmaece também o cabeçalho fixo da tabela.** É o sinal certo: a coluna cortada no cabeçalho também continua do lado.

**O navegador sem `mask-image`** mostra a tabela como hoje, cortada sem esmaecer. Todos os navegadores atuais têm a máscara sem prefixo.

## Migration Plan

Nada a migrar.

## Open Questions

Nenhuma.
