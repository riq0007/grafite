# componentes-base Specification

## Purpose

Oferecer uma biblioteca de componentes base, acessíveis e completos em estados, que toda tela do Grafite reutiliza, com um catálogo navegável em todos os temas e densidades.

## Requirements

### Requirement: Conjunto de componentes base

A biblioteca SHALL oferecer os seguintes componentes:

- **ações:** botão (primário, secundário, terciário e destrutivo);
- **formulário:** campo de texto, área de texto, campo de data, seleção, busca com sugestões, checkbox, rádio, interruptor, controle segmentado, controle deslizante, linha de campos, escolha de imagem;
- **exibição:** rótulo de situação, miniatura de ativo, avatar, tecla de atalho, código QR, texto para copiar, etiqueta do ativo, indicador com meta;
- **camadas:** dica, popover, menu com submenu, menu de contexto, diálogo, gaveta, aviso, prévia do registro (Quick Look), resumo da linha;
- **estrutura:** abas, tabela base, árvore, filtros ativos, estado vazio, esqueleto de carregamento, barra de progresso;
- **tabela configurável:** painel de colunas, escolha da visão, editor de filtro.

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

O rótulo de situação SHALL comunicar o estado por texto, e a cor e o ícone serão sempre complementos. SHALL ficar em uma única linha, sem quebra. SHALL oferecer as severidades Informação, Atenção e Crítico, e as situações neutra e de sucesso. O rótulo SHALL ser um selo:
- o texto em maiúsculas, no tamanho da legenda;
- o fundo sutil da situação;
- a borda da situação.

O neutro SHALL usar a linha forte como borda.

#### Scenario: Leitura sem percepção de cor
- **WHEN** a tela é vista por alguém que não distingue as cores
- **THEN** cada rótulo continua identificável pelo texto

#### Scenario: Coluna estreita
- **WHEN** um rótulo como "EM MANUTENÇÃO" não cabe na largura da coluna
- **THEN** o rótulo continua em uma única linha e a área rola horizontalmente, sem cortar o texto

#### Scenario: Selo de atenção
- **WHEN** o rótulo "Em manutenção" aparece com a situação atenção
- **THEN** ele tem o fundo sutil e a borda da atenção, com o texto em maiúsculas

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
- **persistente:** é usado no nível Crítico e nos avisos que pedem uma decisão, de qualquer severidade, como uma versão nova da aplicação. Só sai por ação do usuário.

Além de "Abrir", "Reconhecer" e "Adiar", o aviso SHALL poder oferecer uma ação com nome próprio, como "Atualizar", e "Fechar" SHALL continuar sempre à vista.

#### Scenario: Aviso crítico
- **WHEN** um aviso de nível Crítico é exibido
- **THEN** ele permanece na tela até o usuário reconhecer, adiar ou fechar

#### Scenario: Pausa no hover
- **WHEN** o ponteiro fica sobre um aviso temporário
- **THEN** a contagem para sumir fica pausada até o ponteiro sair

#### Scenario: Aviso persistente de Informação
- **WHEN** um aviso de Informação é exibido como persistente
- **THEN** ele permanece na tela, qualquer que seja o tempo escolhido, até o usuário agir ou fechar

#### Scenario: Ação com nome próprio
- **WHEN** um aviso oferece a ação "Atualizar" e o usuário a escolhe
- **THEN** a ação acontece, e o aviso sai da tela

### Requirement: No máximo três avisos na tela

A região de avisos SHALL mostrar no máximo três avisos ao mesmo tempo, o mais novo em cima. Quando chega um aviso e já há três na tela, o temporário mais antigo SHALL sair da tela para dar lugar a ele.

Um aviso persistente, crítico ou de outra severidade, SHALL NOT sair da tela por causa de outro aviso. Se os três avisos na tela forem persistentes, o que chega SHALL esperar a sua vez e aparecer quando um deles sair. Só então SHALL começar a contar o seu tempo.

#### Scenario: Quarto aviso
- **WHEN** há três avisos temporários na tela e chega um quarto
- **THEN** o quarto aparece em cima, e o mais antigo sai da tela

#### Scenario: Crítico entre temporários
- **WHEN** há na tela um aviso crítico e dois temporários, e chegam mais dois avisos
- **THEN** o crítico continua na tela, e os dois temporários mais antigos saem

#### Scenario: Persistente de Informação entre temporários
- **WHEN** há na tela o aviso "Nova versão do Grafite" e dois temporários, e chegam mais dois avisos
- **THEN** o aviso da versão nova continua na tela, e os dois temporários mais antigos saem

#### Scenario: Três críticos na tela
- **WHEN** há três avisos críticos na tela e chega um aviso de Atenção
- **THEN** o aviso de Atenção espera, aparece quando um crítico sai e só então começa a contar o seu tempo

### Requirement: Tabela base

A tabela base SHALL ter:
- cabeçalho fixo durante a rolagem;
- linhas demarcadas e, se o usuário não as desligou, alternadas;
- miniatura opcional no início da linha, que sai de todas as tabelas quando o usuário desliga as miniaturas;
- indicação visual da ordenação aplicada;
- estado vazio padronizado;
- a linha em foco marcada, com as setas movendo o foco entre as linhas.

