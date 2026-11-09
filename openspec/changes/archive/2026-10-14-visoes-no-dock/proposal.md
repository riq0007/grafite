## Why

O usuário perguntou se o sistema "vai contar com customização de tudo e qualquer aba no dock", como uma aba "Impressoras" que liste só as impressoras. Hoje os menus do dock são fixos no código: o do Ativos tem "Ativos", "Importações" e o "Catálogo", e uma visão salva só se abre pelo menu da visão na tabela ou pela busca. O brainstorming aprovado já mostrava o menu do Ativos com "Todos os ativos / Computadores / Impressoras / Rede › Switches, Racks": as visões como navegação eram a intenção original.

A change pertence ao P1c · Tabela e visões e ao F1a (o registro de módulos e o dock), seção 3.2 da spec mestre, e aplica a quinta proposta do handoff de 2026-10-13 ("Visões no dock"). Ela vem depois das relações vivas, porque usa a origem da tabela para abrir os ativos de um tipo.

Ficam fora desta change:
- os atalhos do dock para qualquer endereço;
- os grupos como pastas e a ordem dos módulos;
- as contagens nos itens;
- o dock por perfil (A1);
- as visões fixadas em outros módulos além do Ativos.

## What Changes

- **"Fixar no menu"** nas visões:
  - a conta fixa as visões dela e as da organização no menu do Ativos, só para ela;
  - quem tem `organizacao.editar` fixa visões da organização para todos;
  - a visão fixada aparece no menu do dock, em "Ativos", abaixo de "Todos os ativos", e leva à tabela nela;
  - "Desafixar do menu" a tira.
- **"Por tipo"** no menu do Ativos: um submenu com os tipos ativos, cada um com o ícone dele, que abre a tabela com a origem do tipo.
- **O registro de módulos** aceita itens de menu que vêm dos dados, além dos fixos no código. Eles seguem a mesma permissão e somem com o módulo desligado ou com a visão removida.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `estrutura-da-casca`: o registro de módulos com os itens de menu que vêm dos dados.
- `modulo-ativos`: o menu do Ativos com as visões fixadas e o submenu "Por tipo".
- `visoes-de-tabela`: fixar e desafixar uma visão no menu, para a conta ou para a organização.

## Impact

- **`apps/api`:** as visões fixadas da organização, gravadas nos padrões da organização, com a auditoria; as da conta, nas preferências dela, só com os ids.
- **`packages/domain`:** as preferências e os padrões com as visões fixadas, com o limite de 20.
- **`apps/web`:** o registro de módulos com os itens dinâmicos, o menu do Ativos e o menu da visão com "Fixar no menu".
- **`packages/ui`:** o menu do dock, que já desenha a árvore, recebe os itens do registro como hoje.
- **Documentação:** o contrato de módulo, com os itens de menu dinâmicos, e o mapa.
