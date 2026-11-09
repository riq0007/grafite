## MODIFIED Requirements

### Requirement: Módulos registrados

A casca SHALL montar o dock, a barra de abas e a barra superior a partir de um registro de módulos. Cada módulo SHALL declarar nome, ícone, endereço inicial e prioridade no celular. Se tiver, SHALL declarar também:
- os menus em árvore e os menus da barra superior;
- as entradas de busca, como as ações e os atalhos para as telas dele;
- um provedor de busca, com o nome do grupo dos resultados;
- uma fonte de ocorrências abertas, para a tela inicial.

Um módulo novo SHALL entrar na casca, na busca e na tela inicial só pelo registro, sem mudança na casca. A casca SHALL NOT mostrar módulos que ainda não têm tela: nenhum item leva a uma página em construção.

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

## ADDED Requirements

### Requirement: Datas e horas no fuso escolhido

A casca SHALL mostrar as datas e as horas no fuso escolhido nos Ajustes: o relógio da barra, os horários da central de notificações e as datas dos módulos. Os módulos SHALL formatar datas e horas pela casca, e não pelo fuso do navegador. A virada do dia, nos grupos "Hoje" e "Ontem", SHALL seguir o mesmo fuso.

#### Scenario: Relógio em outro fuso
- **WHEN** o fuso escolhido é o de Manaus e são 14:32 em Brasília
- **THEN** o relógio da barra mostra 13:32

#### Scenario: Virada do dia no fuso escolhido
- **WHEN** o fuso escolhido é o Horário de Brasília e o do sistema é o UTC, são 23:30 de 24 de setembro em Brasília (02:30 de 25 de setembro em UTC), e uma notificação chegou às 20:00 de 24 de setembro em Brasília
- **THEN** a central mostra a notificação no grupo "Hoje", às 20:00, e não em "Ontem"
