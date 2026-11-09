## Why

Na empresa, cada Face ID (controle de acesso Control iD) pode ter um login diferente. Hoje a tela só deixa escolher o login no tipo, e o tipo exige um. O login próprio de um controle já existe: é o segredo do cofre ligado a ele. Mas esse vínculo só se faz pela ficha do segredo, no cofre, e quem olha o Face ID não acha por onde escolher. O usuário pediu, em 30/10:
- o login escolhido no próprio ativo;
- o login do tipo opcional.

Esta change segue o subprojeto P2 · Coletor local da spec mestre, na parte da saúde do Control iD (P2c). Ficam fora dela:
- a porta de cada controle, que continua a do tipo (escolha do usuário em 30/10);
- o cadastro de um login novo pela ficha do controle, que continua no cofre.

## What Changes

- **O login do tipo opcional:** a saúde do Control iD liga no tipo sem login. Os controles sem login próprio ficam "Não verificado", com "Sem login: escolha o login deste controle ou o do tipo.".
- **O login na ficha do controle:** no cartão Saúde do Control iD, quem administra o cofre vê "Escolher login" e escolhe, entre os logins do cofre, o deste controle, ou volta ao login do tipo. A escolha liga o segredo ao controle no cofre e desliga dele os outros logins, com a auditoria de cada segredo que mudou. O controle passa a ser sondado com o login novo na configuração seguinte do coletor.
- **A API:** a ficha diz se a conta pode escolher o login, e o cofre ganha a leitura e a gravação do login de um controle, com a mesma guarda das outras rotas do cofre.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `saude-do-control-id`: o login do tipo opcional, o motivo sem login e a escolha do login na ficha do controle.
- `cofre-de-segredos`: o login do controle escolhido também na ficha dele, por quem administra o cofre.

## Impact

- `packages/domain`: a configuração da capacidade no tipo e a escolha do login de cada controle.
- `apps/api`: a ficha do ativo, as rotas do cofre e o contrato (`pnpm contrato:gerar`).
- `apps/web`: a configuração do Control iD no tipo e o cartão Saúde do Control iD na ficha.
- Nenhuma migration: o login do tipo já fica no JSON da configuração das capacidades, e o vínculo do segredo com o ativo já existe.
