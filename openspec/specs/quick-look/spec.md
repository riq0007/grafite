# quick-look Specification

## Purpose

Mostrar a prévia de um registro sem sair da lista, com a imagem, os campos principais e as ações, trocando de registro pelas setas, como o Quick Look do macOS.

## Requirements

### Requirement: Abrir e fechar a prévia pela tabela

Numa tabela que oferece prévia, a barra de espaço na linha em foco SHALL abrir a prévia do registro daquela linha. A prévia SHALL fechar com Esc, com a barra de espaço e com o botão Fechar. Ao fechar, o foco SHALL ir para a linha do registro que estava na prévia, que pode não ser a de origem, se o usuário trocou de registro.

#### Scenario: Abrir pelo espaço
- **WHEN** o foco está na linha "HP LaserJet M404dn" e o usuário pressiona espaço
- **THEN** a prévia abre com o registro "HP LaserJet M404dn"

#### Scenario: Fechar depois de trocar
- **WHEN** o usuário abre a prévia da terceira linha, passa para a quinta pelas setas e pressiona Esc
- **THEN** a prévia fecha, e o foco está na quinta linha

### Requirement: Conteúdo da prévia

A prévia SHALL mostrar:
- o nome do registro como título e, abaixo dele, o tipo ou o modelo;
- a imagem do registro, a do modelo ou a genérica do tipo, nessa ordem, inteira e sem distorção;
- os campos principais, com rótulo e valor, e os identificadores na fonte monoespaçada;
- as ações que a tabela oferece para o registro, como "Abrir";
- a posição do registro na lista, como "3 de 120".

O lugar da imagem SHALL aceitar outro conteúdo visual, para o 3D do T1.

#### Scenario: Registro sem imagem
- **WHEN** nem o registro nem o modelo têm imagem
- **THEN** a prévia mostra a imagem genérica do tipo, inteira e sem distorção

#### Scenario: Identificadores
- **WHEN** a prévia mostra o patrimônio e o IP de um ativo
- **THEN** os dois valores aparecem na fonte monoespaçada

### Requirement: Trocar de registro pelas setas

Com a prévia aberta, as setas para cima e para a esquerda SHALL mostrar o registro anterior, e as setas para baixo e para a direita, o seguinte, na ordem da tabela. No primeiro e no último registro, a seta que sairia da lista SHALL NOT fazer nada. Enter SHALL acionar a ação de abrir, quando ela existe.

Aberta com mais de uma linha selecionada, a prévia SHALL passar só pelos registros selecionados, na ordem da tabela, e a posição SHALL contar a seleção, como "2 de 3".

Numa lista paginada, a posição SHALL contar o total da lista, e não só os registros carregados. A seta que passa do último registro carregado SHALL trazer a página seguinte, com o esqueleto de carregamento enquanto ela chega, e mostrar o registro seguinte.

#### Scenario: Registro seguinte
- **WHEN** a prévia mostra "3 de 120" e o usuário pressiona seta para baixo
- **THEN** a prévia mostra "4 de 120", com o registro da quarta linha

#### Scenario: Fim da lista
- **WHEN** a prévia mostra "120 de 120" e o usuário pressiona seta para baixo
- **THEN** a prévia continua no registro 120

#### Scenario: Só os selecionados
- **WHEN** a segunda, a quinta e a nona linhas estão selecionadas e o usuário abre a prévia na quinta
- **THEN** a prévia mostra "2 de 3", e a seta para baixo leva à nona linha

#### Scenario: Página seguinte
- **WHEN** a lista tem 300 ativos, 100 carregados, e a prévia mostra "100 de 300"
- **THEN** a seta para baixo traz a página seguinte e mostra "101 de 300", com o ativo da linha 101

### Requirement: Estados e superfície da prévia

Enquanto os dados do registro carregam, a prévia SHALL mostrar o esqueleto de carregamento no lugar dos campos. Se a carga falhar, SHALL mostrar "Não foi possível carregar a prévia." e "Tentar de novo".

A prévia SHALL:
- ter superfície sólida e ficar sem véu, para a lista continuar à vista;
- prender o foco enquanto está aberta;
- abrir com troca de opacidade e uma escala leve, dentro de 300 ms, e só com a opacidade quando o movimento é reduzido;
- ocupar a largura da tela no celular.

#### Scenario: Carga com falha
- **WHEN** os dados do registro não carregam
- **THEN** a prévia mostra "Não foi possível carregar a prévia." e "Tentar de novo", que carrega de novo

#### Scenario: Movimento reduzido
- **WHEN** o movimento está reduzido e a prévia abre
- **THEN** ela aparece só com a troca de opacidade, sem escala
