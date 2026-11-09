## MODIFIED Requirements

### Requirement: Módulos registrados

A casca SHALL montar o dock, a barra de abas e a barra superior a partir de um registro de módulos. Cada módulo SHALL declarar nome, ícone, endereço inicial e prioridade no celular. Se tiver, SHALL declarar também:
- os menus em árvore e os menus da barra superior;
- as entradas de busca, como as ações e os atalhos para as telas dele;
- um provedor de busca, com o nome do grupo dos resultados;
- uma fonte de ocorrências abertas, para a tela inicial;
- os itens de menu que vêm dos dados, além dos fixos, como as visões fixadas e os tipos de ativo, calculados a cada vez com a sessão e os dados do módulo;
- as relações: o que ele mostra na ficha de um registro de outro módulo, como os ativos sob responsabilidade de uma pessoa;
- as ações de cada tela dele, que a busca mostra em "Nesta tela" quando a tela está aberta;
- as permissões que exige, no próprio módulo, em cada item de menu, em cada entrada de busca, no provedor, na fonte de ocorrências e em cada relação;
- para cada tipo de evento, as consultas dele que o evento atualiza.

Um módulo novo SHALL entrar na casca, na busca, na tela inicial, nas fichas dos outros módulos e na atualização pelos eventos só pelo registro, sem mudança na casca. A casca SHALL NOT mostrar módulos que ainda não têm tela: nenhum item leva a uma página em construção.

O que exige permissões SHALL aparecer só para a conta que tem ao menos uma delas, em qualquer escopo: o módulo, o item de menu, a entrada de busca, os resultados do provedor, as ocorrências da fonte e as relações. Com a sessão desconhecida, porque o servidor não respondeu, nada que exige permissão SHALL aparecer.

#### Scenario: Módulo novo
- **WHEN** um módulo é registrado com nome, ícone, endereço e menus
- **THEN** ele aparece no dock com seus menus, e ele e os itens dos menus aparecem na busca, sem nenhuma mudança no código da casca

#### Scenario: Só módulos com tela
- **WHEN** o usuário escolhe, um a um, os itens do dock
- **THEN** cada item leva a uma tela que funciona, e nenhum a uma página em construção

#### Scenario: Provedor de busca de um módulo
- **WHEN** um módulo registra um provedor de busca com o grupo "Ativos"
- **THEN** os resultados dele aparecem na busca, no grupo "Ativos", sem mudança na casca

#### Scenario: Fonte de ocorrências de um módulo
- **WHEN** um módulo registra uma fonte de ocorrências
- **THEN** as ocorrências abertas dele aparecem na tela inicial, sem mudança na casca

#### Scenario: Eventos de um módulo
- **WHEN** um módulo declara que `pessoas.mudaram` atualiza as consultas de pessoas, e chega esse evento
- **THEN** as listas e as fichas de pessoas abertas se atualizam, sem mudança na casca

#### Scenario: Item de menu sem permissão
- **WHEN** um item de menu exige `auditoria.ver` e a conta não a tem
- **THEN** o item não aparece no menu nem na busca, e os outros itens do módulo continuam

#### Scenario: Sessão desconhecida
- **WHEN** a casca abre sem resposta do servidor
- **THEN** o dock mostra só os módulos que não exigem permissão

#### Scenario: Relação de um módulo
- **WHEN** o módulo Ativos registra os ativos sob responsabilidade como relação da ficha da pessoa
- **THEN** a ficha da pessoa mostra a relação para quem vê ativos, sem mudança na Administração, e ela some com o módulo Ativos desligado

#### Scenario: Itens de menu dos dados
- **WHEN** o módulo Ativos registra as visões fixadas como itens do menu, e a conta fixa a visão "Impressoras"
- **THEN** o menu do Ativos no dock mostra "Impressoras", sem mudança na casca, e o item some quando a visão é removida
