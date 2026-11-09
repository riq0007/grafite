## MODIFIED Requirements

### Requirement: Consumível

Um consumível SHALL ter:
- o código do fabricante, obrigatório, de até 40 caracteres, como "CF258A", guardado como foi escrito, sem os espaços das pontas, e único na organização sem diferenciar maiúsculas, espaços e hífens, entre os ativos e os inativos;
- o nome, opcional, de até 80 caracteres, como "HP 58A";
- o tipo, de uma lista fixa: Toner, Cilindro, Tinta, Fita, Kit de manutenção, Peça ou Outro;
- a cor, opcional, de uma lista fixa: Preto, Ciano, Magenta, Amarelo ou Colorido;
- o rendimento, opcional, em páginas, um número inteiro de 1 a 1.000.000, mostrado como "3.000 páginas";
- os fornecedores que o vendem (requisito "Fornecedores do consumível");
- os modelos em que ele serve (requisito "Compatibilidade com os modelos");
- a situação, ativo ou inativo.

A Peça SHALL ser a parte trocada num conserto, como uma fonte ou um teclado, que entra e sai do estoque como os outros tipos (spec estoque) e é lançada nas ordens de serviço (spec ordens-de-servico).

As recusas SHALL ficar no campo:
- "Informe o código do consumível.";
- "Já existe um consumível com este código.";
- "Use até 40 caracteres.", no código, e "Use até 80 caracteres.", no nome;
- "Escolha o tipo do consumível.";
- "Use um número inteiro de páginas, de 1 a 1.000.000.".

#### Scenario: Código com outra grafia
- **WHEN** já existe o consumível "TN-2370" e alguém cadastra "tn 2370"
- **THEN** o cadastro é recusado com "Já existe um consumível com este código.", no campo Código

#### Scenario: Rendimento fora do limite
- **WHEN** alguém informa o rendimento 0
- **THEN** o cadastro é recusado com "Use um número inteiro de páginas, de 1 a 1.000.000.", no campo Rendimento

#### Scenario: Kit sem cor nem rendimento
- **WHEN** alguém cadastra o kit de manutenção "RM2-5425", sem a cor e sem o rendimento
- **THEN** o consumível é cadastrado, e a lista o mostra sem cor e sem rendimento

#### Scenario: Peça no catálogo
- **WHEN** alguém cadastra a peça "FNT-65W", com o nome "Fonte 65W", sem a cor e sem o rendimento
- **THEN** o consumível é cadastrado com o tipo Peça, e o filtro do tipo "Peça" o mostra na lista
