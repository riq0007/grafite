## MODIFIED Requirements

### Requirement: Módulos registrados

A casca SHALL montar o dock, a barra de abas e a barra superior a partir de um registro de módulos. Cada módulo SHALL declarar nome, ícone, endereço inicial e prioridade no celular. Se tiver, SHALL declarar também:
- os menus em árvore e os menus da barra superior;
- as entradas de busca, como as ações e os atalhos para as telas dele;
- um provedor de busca, com o nome do grupo dos resultados.

Um módulo novo SHALL entrar na casca e na busca só pelo registro, sem mudança na casca. A casca SHALL NOT mostrar módulos que ainda não têm tela: nenhum item leva a uma página em construção.

#### Scenario: Módulo novo
- **WHEN** um módulo é registrado com nome, ícone, endereço e menus
- **THEN** ele aparece no dock com seus menus, e ele e os itens dos menus aparecem na busca, sem nenhuma mudança no código da casca

#### Scenario: Só módulos com tela
- **WHEN** o usuário escolhe, um a um, os itens do dock
- **THEN** cada item leva a uma tela que funciona, e nenhum a uma página em construção

#### Scenario: Provedor de busca de um módulo
- **WHEN** um módulo registra um provedor de busca com o grupo "Ativos"
- **THEN** os resultados dele aparecem na busca, no grupo "Ativos", sem mudança na casca

### Requirement: Itens de status da barra

A barra SHALL mostrar, à direita e nesta ordem:
- **Busca:** um botão com a lupa e o atalho ("Ctrl K", ou "⌘K" no Mac), que abre a busca.
- **Rede:** se a aplicação alcança o servidor, por ícone e nome acessível, e com o texto "Sem conexão com o servidor" quando não alcança. O estado nunca é comunicado só por cor. A perda de rede do navegador SHALL aparecer na hora, e a falta de resposta do servidor em até 1 minuto.
- **Notificações:** o sino, com o número de não lidas, que abre a central de notificações.
- **Relógio:** dia da semana, dia, mês abreviado e horário, em pt-BR, como "qui 24 set 14:32", atualizado na virada do minuto.
- **Usuário:** um menu com "Ajustes do Sistema". Enquanto não houver login, que chega no F2, o item SHALL mostrar um avatar neutro, sem nome inventado.

No celular, a barra SHALL manter à vista a busca, as notificações e o usuário, e a rede só quando não há conexão.

#### Scenario: Servidor fora do ar
- **WHEN** a API deixa de responder
- **THEN** em até 1 minuto o item de rede mostra o ícone de sem conexão e o texto "Sem conexão com o servidor"

#### Scenario: Navegador sem rede
- **WHEN** o navegador perde a rede
- **THEN** o item de rede mostra "Sem conexão com o servidor" na hora, e volta ao normal quando a rede e o servidor voltam

#### Scenario: Virada do minuto
- **WHEN** o horário passa de 14:32 para 14:33
- **THEN** o relógio da barra mostra 14:33, sem depender de outra ação

#### Scenario: Menu do usuário
- **WHEN** o usuário abre o item de usuário
- **THEN** o menu oferece "Ajustes do Sistema", que abre o app Ajustes

#### Scenario: Barra no celular
- **WHEN** a casca está no celular, com o servidor alcançado
- **THEN** a barra mostra o nome do módulo, a busca, o sino e o usuário, e não mostra a rede nem o relógio
