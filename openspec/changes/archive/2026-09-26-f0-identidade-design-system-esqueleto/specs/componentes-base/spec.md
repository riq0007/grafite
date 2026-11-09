## Purpose

Oferecer uma biblioteca de componentes base, acessíveis e completos em estados, que toda tela do Grafite reutiliza, com um catálogo navegável em todos os temas e densidades.

## ADDED Requirements

### Requirement: Conjunto de componentes base

A biblioteca SHALL oferecer os seguintes componentes:

- **ações:** botão (primário, secundário, terciário e destrutivo);
- **formulário:** campo de texto, área de texto, seleção, busca com sugestões, checkbox, rádio, interruptor, controle segmentado;
- **exibição:** rótulo de situação, miniatura de ativo, avatar, tecla de atalho;
- **camadas:** dica, popover, menu com submenu, diálogo, gaveta, aviso;
- **estrutura:** abas, tabela base, estado vazio, esqueleto de carregamento, barra de progresso.

#### Scenario: Tela nova
- **WHEN** uma tela precisa de um desses elementos
- **THEN** ela usa o componente da biblioteca, sem criar uma variação própria

### Requirement: Estados completos e foco visível

Cada componente interativo SHALL ter os estados padrão, hover, foco visível, pressionado e desabilitado. Quando aplicável, SHALL ter também os estados carregando e erro. O foco visível SHALL atingir contraste de pelo menos 3:1 nos seis temas.

#### Scenario: Navegação por teclado
- **WHEN** o usuário navega pela interface com Tab
- **THEN** cada componente focado mostra um indicador de foco visível em qualquer tema

#### Scenario: Botão carregando
- **WHEN** um botão dispara uma operação em andamento
- **THEN** ele indica o processamento, fica indisponível para novo acionamento e mantém a largura

### Requirement: Hierarquia de botões

Os botões SHALL ter quatro níveis visuais distintos: primário, secundário, terciário e destrutivo. O destrutivo SHALL ser diferenciado do primário por cor e texto. Nenhum botão SHALL ter forma de cápsula.

#### Scenario: Salvar e excluir na mesma tela
- **WHEN** as ações "Salvar" e "Excluir" aparecem juntas
- **THEN** elas têm aparências diferentes, e "Excluir" usa o estilo destrutivo

### Requirement: Formulários acessíveis

Todo campo de formulário SHALL:
- ter rótulo visível (o texto de exemplo não substitui o rótulo);
- indicar a obrigatoriedade de forma explícita;
- ligar a mensagem de erro ao campo de modo que leitores de tela a anunciem.

#### Scenario: Campo obrigatório vazio
- **WHEN** o usuário tenta enviar um formulário com um campo obrigatório vazio
- **THEN** o campo mostra a mensagem de erro em texto, o foco vai para ele e o leitor de tela anuncia o erro

### Requirement: Rótulo de situação legível sem cor

O rótulo de situação SHALL comunicar o estado por texto, e a cor e o ícone serão sempre complementos. SHALL ficar em uma única linha, sem quebra. SHALL oferecer as severidades Informação, Atenção e Crítico, e as situações neutra e de sucesso.

#### Scenario: Leitura sem percepção de cor
- **WHEN** a tela é vista por alguém que não distingue as cores
- **THEN** cada rótulo continua identificável pelo texto

#### Scenario: Coluna estreita
- **WHEN** um rótulo como "EM MANUTENÇÃO" não cabe na largura da coluna
- **THEN** o rótulo continua em uma única linha e a área rola horizontalmente, sem cortar o texto

### Requirement: Miniatura de ativo proporcional à densidade

A miniatura de ativo SHALL ser um quadrado do tamanho definido pela densidade. SHALL exibir a imagem do ativo, a do modelo ou a imagem genérica do tipo, nessa ordem de prioridade. A imagem SHALL ser contida sem distorção, sobre o fundo de miniatura do tema.

#### Scenario: Imagem retangular
- **WHEN** a imagem cadastrada é mais larga que alta
- **THEN** ela aparece inteira dentro do quadrado, centralizada e sem distorção

### Requirement: Menu com submenu e tolerância diagonal

O menu SHALL:
- abrir o submenu ao passar o mouse, depois de um atraso de intenção;
- manter o submenu aberto enquanto o ponteiro se desloca em direção a ele, dentro do triângulo de tolerância;
- aceitar teclado (setas, Enter e Esc);
- abrir por toque em telas de toque;
- usar o material translúcido, respeitando a transparência reduzida.

Os tempos exatos SHALL ser os do Apêndice B da spec mestre.

#### Scenario: Movimento diagonal até o submenu
- **WHEN** o usuário move o ponteiro na diagonal do item "Rede" até o submenu, passando sobre o item seguinte
- **THEN** o submenu de "Rede" permanece aberto até o ponteiro chegar a ele

#### Scenario: Navegação por teclado no menu
- **WHEN** o menu está aberto e o usuário pressiona seta para a direita sobre um item com submenu
- **THEN** o submenu abre com o foco no primeiro item, e Esc volta ao item de origem

### Requirement: Camadas com foco controlado

Diálogo e gaveta SHALL prender o foco enquanto estiverem abertos, SHALL fechar com Esc e SHALL devolver o foco ao elemento que os abriu.

#### Scenario: Fechamento de um diálogo
- **WHEN** o usuário fecha um diálogo com Esc
- **THEN** o foco volta para o botão que abriu o diálogo

### Requirement: Aviso persistente ou temporário

O componente de aviso SHALL oferecer os modos temporário e persistente:
- **temporário:** some depois do tempo definido e pausa a contagem enquanto o ponteiro está sobre ele;
- **persistente:** é usado para o nível Crítico e só sai por ação do usuário.

#### Scenario: Aviso crítico
- **WHEN** um aviso de nível Crítico é exibido
- **THEN** ele permanece na tela até o usuário reconhecer, adiar ou fechar

#### Scenario: Pausa no hover
- **WHEN** o ponteiro fica sobre um aviso temporário
- **THEN** a contagem para sumir fica pausada até o ponteiro sair

### Requirement: Tabela base

A tabela base SHALL ter:
- cabeçalho fixo durante a rolagem;
- linhas demarcadas e alternadas;
- miniatura opcional no início da linha;
- indicação visual da ordenação aplicada;
- estado vazio padronizado.

#### Scenario: Tabela sem registros
- **WHEN** a tabela não tem linhas para exibir
- **THEN** mostra o estado vazio com uma mensagem objetiva e, quando houver, uma ação relevante

### Requirement: Catálogo navegável e verificado

Todos os componentes base SHALL estar num catálogo navegável que permite ver cada componente em cada um dos seis temas e das três densidades. O catálogo SHALL ser verificado automaticamente:
- sem violações de acessibilidade de impacto sério ou crítico;
- com capturas em três larguras (1366, 1920 e 2560 px), usadas como referência para detectar regressões visuais.

#### Scenario: Regressão visual
- **WHEN** uma mudança altera sem querer a aparência de um componente
- **THEN** a comparação com a captura de referência falha e mostra a diferença

#### Scenario: Violação de acessibilidade
- **WHEN** um componente perde o nome acessível
- **THEN** a verificação do catálogo falha e indica o componente
