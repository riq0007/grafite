## 1. A tabela

- [x] 1.1 Escrever primeiro a história da tabela larga e depois as marcas e a máscara da borda (design, decisões 1 e 2). Verificar: a história passa com "Mais colunas à direita", "Rolada até o fim" e "Tabela que cabe", sem violação de acessibilidade.

## 2. As telas

- [x] 2.1 Conferir no `pnpm dev` as Regras de alerta e os Backups do Control iD, que passam da largura, e as Pessoas, que cabem. Verificar: a borda direita esmaece nas duas primeiras, a esquerda esmaece depois de rolar, e as Pessoas ficam sem esmaecer.

## 3. Fechamento

- [x] 3.1 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:stories`;
  - `pnpm test:visual`;
  - `openspec validate rolagem-das-tabelas --strict`.

  Verificar: os comandos passam.