Quando a tela oferece abrir o registro, o clique na linha, fora dos controles dela e sem Ctrl nem Shift, e Enter na linha em foco SHALL abrir o registro. Quando a tela oferece a prévia, a barra de espaço na linha em foco SHALL abri-la, também com linhas selecionadas.

Quando a lista é paginada, a tabela SHALL terminar com "Carregar mais", enquanto houver mais registros. Durante a carga, o botão SHALL mostrar o carregando e não aceitar um segundo pedido. As linhas novas SHALL entrar ao fim, com o foco do teclado mantido. A tabela que desenha só as linhas perto da área visível SHALL trazer a página seguinte sozinha, no lugar do botão (spec tabelas-configuraveis).

#### Scenario: Tabela sem registros
- **WHEN** a tabela não tem linhas para exibir
- **THEN** mostra o estado vazio com uma mensagem objetiva e, quando houver, uma ação relevante

#### Scenario: Enter na linha
- **WHEN** o foco está numa linha de uma tabela que abre o registro e o usuário pressiona Enter
- **THEN** o registro daquela linha abre

#### Scenario: Controle dentro da linha
- **WHEN** o usuário clica num botão dentro de uma linha que abre o registro
- **THEN** só a ação do botão acontece, e o registro não abre

#### Scenario: Miniaturas desligadas
- **WHEN** o usuário desligou as miniaturas e abre uma tela com uma tabela que tem miniaturas
- **THEN** a tabela aparece sem a coluna da miniatura, com as demais colunas iguais

#### Scenario: Carregar mais
- **WHEN** a tabela mostra 50 de 120 pessoas e o usuário escolhe "Carregar mais"
- **THEN** as próximas 50 entram ao fim da tabela, e "Carregar mais" continua até a última

#### Scenario: Espaço com seleção
- **WHEN** há duas linhas selecionadas numa tabela com prévia, e o usuário pressiona espaço
- **THEN** a prévia abre, e a seleção continua a mesma

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

### Requirement: Controle deslizante

O controle deslizante SHALL mostrar o rótulo e o valor atual com a unidade, como "48 px", "95%" ou "265°". O valor SHALL mudar por arraste, clique na trilha, toque e teclado. As setas SHALL mudar o valor em um passo, e Home e End SHALL levá-lo ao mínimo e ao máximo. O valor SHALL ficar sempre dentro do intervalo, e o leitor de tela SHALL anunciar o valor com a unidade.

Quem usa o controle SHALL poder dar o texto do valor, como "HB · 45", e o texto que o leitor de tela anuncia, e SHALL poder pintar a trilha, como com as matizes.

#### Scenario: Seta para a direita
- **WHEN** o foco está num controle em 48 px, com passo de 1 px, e o usuário pressiona seta para a direita
- **THEN** o valor passa a 49 px, e o texto mostra "49 px"

#### Scenario: Limite do intervalo
- **WHEN** o controle está no máximo e o usuário pressiona seta para a direita
- **THEN** o valor continua no máximo

#### Scenario: Texto do valor dado por quem usa
- **WHEN** um controle de 0 a 100 dá o texto "HB · 45" ao valor 45, e "HB, 45 de 100" ao leitor de tela
- **THEN** o controle mostra "HB · 45", e o leitor de tela anuncia "HB, 45 de 100"

### Requirement: Linha de campos

A linha de campos SHALL pôr os campos lado a lado, em colunas da mesma largura, quando o lugar onde ela está tem pelo menos 480 px de largura, e um abaixo do outro quando tem menos. O arranjo SHALL depender da largura que a linha recebe (janela, painel ou coluna), e não da largura da janela do navegador.

#### Scenario: Linha num formulário largo
- **WHEN** uma linha com dois campos fica num formulário de 960 px
- **THEN** os dois campos ficam lado a lado, com a mesma largura

#### Scenario: Linha numa gaveta
- **WHEN** a mesma linha fica numa gaveta, numa tela de 1920 px
- **THEN** os campos ficam um abaixo do outro

### Requirement: Código QR legível em qualquer tema

O código QR SHALL ter módulos escuros sobre fundo claro em todos os temas, com a margem branca de 4 módulos em volta. Ele SHALL ser desenhado como vetor, nítido em qualquer escala. O código SHALL ter um nome acessível que diz o que ele contém, e a mesma informação SHALL estar disponível em texto perto dele.

#### Scenario: QR code no tema OLED
- **WHEN** o código QR aparece no tema OLED
- **THEN** os módulos são escuros sobre fundo branco, com a margem em volta, e um app de câmera o lê

#### Scenario: QR code no leitor de tela
- **WHEN** o leitor de tela chega ao código QR do cadastro dos dois passos
- **THEN** ele anuncia "QR code para o app autenticador", e a chave em texto está logo ao lado

### Requirement: Árvore navegável pelo teclado

A árvore SHALL mostrar itens aninhados, cada um com ícone, rótulo e, se houver, um detalhe e um rótulo de situação. Ela SHALL:
- expandir e recolher pelo clique no indicador e pelas setas para a direita e para a esquerda;
- mover o foco pelas setas para cima e para baixo;
- escolher um item com Enter ou com o clique;
- anunciar ao leitor de tela o nível, a posição e se o item está expandido.

