## MODIFIED Requirements

### Requirement: Operação no dock

A casca SHALL ter o módulo Operação, depois do Alertas e antes do Cofre. Ele SHALL ficar visível só para quem tem `consumiveis.ver` ou `estoque.ver`, também pelas permissões que as incluem, e só com o módulo ligado na organização (spec modulos-da-organizacao). O menu SHALL ter "Consumíveis", para quem vê os consumíveis, e "Estoque" e "Movimentações", para quem vê o estoque em algum local. O item do dock SHALL levar aos Consumíveis e, para quem só vê o estoque, ao Estoque. No celular, o módulo SHALL ficar em "Mais".

A busca (Ctrl+K) SHALL oferecer:
- "Consumíveis", "Estoque" e "Movimentações", no caminho "Operação", para quem vê cada um;
- os consumíveis, no grupo "Consumíveis", para quem vê os consumíveis: pelo código, sem diferenciar maiúsculas, espaços e hífens, e pelo nome, sem diferenciar acento e maiúsculas, cada um levando à ficha;
- a ação "Novo consumível", para quem edita os consumíveis, no caminho "Operação › Consumíveis";
- as ações "Nova entrada no estoque", "Nova saída do estoque", "Nova transferência no estoque" e "Novo ajuste do estoque", para quem movimenta o estoque em algum local, no caminho "Operação › Estoque".

Sem a permissão, o endereço do Operação SHALL dizer "Você não tem acesso à Operação.", com a quem pedir acesso.

#### Scenario: Conta sem a permissão
- **WHEN** uma conta sem `consumiveis.ver` e sem `estoque.ver` entra
- **THEN** o dock e a busca não mostram o Operação, e o endereço dele diz "Você não tem acesso à Operação."

#### Scenario: Novo consumível pela busca
- **WHEN** quem edita os consumíveis busca "consumível"
- **THEN** a busca oferece "Novo consumível", no caminho "Operação › Consumíveis", que abre o cadastro

#### Scenario: Almoxarife sem os consumíveis
- **WHEN** Carla, com `estoque.movimentar` em Jundiaí e sem `consumiveis.ver`, abre o Operação pelo dock
- **THEN** o Operação abre no Estoque, e o menu mostra "Estoque" e "Movimentações", sem "Consumíveis"

#### Scenario: Consumível pela busca
- **WHEN** quem vê os consumíveis busca "cf258"
- **THEN** a busca mostra o "CF258A" no grupo "Consumíveis", e escolhê-lo abre a ficha dele

### Requirement: Operação atualizada pelos eventos

A lista e a ficha dos consumíveis e os consumíveis compatíveis na ficha do modelo SHALL se atualizar sozinhos quando o evento `consumiveis.mudaram` chega, sem uma ação do usuário. O nome trocado de um fornecedor ou de um modelo SHALL aparecer do mesmo jeito, pelos eventos deles. O estoque, as movimentações, a seção Estoque da ficha do consumível, o saldo no cartão da ficha do ativo e as ocorrências do estoque no Início SHALL se atualizar do mesmo jeito quando o evento `estoque.mudou` chega. Um formulário em edição SHALL manter o que foi digitado.

#### Scenario: Consumível cadastrado com a lista aberta
- **WHEN** Ana cadastra o "CF258X" enquanto Bruno está com a lista dos consumíveis aberta
- **THEN** a lista de Bruno mostra o CF258X, sem recarregar a página

#### Scenario: Modelo renomeado com a ficha aberta
- **WHEN** quem edita os modelos renomeia a "HP LaserJet M404" enquanto a ficha do CF258A está aberta em outra sessão
- **THEN** a ficha mostra o nome novo nos modelos, sem uma ação do usuário

#### Scenario: Saída lançada com o estoque aberto
- **WHEN** Ana lança a saída de 1 CF258A do Almoxarifado enquanto Bruno está com o Estoque aberto
- **THEN** o saldo do CF258A no Almoxarifado de Bruno diminui 1, sem recarregar a página

## ADDED Requirements

### Requirement: Tela do estoque

A tela Estoque SHALL mostrar os saldos dos consumíveis nos locais que a conta vê, um por linha, com:
- o consumível, pelo código, com o nome, o tipo e a cor, em texto;
- o local, pelo caminho, como "Jundiaí › Almoxarifado";
- o saldo;
- o mínimo, ou "Sem mínimo";
- a situação, em texto (spec estoque, "Mínimo do consumível no local").

A linha SHALL existir para o consumível no local que já teve uma movimentação ou um mínimo. A tela SHALL buscar pelo código e pelo nome do consumível e filtrar pelo local, com os de dentro, pelo tipo do consumível e pela situação, com "Abaixo do mínimo", que traz também os sem estoque com o mínimo. Ela SHALL ser paginada no servidor, sem limite fixo, e o consumível SHALL levar à ficha dele para quem vê os consumíveis.

Para quem movimenta o estoque em algum local, a tela SHALL oferecer "Entrada", "Saída", "Transferência" e "Ajuste", e cada linha de um local em que a conta movimenta, "Definir mínimo". Sem nenhuma linha, a tela SHALL dizer "Nenhum consumível no estoque ainda." e oferecer "Entrada" a quem movimenta.

#### Scenario: Toners abaixo do mínimo
- **WHEN** alguém filtra a situação "Abaixo do mínimo", com o CF258A em 2 de 5 no Almoxarifado e em 0 de 2 na Expedição
- **THEN** a tela mostra as duas linhas, com "Abaixo do mínimo" e "Sem estoque", e diz o filtro em texto

