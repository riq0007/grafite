## Why

O F0 deixou a casca vazia: uma barra com a marca, uma área de conteúdo e um dock provisório, sem ação. Sem a estrutura da casca (módulos, navegação, barra superior, dock, menus em árvore e as três posturas), nenhum módulo da fase 2 tem onde se encaixar. O F1b e o F1c também não têm sobre o que montar.

Esta change implementa a **primeira parte do subprojeto F1 · Casca OS** da spec mestre (`docs/superpowers/specs/2026-09-24-grafite-design.md`, seções 3.2, 7.2, 7.4, 7.7, 7.8 e Apêndice B). O F1 foi dividido em três changes, nesta ordem: **F1a · Estrutura da casca** (esta), **F1b · Interação** e **F1c · Chegada e PWA**.

## What Changes

- **Preferências da interface no navegador**
  - Os padrões de fábrica da seção 7.2 para aparência, dock e acessibilidade.
  - Cada campo é validado sozinho: um valor inválido volta ao padrão sem descartar os outros.
  - A posição e o tamanho do dock valem já na primeira pintura, como o tema.
  - O modelo tem camadas (fábrica, depois usuário). O F2 acrescenta a organização e leva tudo ao servidor sem mudar a interface.
- **Módulos e navegação**
  - Um registro de módulos: nome, ícone, rota, menus em árvore e prioridade no celular.
  - No F1a, os módulos são Início e Ajustes. Cada subprojeto seguinte registra o seu.
  - Uma janela de conteúdo única entre a barra e o dock, sem janelas arrastáveis.
- **Barra superior**
  - À esquerda, o módulo atual e seus menus.
  - À direita, os itens de status: rede, relógio e usuário.
- **Dock**
  - Embaixo, à esquerda ou à direita, com itens de 28 a 64 px.
  - Ampliação gaussiana ao passar o mouse (até +55%) e ocultar automático.
  - Um ponto marca o módulo atual, e um separador isola Ajustes.
- **Menus em árvore** a partir do dock, com os tempos do Apêndice B, a tolerância diagonal, o submenu para o lado com espaço, o teclado e o toque.
- **Posturas**
  - **Computador:** a casca completa.
  - **Tablet:** dock embaixo, alvos de 44 px e menus como popovers.
  - **Celular:** barra de abas com "Mais", e menus como painéis que sobem de baixo.
- **Layout:** margem lateral fluida, formulários até 960 px, tabelas na largura toda, e a matriz de resoluções da seção 7.8 na regressão visual da casca.
- **Ajustes do Sistema**
  - O app Ajustes, com as seções Aparência, Dock e Acessibilidade, prévia ao vivo e restauração dos padrões.
  - Substitui o painel provisório de aparência do F0.
- **Controle deslizante** na biblioteca de componentes base, para os cantos e o tamanho do dock. O F1b o reutiliza na suavização do cursor.
- **Spec mestre:** a divisão do F1 em três changes fica registrada na seção 3.3.

**Fora desta change:**
- **F1b · Interação:** busca Ctrl+K, cursor suavizado, notificações (avisos e central lateral) e Quick Look, com as seções Cursor, Notificações e Tabelas dos Ajustes.
- **F1c · Chegada e PWA:** carregamento, boas-vindas e montagem da casca; a tela "O que resolver agora"; a base da PWA; a seção Idioma e região dos Ajustes.
- **F2:** preferências no servidor e padrões por organização; login, com o nome do usuário na barra; o estado da rede pela conexão de eventos.
- **P1 em diante:** os módulos de negócio no dock e a tabela avançada da seção 7.4.

## Capabilities

### New Capabilities
- `preferencias-da-interface`: padrões de fábrica, validação por campo, persistência no navegador e aplicação antes da primeira pintura.
- `estrutura-da-casca`: registro de módulos, navegação, janela de conteúdo e barra superior.
- `dock`: dock e menus em árvore, com seus tempos, a ampliação e o ocultar automático.
- `posturas-da-casca`: comportamento no computador, no tablet e no celular, e o layout fluido.
- `ajustes-do-sistema`: o app Ajustes, com seções, prévia ao vivo e restauração dos padrões.

### Modified Capabilities
- `componentes-base`: o conjunto de componentes base ganha o controle deslizante, com o valor visível e o teclado, e a linha de campos, que se arranja pelo espaço que recebe.

A casca usa como estão os demais requisitos do F0, entre eles a troca de aparência sem flash (`design-tokens`) e o menu com submenu e tolerância diagonal (`componentes-base`).

## Impact

- **Código**
  - `packages/ui`: componentes da casca (barra superior, dock, menus do dock, barra de abas e painel que sobe de baixo), o controle deslizante e a linha de campos, com histórias no catálogo e regressão visual.
  - `apps/web`: registro de módulos, rotas, preferências e o app Ajustes. O painel provisório de aparência sai.
  - `apps/web/index.html`: o script anti-flash passa a aplicar também a posição e o tamanho do dock.
- **Dependências:** nenhuma nova no repositório. A casca usa React Aria, Motion e TanStack Router, que já estão no projeto.
  - O `packages/ui` passa a declarar `react-aria` e `react-stately`, que já vinham com o `react-aria-components` (design, decisão 12).
  - A web passa a declarar as bibliotecas de teste que o `packages/ui` já usa, para os testes de componente.
  - A web passa a declarar o `lucide-react`, que o `packages/ui` já usa, para os ícones do registro de módulos.
- **Testes:**
  - testes de componente para os atrasos dos menus, a tolerância, o teclado e o foco;
  - ponta a ponta nas três posturas;
  - regressão visual da casca na matriz de resoluções.
- **PMG:** nenhum impacto.
