## Purpose

Guardar os fornecedores da organização num cadastro só, com o nome e o CNPJ únicos, para o ativo, os consumíveis, o estoque e as ordens de serviço apontarem para o mesmo fornecedor, em vez de um texto livre.

## ADDED Requirements

### Requirement: Fornecedor

Um fornecedor SHALL ter:
- o nome, obrigatório, de até 120 caracteres, único na organização sem diferenciar acento, maiúsculas e espaços repetidos, entre os ativos e os inativos;
- o CNPJ, opcional, aceito com ou sem a pontuação e em maiúsculas ou minúsculas, com letras nos 12 primeiros caracteres no CNPJ alfanumérico, conferido pelos dígitos verificadores, guardado com os 14 caracteres em maiúsculas e mostrado como "12.345.678/0001-95", único na organização;
- o contato, opcional, de até 120 caracteres, como o nome de quem atende;
- o e-mail, opcional, conferido como um endereço de e-mail;
- o telefone, opcional, de até 30 caracteres;
- as observações, opcionais, de até 2.000 caracteres;
- a situação, ativo ou inativo.

As recusas SHALL ficar no campo:
- "Informe o nome do fornecedor.";
- "Já existe um fornecedor com este nome.";
- "CNPJ inválido: confira os 14 caracteres.";
- "Já existe um fornecedor com este CNPJ.";
- "Use um e-mail, como compras@empresa.com.br.".

#### Scenario: Nome repetido
- **WHEN** já existe o fornecedor "HP Brasil" e alguém cadastra "hp  brasil"
- **THEN** o cadastro é recusado com "Já existe um fornecedor com este nome.", no campo Nome

#### Scenario: CNPJ com a pontuação
- **WHEN** alguém informa o CNPJ "12.345.678/0001-95", com os dígitos verificadores certos
- **THEN** o CNPJ é guardado como 12345678000195 e mostrado como "12.345.678/0001-95"

#### Scenario: CNPJ com o dígito errado
- **WHEN** alguém informa o CNPJ "12.345.678/0001-96"
- **THEN** o cadastro é recusado com "CNPJ inválido: confira os 14 caracteres.", no campo CNPJ

#### Scenario: CNPJ alfanumérico
- **WHEN** alguém informa o CNPJ alfanumérico "12.abc.345/01de-35", com os dígitos verificadores certos
- **THEN** o CNPJ é guardado como 12ABC34501DE35 e mostrado como "12.ABC.345/01DE-35"

### Requirement: Inativação e reativação do fornecedor

O fornecedor SHALL NOT ser excluído: ele é inativado e reativado. O fornecedor inativo SHALL continuar nos registros que já apontam para ele, mostrado com "(inativo)" depois do nome, e SHALL NOT ser escolhido numa referência nova, com "O fornecedor escolhido está inativo. Escolha um fornecedor ativo.".

#### Scenario: Fornecedor inativado com ativos
- **WHEN** quem edita os fornecedores inativa "Locadora Norte", fornecedor de 12 ativos
- **THEN** os 12 ativos continuam com o fornecedor, mostrado como "Locadora Norte (inativo)", e ele não aparece mais para ser escolhido

### Requirement: Quem vê e quem edita os fornecedores

`fornecedores.ver` SHALL dar a lista e a ficha dos fornecedores, e `fornecedores.editar`, que inclui `fornecedores.ver`, o cadastro, a edição, a inativação e a reativação. As duas SHALL valer só na organização inteira. A API SHALL recusar com 403 o que a conta não pode.

Quem edita ativos em algum escopo SHALL ler os fornecedores ativos para escolher um, só com o nome e o CNPJ, sem `fornecedores.ver`, como faz com o responsável.

#### Scenario: Escolher sem ver a Administração
- **WHEN** Bruno, que edita ativos em Campinas sem `fornecedores.ver`, escolhe o fornecedor de uma impressora
- **THEN** ele vê os fornecedores ativos, pelo nome e pelo CNPJ, e não vê a seção Fornecedores da Administração

#### Scenario: Edição sem a permissão
- **WHEN** uma conta com só `fornecedores.ver` tenta salvar um fornecedor pela API
- **THEN** a API responde 403

### Requirement: Ativos do fornecedor

A ficha do fornecedor SHALL mostrar "Ativos deste fornecedor", com quantos ativos ativos têm aquele fornecedor, no escopo de quem vê, e "Ver na tabela", que abre a tabela dos ativos com a origem do fornecedor (spec cadastro-de-ativos). A linha SHALL aparecer só com o módulo Ativos ligado e para quem vê ativos em algum ramo.

#### Scenario: Ativos da HP Brasil
- **WHEN** quem vê os fornecedores e os ativos abre a ficha da "HP Brasil", fornecedor de 8 ativos
- **THEN** a ficha mostra "Ativos deste fornecedor: 8" e "Ver na tabela"

### Requirement: Novo fornecedor numa aba

O Novo fornecedor SHALL abrir numa aba da janela quando um campo o pede (spec estrutura-da-casca), com o mesmo formulário, as mesmas validações e o mesmo retorno da seção Fornecedores, "Fornecedor cadastrado.". Na aba, salvar SHALL devolver o fornecedor criado ao campo que o pediu, em vez de abrir a ficha dele. O Novo fornecedor SHALL exigir `fornecedores.editar`.

#### Scenario: Fornecedor criado pelo campo do ativo
- **WHEN** quem edita o ativo e os fornecedores escolhe "Cadastrar novo fornecedor" na ficha da PAT-00412 e salva "HP Brasil", com o CNPJ
- **THEN** a aba fecha, o campo Fornecedor da ficha vem com "HP Brasil", e o cartão Administrativo diz "HP Brasil" no resumo

#### Scenario: CNPJ recusado na aba
- **WHEN** alguém informa, no Novo fornecedor aberto pelo campo, o CNPJ "12.345.678/0001-96"
- **THEN** a aba continua aberta, com "CNPJ inválido: confira os 14 caracteres." no campo CNPJ, e o cadastro do ativo continua como estava