#### Scenario: Expandir pelo teclado
- **WHEN** o foco está em "Jundiaí", recolhido, e o usuário pressiona a seta para a direita
- **THEN** "Jundiaí" se expande e mostra os locais de dentro, e o foco continua nele

### Requirement: Campo de data em pt-BR

O campo de data SHALL mostrar e aceitar a data no formato dd/mm/aaaa, com cada parte editável pelo teclado. Ele SHALL ter rótulo, descrição e erro como os outros campos, e SHALL recusar uma data inexistente.

#### Scenario: Digitar uma data
- **WHEN** o usuário digita 01102026 no campo de data
- **THEN** o campo mostra 01/10/2026, e o valor é 1º de outubro de 2026

### Requirement: Filtros ativos à vista

Os filtros ativos de uma lista SHALL aparecer como uma linha de rótulos, cada um com o nome do filtro, o operador, quando há mais de um possível, e o valor, e um botão para limpá-lo. Com algum filtro ativo, a linha SHALL ter "Limpar filtros". Cada botão de limpar SHALL ter um nome acessível que diz qual filtro ele limpa.

Numa tabela configurável, clicar num rótulo SHALL abrir o editor daquele filtro preso a ele, e, com o foco no rótulo, Enter SHALL abrir o editor e Backspace SHALL limpar o filtro.

#### Scenario: Limpar um filtro
- **WHEN** a lista está filtrada por "Situação: Inativas" e "Local: Jundiaí" e o usuário limpa o local
- **THEN** só "Situação: Inativas" continua, e a lista se atualiza

#### Scenario: Editar no lugar
- **WHEN** a tabela tem o filtro "Hostname · contém · almox", e o usuário clica nele
- **THEN** o editor do filtro do Hostname abre preso ao rótulo, com "almox" no campo

### Requirement: Texto para copiar

O texto para copiar SHALL mostrar um valor em fonte monoespaçada, com o botão "Copiar". Depois de copiar, o botão SHALL dizer "Copiado", por texto e não só por ícone.

#### Scenario: Copiar uma senha temporária
- **WHEN** o usuário escolhe "Copiar" ao lado da senha temporária
- **THEN** a senha vai para a área de transferência, e o botão diz "Copiado"

### Requirement: Avatar com foto

O avatar SHALL ter três tamanhos:
- o da barra e dos menus;
- o das linhas das tabelas, que segue a densidade como a miniatura;
- o do título das fichas.

Com uma foto, o avatar SHALL mostrá-la recortada no círculo, sem distorcer. Ele SHALL pedir a miniatura com resolução suficiente para o tamanho e a densidade de pixels da tela, sem baixar uma maior que o necessário.

Sem foto, ou quando a foto não carrega, o avatar SHALL mostrar as iniciais do nome. O nome SHALL continuar sendo o nome acessível do avatar, com ou sem foto.

#### Scenario: Foto numa tela de alta densidade
- **WHEN** o avatar do título da ficha aparece numa tela com o dobro de densidade de pixels
- **THEN** ele mostra a miniatura com o dobro da resolução do tamanho dele, e não a maior de todas

#### Scenario: Foto que não carrega
- **WHEN** a foto de "Ana Souza" não carrega
- **THEN** o avatar mostra "AS", e o nome acessível continua "Ana Souza"

### Requirement: Escolha de imagem

A escolha de imagem SHALL mostrar a imagem atual, ou um estado vazio quando não há imagem, e oferecer:
- "Escolher imagem", que abre a escolha de arquivos já filtrada pelos formatos aceitos e, no celular, oferece também a câmera;
- no computador, também arrastar um arquivo para a área da imagem;
- "Remover imagem", com confirmação, quando há imagem.

Durante o envio, a escolha SHALL mostrar "Enviando…" e a barra de progresso, e não aceitar outra escolha. Uma recusa SHALL aparecer junto da escolha, com a mensagem da API, e a imagem anterior SHALL continuar. Tudo SHALL funcionar pelo teclado.

#### Scenario: Enviar uma imagem
- **WHEN** o usuário escolhe uma imagem PNG
- **THEN** a escolha mostra "Enviando…" com o progresso, e depois a imagem nova

#### Scenario: Formato recusado
- **WHEN** o usuário arrasta um GIF para a área da imagem
- **THEN** a escolha mostra "Formato não aceito. Envie uma imagem PNG, JPG, WebP, AVIF ou SVG.", e a imagem anterior continua

#### Scenario: Remover pelo teclado
- **WHEN** o usuário chega a "Remover imagem" com Tab, pressiona Enter e confirma
- **THEN** a imagem é removida, e o foco vai para "Escolher imagem"

### Requirement: Menu de contexto

O menu de contexto SHALL abrir junto do ponteiro, ou do elemento em foco quando aberto pelo teclado, com o mesmo material, os mesmos itens com submenu e o mesmo teclado do menu com submenu. Ele SHALL fechar com Esc, com o clique fora dele e com a escolha de um item, e SHALL devolver o foco ao elemento de onde foi aberto.

#### Scenario: Fechar com Esc
- **WHEN** o menu de contexto está aberto sobre uma linha e o usuário pressiona Esc
- **THEN** o menu fecha, e o foco volta à linha

