## Why

O pedido de toner, de conserto ou de um equipamento chega à TI por telefone, por mensagem ou no corredor e não fica registrado. O estoque da P4c sabe o que saiu para cada impressora, mas não por pedido de quem. No PMG, as solicitações de toner tinham dois problemas (spec mestre, seção 13.2):
- o solicitante era um texto livre;
- a solicitação se apagava e mudava sem auditoria.

A P4d · Solicitações é a quarta change do P4 (spec mestre, seção 3.2): o pedido do colaborador, com o que as solicitações de toner do PMG fazem, que são os itens por cor, os contadores congelados e o status em lote. Em 21/10, o usuário escolheu:
- **quem registra:** a TI, em nome da pessoa; a aba em que os colaboradores abrem o próprio chamado fica para o portal do colaborador (A1);
- **os tipos:** toner, conserto e equipamento;
- **o atendimento do toner:** pelo estoque ou pelo fornecedor;
- **o pedido do toner:** pela cor, com o consumível sugerido.

## What Changes

- **Solicitação**, no módulo Operação:
  - três tipos: o Toner, com uma ou mais impressoras e os itens pela cor; o Conserto, com o ativo e o defeito; e o Equipamento, com o tipo de ativo, a quantidade, o motivo e o local;
  - registrada por quem atende, com a pessoa que pediu escolhida no cadastro, o número sequencial na organização, quem registrou e quando;
  - a situação em texto: Aberta, Em atendimento, Aguardando entrega, Concluída ou Cancelada;
  - o cancelamento pede o motivo, e nenhuma solicitação se apaga.
- **Toner:**
  - cada item tem a impressora, a cor e a quantidade, com o consumível compatível daquela cor já sugerido;
  - o total de páginas de cada impressora fica congelado no momento em que ela entra na solicitação;
  - o pedido ao fornecedor guarda o fornecedor e o número da OS dele, a "OS digital" do PMG;
  - a entrega de cada item vem do estoque, com a saída lançada no livro-razão para a impressora, ou pelo fornecedor, sem mexer no estoque;
  - com todos os itens entregues, a solicitação se conclui.
- **Telas:**
  - "Solicitações", com as pendentes por padrão, os filtros do tipo e do local, a busca e a mudança da situação em lote;
  - a ficha da solicitação, com as ações de cada situação;
  - os formulários numa gaveta, com "Cadastrar nova pessoa" embaixo do campo de quem pediu;
  - a seção "Solicitações" na ficha do ativo, com a nova solicitação já com o ativo.
- **Permissões** `solicitacoes.ver` e `solicitacoes.atender`, com escopo de local. A entrega do estoque pede também `estoque.movimentar` no local de origem, como a saída.
- **Banco:** a migration 0038 cria as solicitações, as impressoras de cada uma, com o contador congelado, e os itens do toner. O papel da aplicação não apaga uma solicitação.
- **Auditoria e evento:** toda mudança vai para a auditoria com o "antes → depois", e o evento `solicitacoes.mudaram` chega a quem vê as solicitações dos locais dela.

**Fora desta change:**
- a aba em que os colaboradores abrem e acompanham o próprio chamado, com o QR code e o push, que fica para o portal do colaborador (A1);
- a ordem de serviço que nasce do conserto, na P4e;
- a notificação e a ocorrência no Início da solicitação parada, e o tempo de resolução, que fica para os indicadores da P4f;
- o ativo entregue ligado à solicitação de equipamento;
- os contadores de páginas em preto e branco e em cores, porque a coleta da P2b traz só o total;
- reabrir uma solicitação concluída ou cancelada: o pedido de novo é outra solicitação.

## Capabilities

### New Capabilities

- `solicitacoes`: a solicitação e os três tipos, a situação, a alteração e a mudança em lote, os itens do toner com o consumível sugerido, o contador congelado, o pedido ao fornecedor, a entrega pelo estoque ou pelo fornecedor e quem vê e quem atende.

### Modified Capabilities

- `modulo-operacao`:
  - "Operação no dock" ganha as solicitações no menu e na busca, com as ações de registrar;
  - entram a tela das solicitações, os formulários e a ficha da solicitação;
  - a atualização pelos eventos ganha `solicitacoes.mudaram`.
- `cadastro-de-ativos`: a seção "Solicitações" na ficha do ativo.
- `administracao-de-pessoas`: os nomes das pessoas ativas servem também para escolher quem pediu uma solicitação.
- `permissoes`: `solicitacoes.ver` e `solicitacoes.atender` no catálogo.
- `auditoria`: as solicitações registradas.
- `eventos-em-tempo-real`: o evento `solicitacoes.mudaram`.
- `modulos-da-organizacao`: a descrição do Operação, com as solicitações.

## Impact

- **Domínio (`packages/domain`):** a solicitação, os tipos, as situações e as mudanças, as recusas, a sugestão do consumível pela cor e os textos; as permissões, as ações da auditoria e o evento.
- **Banco (`packages/db`):** a migration 0038, com a numeração por organização e o teste-guarda do RLS.
- **API (`apps/api`):** as rotas das solicitações no escopo do Operação; a entrega pelo lançamento da saída da P4c, na mesma transação; as solicitações na ficha do ativo; o contrato e o cliente gerados de novo.
- **Web (`apps/web`):** o Operação com a tela, a ficha, os formulários, a busca e a relação na ficha do ativo.
- **Documentação:** a spec mestre (seção 3.2), o runbook ("A versão com as solicitações"), o contrato de módulo e o mapa.
- **Depois da atualização:** quem administra dá `solicitacoes.ver` e `solicitacoes.atender` aos perfis da TI.
