## MODIFIED Requirements

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