### Requirement: Escolha da visão e editor de filtro

A escolha da visão SHALL mostrar o nome da visão aberta e, quando a conta tem mudanças guardadas sobre ela, "Personalizada" em texto, ou "Do link" quando a tabela veio de um endereço com mudanças, e abrir o menu das visões com os grupos e as ações (spec visoes-de-tabela). O editor de filtro SHALL mostrar a coluna, o operador e os campos do valor conforme o tipo do filtro, com "Aplicar filtro" e, num filtro que já existe, "Tirar filtro", e as recusas no próprio campo.

#### Scenario: Visão alterada à vista
- **WHEN** a conta tem mudanças guardadas sobre a visão "Impressoras"
- **THEN** a escolha da visão mostra "Impressoras" e "Personalizada" em texto, e não só por um ponto ou por uma cor

#### Scenario: Tabela de um link
- **WHEN** a tabela abre por um endereço com mudanças sobre "Impressoras"
- **THEN** a escolha da visão mostra "Impressoras" e "Do link" em texto

### Requirement: Etiqueta do ativo em preto sobre branco

A etiqueta do ativo SHALL ter texto preto sobre fundo branco em todos os temas, com as cores fixas dos tokens, como o código QR, porque sai no papel. Ela SHALL ter as medidas em milímetros, em dois tamanhos: 63,5 × 38,1 mm e 50 × 30 mm, com o QR code à esquerda e o texto à direita, sem passar das bordas. O QR code SHALL ter um nome acessível que diz que ele abre a ficha do ativo, e o patrimônio e o nome SHALL estar em texto ao lado dele.

#### Scenario: Etiqueta no tema OLED
- **WHEN** a etiqueta aparece na tela com o tema OLED
- **THEN** ela tem o texto preto sobre o fundo branco, como no papel

#### Scenario: Nome longo
- **WHEN** o nome do ativo não cabe em duas linhas da etiqueta de 50 × 30 mm
- **THEN** o nome é cortado no fim da segunda linha, com reticências, e nada passa da borda

### Requirement: Escolha com as opções à vista

A busca com sugestões SHALL abrir a lista ao clicar no campo, ao focá-lo pelo teclado com Alt+↓ ou seta para baixo, e pelo botão de abrir ao lado dele, antes de qualquer tecla. Ela SHALL NOT abrir vazia:
- com as opções na memória, ela SHALL mostrar todas, com as sugeridas pelo contexto primeiro, numa seção "Sugeridos", e as outras depois, em ordem alfabética do português;
- com as opções vindas da API, ela SHALL mostrar as sugestões do contexto e as primeiras em ordem alfabética, e, quando houver mais, o rodapé "Digite para buscar entre N" com o total.

Digitar SHALL filtrar a lista sem diferenciar acento e maiúsculas, como hoje. A origem de uma sugestão SHALL estar escrita, como "Sugerido: local de trabalho de Bruno". A escolha SHALL continuar acessível pelo teclado: setas, Home e End, Enter para escolher e Esc para fechar sem mudar o valor.

#### Scenario: Ver antes de digitar
- **WHEN** alguém clica no campo do fuso horário em Ajustes
- **THEN** a lista abre com "Seguir o sistema" e os fusos do Brasil em "Sugeridos", seguidos dos outros fusos

#### Scenario: Opções que vêm da API
- **WHEN** alguém abre a escolha do responsável de um ativo, numa organização com 300 pessoas, sem digitar
- **THEN** a lista mostra as primeiras pessoas em ordem alfabética e o rodapé "Digite para buscar entre 300"

#### Scenario: Fechar sem mudar
- **WHEN** alguém abre a lista, desce até outra opção pelas setas e aperta Esc
- **THEN** a lista fecha, e o valor escolhido continua o mesmo

### Requirement: Escolha de local em árvore

A escolha de um local SHALL mostrar, no painel que abre ao clicar, a árvore dos locais ativos com o ícone e o tipo de cada um, os ramos expansíveis pelo mouse e pelo teclado, e um campo para filtrar sem diferenciar acento e maiúsculas. O filtro SHALL mostrar os locais que casam com o caminho completo deles, como "Jundiaí › Expedição". Quando a tela dá um local provável, ele SHALL aparecer no topo, com a origem em texto. O local escolhido SHALL aparecer pelo caminho completo no campo.

#### Scenario: Escolher pela árvore
- **WHEN** alguém abre a escolha do local de trabalho e expande "Jundiaí"
- **THEN** o painel mostra os locais de dentro de "Jundiaí", e escolher "Expedição" põe "Jundiaí › Expedição" no campo

#### Scenario: Filtrar pelo nome
- **WHEN** alguém digita "expedicao" no filtro do painel
- **THEN** o painel mostra "Jundiaí › Expedição" e os outros locais com esse nome no caminho

#### Scenario: Local sugerido
- **WHEN** a tela de atribuição de perfil abre a escolha do local para Bruno, que trabalha em "Jundiaí › Expedição"
- **THEN** o topo do painel mostra "Jundiaí › Expedição" com "Sugerido: local de trabalho de Bruno"

### Requirement: Referência com cartão

