## Context

A miniatura de ativo é uma caixa em linha (`display: inline-grid`) e fica com o alinhamento vertical padrão, pela linha de base do texto. Na tabela que desenha só as linhas visíveis, as células são blocos posicionados, e o texto fica no meio da linha pelo `line-height`, igual à altura da linha (`.virtualizada .celula` em `Tabela.module.css`). A linha de base fica um pouco abaixo do meio dessa altura, e o quadrado da miniatura sobe a partir dela.

Medido em 11/11/2026 na tabela dos ativos, na densidade de fábrica, com linha de 44 px e miniatura de 30 px:
- o texto da célula vizinha fica 0,5 px acima do centro;
- a miniatura fica 7 px acima;
- com `vertical-align: middle` aplicado só na página, a miniatura fica 0,4 px abaixo.

## Goals / Non-Goals

**Goals:**
- A miniatura no meio da linha, a até 1 px, na tabela base e na que desenha só as linhas visíveis, nas três densidades.

**Non-Goals:**
- Mudar o tamanho da miniatura, a estrutura das células ou o jeito como a tabela virtualizada centraliza o texto.

## Decisions

1. **O conserto no componente:** `vertical-align: middle` na classe da própria miniatura.
   - Uma caixa que faz o papel de ícone, em linha com o texto, alinha pelo meio.
   - Uma linha cobre todas as tabelas e todo uso em linha.
   - Onde a miniatura é item de um contêiner flexível ou de grade, como na ficha e nos ligados, o `vertical-align` não tem efeito, e nada muda.
   - Alternativa descartada: tornar a célula da miniatura um contêiner flexível centralizado. É mais código para o mesmo efeito, e o `display: flex` numa célula da tabela base desmancha o layout da tabela.
2. **O teste mede a geometria, e não a propriedade do CSS:** a história com miniaturas da tabela virtualizada, e a da tabela base, medem na função `play` o centro da miniatura contra o centro da linha. O `pnpm test:stories` roda num navegador de verdade. O defeito é a posição na tela; conferir o `vertical-align` passaria mesmo se outra causa desalinhasse a miniatura.

## Risks / Trade-offs

- [Outros usos em linha da miniatura mudam alguns pixels] → A regressão visual do catálogo pega toda história que mudar. As capturas novas são conferidas antes de regravar as referências.
- [Uma mudança abaixo da tolerância da regressão visual deixa a referência antiga] → As referências das histórias com miniatura que mudam pouco são apagadas antes do `--atualizar`.
