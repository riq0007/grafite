# modulo-operacao Specification

## Purpose
Reunir na casca o módulo Operação, onde moram os consumíveis da organização e, depois, o estoque, as solicitações e as ordens de serviço: a lista, o cadastro e a ficha dos consumíveis, e os consumíveis compatíveis na ficha dos modelos.

## Requirements

### Requirement: Operação no dock

A casca SHALL ter o módulo Operação, depois do Alertas e antes do Mapa. Ele SHALL ficar visível só para quem tem `consumiveis.ver`, `estoque.ver`, `solicitacoes.ver` ou `ordens.ver`, também pelas permissões que as incluem, e só com o módulo ligado na organização (spec modulos-da-organizacao).

O menu SHALL ter estes itens:
- "Início", para quem vê o módulo;
- "Consumíveis", para quem vê os consumíveis;
- "Estoque" e "Movimentações", para quem vê o estoque em algum local;
- "Solicitações", para quem vê as solicitações em algum local;
- "Ordens de serviço", para quem vê as OS em algum local;
- "Indicadores", para quem vê as OS ou o estoque em algum local.

O item do dock SHALL levar ao Início do Operação. No celular, o módulo SHALL ficar em "Mais".

A busca (Ctrl+K) SHALL oferecer:
- "Consumíveis", "Estoque", "Movimentações", "Solicitações", "Ordens de serviço" e "Indicadores", no caminho "Operação", para quem vê cada um;
- os consumíveis, no grupo "Consumíveis", para quem vê os consumíveis: pelo código, sem diferenciar maiúsculas, espaços e hífens, e pelo nome, sem diferenciar acento e maiúsculas, cada um levando à ficha;
- a ação "Novo consumível", para quem edita os consumíveis, no caminho "Operação › Consumíveis";
- as ações "Nova entrada no estoque", "Nova saída do estoque", "Nova transferência no estoque" e "Novo ajuste do estoque", para quem movimenta o estoque em algum local, no caminho "Operação › Estoque";
- as ações "Nova solicitação de toner", "Nova solicitação de conserto" e "Nova solicitação de equipamento", para quem atende as solicitações em algum local, no caminho "Operação › Solicitações";
- a ação "Nova ordem de serviço", para quem atende as OS em algum local, no caminho "Operação › Ordens de serviço".

Sem a permissão, o endereço do Operação SHALL dizer "Você não tem acesso à Operação.", com a quem pedir acesso.

#### Scenario: Conta sem a permissão
- **WHEN** uma conta sem `consumiveis.ver`, sem `estoque.ver`, sem `solicitacoes.ver` e sem `ordens.ver` entra
- **THEN** o dock e a busca não mostram o Operação, e o endereço dele diz "Você não tem acesso à Operação."

#### Scenario: Novo consumível pela busca
- **WHEN** quem edita os consumíveis busca "consumível"
- **THEN** a busca oferece "Novo consumível", no caminho "Operação › Consumíveis", que abre o cadastro

#### Scenario: Almoxarife sem os consumíveis
- **WHEN** Carla, com `estoque.movimentar` em Jundiaí e sem `consumiveis.ver`, abre o Operação pelo dock
- **THEN** o Operação abre no Início, com o bloco da entrada no estoque, e o menu mostra "Início", "Estoque", "Movimentações" e "Indicadores", sem "Consumíveis"

#### Scenario: Consumível pela busca
- **WHEN** quem vê os consumíveis busca "cf258"
- **THEN** a busca mostra o "CF258A" no grupo "Consumíveis", e escolhê-lo abre a ficha dele

#### Scenario: Atendente só das solicitações
- **WHEN** Eva, com `solicitacoes.atender` em Jundiaí e sem as permissões dos consumíveis e do estoque, abre o Operação pelo dock
- **THEN** o Operação abre no Início, com os blocos do toner, do conserto e do equipamento, e o menu mostra só "Início" e "Solicitações"

#### Scenario: Toner pela busca
- **WHEN** quem atende as solicitações busca "toner"
- **THEN** a busca oferece "Nova solicitação de toner", no caminho "Operação › Solicitações", que abre o formulário do Toner