Uma referência a um registro SHALL ser um link para a ficha dele, com o nome em texto. Ao parar o ponteiro 500 ms sobre ela, ou com o foco nela e a seta para baixo, SHALL abrir um cartão na camada flutuante com o resumo do registro e até quatro ações, como "Abrir" e "Ver ativos". O cartão SHALL ficar aberto enquanto o ponteiro estiver sobre a referência ou sobre ele, e SHALL fechar com Esc, devolvendo o foco à referência.

Nada essencial SHALL existir só no cartão: o que ele mostra também está na ficha do registro. No toque, o toque SHALL abrir a ficha, sem cartão. Uma pessoa anonimizada e um registro fora do acesso de quem vê SHALL continuar só como texto, sem link nem cartão. O cartão SHALL abrir com a troca de opacidade, sem crescer, e sem movimento quando o movimento é reduzido.

#### Scenario: Cartão de uma pessoa
- **WHEN** o usuário para o ponteiro 500 ms sobre "Ana Souza" na coluna Responsável
- **THEN** abre o cartão com a foto, o local de trabalho, "3 ativos sob responsabilidade", "Abrir" e "Ver ativos"

#### Scenario: Pelo teclado
- **WHEN** o foco está na referência "Jundiaí › Expedição" e o usuário aperta a seta para baixo
- **THEN** abre o cartão do local, e Esc o fecha com o foco de volta na referência

#### Scenario: Fora do acesso
- **WHEN** a ficha mostra um ativo ligado fora do acesso de quem vê
- **THEN** ele aparece como "Ativo fora do seu acesso", em texto, sem link nem cartão

### Requirement: Indicador com meta e decisão

O indicador SHALL mostrar o nome, uma linha com o que ele mede, o valor com a unidade em algarismos tabulares, o valor do período anterior, a meta e a situação no rótulo de situação: "Dentro da meta", de sucesso, "Fora da meta", de Atenção, ou "Sem dado", neutra. Fora da meta, SHALL mostrar a decisão que o indicador pede, em texto. Sem valor, SHALL mostrar o motivo em texto no lugar do número, e nunca um zero. O detalhe, como a lista do que passou da meta, e a ação, como mudar a meta, SHALL vir de quem usa o indicador.

#### Scenario: Indicador sem dado
- **WHEN** um indicador não tem valor no período
- **THEN** ele mostra o motivo, como "Nenhum toner trocado nos últimos 30 dias.", e "Sem dado", sem nenhum número

#### Scenario: Fora da meta sem cor
- **WHEN** um indicador fora da meta é visto por alguém que não distingue as cores
- **THEN** ele lê "Fora da meta" e a decisão em texto

### Requirement: Barra de abas da janela

A biblioteca SHALL oferecer a barra de abas da janela, que mostra as abas abertas, com a da frente marcada. Cada aba SHALL ter o título e, menos a primeira, um botão de fechar com o nome acessível "Fechar <título>".

A barra SHALL seguir estas regras:
- a aba da frente SHALL ser indicada pela forma e pelo texto lido pelo leitor de tela, e não só pela cor;
- o teclado SHALL andar entre as abas pelas setas e por Home e End, e Enter ou espaço SHALL trazer a aba escolhida para a frente;
- o leitor de tela SHALL anunciar a lista de abas, a posição de cada uma e qual está na frente;
- com mais abas do que cabem, a barra SHALL rolar na horizontal, e a aba da frente SHALL ficar à vista;
- no toque, cada aba e cada botão de fechar SHALL ter alvo de pelo menos 44 px;
- abrir uma aba SHALL animar a entrada dela em no máximo 300 ms, e, com movimento reduzido, a aba SHALL aparecer sem animação; fechar SHALL tirar a aba na hora, sem animação.

#### Scenario: Aba da frente pelo teclado
- **WHEN** o foco está na barra com as abas "Novo ativo" e "Novo local", e o usuário pressiona a seta para a esquerda e Enter
- **THEN** "Novo ativo" vai para a frente, e o leitor de tela anuncia que ela está selecionada, a primeira de duas

#### Scenario: Fechar pelo botão
- **WHEN** o usuário escolhe "Fechar Novo local"
- **THEN** a barra avisa quem a usa de que a aba "Novo local" pediu para fechar, e a primeira aba não tem botão de fechar

### Requirement: Link de cadastro do campo

A biblioteca SHALL oferecer o link de cadastro que fica embaixo de um campo, com o texto do que ele cria, como "Cadastrar novo local", precedido de um ícone de mais. O link SHALL ficar ligado ao campo, de modo que o leitor de tela o anuncie junto dele, e SHALL ser alcançável pelo teclado logo depois do campo. Com o campo desabilitado ou só para leitura, o link SHALL NOT aparecer.

#### Scenario: Link anunciado com o campo
- **WHEN** o foco sai do campo Local para o link embaixo dele
- **THEN** o leitor de tela anuncia "Cadastrar novo local" e que ele é do campo Local

#### Scenario: Campo só para leitura
- **WHEN** o campo Local aparece só para leitura
- **THEN** o link "Cadastrar novo local" não aparece embaixo dele

### Requirement: Etapas de um formulário

