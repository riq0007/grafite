## Why

Em 29/10 o usuário pediu que o menu do Ativos mostre só os ativos, cada tipo direto no menu (Impressoras, Face ID, Computadores, Switches…), e que o resto vá para outro lugar. Hoje os tipos ficam escondidos em Ativos › Por tipo, ao lado de Importações, Control iD, Software e Catálogo. No cartão de 29/10, o usuário escolheu um ícone novo no dock, a "Gestão de ativos", para essas telas.

A change é ligada ao P1 · Ativos da spec mestre, que entregou no P1a "o módulo Ativos com o catálogo", e ao F1 · Casca, pelo dock e pelos menus em árvore. Ficam fora dela: o conteúdo e as ações das telas, a API, o banco, as permissões e a barra de abas do celular, que continua com o Ativos logo depois do Início.

## What Changes

- **O menu do Ativos só com os ativos.**
  - O menu passa a ter "Todos os ativos", cada tipo ativo direto no menu, com o ícone dele, e as visões fixadas depois de uma linha.
  - O submenu "Por tipo" sai.
  - O módulo passa a aparecer só para quem tem `ativos.ver`.
- **A Gestão de ativos no dock**, logo depois do Ativos.
  - Ela reúne o Catálogo (Tipos, Campos e Modelos), as Importações, o Software e o Control iD (Backups e Comparar backups), cada um com a permissão de hoje.
  - O item do dock abre a primeira dessas telas que a conta pode usar, nessa ordem.
  - No celular, ela fica em "Mais".
- **Os endereços novos.**
  - As telas saem de `/ativos/catalogo`, `/ativos/importacoes`, `/ativos/software` e `/ativos/control-id` e vão para `/gestao/catalogo`, `/gestao/importacoes`, `/gestao/software` e `/gestao/control-id`.
  - Os endereços antigos levam aos novos, para os favoritos continuarem abrindo.
- **Um interruptor só.** A Gestão de ativos faz parte do módulo opcional Ativos, e desligar o Ativos tira os dois do dock.
- **A busca.** As ações do catálogo e da importação e os modelos levam aos endereços novos.

## Capabilities

### New Capabilities
- `modulo-gestao-de-ativos`: o módulo Gestão de ativos no dock, com o menu, o início pela primeira tela permitida e os endereços antigos que levam aos novos; o catálogo na busca e atualizado pelos eventos, que saem do `modulo-ativos`.

### Modified Capabilities
- `modulo-ativos`: o menu só com os ativos, os tipos direto nele e o módulo só para quem vê ativos; o catálogo na busca e nos eventos passa para a Gestão de ativos.
- `catalogo-de-ativos`: as telas do catálogo ficam na Gestão de ativos.
- `backup-do-control-id`: a tela "Backups do Control iD" fica na Gestão de ativos.
- `modulos-da-organizacao`: o Ativos desligado tira também a Gestão de ativos.

## Impact

- **`apps/web`:**
  - o módulo novo em `modulos/gestao`, com as rotas que mudam de lugar e as do endereço antigo;
  - o menu e o registro do Ativos;
  - a casca e o registro da conta, para um módulo seguir o interruptor de outro;
  - os links do Operação para a ficha do modelo e a busca;
  - os testes unitários e os ponta a ponta que abrem esses endereços.
- **A documentação:** o contrato de módulo (`docs/casca/modulos.md`), o mapa e a linha do P1a na spec mestre.
- **A regressão visual:** o dock ganha um ícone, e as capturas com o dock são regravadas.
- A API, o banco, o contrato e o coletor não mudam.
