# estrutura-da-casca Specification

## Purpose

Dar à casca a estrutura em que todo módulo se encaixa: o registro de módulos, a navegação entre eles, a janela de conteúdo e a barra superior, com os menus do módulo e os itens de status.

## Requirements

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

O conteúdo do módulo SHALL ocupar uma janela única, com superfície sólida, no espaço entre a barra superior e o dock. A janela SHALL NOT ser arrastável nem ter botões de janela coloridos. A janela SHALL ter abas só quando um campo abre um cadastro (requisito "Abas de cadastro na janela"); sem elas, ela SHALL mostrar a tela atual, como sempre. Ao trocar de módulo ou de seção, o foco SHALL ir para o título do novo conteúdo. O primeiro item do teclado na página SHALL ser o link "Ir para o conteúdo".

A janela SHALL terminar sempre antes do dock, separada dele pelo mesmo respiro que a separa da barra superior; no celular, ela SHALL terminar antes da barra de abas. A janela SHALL obedecer a estas regras:
- a página SHALL NOT rolar;
- o conteúdo que não cabe SHALL rolar dentro da janela, abaixo da barra de abas dela, que fica no lugar;
- com o ocultar automático do dock, a janela SHALL ocupar o lugar do dock escondido, e o dock SHALL passar por cima dela quando reaparece (spec dock, "Ocultar automático").

Perto da borda de cima e da de baixo da área que rola, o conteúdo SHALL esmaecer enquanto ainda houver conteúdo além daquela borda. O esmaecimento SHALL obedecer a estas regras:
- no começo da rolagem, a borda de cima SHALL ficar nítida, e no fim, a de baixo;
- o conteúdo que cabe inteiro SHALL NOT esmaecer;
- a barra de rolagem SHALL NOT esmaecer;
- o elemento que recebe o foco SHALL ficar fora da faixa esmaecida, e a janela SHALL rolar o que for preciso para isso;
- o esmaecimento SHALL aparecer e sumir sem animação.

Ao trocar de tela na mesma aba, a rolagem SHALL voltar ao começo.

#### Scenario: Foco depois da navegação
- **WHEN** o usuário escolhe um módulo pelo teclado
- **THEN** o foco vai para o título do novo conteúdo, que o leitor de tela anuncia

#### Scenario: Ir para o conteúdo
- **WHEN** o usuário pressiona Tab logo depois de abrir a página
- **THEN** o foco vai para "Ir para o conteúdo", e Enter leva o foco à janela

#### Scenario: Janela sem abas
- **WHEN** o usuário navega pelos módulos sem abrir nenhum cadastro por um campo
- **THEN** a janela mostra só a tela atual, sem barra de abas

#### Scenario: Conteúdo mais alto que a janela
- **WHEN** a etapa Administrativo do cadastro do ativo tem mais campos do que cabem na janela, com o dock embaixo
- **THEN** a janela termina antes do dock, com o mesmo respiro de cima, os campos rolam dentro dela, nenhum campo fica sob o dock, e os campos perto da borda de baixo esmaecem

#### Scenario: Fim da rolagem
- **WHEN** a pessoa rola os campos da etapa até o fim
- **THEN** a borda de baixo fica nítida, e os campos perto da borda de cima esmaecem

#### Scenario: Conteúdo que cabe
- **WHEN** a tela aberta cabe inteira na janela
- **THEN** a janela não rola, e nada esmaece

#### Scenario: Foco na faixa esmaecida
- **WHEN** o Tab leva o foco a um campo que está na faixa esmaecida de baixo
- **THEN** a janela rola até o campo ficar inteiro fora da faixa

#### Scenario: Barra de abas no lugar
- **WHEN** a pessoa rola o cadastro do ativo com a aba "Novo modelo" aberta
- **THEN** a barra de abas continua no topo da janela, e só o conteúdo rola

#### Scenario: Tela nova no começo
- **WHEN** a pessoa rolou a ficha de um ativo até o fim e escolhe Ajustes no dock
- **THEN** Ajustes abre no começo da rolagem, com o foco no título

#### Scenario: Ocultar automático
- **WHEN** o ocultar automático está ligado, o dock está escondido, e o ponteiro chega à borda de baixo
- **THEN** a janela vai até o respiro da borda, e o dock reaparece por cima dela

### Requirement: Barra superior

A barra superior SHALL mostrar, à esquerda, o nome do módulo atual e os menus que ele registrar para a barra; à direita, os itens de status. Os menus da barra SHALL abrir por clique, teclado e toque, e seguir o requisito de menu com submenu da biblioteca de componentes.

