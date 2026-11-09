## 1. O nome livre

- [x] 1.1 Escrever primeiro os testes e depois o padrão, a ordem e o nome livre na distribuição (design, decisões 1 e 2).
  - O `backupsProntosNoDestino` reconhece `2026-10-14T0605Z-2` e ordena o nome sem sufixo, o `-2`, o `-9` e o `-10`, nessa ordem.
  - O `nomeLivre` devolve o nome do minuto quando ele está livre, `-2` quando o nome está ocupado só no segundo destino, e `-3` quando o nome e o `-2` estão ocupados.
  - A retenção apaga e guarda os nomes com sufixo como os outros.
  - Verificar: os testes reprovam antes da mudança e passam depois, com `pnpm --filter @grafite/operacao test`.
- [x] 1.2 Escrever primeiro o teste de integração e depois o nome livre no `fazerBackup`.
  - Verificar: dois backups seguidos, no mesmo minuto, ficam prontos nos dois destinos, o segundo com o `-2`. O teste reprova antes da mudança com o `EPERM` ou o `EEXIST` da renomeação.
  - Verificar: `pnpm --filter @grafite/operacao test:integration` passa.
- [x] 1.3 Escrever primeiro o teste de integração do registro e depois a migration que aceita o sufixo na restrição `backups_pasta_valida` da tabela `operacao.backups` (design, decisão 3). A "Instalação num Windows" do PR #35 mostrou a restrição recusando o `-2`.
  - Verificar: dois `executarBackup` no mesmo minuto gravam as linhas com `2026-10-14T0605Z` e `2026-10-14T0605Z-2`. O teste reprova antes da migration com a restrição violada.
  - Verificar: `pnpm --filter @grafite/operacao test:integration` passa.

## 2. Fechamento

- [x] 2.1 O mapa traz a change em andamento. Verificar: `pnpm test` passa, com o guarda do mapa.
- [x] 2.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck` e `openspec validate backup-no-mesmo-minuto --strict` sem erros, e o CI do PR verde, com a "Instalação num Windows".
