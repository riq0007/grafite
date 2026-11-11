# dock Specification

## Purpose

Oferecer o dock da casca, de onde se chega a cada módulo e aos seus menus em árvore, com posição, tamanho, ampliação e ocultar automático ajustáveis por usuário.

## Requirements

### Requirement: Itens do dock

O dock SHALL mostrar um item por módulo disponível que a conta não tirou do dock, na ordem que vale para ela (requisito "Ordem dos módulos e módulos fora do dock"), com o ícone e o nome acessível do módulo. Cada item SHALL ter uma placa leve, com o ícone no texto do tema. Um ponto e a borda da placa SHALL marcar o módulo atual, que o leitor de tela SHALL anunciar como atual. Um separador SHALL isolar Ajustes, sempre no fim. Um item sem menu SHALL mostrar o nome do módulo numa dica, ao parar o ponteiro ou receber o foco; num item com menu, o nome SHALL aparecer no topo do menu. O dock SHALL usar o material translúcido das camadas sobrepostas, com superfície sólida na transparência reduzida.

#### Scenario: Módulo atual
- **WHEN** o usuário está em Ajustes
- **THEN** o item Ajustes mostra o ponto de módulo atual e a borda da placa, e o leitor de tela o anuncia como atual

#### Scenario: Transparência reduzida
- **WHEN** o usuário escolhe reduzir a transparência
- **THEN** o dock passa a ter superfície sólida, sem desfoque

### Requirement: Posição e tamanho

O dock SHALL ficar embaixo, à esquerda ou à direita, conforme a preferência, com itens do tamanho escolhido, de 28 a 64 px. A janela de conteúdo SHALL se ajustar ao dock, sem ficar sob ele. O conteúdo da janela que não cabe SHALL rolar dentro dela, sem passar sob o dock (spec estrutura-da-casca, "Janela de conteúdo"). Com o ocultar automático, a janela SHALL ocupar o lugar do dock escondido, e o dock SHALL passar por cima dela quando reaparece.

#### Scenario: Dock à direita
- **WHEN** o usuário escolhe o dock à direita
- **THEN** o dock passa para a borda direita, e a janela se ajusta sem ficar sob ele

#### Scenario: Conteúdo longo com o dock embaixo
- **WHEN** o dock está embaixo, sem o ocultar automático, e a tela aberta é mais alta que a janela
- **THEN** a janela termina antes do dock, e o conteúdo rola dentro dela, sem nada passar sob o dock

### Requirement: Ampliação ao passar o mouse

Com a ampliação ligada, os itens perto do ponteiro SHALL crescer numa curva gaussiana com σ de 1,3 vez o tamanho do item, até 55% a mais no item sob o ponteiro, suavizada quadro a quadro, e voltar ao tamanho normal quando o ponteiro sai. Os itens ampliados SHALL crescer por cima do conteúdo, sem mover a janela. A ampliação SHALL NOT acontecer com movimento reduzido, no toque nem com a preferência desligada.

#### Scenario: Ponteiro sobre um item
- **WHEN** o ponteiro para no centro de um item de 48 px
- **THEN** esse item chega a cerca de 74 px, os vizinhos crescem menos quanto mais longe estão, e a janela não se move

#### Scenario: Movimento reduzido
- **WHEN** o sistema pede movimento reduzido
- **THEN** os itens do dock não mudam de tamanho sob o ponteiro

### Requirement: Ocultar automático

Com o ocultar automático ligado, o dock SHALL se esconder 650 ms depois de o ponteiro sair dele, numa animação de 280 ms, e reaparecer quando o ponteiro entra na faixa de 18 px da borda do dock. O dock SHALL reaparecer também ao receber o foco do teclado, e ficar visível enquanto tiver o foco ou um menu aberto. Com movimento reduzido, o dock SHALL aparecer e sumir sem deslocamento.

#### Scenario: Revelar pela borda
- **WHEN** o dock está escondido e o ponteiro chega à faixa de 18 px da borda
- **THEN** o dock reaparece

#### Scenario: Esconder ao sair
- **WHEN** o ponteiro sai do dock, sem menu aberto
- **THEN** o dock se esconde 650 ms depois, e continua visível se o ponteiro voltar antes disso