#### Scenario: Técnico só das OS
- **WHEN** Davi, com `ordens.atender` em Jundiaí e sem as outras permissões do Operação, abre o Operação pelo dock
- **THEN** o Operação abre no Início, com o bloco "Nova ordem de serviço", e o menu mostra só "Início", "Ordens de serviço" e "Indicadores"

#### Scenario: Nova OS pela busca
- **WHEN** quem atende as OS busca "ordem"
- **THEN** a busca oferece "Nova ordem de serviço", no caminho "Operação › Ordens de serviço", que abre o formulário dela

#### Scenario: Indicadores pela busca
- **WHEN** quem vê as OS busca "indicadores"
- **THEN** a busca oferece "Indicadores", no caminho "Operação", que leva à tela dos indicadores da operação

#### Scenario: Quem administra a operação
- **WHEN** Ana, só com `operacao.administrar`, abre o Operação pelo dock
- **THEN** o Operação abre no Início, e o menu mostra "Início", "Estoque", "Movimentações", "Ordens de serviço" e "Indicadores"

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

A lista e a ficha dos consumíveis e os consumíveis compatíveis na ficha do modelo SHALL se atualizar sozinhos quando o evento `consumiveis.mudaram` chega, sem uma ação do usuário. O nome trocado de um fornecedor ou de um modelo SHALL aparecer do mesmo jeito, pelos eventos deles. O estoque, as movimentações, a seção Estoque da ficha do consumível, o saldo no cartão da ficha do ativo e as ocorrências do estoque no Início SHALL se atualizar do mesmo jeito quando o evento `estoque.mudou` chega. A lista e a ficha das solicitações e a seção Solicitações da ficha do ativo SHALL se atualizar do mesmo jeito quando o evento `solicitacoes.mudaram` chega. A lista e a ficha das OS, a seção Ordens de serviço da ficha do ativo e a OS na ficha da solicitação SHALL se atualizar do mesmo jeito quando o evento `ordens.mudaram` chega. A tela dos indicadores da operação SHALL se atualizar do mesmo jeito quando chega o evento `ordens.mudaram`, `estoque.mudou`, `consumiveis.mudaram` ou `metas.mudaram`. Um formulário em edição SHALL manter o que foi digitado.

#### Scenario: Consumível cadastrado com a lista aberta
- **WHEN** Ana cadastra o "CF258X" enquanto Bruno está com a lista dos consumíveis aberta
- **THEN** a lista de Bruno mostra o CF258X, sem recarregar a página

#### Scenario: Modelo renomeado com a ficha aberta
- **WHEN** quem edita os modelos renomeia a "HP LaserJet M404" enquanto a ficha do CF258A está aberta em outra sessão
- **THEN** a ficha mostra o nome novo nos modelos, sem uma ação do usuário

#### Scenario: Saída lançada com o estoque aberto
- **WHEN** Ana lança a saída de 1 CF258A do Almoxarifado enquanto Bruno está com o Estoque aberto
- **THEN** o saldo do CF258A no Almoxarifado de Bruno diminui 1, sem recarregar a página

#### Scenario: Solicitação registrada com a lista aberta
- **WHEN** Carla registra um Toner enquanto Bruno está com as Solicitações abertas
- **THEN** a lista de Bruno mostra a solicitação nova, sem recarregar a página

#### Scenario: OS resolvida com a ficha aberta
- **WHEN** Carla resolve a OS 12 enquanto Bruno está com a ficha dela aberta
- **THEN** a ficha de Bruno mostra a OS Resolvida, com o que foi feito, sem recarregar a página

#### Scenario: OS resolvida com os indicadores abertos
- **WHEN** Carla resolve a OS 12 enquanto Bruno está com os indicadores da operação abertos
- **THEN** o tempo de resolução de Bruno passa a contar a OS 12, sem recarregar a página

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

### Requirement: Tela das solicitações

A tela "Solicitações" SHALL listar as solicitações que a conta vê (spec solicitacoes), das mais novas para as mais antigas. Cada linha SHALL mostrar:
- o número, o tipo e a situação, em texto;
- quem pediu;
- o pedido: as impressoras com os itens, como "PAT-00412: 1 Preto"; o ativo e o defeito; ou a quantidade e o tipo de ativo, como "2 Notebook";
- os locais;
- o fornecedor e o número da OS, quando há o pedido ao fornecedor;
- quando foi registrada, como "há 3 d", com o momento exato ao parar o mouse.

