## Why

A ordem dos módulos no dock é fixa no código: Início, Ativos, Gestão de ativos, Alertas, Operação, Mapa, Salas, Painéis, Cofre, Administração e Ajustes. Com onze módulos, o dock já recorre ao "Mais" nas telas menores, e cada pessoa usa dois ou três deles no dia a dia. A conta escolhe a posição, o tamanho, a ampliação e o ocultar, mas não o que fica à mão. Em 09/11/2026 o usuário pediu: "Organização do dock deve ser personalizável".

Esta change segue o subprojeto F1 · Casca OS da spec mestre, no dock, com a preferência no servidor do F2c. Ficam fora dela:
- arrastar os itens com o mouse: a ordem muda pelos botões, que servem ao teclado e ao leitor de tela, como no Início;
- grupos e separadores criados pela conta;
- trocar o ícone ou o nome de um módulo;
- mover ou tirar os Ajustes, que continuam no fim.

## What Changes

- **A ordem dos módulos:** a seção Dock dos Ajustes ganha a lista "No dock", com "Subir" e "Descer" em cada módulo.
- **Tirar do dock:** o módulo tirado sai do dock e passa ao menu "Mais", com os menus dele. Ele continua na busca e nos endereços, e a conta continua podendo o mesmo nele. O "Mais" passa a aparecer também quando há módulo tirado.
- **O padrão da organização:** a mesma lista vale nos padrões da organização, para quem não arrumou o próprio dock.
- **No celular:** as abas seguem a ordem escolhida, e o módulo tirado fica em "Mais".

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `dock`: a ordem que vale para a conta, os módulos fora do dock e o "Mais" com eles.
- `ajustes-do-sistema`: as listas "No dock" e "No Mais" na seção Dock.
- `preferencias-da-interface`: a lista dos módulos do dock, com a validação.
- `posturas-da-casca`: as abas do celular na ordem escolhida.

## Impact

- `packages/domain/src/preferencias`: o campo `dock.modulos`.
- `apps/api/src/preferencias/esquemas.ts` e o contrato gerado.
- `apps/web/src/casca/modulosDaCasca.ts` e `apps/web/src/casca/CascaDoApp.tsx`: a ordem e os módulos do "Mais".
- `packages/ui/src/casca/Dock.tsx`: os módulos do "Mais" que não vêm da falta de espaço; as histórias e as referências visuais do dock. `packages/ui/src/casca/Casca.tsx`: os mesmos módulos na barra de abas do celular.
- `apps/web/src/modulos/ajustes/secoes/Dock.tsx` e a lista dos ajustes da busca.
- `apps/web/src/modulos/inicio/blocos.ts`: as funções da ordem, que passam a servir às duas listas, em `apps/web/src/preferencias/listaOrdenada.ts`.
- A spec mestre (seções 7.2 e 7.4) e o mapa.
