## 1. Correção

- [x] 1.1 Escrever primeiro o teste da ficha (`apps/web/src/modulos/ativos/cadastro/FichaDoAtivo.test.tsx`): com a ficha aberta, a pessoa digita o Hostname, o canal publica `ativos.mudaram`, e o servidor devolve a série e o hostname novos; o campo da série mostra a nova, o Hostname continua com o digitado, e salvar envia só o hostname. Depois, fazer o `FormularioDoAtivo` adotar o valor novo de cada campo cuja entrada ainda é a inicial, atualizando a inicial dele. Verificar: o teste reprova antes da correção e passa depois, com os outros testes da ficha.

## 2. Fechamento

- [x] 2.1 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm test:e2e` verdes; `openspec validate ficha-com-valores-do-servidor --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
