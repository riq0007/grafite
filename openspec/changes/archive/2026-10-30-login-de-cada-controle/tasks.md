## 1. O login do tipo opcional

- [x] 1.1 Escrever primeiro os testes do domínio e depois o login opcional na configuração da saúde do Control iD e o motivo sem login no `loginDoControle`, com o `escolhidoNoTipo` (design, decisões 1 e 2). Verificar: `pnpm --filter @grafite/domain test` passa.
- [x] 1.2 Escrever primeiro os testes de integração e depois passar o `escolhidoNoTipo` na leitura dos logins (decisão 2). Os testes cobrem o tipo salvo sem login, a ficha do controle sem login, com o motivo, e a coluna Control iD com "Não verificado". Verificar: os testes de integração do Control iD e dos tipos passam.

## 2. O login na ficha do controle

- [x] 2.1 Escrever primeiro os testes de integração e depois as rotas `GET` e `PUT /cofre/controles/:id/login` e o `permite.escolherLoginDoControle` da ficha (decisões 3 e 4), com o contrato regerado. Verificar: os testes de integração passam, inclusive a auditoria de cada segredo que mudou, e `pnpm contrato:verificar` passa.
- [x] 2.2 Escrever primeiro os testes da tela e depois a opção "Nenhum" no login do tipo e o "Escolher login" no cartão Saúde do Control iD, com o diálogo (decisão 5). Verificar: os testes do tipo e da ficha passam; no `pnpm dev`, um Face ID ganha o login próprio, e a ficha diz "Login próprio do controle".

## 3. Fechamento

- [x] 3.1 Conferir as verificações:
  - `pnpm lint`;
  - `pnpm typecheck`;
  - `pnpm test`;
  - `pnpm test:e2e`;
  - os testes de integração do Control iD, dos tipos e do cofre;
  - `openspec validate login-de-cada-controle --strict`.

  Verificar: os comandos passam.
