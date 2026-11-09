## 1. Spec mestre

- [x] 1.1 Atualizar a spec mestre: na seção do login, junto da primeira conta de cada organização com senha temporária, a exceção da conta `admin` do ambiente de desenvolvimento, que entra com `admin123`, sem troca, gravada só pelo `pnpm dev`. Verificar: o diff da spec mestre bate com as specs desta change.

## 2. Senha de desenvolvimento

- [x] 2.1 Escrever os testes de integração e depois criar `garantirSenhaDeDesenvolvimento` em `apps/api/src/comando/desenvolvimento.ts`, conforme o design (decisões 2 e 3). Os casos:
  - a conta `admin` com a senha temporária da criação passa a entrar com `admin123`, sem troca, com `senha.trocada` na auditoria e as recusas seguidas zeradas;
  - com a senha já `admin123`, nada é gravado, sem auditoria nem evento;
  - com outra senha, ela volta a `admin123`, e as sessões abertas da conta são encerradas;
  - a organização com um endereço que não é local é recusada, e a conta não muda;
  - `NODE_ENV=production` é recusado antes de abrir o banco;
  - sem organização no endereço `localhost` ou sem a conta `admin`, a recusa diz o que falta.

  Verificar: `pnpm test:integration` passa no `apps/api`.
- [x] 2.2 Criar o ponto de entrada `apps/api/scripts/desenvolvimento.ts`, como o `grafite.ts`, e deixá-lo fora da imagem no `.dockerignore`. Verificar: rodar o ponto de entrada contra o banco de desenvolvimento mostra "Entre com o usuário admin e a senha admin123", e a entrada pela tela com `admin` e `admin123` abre a casca sem pedir senha nova.

## 3. `pnpm dev`

- [x] 3.1 Escrever os testes e depois, no `scripts/dev.ts`, rodar a criação da organização sem a saída padrão e, logo depois, o ponto de entrada da senha de desenvolvimento, conforme o design (decisão 4). Verificar: `pnpm test` passa nos scripts, e o `pnpm dev` mostra o usuário e a senha da conta `admin`.

## 4. Documentação e fechamento

- [x] 4.1 Atualizar o `CLAUDE.md` (a linha do `pnpm dev`) e conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm test:integration` verdes, `openspec validate senha-do-admin-no-desenvolvimento` sem erros. Verificar: os comandos passam.
