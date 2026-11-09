## Context

O módulo Ativos da web (`apps/web/src/modulos/ativos`) é um módulo só no registro, com um menu estático e um dinâmico:
- **O menu estático** tem "Ativos", com "Todos os ativos", depois Importações, Control iD (Backups e Comparar backups), Software e Catálogo (Tipos, Campos e Modelos).
- **O menu dinâmico** (`menu.ts`) acrescenta a "Ativos" as visões fixadas e "Por tipo".
- **As rotas** ficam todas debaixo de `/ativos`, com o catálogo numa janela de seções própria (`Catalogo.tsx`).
- **O interruptor da organização** é por id de módulo: o registro da conta e a casca escondem o módulo cujo id está entre os desligados (`registroDaConta.ts` e `CascaDoApp.tsx`).

A API, as permissões e o interruptor do servidor não mudam. A API já recusa as rotas do catálogo, das importações, do software e do Control iD com o Ativos desligado.

## Goals / Non-Goals

**Goals:**
- O dock com dois módulos: o Ativos, só com a lista, e a Gestão de ativos, com o resto, governados pelo mesmo interruptor.
- Nenhum favorito quebrado: os endereços antigos levam aos novos.
- As telas iguais por dentro: só o lugar delas no dock e o endereço mudam.

**Non-Goals:**
- Mudar o conteúdo, as ações ou o layout das telas que mudam de lugar.
- Mover os arquivos dos componentes para outra pasta.
- Mudar a API, as permissões, a barra de abas do celular ou a Administração › Módulos.

## Decisions

### 1. Um módulo novo no registro, com o id `gestao`

A Gestão de ativos entra no registro da web logo depois do Ativos (`REGISTRO`):
- o id `gestao`, o nome "Gestão de ativos" e o endereço `/gestao`;
- o ícone `FolderCog`, do lucide, ao lado do `Boxes` do Ativos;
- o celular em "Mais".

O id curto deixa os endereços legíveis, como `/gestao/catalogo/tipos`.

As alternativas eram as seções na Administração ou o submenu "Gerenciar" no fim do Ativos, e o usuário escolheu o ícone novo no cartão de 29/10.

### 2. O módulo que segue o interruptor de outro: `parteDe`

A definição do módulo ganha o campo opcional `parteDe`, com o id do módulo opcional a que ele pertence. A Gestão de ativos declara `parteDe: 'ativos'`. Com isso:
- o registro da conta esconde o módulo quando `parteDe ?? id` está entre os desligados;
- a casca, no endereço de uma tela dele, mostra o `ModuloDesligado` com o nome do módulo dono, "Ativos", porque é esse o nome do interruptor em Administração › Módulos.

As alternativas eram:
- **um segundo módulo opcional "Gestão de ativos":** recusada, porque seriam dois interruptores para uma coisa só, e o catálogo sem o Ativos não serve para nada;
- **a lista dos desligados expandida pelo servidor:** recusada, porque a relação entre os dois é da web, e o servidor continua falando só do módulo opcional.

### 3. As rotas mudam de lugar; os componentes, não

O `gestao/rotas.tsx` recebe a árvore de `/gestao`:
- o início, que escolhe a primeira tela;
- `catalogo`, com a janela de seções e as telas de tipos, campos e modelos;
- `importacoes`, com a nova e a ficha;
- `software`, com a ficha da distribuição;
- `control-id/backups` e `control-id/comparar`.

Essas rotas saem de `ativos/rotas.tsx`. Os componentes continuam nas pastas de hoje, debaixo de `modulos/ativos`, e são importados pela Gestão. Assim o diff fica pequeno e a história dos arquivos fica inteira. Mover as pastas fica para quando houver outro motivo.

Os links tipados (`to="/ativos/catalogo/..."`) passam a apontar para `/gestao/...`, e o typecheck acusa o link que ficar para trás. Isso vale também nos que estão fora do módulo, como os do Operação para a ficha do modelo. Os endereços em texto, como os da busca e os dos testes ponta a ponta, são trocados pela busca no código.