Por padrão, a tela SHALL mostrar as pendentes, que são as Abertas, as Em atendimento e as Aguardando entrega, e o filtro da situação SHALL oferecer "Pendentes", cada situação e "Todas". O tipo e o local SHALL filtrar também. A busca SHALL achar pelo número, pelo nome de quem pediu, pelo nome, pelo patrimônio ou pela série da impressora ou do ativo, e pelo número da OS no fornecedor, sem diferenciar acento e maiúsculas. Os filtros e a busca SHALL ficar no endereço, e a lista SHALL trazer 50 por vez, com "Carregar mais".

Sem nenhuma solicitação, a tela SHALL dizer "Nenhuma solicitação ainda." e, para quem atende, oferecer "Nova solicitação". Sem nenhuma pendente, com outras registradas, SHALL dizer "Nenhuma solicitação pendente." e oferecer "Ver todas". Com os filtros sem resultado, SHALL dizer "Nenhuma solicitação com esses filtros." e oferecer "Limpar filtros".

Para quem atende, a tabela SHALL permitir selecionar as linhas, e a barra da tabela SHALL mostrar quantas estão selecionadas (spec componentes-base), com a ação em lote "Mudar a situação" (spec solicitacoes, "Mudança da situação em lote"). A seleção SHALL continuar ao trazer mais linhas e SHALL ser limpa depois da mudança. Cada linha que a conta atende SHALL oferecer, em "Ações", as ações que a situação e o tipo dela permitem, as mesmas da ficha.

#### Scenario: Pendentes por padrão
- **WHEN** Bruno abre as Solicitações
- **THEN** a lista mostra só as Abertas, as Em atendimento e as Aguardando entrega, das mais novas para as mais antigas, e o filtro da situação diz "Pendentes"

#### Scenario: Busca pelo patrimônio
- **WHEN** Carla busca "00412" nas Solicitações
- **THEN** a lista mostra as solicitações com a PAT-00412, e o endereço guarda a busca

#### Scenario: Primeira solicitação
- **WHEN** Carla abre as Solicitações sem nenhuma registrada
- **THEN** a tela diz "Nenhuma solicitação ainda." e oferece "Nova solicitação"

#### Scenario: Nenhuma pendente
- **WHEN** Bruno abre as Solicitações, e todas as que ele vê estão Concluídas ou Canceladas
- **THEN** a tela diz "Nenhuma solicitação pendente." e oferece "Ver todas", que mostra as encerradas

#### Scenario: Lote pela lista
- **WHEN** Carla seleciona três solicitações Abertas e muda a situação delas para Em atendimento
- **THEN** o retorno diz "3 solicitações mudaram.", as três mostram "Em atendimento", e a seleção fica limpa

### Requirement: Formulários das solicitações

O registro, a alteração, o pedido ao fornecedor, a entrega, a conclusão e o cancelamento SHALL abrir numa gaveta, pela tela das solicitações, pela ficha da solicitação e pela busca:
- **Nova solicitação:** a escolha do tipo e os campos dele (spec solicitacoes):
  - "Pedida por" SHALL buscar as pessoas ativas pelo nome, com as do local da impressora ou do ativo primeiro (spec administracao-de-pessoas), e SHALL mostrar "Cadastrar nova pessoa" embaixo, para quem cadastra pessoas, que abre a Nova pessoa numa aba e volta com a pessoa no campo e o resto do formulário como estava;
  - no toner, as impressoras SHALL ser escolhidas entre as que usam consumíveis e a conta vê, e cada uma SHALL mostrar o total de páginas e as cores, com a quantidade e o consumível sugerido de cada uma, ou "Nenhum compatível dessa cor.";
  - no conserto, o ativo e o defeito; no equipamento, o tipo de ativo, a quantidade, o motivo e o local;
- **Pedir ao fornecedor:** o fornecedor, com "Cadastrar novo fornecedor" embaixo, para quem cadastra fornecedores, e o número da OS;
- **Entregar:** os itens pendentes, todos escolhidos, e, em cada um, "Do estoque", com o consumível sugerido e o local de origem entre os locais em que a conta movimenta o estoque, com o saldo e o de maior saldo já escolhido, ou "Pelo fornecedor", com o fornecedor do pedido. Com o pedido ao fornecedor, ou para quem não movimenta o estoque, cada item SHALL vir "Pelo fornecedor"; sem eles, "Do estoque". Sem saldo do consumível nesses locais, "Do estoque" SHALL dizer "Sem saldo nos locais em que você movimenta o estoque.";
- **Concluir:** o que foi feito, no conserto e no equipamento;
- **Cancelar:** o motivo.

