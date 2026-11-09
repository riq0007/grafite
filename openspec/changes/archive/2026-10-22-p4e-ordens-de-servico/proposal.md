## Why

O conserto pedido numa solicitação da P4d se resolve hoje com um "Concluir" e um texto, e o trabalho da TI que ninguém pediu, como a manutenção que ela mesma achou, não fica registrado. Não há onde guardar quanto tempo um ativo ficou parado esperando a peça ou a assistência, que peças ele levou e se o mesmo problema voltou, que é o que os indicadores da P4f vão ler: o tempo de resolução das OS e as OS repetidas.

A P4e · Ordens de serviço é a quinta change do P4 (spec mestre, seção 3.2): o trabalho da TI ligado a um ativo, com o histórico das situações e as peças do estoque. Em 22/10, o usuário escolheu:
- **como a OS nasce:** pela solicitação de conserto, que se conclui quando a OS é resolvida, e direto no ativo, sem pedido;
- **as situações:** as seis da spec mestre, com a Resolvida que reabre se o problema voltar e a Encerrada final;
- **as peças:** do estoque, com o tipo Peça no catálogo dos consumíveis e a saída lançada para o ativo da OS;
- **quem atende:** a equipe toda, sem um responsável por OS; o histórico diz quem mexeu.

## What Changes

- **Ordem de serviço**, no módulo Operação:
  - ligada a um ativo, com o problema, o número sequencial na organização, quem a abriu e quando;
  - aberta direto no ativo, ou pela solicitação de conserto, uma OS por solicitação;
  - a situação em texto: Aberta, Em atendimento, Aguardando peça, Aguardando fornecedor, Resolvida ou Encerrada;
  - o histórico das situações, com quem mudou, quando e a observação, e nada se apaga;
  - "Aguardando fornecedor" guarda o fornecedor e o número da OS dele, como o pedido ao fornecedor da P4d;
  - a resolução pede o que foi feito; a Resolvida reabre, com o motivo, e se encerra; a OS aberta por engano se encerra sem resolver, com o motivo.
- **Peças do estoque:**
  - o catálogo dos consumíveis ganha o tipo Peça;
  - a peça usada na OS lança no livro-razão da P4c a saída do estoque para o ativo da OS, com "OS <número>" na observação.
- **Solicitação de conserto:**
  - "Abrir OS" gera a OS com o ativo e o defeito, e a solicitação passa a Em atendimento;
  - daí em diante ela segue a OS: conclui-se quando a OS é resolvida, com o que foi feito, e cancela-se quando a OS é encerrada sem resolver, com o motivo.
- **Telas:**
  - "Ordens de serviço", com as em aberto por padrão, os filtros da situação e do local, a busca e a mudança da situação em lote;
  - a ficha da OS, com o histórico, as peças e as ações de cada situação;
  - os formulários numa gaveta;
  - a seção "Ordens de serviço" na ficha do ativo, com a nova OS já com o ativo;
  - "Abrir OS" e a OS na ficha da solicitação de conserto.
- **Permissões** `ordens.ver` e `ordens.atender`, com escopo de local. A peça do estoque pede também `estoque.movimentar` no local de origem, como a saída, e "Abrir OS" pede `solicitacoes.atender` nos locais da solicitação.
- **Banco:** a migration 0039 cria as ordens de serviço, o histórico das situações, as peças e a numeração, e acrescenta o tipo Peça aos consumíveis. O papel da aplicação não apaga uma OS nem o histórico.
- **Auditoria e evento:** toda mudança vai para a auditoria com o "antes → depois", e o evento `ordens.mudaram` chega a quem vê as OS do local do ativo.

**Fora desta change:**
- o técnico responsável por OS, que o usuário dispensou: a equipe toda atende;
- os indicadores do tempo de resolução e das OS repetidas, com as metas, que ficam para a P4f;
- a OS aberta pelo colaborador e o acompanhamento dela pelo portal, que fica para o A1;
- a notificação e a ocorrência no Início da OS parada;
- o encerramento automático da Resolvida depois de alguns dias: quem atende encerra, também em lote;
- a troca do ativo de uma OS: o ativo errado se resolve encerrando a OS sem resolver e abrindo outra;
- a OS de manutenção preventiva agendada.

## Capabilities

### New Capabilities

- `ordens-de-servico`: a OS ligada a um ativo, as situações e o histórico, a abertura direta e pela solicitação de conserto, o fornecedor, as peças do estoque, a resolução, a reabertura e o encerramento, a mudança em lote e quem vê e quem atende.

### Modified Capabilities

- `solicitacoes`: o conserto com a OS, que segue a situação dela e não muda por si.
- `consumiveis`: o tipo Peça.
- `modulo-operacao`:
  - "Operação no dock" ganha as ordens de serviço no menu e na busca, com a ação "Nova ordem de serviço";
  - a ficha da solicitação ganha "Abrir OS" e a OS do conserto;
  - entram a tela das ordens de serviço, os formulários e a ficha da OS;
  - a atualização pelos eventos ganha `ordens.mudaram`.
- `cadastro-de-ativos`: a seção "Ordens de serviço" na ficha do ativo.
- `permissoes`: `ordens.ver` e `ordens.atender` no catálogo.
- `auditoria`: as ordens de serviço registradas.
- `eventos-em-tempo-real`: o evento `ordens.mudaram`.
- `modulos-da-organizacao`: a descrição do Operação, com as ordens de serviço.

## Impact

- **Domínio (`packages/domain`):** a OS, as situações e as mudanças, as recusas, os textos e o tipo Peça; o conserto que segue a OS nas regras da solicitação; as permissões, as ações da auditoria e o evento.
- **Banco (`packages/db`):** a migration 0039, com a numeração por organização, o tipo Peça na verificação dos consumíveis e o teste-guarda do RLS.
- **API (`apps/api`):** as rotas das OS no escopo do Operação; a peça pelo lançamento da saída da P4c e a solicitação pela OS, na mesma transação; as OS na ficha do ativo e o nome do alvo na auditoria; o contrato e o cliente gerados de novo.
- **Web (`apps/web`):** o Operação com a tela, a ficha, os formulários, a busca e a relação na ficha do ativo; "Abrir OS" na solicitação; o tipo Peça no consumível.
- **Documentação:** a spec mestre (seção 3.2), o runbook ("A versão com as ordens de serviço"), o contrato de módulo e o mapa.
- **Depois da atualização:** quem administra dá `ordens.ver` e `ordens.atender` aos perfis da TI.
