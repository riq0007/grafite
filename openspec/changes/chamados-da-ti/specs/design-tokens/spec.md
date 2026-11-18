## ADDED Requirements

### Requirement: Cores da aba

O tema SHALL ter as cores da aba dos chamados, na prévia do colaborador e na própria aba, feitas na matiz da informação, com a luminosidade e o croma dos mockups aprovados:
- o fundo, na luminosidade 0,42 e no croma 0,16;
- o fundo 2, das pílulas da trilha, em 0,34 e 0,13;
- o bloco de quem pede, em 0,49 e 0,165;
- o texto, em 0,985 e 0,012;
- o contorno da moldura e dos ícones, em 0,8 e 0,1 nos temas escuros e, nos claros, o próprio fundo;
- a atenção da aba, dos selos, na matiz da atenção, em 0,8 e 0,145, com o texto sobre ela em 0,2 e 0,04.

Onde a cor não couber no sRGB, cada canal SHALL ser cortado no limite, como o navegador mostrou o mockup aprovado, e não com o croma reduzido das outras cores do tema: o fundo fica em #004f9d e o bloco em #0064b6.

A verificação automática SHALL conferir, nas 24 combinações dos temas com os destaques e na varredura de entradas do contraste:
- o texto da aba com 4,5:1 sobre o fundo, sobre o fundo pressionado, sobre o fundo 2, sobre o bloco e sobre o bloco pressionado;
- o texto sobre a atenção da aba com 4,5:1;
- o contorno com 3:1 contra a superfície, a superfície 2 e a elevada.

#### Scenario: Faixa da aba no tema Papel
- **WHEN** a prévia do colaborador mostra a faixa da aba no tema Papel
- **THEN** o texto da aba tem pelo menos 4,5:1 sobre o fundo da aba, e a moldura, no próprio fundo, tem pelo menos 3:1 contra a superfície elevada

#### Scenario: Ícone do tipo num tema escuro
- **WHEN** a grade dos tipos mostra o ícone de um tipo no tema Grafite
- **THEN** o ícone, no contorno da aba, tem pelo menos 3:1 contra a superfície 2

#### Scenario: Tema personalizado
- **WHEN** a conta usa um tema personalizado claro
- **THEN** a aba tem as cores dos temas claros, com o contorno no próprio fundo

## MODIFIED Requirements

### Requirement: Raio de borda com base ajustável

O raio SHALL derivar de uma base ajustável de 0 a 24 px (padrão de fábrica de 10 px), com a escala por tipo de elemento da spec mestre (Apêndice A.4). A forma totalmente arredondada SHALL ficar reservada a avatares, pontos e rótulos de situação, fora a exceção nomeada da aba dos chamados: a trilha, os chips, os botões, os selos e o bloco de quem pede SHALL ser cápsulas, no raio da cápsula, que também deriva da base e fica reto na base zero.

#### Scenario: Base zero
- **WHEN** a base de raio é 0
- **THEN** janelas, controles, menus, miniaturas e as cápsulas da aba ficam com cantos retos

#### Scenario: Botão com base máxima
- **WHEN** a base de raio é 24 px
- **THEN** um botão fora da aba dos chamados continua com raio menor que sua meia altura, sem virar cápsula

#### Scenario: Raio de fábrica
- **WHEN** uma conta nunca mudou o raio
- **THEN** a janela tem 10 px de raio

#### Scenario: Cápsula da aba
- **WHEN** a prévia do colaborador mostra a trilha da aba, com a base de fábrica
- **THEN** cada pílula da trilha tem o raio da cápsula, maior que a meia altura dela
