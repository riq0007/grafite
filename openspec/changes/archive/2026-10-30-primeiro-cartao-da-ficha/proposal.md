## Why

A ficha de todo ativo abre na Visão geral. Na impressora, o que a operação quer ver primeiro são os suprimentos, e cada tipo tem a sua informação principal: a saúde no Face ID, a disponibilidade no switch. O usuário pediu, em 30/10, a impressora com os suprimentos primeiro e depois a Visão geral, e cada ativo com a informação importante dele na frente. No cartão de escolha, ficou com as duas primeiras ideias juntas:
- a ficha abre pela capacidade principal do tipo;
- o tipo pode escolher o cartão que abre primeiro.

Esta change segue o subprojeto P1 · Gestão de ativos da spec mestre, na ficha do ativo (P1d) e no catálogo (P1a). Fica fora dela mudar a ordem dos outros cartões, que continua a da ficha.

## What Changes

- **O primeiro cartão:** a ficha abre no cartão que o tipo escolheu. Sem escolha, ela abre no da capacidade principal do tipo, nesta ordem: Suprimentos e contadores, Saúde do Control iD, Inventário de hardware e Disponibilidade na rede. Sem nenhuma delas, abre na Visão geral, como hoje.
- **A ordem dos cartões:** o primeiro cartão vai para o alto da lista, a Visão geral vem logo depois dele e os outros seguem na ordem de hoje.
- **O endereço:** o primeiro cartão fica fora do endereço, e a Visão geral entra nele quando não é a primeira.
- **O tipo:** a ficha do tipo ganha "Primeiro cartão da ficha", com "Automático", a Visão geral e as capacidades do tipo que têm cartão. A escolha de uma capacidade desligada é esquecida, e a ficha volta ao automático.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `cadastro-de-ativos`: a aba Dados abre no primeiro cartão do tipo, com a Visão geral logo depois.
- `catalogo-de-ativos`: o tipo guarda o primeiro cartão da ficha.

## Impact

- `packages/db`: a coluna `primeiro_cartao` em `tipos_de_ativo`, numa migration.
- `packages/domain`: a conferência da escolha no tipo e a escolha automática.
- `apps/api`: o tipo de ativo, com a escolha no pedido, na resposta e na auditoria, e o contrato (`pnpm contrato:gerar`).
- `apps/web`: a ordem dos cartões e o cartão aberto na ficha, o endereço e a escolha na ficha do tipo.
