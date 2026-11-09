## Purpose

Definir num único lugar todos os valores visuais do Grafite (cor, tipografia, espaçamento, raio, material, movimento e densidade), com temas trocáveis em tempo de execução e contraste verificado.

## ADDED Requirements

### Requirement: Fonte única de valores visuais

Todo valor visual SHALL vir de tokens definidos num único lugar: cor, tipografia, espaçamento, raio, sombra, material, movimento e densidade. Nenhum componente ou tela SHALL declarar um valor visual fixo fora dos tokens. Uma verificação automática SHALL acusar valores fixos de cor.

#### Scenario: Alteração de um token
- **WHEN** o valor de um token semântico é alterado
- **THEN** todos os componentes que o usam passam a refleti-lo, sem edição individual

#### Scenario: Cor fixa num componente
- **WHEN** um componente declara uma cor literal fora dos tokens
- **THEN** a verificação automática falha e aponta o arquivo e a linha

### Requirement: Tokens em três camadas

Os tokens SHALL ser organizados em três camadas:
- **primitivos:** paleta e escalas;
- **semânticos:** fundo, superfície, texto, linha, destaque, situação, material e outros papéis;
- **de componente.**

Os componentes SHALL consumir apenas tokens semânticos ou de componente, nunca primitivos.

#### Scenario: Troca de paleta primitiva
- **WHEN** um primitivo de cor muda
- **THEN** só os semânticos que o referenciam mudam, e os componentes não precisam ser editados

### Requirement: Seis temas e quatro destaques

O sistema SHALL oferecer seis temas:
- **escuros:** Grafite, Meia-noite e OLED;
- **claros:** Névoa, Papel e Alto contraste.

O sistema SHALL oferecer também quatro cores de destaque: azul, verde, laranja e grafite. Cada destaque SHALL ter uma variação para temas escuros e outra para temas claros. Os valores iniciais SHALL ser os do Apêndice A da spec mestre, ajustados apenas se necessário para cumprir o contraste.

#### Scenario: Tema padrão
- **WHEN** nenhuma preferência foi escolhida
- **THEN** o tema aplicado é Grafite com destaque azul

#### Scenario: Destaque em tema claro
- **WHEN** o usuário usa um tema claro com o destaque verde
- **THEN** é aplicada a variação do verde para temas claros

### Requirement: Três densidades

O sistema SHALL oferecer três densidades:

| Densidade | Linha | Miniatura |
|---|---|---|
| Compacta (padrão de fábrica) | 34 px | 22 px |
| Normal | 40 px | 28 px |
| Confortável | 48 px | 34 px |

#### Scenario: Troca de densidade
- **WHEN** a densidade muda de compacta para confortável
- **THEN** a altura das linhas passa de 34 px para 48 px e a miniatura de 22 px para 34 px

### Requirement: Raio de borda com base ajustável

O raio SHALL derivar de uma base ajustável de 0 a 24 px (padrão 12 px), com a escala por tipo de elemento da spec mestre (Apêndice A.4). A forma totalmente arredondada SHALL ficar reservada a avatares, pontos e rótulos de situação.

#### Scenario: Base zero
- **WHEN** a base de raio é 0
- **THEN** janelas, controles, menus e miniaturas ficam com cantos retos

#### Scenario: Botão com base máxima
- **WHEN** a base de raio é 24 px
- **THEN** um botão continua com raio menor que sua meia altura, sem virar cápsula

### Requirement: Movimento e transparência como tokens

As durações, curvas e molas de animação SHALL ser tokens. Com a preferência de movimento reduzido ativa, os deslocamentos, escalas e molas SHALL ser suprimidos e apenas as trocas de opacidade SHALL permanecer. Com a transparência reduzida, os materiais translúcidos SHALL ser substituídos por equivalentes sólidos.

#### Scenario: Movimento reduzido do sistema operacional
- **WHEN** o sistema operacional declara preferência por movimento reduzido
- **THEN** nenhum componente anima deslocamento ou escala, e as transições viram trocas de opacidade

#### Scenario: Transparência reduzida
- **WHEN** a transparência reduzida está ativa
- **THEN** menus, avisos e popovers usam o fundo sólido do material, sem desfoque

### Requirement: Troca de aparência em tempo de execução e sem flash

Tema, destaque, densidade, raio, movimento e transparência SHALL mudar em tempo de execução, sem recarregar a página. A aparência escolhida SHALL ser aplicada antes da primeira pintura, sem mostrar outro tema por um instante.

#### Scenario: Troca de tema
- **WHEN** o usuário troca de Grafite para Névoa
- **THEN** a interface muda imediatamente, sem recarregar

#### Scenario: Reabertura com tema salvo
- **WHEN** o usuário reabre a aplicação com o tema OLED salvo
- **THEN** a primeira pintura já usa o OLED, sem piscar outro tema

### Requirement: Contraste verificado automaticamente

Todas as 24 combinações de tema × destaque SHALL atender a WCAG 2.2 nível AA:
- 4,5:1 para texto normal;
- 3:1 para texto grande, ícones, bordas de controles e indicadores de foco.

Uma verificação automática SHALL falhar a build quando alguma combinação não atender.

#### Scenario: Combinação reprovada
- **WHEN** uma mudança de token faz o texto secundário do tema Papel ficar abaixo de 4,5:1 contra a superfície
- **THEN** a verificação falha, indicando o tema, o destaque, o par de tokens e o contraste medido

### Requirement: Tipografia auto-hospedada e escala definida

A interface SHALL usar Instrument Sans e JetBrains Mono, servidas pela própria aplicação, sem depender de internet. A tipografia SHALL ter uma escala definida (título, subtítulo, corpo, rótulo, dado). Números em tabelas e indicadores SHALL usar algarismos tabulares. Identificadores (patrimônio, série, IP, MAC, horários) SHALL usar a fonte monoespaçada.

#### Scenario: Servidor sem internet
- **WHEN** a aplicação roda num servidor sem acesso à internet
- **THEN** as fontes carregam normalmente

#### Scenario: Coluna numérica
- **WHEN** uma coluna mostra valores numéricos em linhas seguidas
- **THEN** os algarismos ficam alinhados verticalmente