As recusas SHALL aparecer no campo, e os retornos SHALL ser "Solicitação <número> registrada.", "Solicitação alterada.", "Pedido ao fornecedor registrado.", "Entrega lançada.", "Solicitação concluída." e "Solicitação cancelada.".

#### Scenario: Toner com a sugestão
- **WHEN** Carla escolhe a PAT-00412 num Toner e põe 1 no preto
- **THEN** o formulário mostra o "CF258A · HP 58A" sugerido no preto e "Total de páginas: 48.210, lido em 21/10 14:02"

#### Scenario: Pessoa nova pelo campo
- **WHEN** Carla, que cadastra pessoas, escolhe "Cadastrar nova pessoa" em Pedida por e salva "Joana Prado"
- **THEN** a aba fecha, e a gaveta volta com Joana Prado em Pedida por e o resto do formulário como estava

#### Scenario: Entrega pela gaveta
- **WHEN** Carla abre "Entregar" na solicitação 42, com 6 CF258A no Almoxarifado, e lança
- **THEN** o preto vem "Do estoque", com o CF258A e "Jundiaí › Almoxarifado · saldo 6", o retorno diz "Entrega lançada.", e a solicitação fica Concluída

#### Scenario: Conserto pela busca
- **WHEN** quem atende escolhe "Nova solicitação de conserto" na busca
- **THEN** o Operação abre nas Solicitações com o formulário do Conserto

### Requirement: Ficha da solicitação

Cada solicitação SHALL ter a ficha, no endereço com o número, como "/operacao/solicitacoes/42", com tudo o que ela tem (spec solicitacoes):
- quem pediu, o tipo, a situação e a observação;
- no toner, as impressoras com o contador congelado e os itens com o consumível e a entrega de cada um: do estoque, com o local e o caminho para a movimentação, para quem vê o estoque, ou pelo fornecedor;
- no conserto, o ativo e o defeito, e a OS dele, com o número e a situação, que leva à ficha dela, para quem vê as OS; no equipamento, o tipo de ativo, a quantidade, o motivo e o local;
- o pedido ao fornecedor;
- quem registrou, concluiu ou cancelou e quando, o que foi feito e o motivo do cancelamento;
- "Ver na auditoria", para quem vê a auditoria.

Para quem atende, a ficha SHALL oferecer as ações que a situação e o tipo permitem: "Abrir OS", no conserto pendente sem OS, para quem também atende as OS, "Alterar", "Pedir ao fornecedor", "Entregar", "Concluir", "Mudar a situação" e "Cancelar". O conserto que segue a OS SHALL NOT oferecer nenhuma dessas ações. A solicitação que não existe ou que a conta não vê SHALL mostrar "Solicitação não encontrada.".

#### Scenario: Toner entregue na ficha
- **WHEN** Bruno, que só vê as solicitações, abre a ficha da solicitação 42, Concluída
- **THEN** a ficha mostra a PAT-00412 com o total de páginas congelado e o preto entregue do Almoxarifado com o CF258A, por Carla, sem nenhuma ação

#### Scenario: Ações do conserto
- **WHEN** Carla, que atende as solicitações e as OS, abre a ficha de um Conserto Em atendimento sem OS
- **THEN** a ficha oferece "Abrir OS", "Alterar", "Concluir", "Mudar a situação" e "Cancelar", sem "Entregar" e sem "Pedir ao fornecedor"

#### Scenario: Conserto com a OS
- **WHEN** Carla abre a ficha da solicitação 43, cujo conserto segue a OS 12, Aguardando peça
- **THEN** a ficha mostra "OS 12 · Aguardando peça", que leva à ficha da OS, sem nenhuma ação da solicitação

#### Scenario: Solicitação que não existe
- **WHEN** alguém abre "/operacao/solicitacoes/9999", que não existe
- **THEN** a ficha mostra "Solicitação não encontrada."