#### Scenario: Primeira entrada
- **WHEN** quem movimenta o estoque abre a tela numa organização sem movimentações
- **THEN** a tela diz "Nenhum consumível no estoque ainda." e oferece "Entrada"

#### Scenario: Quem só vê o estoque
- **WHEN** uma conta com só `estoque.ver` abre o Estoque
- **THEN** a tela mostra os saldos, sem "Entrada", "Saída", "Transferência", "Ajuste" e "Definir mínimo"

### Requirement: Movimentações

A tela Movimentações SHALL mostrar o livro-razão dos locais que a conta vê, da movimentação mais nova para a mais antiga, com:
- o momento, no fuso escolhido;
- o tipo, em texto;
- o consumível e a quantidade;
- a origem e o destino;
- o detalhe do tipo: o fornecedor e a nota, o ativo e o contador de páginas, ou o motivo;
- a observação e quem lançou.

A tela SHALL filtrar pelo período, pelo tipo, pelo local, com os de dentro, pelo consumível, pelo fornecedor e pelo ativo, com os filtros no endereço, e SHALL ser paginada no servidor. Sem nenhuma movimentação no filtro, ela SHALL dizer "Nenhuma movimentação encontrada.".

#### Scenario: Toners da PAT-00412
- **WHEN** alguém filtra as movimentações pelo ativo PAT-00412
- **THEN** a tela mostra as saídas para a PAT-00412, com o contador de páginas de cada uma

#### Scenario: Entradas da HP Brasil
- **WHEN** alguém filtra o tipo Entrada e o fornecedor "HP Brasil"
- **THEN** a tela mostra só as entradas da HP Brasil, com a nota de cada uma

### Requirement: Lançamento das movimentações

Cada movimentação SHALL ser lançada num formulário numa gaveta, aberto pela ação dela na tela do estoque ou pela busca, com os campos do tipo (spec estoque, "Movimentação do estoque"). O formulário SHALL:
- vir com o consumível e o local da linha, quando aberto por uma linha do estoque;
- mostrar o saldo do consumível no local de origem, perto da quantidade;
- oferecer, para escolher, só os locais em que a conta movimenta o estoque, na origem e no destino;
- oferecer "Cadastrar novo consumível" no campo do consumível, a quem edita os consumíveis (spec consumiveis, "Novo consumível numa aba"), e "Cadastrar novo fornecedor" no campo do fornecedor, a quem edita os fornecedores (spec fornecedores, "Novo fornecedor numa aba");
- na saída, trazer primeiro, como sugeridos, os ativos de modelo compatível com o consumível (spec consumiveis, "Compatibilidade com os modelos");
- mostrar as recusas no campo e manter o que foi preenchido.

Os retornos SHALL ser "Entrada lançada.", "Saída lançada.", "Transferência lançada." e "Ajuste lançado.". O mínimo SHALL ser definido numa gaveta aberta pela linha do estoque, com o retorno "Mínimo salvo.".

#### Scenario: Toner novo na entrada
- **WHEN** quem movimenta o estoque e edita os consumíveis lança uma entrada, escolhe "Cadastrar novo consumível" e salva o "CF259A"
- **THEN** a aba fecha, e a entrada vem com o CF259A no campo do consumível e o resto como estava

#### Scenario: Impressoras sugeridas na saída
- **WHEN** alguém lança a saída do CF258A, compatível com a "HP LaserJet M404"
- **THEN** a escolha do ativo traz primeiro as impressoras M404 que a conta vê, como sugeridas

### Requirement: Estoque na ficha do consumível

Para quem vê o estoque, a ficha do consumível SHALL ter a seção "Estoque", com:
- o saldo, o mínimo e a situação do consumível em cada local que a conta vê, com a soma dos saldos;
- as 10 movimentações mais novas do consumível nesses locais;
- o caminho para as Movimentações filtradas pelo consumível.

Sem nenhuma movimentação, a seção SHALL dizer "Nenhuma movimentação deste consumível.". Para quem movimenta o estoque, a seção SHALL oferecer "Entrada" com o consumível.

#### Scenario: CF258A em dois locais
- **WHEN** quem vê o estoque de Jundiaí abre a ficha do CF258A, com 7 no Almoxarifado e 2 na Expedição
- **THEN** a seção Estoque mostra os dois locais, com o saldo, o mínimo e a situação, a soma 9 e as últimas movimentações

### Requirement: Estoque abaixo do mínimo no Início

O Operação SHALL registrar uma fonte de ocorrências (spec tela-inicial). Cada consumível abaixo do mínimo num local que a conta vê no estoque SHALL ser uma ocorrência de Atenção, com:
- o texto "<código> abaixo do mínimo em <local>: <saldo> de <mínimo>", ou "Sem <código> em <local>: mínimo <mínimo>", com o saldo 0;
- o consumível no lugar do ativo, pelo código e pelo nome, com a imagem genérica;
- o momento em que ele ficou abaixo do mínimo (spec estoque, "Mínimo do consumível no local");
- o caminho para o Estoque, filtrado pelo consumível e pelo local.

A ocorrência SHALL sair da lista quando o saldo volta ao mínimo ou o mínimo baixa, sem recarregar a página.

#### Scenario: Toner acabando
- **WHEN** o CF258A fica em 2 de 5 no Almoxarifado
- **THEN** quem vê o estoque de Jundiaí tem, em "O que resolver agora", a ocorrência de Atenção "CF258A abaixo do mínimo em Jundiaí › Almoxarifado: 2 de 5"

#### Scenario: Entrada que repõe
- **WHEN** alguém lança a entrada de 10 CF258A no Almoxarifado, que estava em 2 de 5
- **THEN** a ocorrência sai de "O que resolver agora", sem recarregar a página
