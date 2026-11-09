# iconografia Specification

## Purpose

Dar ao Grafite um conjunto único e consistente de ícones de interface e de tipos de ativo, e imagens genéricas para ativos sem foto, todos acompanhando o tema.

## Requirements

### Requirement: Família única de ícones de interface

Os ícones de interface SHALL pertencer a uma única família:
- grade de 24 px;
- espessura de traço única do projeto;
- terminações arredondadas.

Emojis SHALL NOT ser usados como ícones.

#### Scenario: Ícones lado a lado
- **WHEN** ícones diferentes aparecem na mesma barra
- **THEN** todos têm a mesma espessura de traço, o mesmo tamanho óptico e o mesmo estilo de terminação

### Requirement: Ícones por tipo de ativo

O conjunto SHALL incluir ícones próprios para estes tipos de ativo:
- impressora;
- computador;
- notebook;
- monitor;
- switch;
- rack;
- controle de acesso;
- câmera;
- storage;
- nobreak;
- um ícone genérico de ativo.

#### Scenario: Tipo sem ícone próprio
- **WHEN** um tipo de ativo cadastrado não tem ícone próprio
- **THEN** o ícone genérico de ativo é usado

### Requirement: Imagens genéricas de ativo

Quando nem o ativo nem o seu modelo têm imagem, o sistema SHALL exibir a imagem genérica do tipo. A imagem genérica SHALL caber no quadrado da miniatura em qualquer densidade, sem distorção e com a mesma margem interna das imagens reais.

#### Scenario: Ativo sem imagem na densidade compacta
- **WHEN** um nobreak sem imagem aparece numa tabela em densidade compacta
- **THEN** a miniatura mostra a imagem genérica de nobreak dentro do quadrado de 24 px, sem distorção

### Requirement: Cor dos ícones vinda dos tokens

Os ícones de interface SHALL herdar a cor dos tokens do contexto em que aparecem e SHALL acompanhar a troca de tema sem arquivos diferentes por tema.

#### Scenario: Troca de tema
- **WHEN** o tema muda de Grafite para Névoa
- **THEN** os ícones mudam de cor junto com o texto ao redor

### Requirement: Ícones acessíveis

Um ícone decorativo SHALL ser ignorado por leitores de tela. Um botão que tem só ícone SHALL ter nome acessível.

#### Scenario: Botão só com ícone
- **WHEN** um leitor de tela chega a um botão que mostra apenas um ícone
- **THEN** o leitor anuncia o nome da ação do botão