A biblioteca SHALL oferecer a lista das etapas de um formulário longo, empilhadas na vertical, cada uma com o número, o nome e a situação dela em texto, como "Falta: IP" ou "Preenchida". Sem a numeração, como nos cartões dos grupos de uma ficha, cada item SHALL mostrar o nome e o resumo, e o item aberto SHALL ser anunciado como o atual da lista, e não como uma etapa.

A lista SHALL seguir estas regras:
- a etapa atual SHALL ser marcada pela forma e anunciada pelo leitor de tela como a etapa atual, e não só pela cor;
- a lista SHALL funcionar pelo mouse, pelo teclado e pelo toque: o Tab chega a ela, as setas andam entre as etapas, e o Enter ou o espaço abre a escolhida;
- uma etapa sem a escolha, como a que depende de outra que falta, SHALL aparecer apagada, com o motivo em texto, e SHALL NOT abrir;
- no toque, cada etapa SHALL ter alvo de pelo menos 44 px;
- na largura do celular, a lista SHALL virar uma faixa horizontal que rola, com a etapa atual à vista;
- fora da faixa do celular, a lista SHALL continuar à vista enquanto o painel da etapa rola dentro da janela, abaixo da faixa esmaecida da borda de cima (spec estrutura-da-casca, "Janela de conteúdo"), sem esmaecer.

#### Scenario: Etapa atual anunciada
- **WHEN** o foco chega à etapa "3 · Identificação", que é a atual
- **THEN** o leitor de tela anuncia o nome, a situação dela e que ela é a etapa atual

#### Scenario: Etapa pelo teclado
- **WHEN** o foco está na etapa 2, e o usuário pressiona a seta para baixo e o Enter
- **THEN** a etapa 3 abre e passa a ser a atual

#### Scenario: Etapa sem a escolha
- **WHEN** uma etapa depende de outra que ainda falta
- **THEN** ela aparece apagada, com o motivo em texto, e o clique e o Enter não a abrem

#### Scenario: Cartões sem a numeração
- **WHEN** o foco chega ao cartão "Uso" de uma ficha, que está aberto
- **THEN** o leitor de tela anuncia "Uso", sem número, o resumo dele e que ele é o atual da lista

#### Scenario: Lista à vista com o painel rolado
- **WHEN** o painel da etapa é mais alto que a janela, a lista cabe nela, e a pessoa rola o painel até o fim
- **THEN** a lista das etapas continua à vista, inteira e nítida, abaixo da faixa esmaecida

### Requirement: Tabela na largura toda

A tabela SHALL ocupar a largura da área em que está. Na tabela redimensionável:
- a coluna sem largura guardada SHALL dividir com as outras o espaço que sobra;
- a coluna principal SHALL ficar com o dobro;
- a coluna que declara a largura que o conteúdo dela pede, como as da coleta dos ativos, SHALL NOT ficar mais estreita que essa largura na divisão, e a tabela SHALL rolar de lado quando as larguras passam da área;
- a largura que a conta arrasta SHALL continuar guardada, e com ela a coluna SHALL poder ficar mais estreita que o conteúdo pede.

A linha que abre um registro SHALL mudar de fundo ao passar o ponteiro, sem outra animação.

#### Scenario: Tabela com quatro colunas
- **WHEN** a tabela dos ativos mostra só quatro colunas numa janela de 1.400 px
- **THEN** as colunas dividem a largura toda, com a do nome maior que as outras

#### Scenario: Coluna que pede mais que a divisão
- **WHEN** a tabela dos ativos mostra dez colunas sem largura guardada numa janela de 1.280 px, entre elas a "Disponibilidade"
- **THEN** a "Disponibilidade" fica com a largura que o conteúdo dela pede, as outras ficam com a parte delas na divisão, e a tabela rola de lado

#### Scenario: Coluna estreitada pela conta
- **WHEN** a conta arrasta a "Disponibilidade" até 64 px
- **THEN** a coluna fica com 64 px, e o conteúdo dela termina cortado, numa linha só

### Requirement: Ação principal da tela em destaque

O cabeçalho de cada tela SHALL trazer a ação principal no grupo das ações, à direita do título (requisito "Cabeçalho da página"):
- a ação principal SHALL vir primeiro no grupo, no nível primário, na altura dos outros botões;
- as outras ações SHALL vir depois dela;
- uma linha SHALL separar o cabeçalho do conteúdo.

Cada tela SHALL ter no máximo uma ação no nível primário à vista, fora dos diálogos e das gavetas. O estado vazio que repete a ação do cabeçalho SHALL oferecê-la no nível secundário.

#### Scenario: Lista das solicitações
- **WHEN** a técnica abre a lista das solicitações
- **THEN** "Nova solicitação" aparece à direita do título, no nível primário, e é a única ação primária da tela

#### Scenario: Lista vazia
- **WHEN** a lista dos modelos não tem nenhum modelo
- **THEN** o estado vazio oferece "Novo modelo" no nível secundário, e o "Novo modelo" do cabeçalho continua a única ação primária

### Requirement: Acabamento de prancheta dos componentes base

Os componentes base SHALL seguir o acabamento da linguagem visual v3:
- **o campo de entrada:** é um poço, com o fundo na superfície afundada e a borda de controle;
- **o botão secundário:** usa a linha forte como borda;
- **o botão destrutivo:** usa a borda da situação crítica;
- **o cabeçalho da tabela:** vem em legenda, em maiúsculas e no texto secundário;
- **a linha selecionada da tabela:** tem a marca lateral de 2 px no destaque, além do fundo.

