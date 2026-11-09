## Context

A motivação está na proposta. O módulo Operação já tem os consumíveis (P4b), o estoque (P4c) e as solicitações (P4d), com as rotas num escopo com a guarda `exigirModuloLigado`.

O que esta change usa e já existe:
- **Lançamento do estoque:** `lancar(tx, pedido, contexto)` (`apps/api/src/estoque/lancamento.ts`) confere a saída, a permissão no local de origem, o ativo que a conta vê e o saldo, e grava a movimentação, a auditoria e o evento `estoque.mudou` na transação recebida. A entrega da P4d já o chama, com a recusa levada ao campo do item.
- **Solicitações:** `solicitacaoParaMudar` trava a solicitação pelo número, e `exigirAtender` confere `solicitacoes.atender` em todos os locais dela (`apps/api/src/solicitacoes/`). O domínio diz as mudanças da situação por `recusaDaSituacao`, também no lote.
- **Numeração:** a das solicitações, por `INSERT ... ON CONFLICT (org_id) DO UPDATE ... RETURNING`, sem buraco nem repetição.
- **Referências para quem não tem o cadastro:** `GET /fornecedores/escolha`, `GET /consumiveis/escolha` e os saldos do estoque para a origem, como na entrega da P4d.
- **Permissões com escopo:** `alcance` dá os locais do ramo, e `exigirEm` confere um local, como no estoque.
- **Eventos e auditoria:** o evento de saída leva a permissão e os locais do público; a auditoria é só de inclusão e dá nome ao alvo na consulta, como `solicitacao` na P4d.
- **Web:** a tela, a ficha, as gavetas, as ações da linha, o lote pela `BarraDaTabela` e a relação na ficha do ativo das solicitações são o modelo das OS.

## Goals / Non-Goals

**Goals:**
- O número que as pessoas citam, "OS 12", sem buraco e sem repetição, numa sequência separada da das solicitações.
- O histórico das situações no banco, só de inclusão, com o momento de cada mudança, que a P4f lê para o tempo de resolução e as OS repetidas.
- A peça pelo mesmo `lancar` da P4c, na transação da OS, sem outro caminho para o livro-razão.
- A solicitação de conserto e a OS mudando juntas, na mesma transação, sem a solicitação mudar por fora.
- As telas no padrão do Operação, sem componente novo na biblioteca.

**Non-Goals:**
- O responsável pela OS, a prioridade, o prazo e o SLA.
- As OS de manutenção preventiva agendadas e o encerramento automático da Resolvida.
- Os indicadores da P4f, que só leem o que esta change grava.

## Decisions

### 1. A OS no domínio

O domínio (`packages/domain/src/ordens/`) traz:
- **listas e limites:** as situações, as em aberto e os limites do problema (1.000), do que foi feito (1.000), da observação (500), dos motivos (200), da OS no fornecedor (40) e do lote (200);
- **situações:** a mudança permitida de cada situação para cada outra, com a reabertura e o encerramento sem resolver, e a mensagem de cada recusa ("A OS 12 já está encerrada.", "A OS 12 está resolvida: reabra ou encerre.", "A OS 12 ainda não foi resolvida.");
- **conferência:** a da abertura, a da correção, a da situação com o fornecedor, a da peça, a da resolução, a da reabertura e a do encerramento, campo a campo;
- **textos:** "OS 12", o nome do alvo na auditoria ("12 · NB-0031 · Não liga") e o retorno do lote ("5 ordens de serviço mudaram. A 12 não: ainda não foi resolvida.").

O domínio ganha também:
- o tipo de consumível `peca`, com o rótulo "Peça";
- `ordens.ver` e `ordens.atender` no catálogo, com escopo de local; a segunda inclui a primeira;
- as ações da auditoria `ordem.aberta`, `ordem.corrigida`, `ordem.situacao`, `ordem.peca`, `ordem.resolvida`, `ordem.reaberta` e `ordem.encerrada`, com os rótulos;
- o evento `ordens.mudaram`;
- na solicitação, a recusa `segue-a-ordem`, com o número da OS, em `recusaDaSituacao` e no texto do lote ("A 43 não: segue a OS 12.").

### 2. As tabelas

A migration 0039 cria quatro tabelas da organização, com `orgScoped()` e o RLS forçado, e muda uma checagem.

**`ordens_de_servico`:**
- as colunas: o número, o ativo, o local da abertura, a solicitação de origem, o problema, a situação, o fornecedor e a OS dele, o que foi feito, o motivo do encerramento, quem abriu, resolveu e encerrou e quando;
- o número é único na organização, e a solicitação de origem também: uma OS por solicitação;
- as checagens, na forma de implicação, para a primeira a reprovar ser a do campo: a Aguardando fornecedor tem o fornecedor; a Resolvida tem o que foi feito e o momento; a Encerrada tem o momento e, sem resolver, o motivo;
- `REVOKE DELETE ... FROM grafite_app`.