#### Scenario: Menus do módulo na barra
- **WHEN** o módulo atual registra os menus "Visualizar" e "Ações" para a barra
- **THEN** os dois aparecem ao lado do nome do módulo e abrem por clique e pelo teclado

### Requirement: Itens de status da barra

A barra SHALL mostrar, à direita e nesta ordem:
- **Ambiente:** só no ambiente de teste, o texto "Ambiente de teste", com um ícone. Nos outros ambientes, o item SHALL NOT aparecer (spec operacao-servicos).
- **Busca:** um botão com a lupa e o atalho ("Ctrl K", ou "⌘K" no Mac), que abre a busca.
- **Rede:**
  - mostra se a aplicação alcança o servidor, por ícone e nome acessível, e com o texto "Sem conexão com o servidor" quando não alcança;
  - o estado nunca é comunicado só por cor;
  - a perda de rede do navegador SHALL aparecer na hora, e a falta de resposta do servidor em até 1 minuto.
- **Notificações:** o sino, com o número de não lidas e, com o modo Foco ligado, o texto "Foco", que abre a central de notificações (spec notificacoes).
- **Relógio:** dia da semana, dia, mês abreviado e horário, em pt-BR, como "qui 24 set 14:32", atualizado na virada do minuto.
- **Usuário:**
  - o avatar com a foto da pessoa da conta, ou com as iniciais quando não há foto, e o nome da pessoa, num menu com "Conta", "Ajustes do Sistema" e "Sair";
  - "Conta" abre a seção Conta dos Ajustes, e "Sair" encerra a sessão;
  - com a sessão desconhecida, porque o servidor não respondeu, o item SHALL mostrar um avatar neutro, sem nome nem foto inventados, e o menu só com "Ajustes do Sistema".

No celular, a barra SHALL manter à vista o ambiente de teste, a busca, as notificações e o usuário, e a rede só quando não há conexão.

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

#### Scenario: Ambiente de teste
- **WHEN** a casca abre no ambiente de teste
- **THEN** a barra mostra "Ambiente de teste", com o ícone, antes da busca, também no celular

#### Scenario: Produção sem aviso
- **WHEN** a casca abre na produção
- **THEN** a barra não mostra o item de ambiente

### Requirement: Datas e horas no fuso escolhido

A casca SHALL mostrar as datas e as horas no fuso escolhido nos Ajustes: o relógio da barra, os horários da central de notificações e as datas dos módulos. Os módulos SHALL formatar datas e horas pela casca, e não pelo fuso do navegador. A virada do dia, nos grupos "Hoje" e "Ontem", SHALL seguir o mesmo fuso.

#### Scenario: Relógio em outro fuso
- **WHEN** o fuso escolhido é o de Manaus e são 14:32 em Brasília
- **THEN** o relógio da barra mostra 13:32

#### Scenario: Virada do dia no fuso escolhido
- **WHEN** o fuso escolhido é o Horário de Brasília e o do sistema é o UTC, são 23:30 de 24 de setembro em Brasília (02:30 de 25 de setembro em UTC), e uma notificação chegou às 20:00 de 24 de setembro em Brasília
- **THEN** a central mostra a notificação no grupo "Hoje", às 20:00, e não em "Ontem"

### Requirement: Abas de cadastro na janela

Um campo que pede outro cadastro SHALL abri-lo numa aba nova da janela, sem fechar a aba de onde veio. A primeira aba SHALL ser a tela em que a pessoa estava, com o nome dela; cada aba de cadastro SHALL ter o título do cadastro, como "Novo local".

A janela SHALL obedecer a estas regras:
- a barra de abas SHALL aparecer só com mais de uma aba, no topo da janela, e SHALL sumir quando sobrar uma;
- abrir um cadastro SHALL trazer a aba dele para a frente e levar o foco ao título dele;
- trocar de aba SHALL NOT descartar nada: a aba que sai de vista SHALL continuar como estava, com o que foi preenchido e a posição da rolagem, e voltar a ela SHALL mostrar tudo igual, no mesmo ponto da rolagem;
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

#### Scenario: Troca de aba no mesmo ponto da rolagem
- **WHEN** a pessoa rola o cadastro do ativo até o campo Fornecedor, abre o Novo fornecedor por ele, e depois volta à aba do ativo
- **THEN** a aba do ativo mostra o mesmo ponto da rolagem, com o campo Fornecedor à vista

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
