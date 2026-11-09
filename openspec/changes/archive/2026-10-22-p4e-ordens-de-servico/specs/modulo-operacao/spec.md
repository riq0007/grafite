## MODIFIED Requirements

### Requirement: Operação no dock

A casca SHALL ter o módulo Operação, depois do Alertas e antes do Cofre. Ele SHALL ficar visível só para quem tem `consumiveis.ver`, `estoque.ver`, `solicitacoes.ver` ou `ordens.ver`, também pelas permissões que as incluem, e só com o módulo ligado na organização (spec modulos-da-organizacao). O menu SHALL ter "Consumíveis", para quem vê os consumíveis, "Estoque" e "Movimentações", para quem vê o estoque em algum local, "Solicitações", para quem vê as solicitações em algum local, e "Ordens de serviço", para quem vê as OS em algum local. O item do dock SHALL levar à primeira tela do menu que a conta vê, na ordem Consumíveis, Estoque, Solicitações e Ordens de serviço. No celular, o módulo SHALL ficar em "Mais".

A busca (Ctrl+K) SHALL oferecer:
- "Consumíveis", "Estoque", "Movimentações", "Solicitações" e "Ordens de serviço", no caminho "Operação", para quem vê cada um;
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

#### Scenario: Técnico só das OS
- **WHEN** Davi, com `ordens.atender` em Jundiaí e sem as outras permissões do Operação, abre o Operação pelo dock
- **THEN** o Operação abre nas Ordens de serviço, e o menu mostra só "Ordens de serviço"

#### Scenario: Nova OS pela busca
- **WHEN** quem atende as OS busca "ordem"
- **THEN** a busca oferece "Nova ordem de serviço", no caminho "Operação › Ordens de serviço", que abre o formulário dela

### Requirement: Operação atualizada pelos eventos

A lista e a ficha dos consumíveis e os consumíveis compatíveis na ficha do modelo SHALL se atualizar sozinhos quando o evento `consumiveis.mudaram` chega, sem uma ação do usuário. O nome trocado de um fornecedor ou de um modelo SHALL aparecer do mesmo jeito, pelos eventos deles. O estoque, as movimentações, a seção Estoque da ficha do consumível, o saldo no cartão da ficha do ativo e as ocorrências do estoque no Início SHALL se atualizar do mesmo jeito quando o evento `estoque.mudou` chega. A lista e a ficha das solicitações e a seção Solicitações da ficha do ativo SHALL se atualizar do mesmo jeito quando o evento `solicitacoes.mudaram` chega. A lista e a ficha das OS, a seção Ordens de serviço da ficha do ativo e a OS na ficha da solicitação SHALL se atualizar do mesmo jeito quando o evento `ordens.mudaram` chega. Um formulário em edição SHALL manter o que foi digitado.

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

## ADDED Requirements

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
