## 1. A escolha no tipo

- [x] 1.1 Escrever primeiro os testes do domínio e depois a `conferirPrimeiroCartao` e a `primeiroCartaoAutomatico` (design, decisão 2). Verificar: `pnpm --filter @grafite/domain test` passa.
- [x] 1.2 Gerar a migration da coluna, escrever primeiro os testes de integração e depois o tipo com a escolha na API, com o contrato regerado (decisões 1 e 6). Os testes cobrem o tipo salvo com a escolha, a escolha esquecida ao desligar a capacidade, a recusa e a auditoria. Verificar: os testes de integração dos tipos passam, o teste-guarda do isolamento continua verde, e `pnpm contrato:verificar` passa.

## 2. A ficha

- [x] 2.1 Escrever primeiro os testes e depois a ordem dos cartões, a ficha aberta no primeiro e o endereço (decisões 3 e 4). Verificar: os testes dos cartões, do endereço e da ficha passam; no `pnpm dev`, uma impressora abre nos suprimentos, com a Visão geral logo abaixo.
- [x] 2.2 Escrever primeiro os testes e depois o "Primeiro cartão da ficha" na ficha do tipo (decisão 5). Verificar: os testes do tipo passam; no `pnpm dev`, escolher a Visão geral no tipo faz a impressora abrir nela.

## 3. Fechamento

- [x] 3.1 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:e2e`;
  - os testes de integração dos tipos e dos ativos;
  - `openspec validate primeiro-cartao-da-ficha --strict`.

  Verificar: os comandos passam.
