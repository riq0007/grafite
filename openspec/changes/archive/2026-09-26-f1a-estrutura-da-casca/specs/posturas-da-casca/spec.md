## Purpose

Adaptar a casca ao aparelho (computador, tablet ou celular) e mantê-la utilizável em todas as resoluções da matriz de teste da spec mestre, sem perder função entre as posturas.

## ADDED Requirements

### Requirement: Escolha da postura

A casca SHALL escolher a postura pelo ponteiro e pela largura da janela:
- **computador:** ponteiro fino (mouse ou trackpad) e largura de pelo menos 768 px;
- **tablet:** ponteiro de toque e largura de pelo menos 768 px;
- **celular:** largura abaixo de 768 px.

A postura SHALL mudar sem recarregar quando a janela muda de largura ou o aparelho gira, mantendo o módulo e a seção abertos.

#### Scenario: Janela estreitada
- **WHEN** a janela do computador é estreitada para 700 px
- **THEN** a casca passa à postura celular sem recarregar, no mesmo módulo

#### Scenario: Tablet girado
- **WHEN** um tablet em 1024×768 gira para 768×1024
- **THEN** a casca continua na postura tablet, no mesmo módulo

### Requirement: Postura computador

No computador, a casca SHALL mostrar a barra superior, o dock na posição escolhida e a janela de conteúdo. Abaixo de 1024 px de largura, a barra SHALL reunir os menus do módulo num único menu, com o nome do módulo, e os menus SHALL continuar utilizáveis.

#### Scenario: Computador com 900 px
- **WHEN** a janela do computador tem 900 px de largura
- **THEN** os menus do módulo saem da barra, ficam no menu com o nome do módulo e continuam utilizáveis

### Requirement: Postura tablet

No tablet, o dock SHALL ficar embaixo, qualquer que seja a posição salva, que continua valendo no computador. Todo alvo de toque da casca SHALL ter pelo menos 44 × 44 px. Os menus do dock e da barra SHALL abrir por toque, como popovers ancorados no item, e o dock SHALL NOT ampliar.

#### Scenario: Dock salvo à esquerda num tablet
- **WHEN** o dock está salvo à esquerda e a casca abre num tablet
- **THEN** o dock aparece embaixo, e a preferência salva continua à esquerda

#### Scenario: Alvos de toque no tablet
- **WHEN** a casca está na postura tablet
- **THEN** todo item do dock, da barra e dos menus tem pelo menos 44 × 44 px de área de toque

### Requirement: Postura celular

No celular, o dock SHALL dar lugar a uma barra de abas embaixo, com os módulos em ordem de prioridade: até cinco abas, ou quatro e "Mais" quando houver mais de cinco módulos. "Mais" SHALL listar os módulos restantes num painel que sobe de baixo. A barra superior SHALL mostrar o nome do módulo e o menu do usuário. Tocar no nome do módulo SHALL abrir a árvore de menus do módulo e os menus da barra num painel que sobe de baixo, com os submenus no próprio painel e um botão Voltar. Todo alvo de toque SHALL ter pelo menos 44 × 44 px.

#### Scenario: Sete módulos no celular
- **WHEN** há sete módulos disponíveis e a casca está no celular
- **THEN** a barra de abas mostra os quatro de maior prioridade e "Mais", que lista os outros três num painel que sobe de baixo

#### Scenario: Árvore de menus no celular
- **WHEN** o usuário toca no nome do módulo na barra superior
- **THEN** a árvore de menus do módulo abre num painel que sobe de baixo, e um submenu abre no próprio painel, com Voltar

### Requirement: Layout fluido

A margem lateral do conteúdo SHALL crescer com a largura da janela: 16 px mais 1% da largura, sem passar de 40 px, como a seção 7.8 da spec mestre define (`clamp(16px, 16px + 1vw, 40px)`). Formulários SHALL ter no máximo 960 px de largura, e tabelas SHALL ocupar a largura toda. Os componentes adaptáveis SHALL se arranjar pelo espaço do lugar onde estão, e não pela largura da janela.

#### Scenario: Formulário numa tela larga
- **WHEN** um formulário é aberto numa janela de 2560 px
- **THEN** ele não passa de 960 px de largura, e uma tabela na mesma janela ocupa a largura toda

#### Scenario: Margem no celular
- **WHEN** a janela tem 390 px de largura
- **THEN** a margem lateral do conteúdo é de 19,9 px (16 px mais 1% de 390 px)

#### Scenario: Margem numa tela larga
- **WHEN** a janela tem 2560 px de largura
- **THEN** a margem lateral do conteúdo para em 40 px

#### Scenario: Componente numa coluna estreita
- **WHEN** um componente adaptável, como a linha de campos, fica numa coluna de 320 px, numa janela de 1920 px
- **THEN** ele usa o arranjo estreito, como faria numa janela de 320 px

### Requirement: Matriz de resoluções

A casca SHALL ser verificada, com capturas de referência, nas resoluções da seção 7.8 da spec mestre: 1366×768, 1920×1080, 2560×1440, 3840×2160 com escala de 150%, 3440×1440, tablet em 1024×768 e celular em 390×844. Em repouso, em nenhuma delas a página SHALL ter rolagem horizontal, nem a barra, o dock e a janela SHALL se sobrepor.

#### Scenario: Sem rolagem horizontal
- **WHEN** a casca abre em qualquer resolução da matriz
- **THEN** a página não tem rolagem horizontal, e barra, dock e janela não se sobrepõem

#### Scenario: Regressão visual da casca
- **WHEN** uma mudança altera sem querer a casca em alguma resolução da matriz
- **THEN** a comparação com a captura de referência falha e mostra a diferença