#### Scenario: Linha selecionada com o destaque Grafite
- **WHEN** uma linha da tabela é selecionada com o destaque Grafite
- **THEN** ela mostra a marca lateral no destaque, além do fundo, e o texto continua com o contraste do tema

### Requirement: Carimbo de seção

O catálogo SHALL ter o carimbo de seção:
- um título de seção, com o nível de título pedido (2 por padrão);
- o texto em legenda e em maiúsculas;
- a linha fina que segue até a borda.

Os títulos dos blocos dos painéis da ficha do ativo SHALL ter o mesmo desenho.

#### Scenario: Título lido pelo leitor de tela
- **WHEN** a tela mostra o carimbo "Suprimentos"
- **THEN** o leitor de tela o anuncia como título de nível 2, com o texto "Suprimentos"

### Requirement: Espécie da coluna da tabela

Cada coluna da tabela base SHALL poder declarar a espécie do que mostra: texto, número, código, data, situação ou ações. A célula SHALL seguir a espécie da coluna dela, sem declarar de novo:
- **número:** o cabeçalho e o valor à direita, na fonte mono, com algarismos tabulares;
- **código:** o valor na fonte mono;
- **data:** o valor numa linha só, com algarismos tabulares;
- **ações:** o cabeçalho "Ações" e os botões à direita, lado a lado, numa linha só.

O texto é a espécie de fábrica. A célula SHALL poder trocar o alinhamento e a fonte só dela.

#### Scenario: Número alinhado
- **WHEN** a tabela do estoque mostra a coluna Saldo, da espécie número, com o saldo 2
- **THEN** o cabeçalho "Saldo" e o valor "2" ficam à direita, e o 2 vem na mono

#### Scenario: Ações numa linha
- **WHEN** um alerta aberto tem "Reconhecer" e "Adiar" na coluna Ações
- **THEN** os dois botões ficam lado a lado, e a linha tem a mesma altura das linhas sem botão

### Requirement: Situação, tempo e contagem nas tabelas

Nas tabelas do app:
- toda coluna Situação SHALL mostrar o rótulo de situação;
- o tempo desde um momento SHALL ter uma escrita só: "Agora", "Há 32 min", "Há 1 h" e "Há 2 d";
- cada lista SHALL dizer quantos itens tem, acima da tabela, como "4 pessoas" ou "1 fornecedor".

#### Scenario: Situação do alerta
- **WHEN** a tabela dos alertas mostra um alerta aberto
- **THEN** a situação aparece no selo "Aberto", como nas outras tabelas

#### Scenario: Último contato do coletor
- **WHEN** um coletor falou há 3 horas, e uma ordem de serviço mudou há 3 horas
- **THEN** as duas tabelas mostram "Há 3 h"

#### Scenario: Lista dos perfis
- **WHEN** a organização tem 3 perfis
- **THEN** a tela dos perfis diz "3 perfis" acima da tabela, como a das pessoas diz "4 pessoas"

### Requirement: Cabeçalho da página

O catálogo SHALL ter o cabeçalho da página:
- **à esquerda:** a marca opcional, como o ícone do tipo ou a foto da pessoa, o título da janela, os selos ao lado do título e o detalhe opcional embaixo, no texto secundário;
- **à direita:** as ações da tela, lado a lado, na ordem dada, que quebram para baixo quando a largura não comporta.

O título SHALL continuar o título da janela, de nível 1, que recebe o foco ao abrir a tela. Toda tela do app SHALL mostrar o título nesse cabeçalho, também nos estados de carregamento, de erro, vazio e sem acesso. O Início, feito de blocos que a conta ordena, fica de fora. Um teste-guarda SHALL reprovar o título da janela solto nas telas da web.

#### Scenario: Ações à direita
- **WHEN** a ficha da OS 3 mostra o título, o selo "Aberta" e as ações "Mudar a situação", "Lançar peça" e "Resolver"
- **THEN** o título e o selo ficam à esquerda, e as três ações ficam juntas, à direita, na mesma linha

#### Scenario: Detalhe embaixo do título
- **WHEN** a ficha da OS 3 dá o detalhe "PAT-00139 · Impressora 139"
- **THEN** o detalhe aparece embaixo do título, no texto secundário, e o leitor de tela lê o título como nível 1

#### Scenario: Tela carregando
- **WHEN** a ficha da OS 3 ainda está carregando
- **THEN** o título "OS 3" já aparece no cabeçalho da página, com a linha embaixo, e ela continua no mesmo lugar quando a ficha chega

#### Scenario: Espaço depois do cabeçalho
- **WHEN** a ficha da OS 3 carregando mostra o cabeçalho e o aviso "Carregando a ordem de serviço…"
- **THEN** o aviso começa a 4 passos da linha do cabeçalho, como o conteúdo da ficha carregada

#### Scenario: Título oculto com a barra das abas
- **WHEN** o cadastro do ativo, cujo cabeçalho só tem o título que a primeira aba repete, fica atrás da barra das abas
- **THEN** o cabeçalho não deixa faixa nem linha em cima do conteúdo, e o título continua para o leitor de tela e para o foco