### 4. Os endereços antigos por redirecionamento

`ativos/rotas.tsx` ganha uma rota por prefixo antigo, com o resto do caminho: `catalogo/$`, `importacoes/$`, `software/$` e `control-id/$`. No `beforeLoad`, cada rota lança o redirecionamento para o mesmo resto debaixo de `/gestao`, com a busca do endereço e o `replace`.

Os segmentos fixos ganham do `$id` da ficha do ativo, e por isso `/ativos/catalogo` não vira a ficha de um ativo chamado "catalogo". Um teste confere isso, junto com o endereço sem o resto, `/ativos/catalogo`.

A alternativa era manter as telas nos dois endereços, recusada porque teríamos dois endereços para a mesma tela e o menu marcaria o módulo errado.

### 5. O menu do Ativos

- **O menu estático** é só `{ rotulo: 'Todos os ativos', destino: '/ativos' }`, no primeiro nível.
- **O menu dinâmico** devolve o menu com, depois de "Todos os ativos":
  - os tipos ativos, na ordem da API (o nome normalizado), com o ícone e o destino da origem do tipo;
  - as visões fixadas, a primeira com `separadoAntes`.
- **A permissão** do módulo passa a ser só `ativos.ver`.
- **O início** do módulo, para quem não vê ativos, leva a `/gestao`.
- **Os eventos** do `catalogo.mudou` continuam relendo os tipos, e um tipo inativado sai do menu sem recarregar.

### 6. O menu, o início e os registros da Gestão de ativos

- **O menu** é estático e segue a ordem da spec:
  - Catálogo, com as seções de `SECOES_DO_CATALOGO`, agora em `/gestao/catalogo`;
  - Importações;
  - Software;
  - Control iD, com Backups e Comparar backups;
  - cada um com a permissão de hoje.
- **O início** (`/gestao`) navega, com `replace`, para a primeira tela que a conta pode usar: tipos, importações, software e backups. Sem nenhuma, mostra o `SemPermissao` "à Gestão de ativos".
- **A busca:**
  - "Novo tipo de ativo", "Novo campo", "Novo modelo", "Importar planilha" e o provedor dos modelos vão para a Gestão;
  - "Novo ativo" e os provedores dos ativos e das visões ficam no Ativos.
- **Os cadastros numa aba** ("Novo tipo" e "Novo modelo") vão para a Gestão.
- **Os eventos:** o `App` liga os eventos de todos os módulos do registro, com ou sem a permissão da conta. Por isso:
  - o `importacoes.mudaram`, que só as telas da Gestão usam, vai para ela;
  - os do catálogo, do Control iD e do software ficam no Ativos, porque as mesmas consultas servem às telas dos dois, e repeti-los na Gestão não mudaria nada.

### 7. A documentação

- **O contrato de módulo** (`docs/casca/modulos.md`) troca o exemplo do menu do Ativos pelo novo e documenta o `parteDe`. O teste `documentacao.test.ts` confere os trechos contra os arquivos.
- **A linha do P1a na spec mestre** e **o mapa** ganham a Gestão de ativos.

## Risks / Trade-offs

- **[As capturas da regressão visual mudam com o ícone novo no dock]** → regravar com `pnpm test:visual --atualizar`, com o Docker aberto pelo usuário, e conferir que só o dock mudou.
- **[Um endereço em texto esquecido leva ao antigo]** → o redirecionamento cobre, e a busca no código pelos prefixos antigos faz parte das tarefas.
- **[Quem só vê ativos e tem `controlid.ver` passa a ver a Gestão de ativos, só com o Control iD]** → é o que a spec pede: a tela dos backups saiu do Ativos.
- **[O menu do Ativos fica longo numa organização com muitos tipos]** → é o pedido do usuário. O menu em árvore já rola, e um tipo inativado sai dele.

## Migration Plan

A mudança é só da web. Ela sai na versão seguinte, sem migration e sem passo de operação. Os favoritos antigos continuam abrindo pelo redirecionamento. Voltar à versão anterior (`grafite voltar`) devolve o menu de antes.
