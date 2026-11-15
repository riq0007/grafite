## MODIFIED Requirements

### Requirement: Medidor

O medidor SHALL mostrar um valor de 0 ao máximo numa régua com:
- as marcas de 25 em 25%;
- o preenchimento na tinta escolhida;
- o número em numeral, com a unidade.

O medidor SHALL ter o papel de medidor (`meter`), com o valor, o mínimo, o máximo, o texto do valor e o nome acessível. Um limite SHALL aparecer como o cursor ▲ na posição dele, com o texto. Sem valor, o medidor SHALL mostrar o motivo em texto, sem a régua e sem zero. Um valor fora da faixa SHALL ficar na ponta da régua, e o texto SHALL mostrar o valor de verdade.

O medidor SHALL ter também o tamanho compacto, com a trilha mais baixa e o número menor, para a célula de uma tabela e para a contagem. No tamanho compacto, a régua SHALL caber numa caixa de 40 px de largura, e o que vem depois da caixa SHALL ficar à vista, sem a régua por cima.

#### Scenario: Nível do toner com o limite da regra
- **WHEN** um medidor mostra 38% com o limite "Alerta abaixo de 10%"
- **THEN** a régua enche até 38%, o cursor fica em 10% com o texto, e o leitor de tela anuncia "38%"

#### Scenario: Sem valor
- **WHEN** o medidor recebe o valor vazio e o motivo "Sem dado"
- **THEN** aparece só "Sem dado", sem a régua e sem nenhum número

#### Scenario: Medidor compacto numa caixa de 40 px
- **WHEN** o medidor compacto do toner a 8%, sem o número, fica numa caixa de 40 px, com o "8%" logo depois dela
- **THEN** a régua acaba dentro da caixa e antes do "8%", nas três densidades
