## Why

O Início só tem "O que resolver agora". Quem cuida das impressoras e dos controles de acesso precisa abrir cada ficha para saber que toner acaba primeiro ou qual controle está sem backup. O usuário pediu mais criatividade para mostrar os toners, os rostos e os backups, e mais controle na mão de quem usa.

Esta change é a quinta etapa do subprojeto D1 · Linguagem visual v3 da spec mestre, na parte do Início ajustável. Ficam fora dela:
- os blocos de indicadores, que já têm o módulo Painéis;
- o arraste dos blocos com o mouse: a ordem muda pelos botões, que servem ao teclado e ao leitor de tela.

## What Changes

- **O Início em blocos:** "O que resolver agora" passa a ser o primeiro bloco do Início, e cada módulo pode registrar blocos dele, pelo contrato de módulo, como registra as ocorrências.
- **A busca no topo:** o Início abre com um campo grande, "Buscar ativos, pessoas, locais e ações", que abre a busca global, como o Ctrl K.
- **Suprimentos que acabam primeiro:** um bloco do Ativos com até 6 impressoras de menor nível, cada uma com o cartucho na tinta dele, o nível e a estimativa de quando acaba, pelas leituras dos últimos 30 dias. O clique abre a ficha.
- **Backups do Control iD:** um bloco da Gestão de ativos com cada controle, os rostos e a faixa dos últimos 14 dias, os que estão há mais dias sem backup primeiro. O clique abre a ficha do controle.
- **Personalizar o Início:** um modo em que cada bloco ganha Subir, Descer e Ocultar, e os ocultos ficam numa lista, com Mostrar. A escolha fica nas preferências da conta, em `inicio.blocos`.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `tela-inicial`: os blocos, a busca no topo, os dois blocos novos e o modo Personalizar.
- `preferencias-da-interface`: a ordem e a visibilidade dos blocos do Início, com a validação.

## Impact

- `packages/domain/src/preferencias`: o campo `inicio.blocos`.
- `apps/api/src/preferencias/esquemas.ts` e o contrato gerado.
- `apps/web/src/modulos/tipos.ts`: o `BlocoDoInicio` no contrato de módulo.
- `apps/web/src/modulos/inicio`: o Início em blocos, a busca e o modo Personalizar.
- `apps/web/src/casca/CascaDoApp.tsx`: a abertura da busca para o Início.
- `apps/web/src/modulos/ativos` e `apps/web/src/modulos/gestao`: os dois blocos.
- `docs/casca/modulos.md`: o bloco do Início no contrato.
