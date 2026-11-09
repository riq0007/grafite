## Purpose

Reunir na casca o módulo Operação, onde moram os consumíveis da organização e, depois, o estoque, as solicitações e as ordens de serviço: a lista, o cadastro e a ficha dos consumíveis, e os consumíveis compatíveis na ficha dos modelos.

## ADDED Requirements

### Requirement: Operação no dock

A casca SHALL ter o módulo Operação, depois do Alertas e antes do Cofre. Ele SHALL ficar visível só para quem tem `consumiveis.ver`, inclusive por `consumiveis.editar`, e só com o módulo ligado na organização (spec modulos-da-organizacao). O item do dock SHALL levar à lista dos consumíveis, e o menu dele SHALL ter "Consumíveis". No celular, o módulo SHALL ficar em "Mais".

A busca (Ctrl+K) SHALL oferecer "Consumíveis", no caminho "Operação", e, para quem edita os consumíveis, a ação "Novo consumível", no caminho "Operação › Consumíveis".

Sem a permissão, o endereço do Operação SHALL dizer "Você não tem acesso à Operação.", com a quem pedir acesso.

#### Scenario: Conta sem a permissão
- **WHEN** uma conta sem `consumiveis.ver` e sem `consumiveis.editar` entra
- **THEN** o dock e a busca não mostram o Operação, e o endereço dele diz "Você não tem acesso à Operação."

#### Scenario: Novo consumível pela busca
- **WHEN** quem edita os consumíveis busca "consumível"
- **THEN** a busca oferece "Novo consumível", no caminho "Operação › Consumíveis", que abre o cadastro

### Requirement: Lista dos consumíveis

A lista SHALL mostrar os consumíveis ativos pelo código, com:
- o nome;
- o tipo e a cor, em texto;
- o rendimento, como "3.000 páginas";
- quantos modelos compatíveis, como "2 modelos";
- a situação, em texto.

A lista SHALL buscar pelo código, sem diferenciar maiúsculas, espaços e hífens, e pelo nome, sem diferenciar acento e maiúsculas. Ela SHALL filtrar pelo tipo, pela cor e pela situação, que mostra os inativos. A lista SHALL ser paginada no servidor, sem limite fixo, e a linha SHALL abrir a ficha.

Sem nenhum consumível, a lista SHALL dizer "Nenhum consumível ainda." e oferecer "Novo consumível" a quem edita os consumíveis.

#### Scenario: Primeiro consumível
- **WHEN** quem edita os consumíveis abre a lista numa organização sem consumíveis
- **THEN** a lista diz "Nenhum consumível ainda." e oferece "Novo consumível"

#### Scenario: Busca pelo código sem o hífen
- **WHEN** alguém busca "tn2370" na lista
- **THEN** a lista mostra o "TN-2370"

#### Scenario: Filtro da cor
- **WHEN** alguém filtra a cor "Ciano"
- **THEN** a lista mostra só os consumíveis ciano, e diz o filtro em texto

### Requirement: Cadastro e ficha do consumível

Quem edita os consumíveis SHALL cadastrar um consumível pelo "Novo consumível", com o código, o nome, o tipo, a cor, o rendimento, os fornecedores e os modelos compatíveis. Os fornecedores e os modelos SHALL ser incluídos pela busca, entre os que podem ser escolhidos (spec consumiveis), e retirados um a um. Os modelos SHALL aparecer pelo fabricante e pelo nome, com o tipo. Embaixo da busca dos fornecedores SHALL ficar "Cadastrar novo fornecedor", para quem tem `fornecedores.editar` (spec fornecedores, "Novo fornecedor numa aba"), e o fornecedor criado SHALL entrar nos fornecedores do consumível.

A ficha SHALL mostrar:
- o código e a situação no título, com o nome embaixo;
- os dados do consumível;
- os fornecedores, cada um levando à ficha do fornecedor para quem tem `fornecedores.ver`;
- os modelos compatíveis, cada um levando à ficha do modelo;
- para quem edita os consumíveis, a edição, com "Salvar", "Inativar consumível", com a confirmação "O consumível sai dos consumíveis compatíveis dos modelos e dos ativos. Ele pode ser reativado.", e "Reativar consumível".

Quem só vê SHALL ver a ficha sem as ações. Os retornos SHALL ser "Consumível cadastrado.", "Consumível salvo.", "Consumível inativado." e "Consumível reativado.".

#### Scenario: Cadastro com o fornecedor e o modelo
- **WHEN** quem edita os consumíveis cadastra o "CF258A", Toner, Preto, com 3.000 páginas, a "HP Brasil" e a "HP LaserJet M404"
- **THEN** a tela diz "Consumível cadastrado." e abre a ficha do CF258A, com a HP Brasil nos fornecedores e a HP LaserJet M404 nos modelos

#### Scenario: Fornecedor criado pelo consumível
- **WHEN** quem edita os consumíveis e os fornecedores escolhe "Cadastrar novo fornecedor" no cadastro do consumível e salva a "Distribuidora Sul"
- **THEN** a aba fecha, e a "Distribuidora Sul" entra nos fornecedores do consumível

#### Scenario: Quem só vê
- **WHEN** uma conta com só `consumiveis.ver` abre a ficha do "CF258A"
- **THEN** a ficha mostra os dados, os fornecedores e os modelos, sem "Salvar", "Inativar consumível" e sem as buscas para incluir

### Requirement: Consumíveis compatíveis na ficha do modelo

A ficha de um modelo de um tipo que liga a capacidade `consumiveis.compatibilidade` SHALL mostrar "Consumíveis compatíveis", com os consumíveis compatíveis do modelo (spec consumiveis), pelo código, com o nome, o tipo, a cor e o rendimento. Para quem tem `consumiveis.ver`, cada um SHALL levar à ficha do consumível. Sem nenhum, a ficha SHALL dizer "Nenhum consumível compatível. A compatibilidade é escolhida na ficha de cada consumível.".

A seção SHALL aparecer só com o módulo Operação ligado, para quem vê a ficha do modelo, e SHALL NOT aparecer nos modelos dos tipos que não ligam a capacidade.

#### Scenario: Toners da M404
- **WHEN** alguém abre a ficha da "HP LaserJet M404", com o CF258A e o CF258X compatíveis
- **THEN** a ficha mostra os dois em "Consumíveis compatíveis", com o tipo, a cor e o rendimento

#### Scenario: Modelo de notebook
- **WHEN** alguém abre a ficha do "Dell Latitude 5440", de um tipo sem a capacidade
- **THEN** a ficha não mostra "Consumíveis compatíveis"

### Requirement: Operação atualizada pelos eventos

A lista e a ficha dos consumíveis e os consumíveis compatíveis na ficha do modelo SHALL se atualizar sozinhos quando o evento `consumiveis.mudaram` chega, sem uma ação do usuário. O nome trocado de um fornecedor ou de um modelo SHALL aparecer do mesmo jeito, pelos eventos deles. Um formulário em edição SHALL manter o que foi digitado.

#### Scenario: Consumível cadastrado com a lista aberta
- **WHEN** Ana cadastra o "CF258X" enquanto Bruno está com a lista dos consumíveis aberta
- **THEN** a lista de Bruno mostra o CF258X, sem recarregar a página

#### Scenario: Modelo renomeado com a ficha aberta
- **WHEN** quem edita os modelos renomeia a "HP LaserJet M404" enquanto a ficha do CF258A está aberta em outra sessão
- **THEN** a ficha mostra o nome novo nos modelos, sem uma ação do usuário
