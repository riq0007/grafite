## Why

No ambiente de desenvolvimento, a conta `admin` nasce com uma senha temporária gerada ao acaso, que aparece uma vez no terminal, e a primeira entrada exige trocá-la por uma de 12 caracteres ou mais. Quem desenvolve perde essa senha a cada banco novo e digita uma senha longa a cada teste manual. O pedido do usuário é que a conta `admin` do desenvolvimento entre sempre com a senha `admin123`.

Esta change adianta um pedaço do F2 (spec mestre, seção 3.2), da parte F2d · Operação, que cuida dos ambientes de desenvolvimento, teste e produção. Ficam fora dela os ambientes de teste e de produção, os serviços do Windows, o HTTPS interno e o backup, que seguem no F2d.

## What Changes

- **Senha fixa no desenvolvimento:** a cada execução, o `pnpm dev` garante que a conta `admin` da organização de desenvolvimento entre com a senha `admin123`, sem troca obrigatória.
  - No banco novo, a senha é gravada logo depois de a organização ser criada.
  - No banco que já existe, a senha volta a `admin123` se tiver mudado ou estiver temporária. Igual, nada é gravado.
- **Terminal:** o `pnpm dev` mostra o usuário e a senha da conta `admin`, no lugar da senha temporária.
- **Só no desenvolvimento:**
  - o passo que grava a senha recusa uma organização com algum endereço que não seja local (`localhost`, `127.0.0.1` ou `::1`) e recusa rodar com `NODE_ENV=production`;
  - o ponto de entrada dele fica fora da imagem de contêiner;
  - o comando no servidor (`pnpm grafite`) e a regra da senha não mudam para as organizações de verdade.
- **Spec mestre:** registra a exceção, junto da senha temporária da primeira conta de cada organização.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `plataforma-base`: no requisito "Ambiente de desenvolvimento com um comando", a conta de administração passa a entrar com a senha fixa `admin123`, sem troca, garantida a cada execução, no lugar da senha temporária mostrada uma vez.
- `contas-de-acesso`:
  - o requisito "Senha temporária com troca obrigatória" ganha a exceção da conta de administração da organização de desenvolvimento;
  - o requisito "Regra da senha" diz que essa senha fixa é a única que não passa pela regra, que continua valendo para toda senha escolhida.

## Impact

- **`scripts/dev.ts`:** o passo novo, depois da criação da organização, e os testes dele.
- **`apps/api`:**
  - a função que grava a senha de desenvolvimento, com as recusas, e o teste de integração dela;
  - um ponto de entrada só para o `pnpm dev`, fora da imagem (`.dockerignore`).
- **Documentação:** a linha do `pnpm dev` no `CLAUDE.md` e a primeira conta de cada organização na spec mestre.
- Nada muda no banco, nas rotas da API, no contrato nem na web.