#### Scenario: Foco pelo teclado
- **WHEN** o dock está escondido e o foco do teclado chega a ele
- **THEN** o dock reaparece e continua visível enquanto tiver o foco

### Requirement: Menus em árvore do dock

Parar o ponteiro sobre um item com menu SHALL abrir o menu do módulo depois de 150 ms. Com outro menu do dock já aberto, a troca SHALL acontecer em 60 ms. Ao sair do dock e do menu, os menus SHALL fechar 320 ms depois, e continuar abertos se o ponteiro voltar antes. O menu SHALL abrir com animação de 160 a 180 ms e leve escala a partir do item, e só com opacidade no movimento reduzido. Os submenus SHALL seguir o requisito de menu com submenu da biblioteca de componentes e abrir para o lado com espaço. Escolher um item de menu SHALL navegar e fechar os menus.

#### Scenario: Abrir com atraso
- **WHEN** o ponteiro para 150 ms sobre o item Ajustes
- **THEN** o menu de Ajustes abre junto ao item

#### Scenario: Passagem rápida
- **WHEN** o ponteiro atravessa o dock sem parar 150 ms em nenhum item
- **THEN** nenhum menu abre

#### Scenario: Troca rápida
- **WHEN** um menu do dock está aberto e o ponteiro passa para outro item com menu
- **THEN** o menu do outro item abre em 60 ms, no lugar do primeiro

#### Scenario: Fechar ao sair
- **WHEN** o ponteiro sai do dock e do menu
- **THEN** o menu fecha 320 ms depois, e continua aberto se o ponteiro voltar antes disso

#### Scenario: Submenu perto da borda
- **WHEN** não há espaço para o submenu à direita do menu
- **THEN** o submenu abre à esquerda

### Requirement: Dock pelo teclado

O dock SHALL ser uma parada única do Tab. As setas na direção do dock SHALL mover entre os itens, Home e End SHALL ir ao primeiro e ao último, e Enter SHALL abrir o módulo. A seta que aponta para longe da borda do dock (para cima com o dock embaixo, para a direita com o dock à esquerda e para a esquerda com o dock à direita) SHALL abrir o menu do módulo, com o foco no primeiro item. Esc SHALL fechar o menu e devolver o foco ao item do dock.

#### Scenario: Abrir o menu pelo teclado
- **WHEN** o foco está no item Ajustes do dock embaixo e o usuário pressiona seta para cima
- **THEN** o menu de Ajustes abre, com o foco no primeiro item

#### Scenario: Reabrir o menu enquanto o anterior sai
- **WHEN** o usuário escolhe um item do menu de Ajustes pelo teclado e, enquanto o menu ainda sai da tela, pressiona seta para cima no item Ajustes de novo
- **THEN** o menu de Ajustes abre, com o foco no primeiro item

#### Scenario: Esc no menu
- **WHEN** um menu do dock está aberto e o usuário pressiona Esc
- **THEN** o menu fecha, e o foco volta ao item do dock

#### Scenario: Setas no dock à esquerda
- **WHEN** o dock está à esquerda, o foco está no primeiro item e o usuário pressiona seta para baixo
- **THEN** o foco vai para o segundo item

### Requirement: Dock no toque

No toque, o primeiro toque num item com menu SHALL abrir o menu, tocar num item do menu SHALL navegar e tocar fora SHALL fechar. Um item sem menu SHALL navegar no primeiro toque. Os atrasos do ponteiro SHALL NOT valer no toque.

#### Scenario: Toque num item com menu
- **WHEN** o usuário toca no item Ajustes num tablet
- **THEN** o menu de Ajustes abre na hora, e tocar em "Dock" leva à seção Dock

### Requirement: Limite vertical do dock lateral

O dock lateral SHALL ficar inteiramente abaixo da barra superior. Quando os itens não couberem na altura disponível, eles SHALL manter o tamanho escolhido, e os que não couberem SHALL ir para o botão Mais, sem rolagem no dock (requirement "Módulos excedentes no botão Mais").

