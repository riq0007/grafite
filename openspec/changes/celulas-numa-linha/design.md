## Context

A célula da tabela base tem `white-space: nowrap`, e a da tabela redimensionável tem também `overflow: hidden` e `text-overflow: ellipsis` (`packages/ui/src/componentes/tabela/Tabela.module.css`). Isso segura o texto, mas não um contêiner flexível dentro da célula: o `flex-wrap` decide a quebra dele, e o `white-space` não entra.

As células da coleta dos ativos (`DisponibilidadeNaCelula`, `ControlIdNaCelula`, `SuprimentosNaCelula` e `PaginasNaCelula`) usam a classe `.disponibilidade` do módulo, que é `inline-flex` com `flex-wrap: wrap`. A mesma classe serve à ficha. A situação na tabela dos alertas (`Alertas.tsx`) e a validade na lista do cofre (`validade.tsx`) têm classes do mesmo desenho.

A coluna das ações já passou por isso: a `Tabela` tem a regra `.conteudoAcoes > [class] { flex-wrap: nowrap }`, da change tabelas-consistentes.

O resumo da linha (`resumo.ts`) decide as colunas pelo retângulo do cabeçalho contra a área da rolagem (`colunasForaDaArea`).

As larguras de fábrica das colunas vêm de `packages/domain/src/ativos/colunas.ts`, e a largura igual à de fábrica não fica guardada na visão.

## Goals / Non-Goals

**Goals:**
- A altura da linha não depende do que o módulo pôs na célula.
- Um jeito só de montar uma célula com mais de uma parte.
- Nada cortado sem um caminho para ler o valor inteiro.

**Non-Goals:**
- Esconder partes da célula conforme a largura.
- Ajustar sozinho a largura das colunas ao conteúdo.
- Mudar a barra de cima da tabela.

## Decisions

### 1. A regra na tabela, e não em cada módulo

A `Tabela` passa a ter a regra `.celula [class] { flex-wrap: nowrap; }`. Ela pesa mais que a classe de um módulo e só tem efeito num contêiner flexível. Com isso, a célula de um módulo que ainda use uma classe da ficha deixa de quebrar, mesmo antes de trocar de componente.

**Alternativa descartada:** consertar só as classes dos ativos. O mesmo defeito voltaria na próxima célula composta de qualquer módulo.

### 2. O valor composto

O `@grafite/ui` ganha o `ValorComposto`, para a célula com mais de uma parte:

```tsx
<ValorComposto fixo={<RotuloDeSituacao …>Offline</RotuloDeSituacao>}>
  <IdadeDaLeitura … />
</ValorComposto>
```

Ele é `inline-flex`, sem quebra, com a largura máxima da célula. O `fixo` não encolhe; o resto encolhe com `min-width: 0`, `overflow: hidden` e `text-overflow: ellipsis`. As quatro células da coleta, a situação dos alertas e a validade do cofre passam a usá-lo. Na célula da coleta, o "Desatualizado" vai para o `fixo`, ao lado da situação, e a idade fica no resto. A ficha continua com a classe que quebra.

### 3. O conteúdo cortado no resumo

O resumo da linha passa a juntar, às colunas fora da área, as colunas da linha sob o mouse em que o conteúdo é mais largo que a célula (`scrollWidth > clientWidth`, na célula e no resto do `ValorComposto`). A medida roda só quando o relógio de 1,5 s dispara, numa linha. O valor mostrado é o texto da célula, que as telas já dão ao resumo.

### 4. As larguras de fábrica

As colunas `coleta.disponibilidade`, `coleta.controlid`, `coleta.suprimentos` e `coleta.paginas` ganham a largura que comporta o maior texto comum de cada uma na densidade normal, medida na história da tarefa 1.2. A conta que já mudou a largura continua com a dela, porque só a diferença da fábrica fica na visão.

### 5. A guarda

Uma história nova do catálogo, "Tabela com colunas estreitas", monta a tabela base e a virtualizada com as células compostas em colunas de 64 px, nas três densidades, e confere que toda linha tem a altura da densidade. Um teste ponta a ponta da web estreita a coluna "Disponibilidade" e confere a altura das linhas.

## Risks / Trade-offs

- **[A regra do `flex-wrap` pega um contêiner que precisava quebrar dentro de uma célula]** → nenhuma tabela do app tem célula de mais de uma linha, e a spec passa a proibir; a história das colunas estreitas acusa o caso novo.
- **[Dois rótulos fixos não cabem em 64 px]** → a célula corta na borda, e o resumo da linha traz o valor inteiro.
- **[A largura de fábrica maior empurra colunas para fora da tela]** → vale só para quem nunca mexeu, e a borda esmaecida e o resumo da linha já cobrem a coluna fora da tela.

## Migration Plan

Nada a migrar.

## Open Questions

Nenhuma.
