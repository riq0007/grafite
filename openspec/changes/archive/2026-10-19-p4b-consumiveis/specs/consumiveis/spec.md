## Purpose

Guardar o catálogo dos consumíveis da organização, como os toners e os cilindros, com o código do fabricante único, o tipo, a cor, o rendimento, os fornecedores e os modelos em que cada um serve, para o estoque, as solicitações e as ordens de serviço apontarem para o mesmo consumível.

## ADDED Requirements

### Requirement: Consumível

Um consumível SHALL ter:
- o código do fabricante, obrigatório, de até 40 caracteres, como "CF258A", guardado como foi escrito, sem os espaços das pontas, e único na organização sem diferenciar maiúsculas, espaços e hífens, entre os ativos e os inativos;
- o nome, opcional, de até 80 caracteres, como "HP 58A";
- o tipo, de uma lista fixa: Toner, Cilindro, Tinta, Fita, Kit de manutenção ou Outro;
- a cor, opcional, de uma lista fixa: Preto, Ciano, Magenta, Amarelo ou Colorido;
- o rendimento, opcional, em páginas, um número inteiro de 1 a 1.000.000, mostrado como "3.000 páginas";
- os fornecedores que o vendem (requisito "Fornecedores do consumível");
- os modelos em que ele serve (requisito "Compatibilidade com os modelos");
- a situação, ativo ou inativo.

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

### Requirement: Fornecedores do consumível

O consumível SHALL ter os fornecedores que o vendem, até 50, escolhidos entre os fornecedores ativos (spec fornecedores). O fornecedor inativado depois SHALL continuar no consumível, mostrado com "(inativo)" depois do nome, e SHALL NOT ser incluído de novo, com "O fornecedor escolhido está inativo. Escolha um fornecedor ativo.". Mais de 50 SHALL ser recusado com "Use até 50 fornecedores.".

#### Scenario: Fornecedor inativado
- **WHEN** quem edita os fornecedores inativa a "Locadora Norte", fornecedora do "CF258A"
- **THEN** a ficha do CF258A mostra "Locadora Norte (inativo)", e ela não aparece mais para ser incluída

### Requirement: Compatibilidade com os modelos

O consumível SHALL ter os modelos de equipamento em que ele serve, até 200 (spec catalogo-de-ativos). Um modelo SHALL ser incluído só se estiver ativo e for de um tipo que liga a capacidade `consumiveis.compatibilidade`, com as recusas:
- "O modelo escolhido está inativo. Escolha um modelo ativo.";
- "O modelo escolhido não é de um tipo com consumíveis compatíveis.";
- "Use até 200 modelos.".

O modelo inativado depois SHALL continuar no consumível, mostrado com "(inativo)".

Os consumíveis compatíveis de um modelo SHALL ser os consumíveis ativos que têm o modelo, na ordem do tipo, como na lista fixa, e do código. Eles SHALL aparecer só nos modelos dos tipos que ligam a capacidade. Desligar a capacidade num tipo SHALL esconder os consumíveis compatíveis da ficha dos modelos e da dos ativos desse tipo, sem tirar os modelos dos consumíveis, e ligá-la de novo SHALL trazê-los como estavam.

#### Scenario: Toner em dois modelos
- **WHEN** quem edita os consumíveis inclui a "HP LaserJet M404" e a "HP LaserJet M428" no "CF258A"
- **THEN** a ficha dos dois modelos e a das impressoras deles mostram o CF258A entre os consumíveis compatíveis

#### Scenario: Modelo de outro tipo
- **WHEN** alguém inclui o notebook "Dell Latitude 5440", de um tipo sem a capacidade, no "CF258A"
- **THEN** a inclusão é recusada com "O modelo escolhido não é de um tipo com consumíveis compatíveis."

#### Scenario: Compatibilidade desligada
- **WHEN** o tipo "Impressora" desliga os consumíveis compatíveis
- **THEN** a ficha das impressoras e a dos modelos de impressora deixam de mostrar os consumíveis, e a ficha do CF258A continua com os modelos

### Requirement: Inativação e reativação do consumível

O consumível SHALL NOT ser excluído: ele é inativado e reativado. O consumível inativo SHALL sair dos consumíveis compatíveis dos modelos e dos ativos e SHALL continuar na lista dos consumíveis, pelo filtro da situação, com os fornecedores e os modelos que tinha. Reativá-lo SHALL trazê-lo de volta como estava.

#### Scenario: Toner que saiu de linha
- **WHEN** quem edita os consumíveis inativa o "CF258A"
- **THEN** a ficha da "HP LaserJet M404" deixa de mostrá-lo, e a lista dos consumíveis o mostra só com o filtro dos inativos

### Requirement: Quem vê e quem edita os consumíveis

`consumiveis.ver` SHALL dar a lista e a ficha dos consumíveis, e `consumiveis.editar`, que inclui `consumiveis.ver`, o cadastro, a edição, com os fornecedores e os modelos, a inativação e a reativação. As duas SHALL valer só na organização inteira. A API SHALL recusar com 403 o que a conta não pode.

Os consumíveis compatíveis de um modelo SHALL ser uma referência do modelo: quem vê a ficha do modelo ou a de um ativo dele SHALL vê-los, com o código, o nome, o tipo, a cor e o rendimento, sem `consumiveis.ver`. Só quem tem `consumiveis.ver` SHALL abrir a ficha do consumível a partir deles.

#### Scenario: Técnico sem a permissão
- **WHEN** Bruno, que vê as impressoras de Campinas sem `consumiveis.ver`, abre a ficha da PAT-00412
- **THEN** ele vê o CF258A entre os consumíveis compatíveis, sem o caminho para a ficha do consumível, e não vê o Operação no dock

#### Scenario: Edição sem a permissão
- **WHEN** uma conta com só `consumiveis.ver` tenta salvar um consumível pela API
- **THEN** a API responde 403
