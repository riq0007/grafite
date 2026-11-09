## MODIFIED Requirements

### Requirement: Módulos registrados

A casca SHALL montar o dock, a barra de abas e a barra superior a partir de um registro de módulos. Cada módulo SHALL declarar nome, ícone, endereço inicial e prioridade no celular. Se tiver, SHALL declarar também:
- os menus em árvore e os menus da barra superior;
- as entradas de busca, como as ações e os atalhos para as telas dele;
- um provedor de busca, com o nome do grupo dos resultados;
- uma fonte de ocorrências abertas, para a tela inicial;
- as permissões que exige, no próprio módulo, em cada item de menu, em cada entrada de busca, no provedor e na fonte de ocorrências.

Um módulo novo SHALL entrar na casca, na busca e na tela inicial só pelo registro, sem mudança na casca. A casca SHALL NOT mostrar módulos que ainda não têm tela: nenhum item leva a uma página em construção.

O que exige permissões SHALL aparecer só para a conta que tem ao menos uma delas, em qualquer escopo: o módulo, o item de menu, a entrada de busca, os resultados do provedor e as ocorrências da fonte. Com a sessão desconhecida, porque o servidor não respondeu, nada que exige permissão SHALL aparecer.

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

#### Scenario: Item de menu sem permissão
- **WHEN** um item de menu exige `auditoria.ver` e a conta não a tem
- **THEN** o item não aparece no menu nem na busca, e os outros itens do módulo continuam

#### Scenario: Sessão desconhecida
- **WHEN** a casca abre sem resposta do servidor
- **THEN** o dock mostra só os módulos que não exigem permissão
