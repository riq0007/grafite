## Purpose

Dar à casca a estrutura em que todo módulo se encaixa: o registro de módulos, a navegação entre eles, a janela de conteúdo e a barra superior, com os menus do módulo e os itens de status.

## ADDED Requirements

### Requirement: Módulos registrados

A casca SHALL montar o dock, a barra de abas e a barra superior a partir de um registro de módulos. Cada módulo SHALL declarar nome, ícone, endereço inicial e prioridade no celular e, se tiver, os menus em árvore e os menus da barra superior. Um módulo novo SHALL entrar na casca só pelo registro, sem mudança na casca. A casca SHALL NOT mostrar módulos que ainda não têm tela: nenhum item leva a uma página em construção.

#### Scenario: Módulo novo
- **WHEN** um módulo é registrado com nome, ícone, endereço e menus
- **THEN** ele aparece no dock com seus menus, sem nenhuma mudança no código da casca

#### Scenario: Só módulos com tela
- **WHEN** o usuário escolhe, um a um, os itens do dock
- **THEN** cada item leva a uma tela que funciona, e nenhum a uma página em construção

### Requirement: Navegação entre módulos

Escolher um módulo ou um item de menu SHALL levar ao endereço correspondente, sem recarregar a página. O endereço SHALL identificar o módulo e a seção, e o voltar e o avançar do navegador SHALL funcionar. Um endereço desconhecido SHALL mostrar, dentro da casca, a página "Página não encontrada", com um link para o Início.

#### Scenario: Troca de módulo
- **WHEN** o usuário escolhe Ajustes no dock
- **THEN** a janela passa a mostrar Ajustes, o endereço muda e a página não recarrega

#### Scenario: Voltar do navegador
- **WHEN** o usuário usa o voltar do navegador depois de trocar de módulo
- **THEN** a casca volta ao módulo anterior

#### Scenario: Endereço desconhecido
- **WHEN** o usuário abre um endereço que não existe
- **THEN** a casca mostra "Página não encontrada", com um link para o Início

### Requirement: Janela de conteúdo

O conteúdo do módulo SHALL ocupar uma janela única, com superfície sólida, no espaço entre a barra superior e o dock. A janela SHALL NOT ser arrastável nem ter botões de janela coloridos. Ao trocar de módulo ou de seção, o foco SHALL ir para o título do novo conteúdo. O primeiro item do teclado na página SHALL ser o link "Ir para o conteúdo".

#### Scenario: Foco depois da navegação
- **WHEN** o usuário escolhe um módulo pelo teclado
- **THEN** o foco vai para o título do novo conteúdo, que o leitor de tela anuncia

#### Scenario: Ir para o conteúdo
- **WHEN** o usuário pressiona Tab logo depois de abrir a página
- **THEN** o foco vai para "Ir para o conteúdo", e Enter leva o foco à janela

### Requirement: Barra superior

A barra superior SHALL mostrar, à esquerda, o nome do módulo atual e os menus que ele registrar para a barra; à direita, os itens de status. Os menus da barra SHALL abrir por clique, teclado e toque, e seguir o requisito de menu com submenu da biblioteca de componentes.

#### Scenario: Menus do módulo na barra
- **WHEN** o módulo atual registra os menus "Visualizar" e "Ações" para a barra
- **THEN** os dois aparecem ao lado do nome do módulo e abrem por clique e pelo teclado

### Requirement: Itens de status da barra

A barra SHALL mostrar, à direita:
- **Rede:** se a aplicação alcança o servidor, por ícone e nome acessível, e com o texto "Sem conexão com o servidor" quando não alcança. O estado nunca é comunicado só por cor. A perda de rede do navegador SHALL aparecer na hora, e a falta de resposta do servidor em até 1 minuto.
- **Relógio:** dia da semana, dia, mês abreviado e horário, em pt-BR, como "qui 24 set 14:32", atualizado na virada do minuto.
- **Usuário:** um menu com "Ajustes do Sistema". Enquanto não houver login, que chega no F2, o item SHALL mostrar um avatar neutro, sem nome inventado.

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