### Requirement: Tela das ordens de serviço

A tela "Ordens de serviço" SHALL listar as OS que a conta vê (spec ordens-de-servico), das mais novas para as mais antigas. Cada linha SHALL mostrar:
- o número e a situação, em texto;
- o ativo, pelo patrimônio e pelo nome;
- o problema;
- o local;
- a solicitação de que ela nasceu, quando há, como "Solicitação 43";
- quando foi aberta, como "há 3 d", e a última mudança, com quem a fez.

Por padrão, a tela SHALL mostrar as em aberto, que são as Abertas, as Em atendimento, as Aguardando peça e as Aguardando fornecedor, e o filtro da situação SHALL oferecer "Em aberto", cada situação e "Todas". O local SHALL filtrar também. A busca SHALL achar pelo número, pelo nome, pelo patrimônio ou pela série do ativo, pelo problema e pelo número da OS no fornecedor, sem diferenciar acento e maiúsculas. Os filtros e a busca SHALL ficar no endereço, e a lista SHALL trazer 50 por vez, com "Carregar mais".

Sem nenhuma OS, a tela SHALL dizer "Nenhuma ordem de serviço ainda." e, para quem atende, oferecer "Nova ordem de serviço". Sem nenhuma em aberto, com outras abertas antes, SHALL dizer "Nenhuma ordem de serviço em aberto." e oferecer "Ver todas". Com os filtros sem resultado, SHALL dizer "Nenhuma ordem de serviço com esses filtros." e oferecer "Limpar filtros".

Para quem atende, a tabela SHALL permitir selecionar as linhas, e a barra da tabela SHALL mostrar quantas estão selecionadas, com a ação em lote "Mudar a situação" (spec ordens-de-servico, "Mudança da situação das OS em lote"). A seleção SHALL continuar ao trazer mais linhas e SHALL ser limpa depois da mudança. Cada linha que a conta atende SHALL oferecer, em "Ações", as ações que a situação dela permite, as mesmas da ficha, e a linha SHALL abrir a ficha.

#### Scenario: Em aberto por padrão
- **WHEN** Bruno abre as Ordens de serviço
- **THEN** a lista mostra só as Abertas, as Em atendimento, as Aguardando peça e as Aguardando fornecedor, das mais novas para as mais antigas, e o filtro da situação diz "Em aberto"

#### Scenario: Busca pelo patrimônio
- **WHEN** Carla busca "nb-0031" nas Ordens de serviço
- **THEN** a lista mostra as OS do NB-0031, e o endereço guarda a busca

#### Scenario: Primeira ordem de serviço
- **WHEN** Carla abre as Ordens de serviço sem nenhuma aberta
- **THEN** a tela diz "Nenhuma ordem de serviço ainda." e oferece "Nova ordem de serviço"

### Requirement: Formulários das ordens de serviço

A abertura, a correção, a mudança da situação, as peças, a resolução, a reabertura e o encerramento SHALL abrir numa gaveta, pela tela das OS, pela ficha da OS, pela ficha do ativo e pela busca:
- **Nova ordem de serviço:** o ativo, entre os ativos ativos que a conta vê, pelo nome, pelo patrimônio ou pela série, e o problema;
- **Mudar a situação:** Em atendimento, Aguardando peça ou Aguardando fornecedor, com a observação; Aguardando fornecedor pede o fornecedor, com "Cadastrar novo fornecedor" embaixo, para quem cadastra fornecedores, e o número da OS no fornecedor;
- **Lançar peça:** o consumível, com as Peças primeiro, o local de origem entre os locais em que a conta movimenta o estoque, com o saldo e o de maior saldo já escolhido, e a quantidade. Sem saldo do consumível nesses locais, SHALL dizer "Sem saldo nos locais em que você movimenta o estoque.";
- **Resolver:** o que foi feito;
- **Reabrir:** o motivo;
- **Encerrar:** na Resolvida, a confirmação;
- **Encerrar sem resolver:** o motivo;
- **Corrigir:** o problema e, na OS com o fornecedor, o fornecedor e o número da OS no fornecedor, como na mudança da situação.

"Abrir OS", na ficha e na linha da solicitação de conserto, SHALL abrir a OS sem gaveta, com o ativo e o defeito dela, e levar à ficha da OS nova.

