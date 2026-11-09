## Why

Na verificação do diretório em Linux, a conta de serviço do AD foi cadastrada no Cofre com o tipo "Conta de serviço", a escolha natural para ela, e não apareceu na configuração do diretório: ele só aceitava "Usuário e senha" e "Conta administrativa", os tipos de login do Control iD. A tela avisa, mas obriga a TI a cadastrar a conta de serviço do AD com outro tipo.

## What Changes

- A conta de serviço do diretório passa a aceitar também os logins do Cofre do tipo "Conta de serviço", ativos e com o usuário preenchido.
- A dica do campo na tela diz os três tipos.
- O login do Control iD continua só com "Usuário e senha" e "Conta administrativa".

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `diretorio-ad`: a conta de serviço aceita o tipo "Conta de serviço" do Cofre.

## Impact

- `packages/domain/src/diretorio/diretorio.ts`: os tipos de login da conta de serviço do diretório.
- `apps/api/src/diretorio/diretorio.ts`: a escolha dos logins e a leitura da conta.
- `apps/web/src/modulos/administracao/diretorio/Diretorio.tsx`: a dica do campo.
- Sem migration e sem mudança no contrato.
