## MODIFIED Requirements

### Requirement: Módulos registrados

A casca SHALL montar o dock, a barra de abas e a barra superior a partir de um registro de módulos. Cada módulo SHALL declarar nome, ícone, endereço inicial e prioridade no celular. Se tiver, SHALL declarar também:
- os menus em árvore e os menus da barra superior;
- as entradas de busca, como as ações e os atalhos para as telas dele;
- um provedor de busca, com o nome do grupo dos resultados;
- uma fonte de ocorrências abertas, para a tela inicial;
- os itens de menu que vêm dos dados, além dos fixos, como as visões fixadas e os tipos de ativo, calculados a cada vez com a sessão e os dados do módulo;
- as relações: o que ele mostra na ficha de um registro de outro módulo, como os ativos sob responsabilidade de uma pessoa;
- os cadastros que abrem numa aba da janela a partir de um campo de outro módulo, cada um pelo que ele cria, como o Novo local, que cria um local;
- as ações de cada tela dele, que a busca mostra em "Nesta tela" quando a tela está aberta;
- as permissões que exige, no próprio módulo, em cada item de menu, em cada entrada de busca, no provedor, na fonte de ocorrências, em cada relação e em cada cadastro;
- para cada tipo de evento, as consultas dele que o evento atualiza.

Um módulo novo SHALL entrar na casca, na busca, na tela inicial, nas fichas dos outros módulos, nos campos dos outros módulos e na atualização pelos eventos só pelo registro, sem mudança na casca. A casca SHALL NOT mostrar módulos que ainda não têm tela: nenhum item leva a uma página em construção.

O que exige permissões SHALL aparecer só para a conta que tem ao menos uma delas, em qualquer escopo: o módulo, o item de menu, a entrada de busca, os resultados do provedor, as ocorrências da fonte, as relações e os cadastros. Com a sessão desconhecida, porque o servidor não respondeu, nada que exige permissão SHALL aparecer.

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

#### Scenario: Cadastro de um módulo pedido por um campo
- **WHEN** a Administração registra o Novo local, que exige `locais.editar`, e o cadastro do ativo mostra o campo Local a uma conta com essa permissão
- **THEN** o campo mostra "Cadastrar novo local", sem mudança no módulo Ativos nem na casca, e o link não aparece para a conta sem `locais.editar`

### Requirement: Janela de conteúdo

O conteúdo do módulo SHALL ocupar uma janela única, com superfície sólida, no espaço entre a barra superior e o dock. A janela SHALL NOT ser arrastável nem ter botões de janela coloridos. A janela SHALL ter abas só quando um campo abre um cadastro (requisito "Abas de cadastro na janela"); sem elas, ela SHALL mostrar a tela atual, como sempre. Ao trocar de módulo ou de seção, o foco SHALL ir para o título do novo conteúdo. O primeiro item do teclado na página SHALL ser o link "Ir para o conteúdo".

#### Scenario: Foco depois da navegação
- **WHEN** o usuário escolhe um módulo pelo teclado
- **THEN** o foco vai para o título do novo conteúdo, que o leitor de tela anuncia

#### Scenario: Ir para o conteúdo
- **WHEN** o usuário pressiona Tab logo depois de abrir a página
- **THEN** o foco vai para "Ir para o conteúdo", e Enter leva o foco à janela

#### Scenario: Janela sem abas
- **WHEN** o usuário navega pelos módulos sem abrir nenhum cadastro por um campo
- **THEN** a janela mostra só a tela atual, sem barra de abas

## ADDED Requirements

### Requirement: Abas de cadastro na janela

Um campo que pede outro cadastro SHALL abri-lo numa aba nova da janela, sem fechar a aba de onde veio. A primeira aba SHALL ser a tela em que a pessoa estava, com o nome dela; cada aba de cadastro SHALL ter o título do cadastro, como "Novo local".

A janela SHALL obedecer a estas regras:
- a barra de abas SHALL aparecer só com mais de uma aba, no topo da janela, e SHALL sumir quando sobrar uma;
- abrir um cadastro SHALL trazer a aba dele para a frente e levar o foco ao título dele;
- trocar de aba SHALL NOT descartar nada: a aba que sai de vista SHALL continuar como estava, com o que foi preenchido, e voltar a ela SHALL mostrar tudo igual;
- ao salvar, a aba do cadastro SHALL fechar, a aba de onde ele foi pedido SHALL voltar para a frente, e o campo que o pediu SHALL vir com o registro criado, com o retorno do próprio cadastro, como "Local cadastrado.";
- cancelar o cadastro SHALL fechar a aba e voltar à aba de onde ele foi pedido, sem mudar o campo;
- fechar uma aba de cadastro com dados preenchidos SHALL pedir confirmação ("Fechar sem salvar?"); sem dados, SHALL fechar direto;
- uma aba de cadastro SHALL poder abrir outra, e cada uma SHALL voltar à aba que a pediu;
- o mesmo campo SHALL NOT abrir duas abas: escolher o link de novo SHALL trazer a aba já aberta para a frente;
- escolher um módulo no dock, na busca ou num menu SHALL levar à primeira aba e navegar nela; as abas de cadastro SHALL continuar abertas;
- se a tela que pediu o cadastro não estiver mais aberta quando ele for salvo, a aba SHALL fechar com o retorno do cadastro, sem preencher nada.

A barra de abas SHALL funcionar pelo mouse, pelo teclado e pelo toque, e SHALL seguir o requisito "Barra de abas da janela" da biblioteca de componentes.

#### Scenario: Local criado pelo campo
- **WHEN** quem tem `ativos.editar` e `locais.editar` preenche o nome de um ativo novo, escolhe "Cadastrar novo local" embaixo do campo Local e salva o local "Sala 12"
- **THEN** a aba "Novo local" fecha, a aba do cadastro do ativo volta com o nome preenchido, e o campo Local vem com "Sala 12", com o aviso "Local cadastrado."

#### Scenario: Troca de aba sem perder nada
- **WHEN** a pessoa abre o Novo local pelo campo, volta à aba do ativo e depois à do local
- **THEN** as duas abas mostram exatamente o que já estava preenchido nelas

#### Scenario: Fechar com dados
- **WHEN** a pessoa fecha a aba "Nova pessoa" depois de digitar o nome
- **THEN** a casca pergunta "Fechar sem salvar?", e só fecha se ela confirmar

#### Scenario: Cadastro em cadeia
- **WHEN** a pessoa abre a Nova pessoa pelo campo Responsável do ativo, e nela o Novo local pelo campo Local de trabalho, e salva o local e depois a pessoa
- **THEN** o local criado vem no Local de trabalho da pessoa, e a pessoa criada vem no Responsável do ativo, cada uma na aba que a pediu

#### Scenario: Uma aba por campo
- **WHEN** a pessoa escolhe "Cadastrar novo local" duas vezes no mesmo campo
- **THEN** só existe uma aba "Novo local", que volta para a frente

#### Scenario: Navegação com abas abertas
- **WHEN** há uma aba "Novo modelo" aberta e a pessoa escolhe Administração no dock
- **THEN** a primeira aba vai para a frente e mostra a Administração, e a aba "Novo modelo" continua aberta
