## 1. Renomeação

- [x] 1.1 Escrever os testes e depois `renomearComPaciencia` (`packages/operacao/src/renomear.ts`), conforme o design (decisão 1), e usá-la ao dar o nome final à pasta do backup, à cópia nos outros destinos e à versão desempacotada. Os casos:
  - os erros passageiros (EPERM, EACCES e EBUSY) são tentados de novo, com esperas crescentes, até dar certo;
  - outro erro sobe na hora, sem esperar;
  - o passageiro que passa do limite sobe como veio.

  Verificar: `pnpm test` e `pnpm test:integration` passam nos pacotes de operação.

## 2. Fechamento

- [x] 2.1 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm test:integration` verdes, `openspec validate pasta-presa-no-windows --strict` sem erros. Verificar: os comandos passam e o CI fica verde no PR, com a instalação num Windows.
