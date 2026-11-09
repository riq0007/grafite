## MODIFIED Requirements

### Requirement: Operação no dock

A casca SHALL ter o módulo Operação, depois do Alertas e antes do Cofre. Ele SHALL ficar visível só para quem tem `consumiveis.ver`, `estoque.ver` ou `solicitacoes.ver`, também pelas permissões que as incluem, e só com o módulo ligado na organização (spec modulos-da-organizacao). O menu SHALL ter "Consumíveis", para quem vê os consumíveis, "Estoque" e "Movimentações", para quem vê o estoque em algum local, e "Solicitações", para quem vê as solicitações em algum local. O item do dock SHALL levar aos Consumíveis; a quem não vê os consumíveis, ao Estoque; e a quem vê só as solicitações, às Solicitações. No celular, o módulo SHALL ficar em "Mais".

A busca (Ctrl+K) SHALL oferecer:
- "Consumíveis", "Estoque", "Movimentações" e "Solicitações", no caminho "Operação", para quem vê cada um;
- os consumíveis, no grupo "Consumíveis", para quem vê os consumíveis: pelo código, sem diferenciar maiúsculas, espaços e hífens, e pelo nome, sem diferenciar acento e maiúsculas, cada um levando à ficha;
- a ação "Novo consumível", para quem edita os consumíveis, no caminho "Operação › Consumíveis";
- as ações "Nova entrada no estoque", "Nova saída do estoque", "Nova transferência no estoque" e "Novo ajuste do estoque", para quem movimenta o estoque em algum local, no caminho "Operação › Estoque";
- as ações "Nova solicitação de toner", "Nova solicitação de conserto" e "Nova solicitação de equipamento", para quem atende as solicitações em algum local, no caminho "Operação › Solicitações".

Sem a permissão, o endereço do Operação SHALL dizer "Você não tem acesso à Operação.", com a quem pedir acesso.

#### Scenario: Conta sem a permissão
- **WHEN** uma conta sem `consumiveis.ver`, sem `estoque.ver` e sem `solicitacoes.ver` entra
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

#### Scenario: Atendente só das solicitações
- **WHEN** Eva, com `solicitacoes.atender` em Jundiaí e sem as permissões dos consumíveis e do estoque, abre o Operação pelo dock
- **THEN** o Operação abre nas Solicitações, e o menu mostra só "Solicitações"

#### Scenario: Toner pela busca
- **WHEN** quem atende as solicitações busca "toner"
- **THEN** a busca oferece "Nova solicitação de toner", no caminho "Operação › Solicitações", que abre o formulário do Toner

### Requirement: Operação atualizada pelos eventos

A lista e a ficha dos consumíveis e os consumíveis compatíveis na ficha do modelo SHALL se atualizar sozinhos quando o evento `consumiveis.mudaram` chega, sem uma ação do usuário. O nome trocado de um fornecedor ou de um modelo SHALL aparecer do mesmo jeito, pelos eventos deles. O estoque, as movimentações, a seção Estoque da ficha do consumível, o saldo no cartão da ficha do ativo e as ocorrências do estoque no Início SHALL se atualizar do mesmo jeito quando o evento `estoque.mudou` chega. A lista e a ficha das solicitações e a seção Solicitações da ficha do ativo SHALL se atualizar do mesmo jeito quando o evento `solicitacoes.mudaram` chega. Um formulário em edição SHALL manter o que foi digitado.

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

## ADDED Requirements

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
- no conserto, o ativo e o defeito; no equipamento, o tipo de ativo, a quantidade, o motivo e o local;
- o pedido ao fornecedor;
- quem registrou, concluiu ou cancelou e quando, o que foi feito e o motivo do cancelamento;
- "Ver na auditoria", para quem vê a auditoria.

Para quem atende, a ficha SHALL oferecer as ações que a situação e o tipo permitem: "Alterar", "Pedir ao fornecedor", "Entregar", "Concluir", "Mudar a situação" e "Cancelar". A solicitação que não existe ou que a conta não vê SHALL mostrar "Solicitação não encontrada.".

#### Scenario: Toner entregue na ficha
- **WHEN** Bruno, que só vê as solicitações, abre a ficha da solicitação 42, Concluída
- **THEN** a ficha mostra a PAT-00412 com o total de páginas congelado e o preto entregue do Almoxarifado com o CF258A, por Carla, sem nenhuma ação

#### Scenario: Ações do conserto
- **WHEN** Carla abre a ficha de um Conserto Em atendimento
- **THEN** a ficha oferece "Alterar", "Concluir", "Mudar a situação" e "Cancelar", sem "Entregar" e sem "Pedir ao fornecedor"

#### Scenario: Solicitação que não existe
- **WHEN** alguém abre "/operacao/solicitacoes/9999", que não existe
- **THEN** a ficha mostra "Solicitação não encontrada."
