## MODIFIED Requirements

### Requirement: Módulos registrados

A casca SHALL montar o dock, a barra de abas e a barra superior a partir de um registro de módulos. Cada módulo SHALL declarar nome, ícone, endereço inicial e prioridade no celular. Se tiver, SHALL declarar também:
- os menus em árvore e os menus da barra superior;
- as entradas de busca, como as ações e os atalhos para as telas dele;
- um provedor de busca, com o nome do grupo dos resultados;
- uma fonte de ocorrências abertas, para a tela inicial;
- as permissões que exige, no próprio módulo, em cada item de menu, em cada entrada de busca, no provedor e na fonte de ocorrências;
- para cada tipo de evento, as consultas dele que o evento atualiza.

Um módulo novo SHALL entrar na casca, na busca, na tela inicial e na atualização pelos eventos só pelo registro, sem mudança na casca. A casca SHALL NOT mostrar módulos que ainda não têm tela: nenhum item leva a uma página em construção.

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

#### Scenario: Eventos de um módulo
- **WHEN** um módulo declara que `pessoas.mudaram` atualiza as consultas de pessoas, e chega esse evento
- **THEN** as listas e as fichas de pessoas abertas se atualizam, sem mudança na casca

#### Scenario: Item de menu sem permissão
- **WHEN** um item de menu exige `auditoria.ver` e a conta não a tem
- **THEN** o item não aparece no menu nem na busca, e os outros itens do módulo continuam

#### Scenario: Sessão desconhecida
- **WHEN** a casca abre sem resposta do servidor
- **THEN** o dock mostra só os módulos que não exigem permissão

### Requirement: Itens de status da barra

A barra SHALL mostrar, à direita e nesta ordem:
- **Busca:** um botão com a lupa e o atalho ("Ctrl K", ou "⌘K" no Mac), que abre a busca.
- **Rede:**
  - mostra se a aplicação alcança o servidor, por ícone e nome acessível, e com o texto "Sem conexão com o servidor" quando não alcança;
  - o estado nunca é comunicado só por cor;
  - a perda de rede do navegador SHALL aparecer na hora, e a falta de resposta do servidor em até 1 minuto.
- **Notificações:** o sino, com o número de não lidas, que abre a central de notificações.
- **Relógio:** dia da semana, dia, mês abreviado e horário, em pt-BR, como "qui 24 set 14:32", atualizado na virada do minuto.
- **Usuário:**
  - o avatar com a foto da pessoa da conta, ou com as iniciais quando não há foto, e o nome da pessoa, num menu com "Conta", "Ajustes do Sistema" e "Sair";
  - "Conta" abre a seção Conta dos Ajustes, e "Sair" encerra a sessão;
  - com a sessão desconhecida, porque o servidor não respondeu, o item SHALL mostrar um avatar neutro, sem nome nem foto inventados, e o menu só com "Ajustes do Sistema".

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
- **WHEN** a conta de "Ana Souza", sem foto, está com a sessão valendo e o usuário abre o item de usuário
- **THEN** o item mostra "AS" e o nome acessível "Ana Souza", e o menu oferece "Conta", "Ajustes do Sistema" e "Sair"

#### Scenario: Usuário com foto
- **WHEN** a pessoa da conta de "Ana Souza" tem foto
- **THEN** o item de usuário mostra a foto de Ana, com o nome acessível "Ana Souza"

#### Scenario: Usuário com a sessão desconhecida
- **WHEN** a casca abriu sem resposta do servidor
- **THEN** o item de usuário mostra o avatar neutro, e o menu oferece só "Ajustes do Sistema"

#### Scenario: Barra no celular
- **WHEN** a casca está no celular, com o servidor alcançado
- **THEN** a barra mostra o nome do módulo, a busca, o sino e o usuário, e não mostra a rede nem o relógio
