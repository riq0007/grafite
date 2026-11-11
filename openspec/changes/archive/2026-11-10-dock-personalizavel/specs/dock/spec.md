## MODIFIED Requirements

### Requirement: Itens do dock

O dock SHALL mostrar um item por módulo disponível que a conta não tirou do dock, na ordem que vale para ela (requisito "Ordem dos módulos e módulos fora do dock"), com o ícone e o nome acessível do módulo. Cada item SHALL ter uma placa leve, com o ícone no texto do tema. Um ponto e a borda da placa SHALL marcar o módulo atual, que o leitor de tela SHALL anunciar como atual. Um separador SHALL isolar Ajustes, sempre no fim. Um item sem menu SHALL mostrar o nome do módulo numa dica, ao parar o ponteiro ou receber o foco; num item com menu, o nome SHALL aparecer no topo do menu. O dock SHALL usar o material translúcido das camadas sobrepostas, com superfície sólida na transparência reduzida.

#### Scenario: Módulo atual
- **WHEN** o usuário está em Ajustes
- **THEN** o item Ajustes mostra o ponto de módulo atual e a borda da placa, e o leitor de tela o anuncia como atual

#### Scenario: Transparência reduzida
- **WHEN** o usuário escolhe reduzir a transparência
- **THEN** o dock passa a ter superfície sólida, sem desfoque

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

## ADDED Requirements

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
