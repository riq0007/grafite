## ADDED Requirements

### Requirement: Tema e destaque personalizados nas preferências

A aparência SHALL aceitar o tema `personalizado` e o destaque `personalizado`, além dos de fábrica. As entradas deles SHALL ficar em dois campos da aparência, cada um trocado inteiro:
- **o tema personalizado:** o tom, escuro ou claro, a matiz da base, o tingimento dos cinzas e o contraste;
- **o destaque personalizado:** a matiz e a intensidade.

Os padrões de fábrica SHALL ser:
- **o tema personalizado:** escuro, na matiz 265, com 10% de tingimento e o contraste 45, que é o Grafite;
- **o destaque personalizado:** na matiz 258, com 85% de intensidade, que é o azul.

Cada número SHALL ser inteiro e SHALL ser trazido para o limite mais próximo quando vier fora do intervalo:
- a matiz, da base e do destaque, de 0 a 359 graus;
- o tingimento e a intensidade, de 0 a 100%;
- o contraste, de 0 a 100.

Um tom desconhecido, ou um campo sem algum número, SHALL dar lugar ao campo inteiro da camada de baixo. A API SHALL recusar com 400 a gravação de um tom desconhecido, com a mensagem no campo.

#### Scenario: Primeiro tema personalizado
- **WHEN** uma conta que nunca ajustou o tema personalizado o escolhe
- **THEN** a interface fica como no Grafite, escura, na matiz 265, com 10% de tingimento e o contraste 45

#### Scenario: Matiz fora do intervalo
- **WHEN** o tema personalizado salvo traz a matiz 400 e o tom claro
- **THEN** a matiz usada é 359, e o tom continua claro

#### Scenario: Tom desconhecido
- **WHEN** o tema personalizado salvo traz o tom "sépia", e o padrão da organização é o tema personalizado claro na matiz 80
- **THEN** a interface usa o tema personalizado da organização, claro na matiz 80

#### Scenario: Gravação de um tom desconhecido
- **WHEN** um pedido à API grava o tema personalizado com o tom "sépia"
- **THEN** a API responde 400, com a mensagem no tema personalizado, e a aparência não muda
