## Why

O `docs/ANTISLOP.md` pede um destaque só por tela (seção 12) e põe "dois CTAs" entre os sinais de AI slop (seção 50). Uma auditoria anti-slop das 76 telas do `pnpm dev` mediu nove itens das seções 49 e 50: a ação primária, os emojis, as fontes, os gradientes, o vidro, as animações, o brilho, os botões em pílula e o texto de marketing. Ela achou:
- **duas ações primárias na mesma tela:** o estado vazio repete, no nível primário, a ação que o cabeçalho já oferece. Nos Modelos sem nenhum modelo, por exemplo, "Novo modelo" aparece duas vezes, as duas em destaque. São 13 listas com o mesmo desenho;
- **a Conta dos Ajustes com dois destaques:** "Trocar senha" e "Ativar" a verificação em dois passos;
- **a spec que ficou para trás:** a "Ação principal da tela em destaque" ainda pede a ação logo ao lado do título e maior que os outros botões, o desenho que o cabeçalho da página trocou pelas ações à direita, no tamanho dos outros botões.

Esta change segue o subprojeto D1 · Linguagem visual v3 da spec mestre, nas telas. Ficam fora dela:
- as ações dos diálogos e das gavetas, que são outra camada, com o destaque delas;
- o texto e a ordem das ações.

## What Changes

- **Um destaque por tela:** cada tela tem no máximo uma ação primária à vista, fora das camadas.
- **O estado vazio:** quando ele repete a ação do cabeçalho, ela vem no nível secundário.
- **A Conta dos Ajustes:** "Ativar" a verificação passa ao nível secundário; "Trocar senha", que envia o formulário da senha, continua primária.
- **A spec:** a "Ação principal da tela em destaque" passa a descrever o desenho do cabeçalho da página.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `componentes-base`: a ação principal da tela, à direita, como o único destaque da tela.

## Impact

- `apps/web/src/modulos`: os estados vazios das listas e a Conta dos Ajustes.
- Nenhuma mudança no `packages/ui`, na API nem no contrato.
