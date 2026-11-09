## MODIFIED Requirements

### Requirement: Quem vê e quem edita os consumíveis

`consumiveis.ver` SHALL dar a lista e a ficha dos consumíveis, e `consumiveis.editar`, que inclui `consumiveis.ver`, o cadastro, a edição, com os fornecedores e os modelos, a inativação e a reativação. As duas SHALL valer só na organização inteira. A API SHALL recusar com 403 o que a conta não pode.

Os consumíveis compatíveis de um modelo SHALL ser uma referência do modelo: quem vê a ficha do modelo ou a de um ativo dele SHALL vê-los, com o código, o nome, o tipo, a cor e o rendimento, sem `consumiveis.ver`. Só quem tem `consumiveis.ver` SHALL abrir a ficha do consumível a partir deles.

O consumível SHALL ser também uma referência do estoque (spec estoque): quem vê o estoque SHALL ver o código, o nome, o tipo e a cor dos consumíveis dos saldos e das movimentações, e quem movimenta SHALL escolher entre os consumíveis ativos ao lançar, sem `consumiveis.ver`.

#### Scenario: Técnico sem a permissão
- **WHEN** Bruno, que vê as impressoras de Campinas sem `consumiveis.ver`, abre a ficha da PAT-00412
- **THEN** ele vê o CF258A entre os consumíveis compatíveis, sem o caminho para a ficha do consumível, e não vê o Operação no dock

#### Scenario: Edição sem a permissão
- **WHEN** uma conta com só `consumiveis.ver` tenta salvar um consumível pela API
- **THEN** a API responde 403

#### Scenario: Almoxarife sem os consumíveis
- **WHEN** Carla, que movimenta o estoque de Jundiaí sem `consumiveis.ver`, lança uma entrada
- **THEN** ela escolhe o CF258A pelo código entre os consumíveis ativos, sem o caminho para a ficha dele

## ADDED Requirements

### Requirement: Novo consumível numa aba

O Novo consumível SHALL abrir numa aba da janela quando um campo o pede (spec estrutura-da-casca), com o mesmo formulário, as mesmas validações e o mesmo retorno do cadastro do Operação, "Consumível cadastrado.". Na aba, salvar SHALL devolver o consumível criado ao campo que o pediu, em vez de abrir a ficha dele. O Novo consumível SHALL exigir `consumiveis.editar`.

#### Scenario: Consumível criado pelo campo da entrada
- **WHEN** quem movimenta o estoque e edita os consumíveis escolhe "Cadastrar novo consumível" na entrada e salva o "CF259A", Toner, Preto
- **THEN** a aba fecha, e o campo do consumível da entrada vem com o CF259A

#### Scenario: Código repetido na aba
- **WHEN** alguém informa, no Novo consumível aberto pelo campo, o código "cf 258a", que já existe
- **THEN** a aba continua aberta, com "Já existe um consumível com este código." no campo Código, e a entrada continua como estava