#### Scenario: Tela baixa com muitos módulos
- **WHEN** o dock lateral com itens grandes não cabe entre a barra superior e o rodapé da tela
- **THEN** a barra superior permanece livre, e os módulos que não cabem abrem pelo menu Mais, também pelo teclado

### Requirement: Módulos excedentes no botão Mais

Quando os módulos não couberem no eixo do dock, a casca SHALL manter o tamanho escolhido e mostrar os primeiros módulos que couberem, reservando a última posição para o botão Mais, com ícone de três pontos. O botão Mais SHALL aparecer também quando todos cabem e a conta tem módulos fora do dock: nesse caso, ele SHALL ficar depois dos módulos, antes do separador dos Ajustes.

O menu SHALL oferecer, nesta ordem, os módulos que não couberam e os que a conta tirou do dock, com os submenus deles e com navegação por teclado. O dock SHALL manter a barra superior livre e recalcular os módulos visíveis quando a área disponível mudar. A ampliação SHALL ficar suspensa enquanto houver módulos que não couberam, e SHALL continuar valendo quando o Mais só tem módulos tirados do dock.

#### Scenario: Dock sem espaço para todos os módulos
- **WHEN** não há espaço para todos os módulos do dock
- **THEN** o usuário pode abrir os módulos excedentes pelo menu Mais

#### Scenario: Mais com os módulos tirados
- **WHEN** a conta tirou Salas e Painéis do dock, e os outros módulos cabem
- **THEN** o dock mostra os outros módulos, o botão Mais, o separador e Ajustes; o Mais oferece Salas e Painéis, com os menus deles, e a ampliação continua valendo

#### Scenario: Excedentes e tirados juntos
- **WHEN** a conta tirou Painéis do dock, e o Cofre e a Administração não cabem na tela
- **THEN** o Mais oferece o Cofre, a Administração e, depois deles, os Painéis

### Requirement: Ordem dos módulos e módulos fora do dock

A conta SHALL poder escolher a ordem dos módulos no dock e tirar módulos dele. A ordem que vale SHALL ser:
1. os módulos disponíveis à conta, na ordem escolhida;
2. depois deles, os disponíveis que a escolha não traz, como um módulo que a organização ligou depois, na ordem de fábrica, no dock;
3. Ajustes, sempre no fim, depois do separador, fora da escolha.

Sem a escolha da conta, SHALL valer a dos padrões da organização e, sem ela, a ordem de fábrica. O módulo que a escolha traz e que a conta não vê, ou que a organização desligou, SHALL ficar de fora, e SHALL voltar ao lugar dele quando ficar disponível de novo.

O módulo tirado do dock SHALL continuar disponível no menu Mais, com os menus dele, na busca e pelos endereços. Tirar um módulo do dock SHALL NOT mudar o que a conta pode fazer nele. A ordem e os módulos tirados SHALL valer em qualquer aparelho em que a conta entrar, e uma mudança SHALL chegar às outras sessões da conta sem recarregar a página.

#### Scenario: Ordem escolhida
- **WHEN** Bruno sobe a Operação para antes dos Ativos
- **THEN** o dock dele mostra Início, Operação e Ativos, nessa ordem, no computador e no notebook, e o dock de Carla não muda

#### Scenario: Módulo tirado continua na busca
- **WHEN** Bruno tira as Salas do dock e digita "salas" na busca
- **THEN** a busca oferece o módulo Salas, e Enter o abre

#### Scenario: Módulo ligado depois
- **WHEN** Bruno já arrumou o dock, e a organização liga o módulo Painéis
- **THEN** os Painéis aparecem no dock de Bruno depois dos módulos que ele arrumou, antes dos Ajustes

#### Scenario: Módulo sem acesso na ordem
- **WHEN** a ordem de Bruno traz o Cofre em segundo, e ele perde o acesso ao Cofre
- **THEN** o dock não mostra o Cofre, e, com o acesso de volta, o Cofre aparece de novo em segundo

#### Scenario: Padrão da organização
- **WHEN** a organização define a Operação em primeiro nos padrões, e uma conta que nunca arrumou o dock entra
- **THEN** o dock dessa conta abre com a Operação em primeiro
