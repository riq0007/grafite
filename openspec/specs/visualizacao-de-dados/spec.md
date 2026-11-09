# visualizacao-de-dados Specification

## Purpose
Mostrar níveis, contagens, séries e dias como instrumentos de leitura, como num desenho técnico: o valor sempre em texto, as marcas finas, o número em numeral e uma forma que não depende só da cor.

## Requirements

### Requirement: Medidor

O medidor SHALL mostrar um valor de 0 ao máximo numa régua com:
- as marcas de 25 em 25%;
- o preenchimento na tinta escolhida;
- o número em numeral, com a unidade.

O medidor SHALL ter o papel de medidor (`meter`), com o valor, o mínimo, o máximo, o texto do valor e o nome acessível. Um limite SHALL aparecer como o cursor ▲ na posição dele, com o texto. Sem valor, o medidor SHALL mostrar o motivo em texto, sem a régua e sem zero. Um valor fora da faixa SHALL ficar na ponta da régua, e o texto SHALL mostrar o valor de verdade.

#### Scenario: Nível do toner com o limite da regra
- **WHEN** um medidor mostra 38% com o limite "Alerta abaixo de 10%"
- **THEN** a régua enche até 38%, o cursor fica em 10% com o texto, e o leitor de tela anuncia "38%"

#### Scenario: Sem valor
- **WHEN** o medidor recebe o valor vazio e o motivo "Sem dado"
- **THEN** aparece só "Sem dado", sem a régua e sem nenhum número

### Requirement: Cartucho

O cartucho SHALL mostrar o nível de um suprimento na vertical:
- a placa da tinta no topo, com a letra C, M, Y ou K, ou neutra sem tinta;
- o corpo que enche de baixo para cima até o percentual medido;
- o percentual em numeral e o nome, embaixo.

"Há suprimento" SHALL aparecer hachurado, sem percentual. "Sem dado" e "Inconsistente" SHALL aparecer em texto, com o corpo vazio, e o inconsistente SHALL ter o rótulo de situação de atenção. A estimativa SHALL aparecer em texto, escrita como estimativa.

#### Scenario: Toner preto num tema escuro
- **WHEN** o cartucho do toner preto mostra 15% no tema Grafite
- **THEN** a placa tem a letra K, o corpo enche até 15% na tinta preta do tema, e o texto diz "15%" e "Preto"

#### Scenario: Nível que a impressora não mede
- **WHEN** o cartucho recebe "Há suprimento"
- **THEN** o corpo aparece hachurado com o texto "Há suprimento", e nenhum percentual

### Requirement: Faixa de dias

A faixa de dias SHALL mostrar um quadrado por dia, do mais antigo ao mais recente, com uma forma por situação:

| Situação | Forma |
|---|---|
| Concluído | cheio |
| Parcial | meio cheio |
| Falha | com o X |
| Sem nada | só o contorno |

Cada dia SHALL ter, para o leitor de tela, a data e a situação em texto. A faixa SHALL mostrar o resumo em texto, como "26 de 30 dias com backup · 2 falhas".

#### Scenario: Dias sem backup
- **WHEN** a faixa recebe 30 dias, com 26 concluídos, 2 falhas e 2 sem nada
- **THEN** os dois dias sem nada aparecem só com o contorno, e o resumo diz "26 de 30 dias com backup · 2 falhas"

#### Scenario: Leitura sem a cor
- **WHEN** alguém que não distingue as cores olha a faixa
- **THEN** a falha se distingue pelo X, e o parcial, pelo meio cheio

### Requirement: Tendência

A tendência SHALL desenhar a linha curta de uma série, com o último ponto marcado, e SHALL mostrar o último valor e o período em texto. A projeção SHALL aparecer tracejada. O nome acessível SHALL resumir a série, do primeiro ao último valor, com o período.

#### Scenario: Rostos de um controle
- **WHEN** a tendência recebe os rostos de 30 dias, de 380 a 412
- **THEN** a linha sobe até o último ponto, o texto diz "412" e "30 dias", e o leitor de tela anuncia "de 380 a 412 em 30 dias"

### Requirement: Contagem

A contagem SHALL mostrar um número em numeral, com os milhares do pt-BR, a unidade e o rótulo. Com a capacidade, SHALL mostrar "N de capacidade" e a régua da ocupação. A variação SHALL vir em texto, com o sinal escrito, sem cor.

#### Scenario: Rostos com a capacidade
- **WHEN** a contagem mostra 412 rostos de uma capacidade de 3.000, com 3 a mais desde o backup anterior
- **THEN** ela diz "412 de 3.000", mostra a régua da ocupação e "+3 desde o backup anterior"