As recusas SHALL aparecer no campo, e os retornos SHALL ser "OS <número> aberta.", "OS corrigida.", "Situação mudada.", "Peça lançada.", "OS resolvida.", "OS reaberta." e "OS encerrada.".

#### Scenario: Nova OS pela ficha do ativo
- **WHEN** Carla escolhe "Nova ordem de serviço" na ficha do NB-0031
- **THEN** a gaveta abre com o NB-0031 no ativo, e a OS aberta volta com "OS 12 aberta."

#### Scenario: Peça pela gaveta
- **WHEN** Carla abre "Lançar peça" na OS 12, com 3 Fonte 65W no Almoxarifado, e lança 1
- **THEN** a Fonte 65W vem com "Jundiaí › Almoxarifado · saldo 3", o retorno diz "Peça lançada.", e a ficha lista a peça

#### Scenario: Conserto aberto como OS
- **WHEN** Carla escolhe "Abrir OS" na ficha da solicitação 43
- **THEN** a ficha da OS nova abre, com o retorno "OS 12 aberta.", o NB-0031 e o problema "Não liga"

### Requirement: Ficha da ordem de serviço

Cada OS SHALL ter a ficha, no endereço com o número, como "/operacao/ordens/12", com tudo o que ela tem (spec ordens-de-servico):
- o número e a situação no título;
- o ativo, que leva à ficha dele para quem o vê, o local e o problema;
- a solicitação de que ela nasceu, com quem pediu, que leva à ficha dela;
- o fornecedor e o número da OS no fornecedor;
- o histórico das situações, da mais nova para a mais antiga, cada uma com quem mudou, quando e a observação, o que foi feito ou o motivo;
- as peças, com o consumível, a quantidade, o local, quem lançou e quando, e o caminho para a movimentação, para quem vê o estoque;
- quem abriu, resolveu e encerrou e quando;
- "Ver na auditoria", para quem vê a auditoria.

Para quem atende, a ficha SHALL oferecer as ações que a situação permite: na em aberto, "Mudar a situação", "Lançar peça", "Resolver", "Corrigir" e "Encerrar sem resolver"; na Resolvida, "Reabrir" e "Encerrar"; na Encerrada, nenhuma. A OS que não existe ou que a conta não vê SHALL mostrar "Ordem de serviço não encontrada.".

#### Scenario: OS resolvida na ficha
- **WHEN** Bruno, que só vê as OS, abre a ficha da OS 12, Resolvida
- **THEN** a ficha mostra o NB-0031, o histórico de Aberta a Resolvida, a Fonte 65W lançada do Almoxarifado e "Fonte trocada", sem nenhuma ação

#### Scenario: Ações da Resolvida
- **WHEN** Carla abre a ficha da OS 12, Resolvida
- **THEN** a ficha oferece "Reabrir" e "Encerrar", sem "Lançar peça" e sem "Mudar a situação"

#### Scenario: OS que não existe
- **WHEN** alguém abre "/operacao/ordens/9999", que não existe
- **THEN** a ficha mostra "Ordem de serviço não encontrada."

### Requirement: Início do Operação

O endereço `/operacao` SHALL abrir o Início do Operação.

Ele SHALL ter as ações principais em blocos grandes, cada um com o nome e uma frase do que faz:
- o pedido de toner, o conserto e o equipamento, para quem atende as solicitações em algum local;
- a nova ordem de serviço, para quem atende as OS em algum local;
- a entrada no estoque, para quem movimenta o estoque em algum local.

Embaixo, ele SHALL ter os atalhos para as listas que a conta vê: Solicitações, Ordens de serviço, Estoque, Movimentações, Consumíveis e Indicadores.

Cada bloco SHALL abrir a gaveta da ação na lista dela. Quem não tem nenhuma ação SHALL ver só os atalhos.

#### Scenario: Pedido de toner pelo Início
- **WHEN** a técnica abre o Operação e escolhe "Pedido de toner"
- **THEN** a lista das solicitações abre com o formulário do toner

#### Scenario: Quem só vê as OS
- **WHEN** uma conta com `ordens.ver` e sem `ordens.atender` abre o Operação
- **THEN** ela vê o atalho das Ordens de serviço, sem o bloco "Nova ordem de serviço"
