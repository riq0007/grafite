## Context

A auditoria automática das 76 telas mede a rolagem lateral, o cabeçalho, as seções e os itens do ANTISLOP, e passa no celular. Ela não mede se um texto ficou espremido ou cortado no lugar errado. A inspeção das capturas a 390 px, uma a uma, achou três telas assim:
- o bloco dos backups do Início, que na largura estreita usa duas colunas, `minmax(0, 1fr) auto`, com a faixa dos dias na coluna de largura própria;
- a célula do nome dos ativos, em que o nome encolhe e o tipo, com `flex: none`, não;
- a grade dos Painéis, que tira as colunas só da quantidade (`formaDaGrade`), sem olhar a largura.

## Goals / Non-Goals

**Goals:**
- As três telas legíveis no celular.

**Non-Goals:**
- Mudar o desenho do computador.
- Trocar a tabela por cartões no celular.

## Decisions

### 1. O bloco dos backups no Início

Na consulta de contêiner de até 720 px, que já existe, a linha do controle passa a três faixas:
- o nome, na linha inteira;
- os rostos e os dias sem backup, lado a lado (`auto minmax(0, 1fr)`);
- a faixa dos dias, na linha inteira.

### 2. O nome antes do tipo

Na `nomeETipo`, o nome fica com a largura dele, até a da célula (`flex: none` e `max-width: 100%`), e o tipo fica com o que sobra (`flex: 0 1 auto`, com `min-width: 0` e as reticências). O tipo some inteiro antes de o nome perder uma letra. Com a largura que comporta os dois, nada muda.

A primeira versão, com o tipo encolhendo cem vezes mais rápido que o nome (`flex: 0 100 auto`), ainda tirava do nome uma fração da falta enquanto o tipo aparecia. Na medida a 80 px, "Switch 10" virava "Switch 1…" ao lado de "S…".

### 3. Os Painéis no celular

Na postura do celular (`usePostura`), a grade usa uma coluna e uma linha por painel. Cada linha tem a altura medida da área da janela, a mesma que a grade inteira usa no computador, com o mínimo de hoje. A grade deixa de ter a altura fixa e cresce com as linhas, e a janela rola. O expandido continua sozinho na área.

## Risks / Trade-offs

**O tipo some primeiro na tabela estreita.** O nome é o que identifica a linha; o tipo continua na ficha e no filtro.

## Migration Plan

Nada a migrar.

## Open Questions

Nenhuma.