#### Scenario: Título solto numa tela nova
- **WHEN** uma tela da web mostra o título da janela fora do cabeçalho da página, fora do Início
- **THEN** o teste-guarda reprova, com o arquivo e a linha do título

### Requirement: Lista de dados

O catálogo SHALL ter a lista de dados, para o rótulo e o valor de uma ficha: uma lista de definições, com o rótulo no texto secundário, numa coluna de largura fixa, e o valor ao lado. Na largura estreita, o rótulo SHALL ficar em cima do valor. As fichas que mostram dados só para leitura SHALL usá-la.

#### Scenario: Dados da ordem de serviço
- **WHEN** a ficha da OS 3 mostra o ativo, o local, o problema e quando foi aberta
- **THEN** cada rótulo fica numa coluna, no texto secundário, e o valor ao lado, e o leitor de tela lê cada par como termo e definição

### Requirement: Borda da tabela que rola para o lado

Quando a tabela base é mais larga que a área dela, a borda do lado em que há mais colunas SHALL esmaecer, como a faixa esmaecida da janela (spec estrutura-da-casca, "Janela de conteúdo"):
- no começo da rolagem, só a borda direita;
- no fim, só a esquerda;
- no meio, as duas.

A tabela que cabe na área SHALL ficar sem esmaecer. As barras de rolagem SHALL ficar inteiras, sem esmaecer.

#### Scenario: Mais colunas à direita
- **WHEN** a tabela das regras de alerta é mais larga que a janela e está no começo da rolagem
- **THEN** a borda direita esmaece, e a esquerda não

#### Scenario: Rolada até o fim
- **WHEN** a pessoa rola a mesma tabela até a última coluna
- **THEN** a borda esquerda esmaece, e a direita não

#### Scenario: Tabela que cabe
- **WHEN** a tabela das pessoas cabe inteira na janela
- **THEN** nenhuma borda esmaece

### Requirement: Célula numa linha só

Toda linha da tabela SHALL ter a altura da densidade, com o conteúdo de cada célula numa linha só. O conteúdo que não cabe na largura da coluna SHALL NOT passar para a linha de baixo nem aumentar a altura da linha: ele SHALL terminar cortado, com reticências no texto.

Na célula com mais de uma parte, como a situação com a idade da leitura, as partes SHALL ficar lado a lado, e o corte SHALL seguir esta ordem:
- os rótulos de situação ficam inteiros, enquanto couberem na coluna;
- o texto que os acompanha, como "há 2 min" ou a descrição do suprimento, é o que encolhe e termina em reticências.

As partes SHALL ficar separadas por um espaço no texto da célula, além do respiro à vista: o leitor de tela, a busca na página e quem copia o texto SHALL receber "Reconhecido por Ana Souza", e não as partes emendadas.

A regra SHALL valer na tabela base e na que desenha só as linhas perto da área visível, em todas as densidades. Fora das tabelas, como na ficha, as mesmas partes SHALL continuar quebrando a linha quando falta largura. As colunas da coleta dos ativos SHALL nascer com, pelo menos, a largura que mostra a situação e a idade de uma leitura em dia sem corte, também quando a tabela divide a sobra entre as colunas (requisito "Tabela na largura toda").

#### Scenario: Disponibilidade numa coluna estreita
- **WHEN** a coluna "Disponibilidade" da tabela dos ativos está com 96 px, e uma impressora está "Offline", lida "há 2 min"
- **THEN** a linha dela tem a mesma altura das outras, o rótulo "Offline" aparece inteiro, e a idade termina cortada, sem ir para a linha de baixo

#### Scenario: Suprimentos numa coluna estreita
- **WHEN** a coluna "Suprimentos" está com 140 px, e o menor nível é "8% · Black Toner Cartridge"
- **THEN** o medidor e "8%" ficam à vista, e a descrição termina em reticências, na mesma linha

#### Scenario: Leitura desatualizada
- **WHEN** a leitura do Control iD de um controle está "Sem resposta" e "Desatualizado", numa coluna com a largura de fábrica
- **THEN** os dois rótulos e a idade ficam lado a lado, numa linha só, e o que não cabe termina cortado na borda da célula

#### Scenario: Partes separadas no texto
- **WHEN** a tabela dos alertas mostra um alerta reconhecido por Ana Souza, e o leitor de tela lê a célula da situação
- **THEN** ele lê "Reconhecido por Ana Souza", com as partes separadas

#### Scenario: Densidade compacta
- **WHEN** a tabela dos ativos está na densidade compacta, com a coluna "Total de páginas" em 80 px
- **THEN** toda linha tem a altura da densidade compacta

#### Scenario: Largura de fábrica
- **WHEN** uma conta que nunca mexeu nas colunas mostra a coluna "Disponibilidade" entre outras nove colunas, numa janela de 1.280 px, e uma impressora está "Offline", lida "há 2 min"
- **THEN** a coluna tem pelo menos 210 px, "Offline" e "há 2 min" aparecem inteiros, e a tabela rola de lado

#### Scenario: Ficha continua quebrando
- **WHEN** a ficha do ativo mostra a mesma disponibilidade numa janela estreita
- **THEN** a situação e a idade quebram a linha, sem corte
