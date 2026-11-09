## Why

O usuário pediu, em 29/10, para melhorar o visual de todos os módulos, sem AI slop. O levantamento de 36 telas no `pnpm dev`, de todos os módulos, achou o que mais destoa entre eles:
- **o cabeçalho de cada tela é montado à mão:** são 46 telas, cada uma com o CSS do módulo dela. As ações ficam grudadas no título, à esquerda. A ordem de serviço e a solicitação enfileiram cinco botões logo depois do número;
- **os títulos de seção das fichas mudam de tela para tela:** a ficha do ativo usa o carimbo; a ordem de serviço, a solicitação, o perfil e a regra usam rótulos soltos em negrito;
- **os dados das fichas não têm um padrão de rótulo e valor:** a ordem de serviço, a solicitação e o fornecedor montam a lista deles cada uma do seu jeito;
- **a descrição e a ação se misturam:** nas Importações, o botão fica no meio da frase que explica a tela.

Esta change segue o subprojeto D1 · Linguagem visual v3 da spec mestre, nas telas. Ficam fora dela:
- o conteúdo das telas, os textos e o comportamento;
- o painel da operação (`apps/painel`).

## What Changes

- **O cabeçalho da página:** um componente novo, `CabecalhoDaPagina`, com:
  - à esquerda, a marca (o ícone ou a foto), o título, os selos ao lado dele e o detalhe embaixo, no texto secundário;
  - à direita, as ações, lado a lado, que quebram para baixo quando não cabem.

  As 46 telas com cabeçalho passam a usá-lo, e o CSS dos cabeçalhos dos módulos sai.
- **Os títulos de seção das fichas:** as seções das fichas passam ao carimbo, como na ficha do ativo.
- **A lista de dados:** um componente novo, `ListaDeDados`, para o rótulo e o valor de uma ficha, com o rótulo no texto secundário numa coluna de largura fixa e o valor ao lado. A ordem de serviço, a solicitação e o fornecedor passam a usá-la.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `componentes-base`: o cabeçalho da página e a lista de dados.

## Impact

- `packages/ui/src/componentes`: o `CabecalhoDaPagina` e a `ListaDeDados`.
- `apps/web/src/modulos`: as telas com cabeçalho e as fichas da ordem de serviço, da solicitação, do fornecedor, do perfil e da regra.
- O CSS dos módulos: os `.cabecalho` saem.