**`historico_das_ordens`:** a OS, a situação nova, o texto (a observação, o que foi feito ou o motivo), a conta e o momento. `REVOKE UPDATE, DELETE`: como o livro-razão, só de inclusão. A abertura grava a linha da Aberta.

**`pecas_das_ordens`:** a OS, o consumível, a quantidade, o local de origem, a movimentação do estoque (única), a conta e o momento. `REVOKE UPDATE, DELETE`.

**`numeracao_das_ordens`:** o último número de cada organização, como o das solicitações.

**`consumiveis`:** a checagem `consumiveis_tipo_valido` é recriada com `peca`.

**Alternativa:** guardar o histórico só na auditoria. A P4f teria de ler a auditoria, que é de outra natureza e tem o texto livre do "antes → depois"; a tabela própria dá o momento de cada situação por uma consulta simples, e a auditoria continua com o registro de cada ação.

### 3. A abertura e a correção

Cada uma roda numa transação:
1. a conferência do domínio;
2. o ativo ativo que a conta vê; não achar dá 400, e o inativo dá 409 no campo;
3. `ordens.atender` no local do ativo, ou na organização inteira para o ativo sem local;
4. o número, a OS, a linha do histórico, a auditoria e o evento.

**Pela solicitação** (`POST /solicitacoes/{numero}/ordem`): a solicitação travada por `solicitacaoParaMudar`, o conserto pendente sem OS, `solicitacoes.atender` nos locais dela e `ordens.atender` no local do ativo. A OS nasce com o ativo e o defeito; a solicitação passa a Em atendimento, com a auditoria e o evento dela.

A correção (`PATCH /ordens/{numero}`) trava a OS em aberto e muda o problema e, na OS com o fornecedor, o fornecedor e a OS dele, conferidos como na mudança para Aguardando fornecedor. O fornecedor na correção de uma OS sem ele é um pedido malformado, recusado com 400: o formulário não o oferece.

### 4. As situações e a solicitação

`POST /ordens/{numero}/situacao`, `/resolucao`, `/reabertura` e `/encerramento` travam a OS (`FOR UPDATE`) e, quando ela tem a solicitação, a solicitação depois, sempre nessa ordem. Cada uma confere a mudança pelo domínio, grava a OS, a linha do histórico, a auditoria e o evento.

- **Fornecedor:** a Aguardando fornecedor confere o fornecedor ativo, como o pedido da P4d. O fornecedor e a OS dele ficam na linha quando a OS sai de Aguardando fornecedor e depois da resolução; outra Aguardando fornecedor os troca.
- **Resolução:** grava o que foi feito e quem resolveu; a solicitação pendente passa a Concluída, com o mesmo texto, quem e quando, pela conclusão da P4d.
- **Reabertura:** volta a Em atendimento e limpa a resolução da linha, que fica no histórico. A solicitação concluída continua concluída, e nada que a OS reaberta faça a muda.
- **Encerramento:** da Resolvida, sem texto; da em aberto, sem resolver, com o motivo, e a solicitação pendente passa a Cancelada com o mesmo motivo.

Na P4d, `solicitacaoParaMudar` passa a recusar com 409 a solicitação que tem uma OS em aberto ("A solicitação 43 segue a OS 12."), e o lote a deixa como estava, com a recusa `segue-a-ordem`. A conclusão e o cancelamento que a OS faz na solicitação passam por um caminho próprio, que não pergunta isso.

**Alternativa:** a solicitação ler a situação da OS na hora, sem mudar. A lista e os filtros das solicitações perderiam a situação no banco, e a P4d teria de juntar a OS em toda consulta.

### 5. As peças

`POST /ordens/{numero}/pecas` roda numa transação só:
1. a OS em aberto, travada;
2. a conferência do consumível, do local e da quantidade;
3. `lancar(tx, { tipo: 'saida', consumivel, quantidade, origem: local, ativo: ativoDaOs, observacao: 'OS 12' })`, com a permissão, o saldo, a auditoria e o evento da saída da P4c. A recusa do `lancar` volta no campo da peça, com a origem levada ao local;
4. a peça, com o id da movimentação, a auditoria da OS e o evento.

### 6. O lote

