## Context

A `cabecalhos-e-fichas` passou ao `CabecalhoDaPagina` o estado carregado de cada tela e deixou os outros estados com o `TituloDaJanela` solto (design, decisão 2). Na troca do carregando para a tela, a linha embaixo do título aparece e o conteúdo desce. O estado vazio, como as Etiquetas sem ativo escolhido, fica sem a linha.

A auditoria das 76 telas do `pnpm dev` mediu, em cada tela:
- C1, o título no cabeçalho;
- C2, as ações à direita;
- C3, as seções no carimbo;
- C4, os dados na lista de dados;
- C5, a tabela larga esmaecida;
- C6, a janela sem rolagem lateral;
- C7, o console sem erro;
- C8, o cabeçalho antigo de módulo.

Ela achou falhas fora dos estados:
- o Início, em C1;
- a Conta dos Ajustes, em C3 e em C4;
- o título da etapa do Novo ativo, em C3;
- os títulos dos cartões dos indicadores e dos painéis, em C3 e em C8;
- o 403 do Cofre para a conta sem os dois passos, em C7.

## Goals / Non-Goals

**Goals:**
- O mesmo cabeçalho em todos os estados de todas as telas.
- Uma verificação automática que impeça o título solto de voltar.
- A Conta dos Ajustes e o título da etapa no desenho das outras seções.

**Non-Goals:**
- O Início, em que o título da janela é o do bloco "O que resolver agora", que a conta pode mover.
- Os títulos dos cartões, como os dos indicadores e os dos painéis: eles nomeiam o cartão, e não uma seção da tela.
- O 403 do Cofre sem os dois passos, que a tela já explica.

## Decisions

### 1. O cabeçalho em todos os estados

Cada `<TituloDaJanela>…</TituloDaJanela>` solto das telas passa a `<CabecalhoDaPagina titulo={…} />`, com o `ocultarComAbas` quando houver. Isso vale nos módulos, na tela do módulo desligado e na página não encontrada. Os estados não ganham ações: as ações chegam com a tela carregada, à direita, sem mudar o título de lugar.

### 2. O teste-guarda

`apps/web/src/casca/cabecalhoDasTelas.test.ts` lê os `.tsx` de `apps/web/src`, fora dos testes, e reprova cada `<TituloDaJanela` fora do Início, com o arquivo e a linha. O próprio `CabecalhoDaPagina` está no `packages/ui` e não entra na leitura.

### 3. A Conta dos Ajustes

- **As partes:** passam ao `Carimbo`, com o `id` que a seção usa no `aria-labelledby`, e o "Códigos de recuperação" ao carimbo de nível 3.
- **Os dados:** os três `dl` passam à `ListaDeDados`.

O `.tituloDaParte` e o `.dados` da `Secoes.module.css` saem.

### 4. O título da etapa

O `h2` da etapa continua o elemento que recebe o foco ao mudar de etapa. O CSS dele passa ao desenho do carimbo, como os títulos das partes da Administração:
- a legenda em maiúsculas;
- a linha fina até a borda, num `::after`.

### 5. O espaço depois do cabeçalho

O `TituloDaJanela` solto trazia 16 px de margem embaixo. Dentro do cabeçalho, essa margem sai, e o espaço até o conteúdo passa a vir do contêiner. O `.tela` dos módulos já empilha com o `--esp-4`, mas nem toda tela é um `.tela`:
- os estados em fragmento, como o cabeçalho seguido do "Carregando…";
- as seções da janela com seções, como a Conta dos Ajustes.

Nesses casos, o conteúdo encosta na linha. O painel de cada aba da janela (`.painel` da `AbasDaJanela`, só o visível) e a seção da `JanelaComSecoes` passam a empilhar o que a tela põe:
- em grade, com o `--esp-4` entre as partes;
- numa coluna `minmax(0, 1fr)`, para a tabela larga continuar rolando por dentro, sem alargar a janela.

A tela que é um `.tela` só tem um filho e não muda.

### 6. O cabeçalho com a barra das abas

Com a barra das abas, o título com `ocultarComAbas` sai da vista. O cabeçalho que só tem esse título sobrava como uma faixa vazia, com a linha embaixo, em cima do conteúdo. Nesse caso, o cabeçalho e as caixas de dentro dele passam a `display: contents`:
- o título continua no lugar dele, para o leitor de tela e para o foco;
- a faixa e a linha somem.

O cabeçalho com ações, selos, detalhe ou marca continua inteiro.

### 7. A largura do celular

A auditoria na largura do celular, de 390 px, achou a janela rolando para o lado em três telas: a ficha do ativo, os Backups do Control iD e as Tarefas. As causas foram duas:
- **grades com a coluna mínima maior que o celular:** a Visão geral da ficha do ativo, as rotinas das Tarefas, os cartões dos backups e os das salas pedem colunas de pelo menos 336 ou 384 px. O mínimo passa a `min(100%, …)`, e a coluna nunca passa da largura da tela;
- **o controle segmentado sem quebra:** com seis opções, como a situação dos backups, ele passava da largura. O trilho dele passa a quebrar a linha (`flex-wrap: wrap`, `max-width: 100%`) quando as opções não cabem, e a tela dos backups prende a coluna dela em `minmax(0, 1fr)`.

Na largura do computador, nada disso muda o desenho. O critério das ações à direita, na largura estreita, aceita as ações na linha de baixo, encostadas à direita, como a decisão 1 da `cabecalhos-e-fichas` pede.

## Risks / Trade-offs

**O carregando com a linha:** a tela que carrega rápido mostra o cabeçalho do mesmo jeito, só sem as ações; nada pisca.

**O teste-guarda lê o código, e não a tela.** Ele acha o título solto escrito em qualquer arquivo, mas não acha um título montado de outro jeito. A auditoria no `pnpm dev` cobre a tela.

## Migration Plan

Nada a migrar.

## Open Questions

Nenhuma.