`POST /ordens/situacao` recebe até 200 números e a situação, Em atendimento, Aguardando peça ou Encerrada. Cada OS vai num ponto de retorno dentro de uma transação só, como o lote da P4d: a que passa muda, com o histórico, a auditoria e o evento; a que é recusada volta ao ponto e entra no retorno com o número e o motivo. No lote, a Encerrada vale só para a Resolvida.

### 7. Quem vê e quem atende, e as rotas

A OS guarda o local do ativo na abertura (`local_id`), e o filtro é o do estoque: `local_id` no alcance, e o sem local só com o alcance da organização inteira. O ativo que muda de local não muda o local da OS.

No escopo do Operação:
- `GET /ordens`: os filtros (a situação, com "em-aberto" por padrão, e o local), a busca e o cursor pelo momento da abertura e pelo id. A busca usa `semAcento` no número, no nome, no patrimônio e na série do ativo, no problema e na OS do fornecedor. Cada linha traz a última mudança do histórico, com quem a fez;
- `GET /ordens/{numero}`: a ficha, com o histórico e as peças;
- `POST /ordens`, `PATCH /ordens/{numero}` e `POST /solicitacoes/{numero}/ordem`: a abertura, a correção e a abertura pela solicitação;
- `POST /ordens/{numero}/situacao`, `/pecas`, `/resolucao`, `/reabertura` e `/encerramento`: as ações de uma OS;
- `POST /ordens/situacao`: o lote;
- `GET /ativos/{id}/ordens`: a seção da ficha do ativo, com as em aberto e as 5 resolvidas ou encerradas mais novas.

A solicitação lida, na lista e na ficha, ganha a OS dela, com o número e a situação, e a consulta da auditoria dá o nome do alvo `ordem`.

### 8. A web

O Operação ganha:
- **menu e endereço:** "Ordens de serviço" no menu, a rota `/operacao/ordens` e a ficha em `/operacao/ordens/$numero`. O endereço do Operação leva à primeira tela que a conta vê, na ordem do menu;
- **busca:** a tela e a ação "Nova ordem de serviço", que abre `/operacao/ordens?nova=1`, com `&ativo=<id>` pela ficha do ativo;
- **lista:** a `Tabela` com a seleção para quem atende, a `BarraDaTabela` com "Mudar a situação" e as "Ações" de cada linha, como nas solicitações;
- **gavetas:** a nova OS, a correção (o problema e o fornecedor), a situação (com o fornecedor e "Cadastrar novo fornecedor" pelo `useCadastro`), a peça, a resolução, a reabertura e os dois encerramentos. A peça usa a escolha dos consumíveis, com as Peças primeiro em cada busca, e a origem de maior saldo, como a entrega da P4d;
- **ficha:** os dados, o histórico das situações, as peças e as ações da situação;
- **solicitação:** "Abrir OS" na linha e na ficha do conserto, que abre a OS e leva à ficha dela; a OS na ficha da solicitação, que leva à ficha dela para quem vê as OS, e na lista, ao lado da situação, como "Em atendimento · OS 12";
- **relação:** a seção "Ordens de serviço" no alvo `ativo`, com "Nova ordem de serviço";
- **eventos:** `ordens.mudaram` invalida `['ordens']` e `['solicitacoes']`, porque a ficha da solicitação mostra a situação da OS;
- **consumíveis e auditoria:** o tipo Peça vem do domínio; a tela da auditoria ganha o alvo `ordem` e os campos das OS.

## Risks / Trade-offs

- **Solicitação concluída com a OS reaberta.** A solicitação é final pela P4d, e o problema que volta reabre a OS, e não o pedido.
  - Mitigação: a ficha da solicitação mostra a OS com a situação dela, e o histórico da OS guarda a reabertura.
- **Duas travas na mesma transação.** A OS e a solicitação mudam juntas.
  - Mitigação: a ordem é sempre a OS e depois a solicitação; a abertura pela solicitação trava só a solicitação, porque a OS ainda não existe.
- **Técnico sem o estoque.** A peça pede `estoque.movimentar` no local de origem.
  - Mitigação: a recusa é a da saída, no campo, e o runbook diz para dar a permissão a quem lança as peças.
- **A peça errada.** A peça lançada não sai da OS.
  - Mitigação: como na entrega da P4d, o ajuste do estoque corrige o saldo, e os dois ficam nas movimentações e na auditoria.

## Migration Plan

A migration 0039 só cria as tabelas e recria a checagem do tipo dos consumíveis, sem mudar os dados. As permissões novas entram no catálogo, e o Administrador as ganha sozinho. O runbook ("A versão com as ordens de serviço") diz a quem dar `ordens.ver` e `ordens.atender` e lembra o `estoque.movimentar` das peças. A volta à versão anterior pede o backup de antes da atualização, como nas versões do P4.
