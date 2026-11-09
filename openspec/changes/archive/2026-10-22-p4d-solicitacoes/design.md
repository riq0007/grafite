## Context

A motivação está na proposta. O módulo Operação já tem os consumíveis (P4b) e o estoque (P4c), com as rotas num escopo com a guarda `exigirModuloLigado`.

O que esta change usa e já existe:
- **Lançamento do estoque:** `lancar(tx, pedido, contexto)` (`apps/api/src/estoque/lancamento.ts`) confere a saída, a permissão no local de origem, o ativo que a conta vê e o saldo, por um `UPDATE` condicional. Ele lê o contador de páginas e grava a movimentação, a auditoria e o evento `estoque.mudou` na transação recebida.
- **Contador:** `lerContador` lê o total de páginas válido de `estado_dos_ativos`, pela métrica `impressora.contador`. Hoje ele é interno do lançamento.
- **Compatíveis com o saldo:** `compativeisDoAtivo(tx, ativo, alcance)` dá os consumíveis compatíveis do modelo do ativo, com o saldo somado no alcance de `estoque.ver`. A capacidade `consumiveis.compatibilidade` no tipo diz se o ativo usa consumíveis.
- **Referências para quem não tem o cadastro:** `GET /pessoas/nomes`, para qualquer sessão, com as pessoas de um local primeiro; `GET /fornecedores/escolha`; e os tipos de ativo de referência.
- **Permissões com escopo:** `podeEm` confere um local, e `alcance` dá os locais do ramo, como no estoque.
- **Eventos e auditoria:** o evento de saída leva a permissão e os locais do público. A auditoria é só de inclusão.
- **Busca no banco:** `semAcento` (`apps/api/src/ativos/colunas.ts`) compara sem acento e sem maiúsculas.
- **Tabela:** a `Tabela` da biblioteca seleciona linhas, e a `BarraDaTabela` mostra a quantidade selecionada e as ações em lote, como "Imprimir etiquetas" nos ativos.
- **Formulários:** o padrão da gaveta do estoque guarda o que foi preenchido fora da gaveta e pede o cadastro pelo `useCadastro`, com o `LinkDeCadastro` embaixo do campo.

## Goals / Non-Goals

**Goals:**
- O número que as pessoas citam, sem buraco e sem repetição, também com dois registros ao mesmo tempo.
- Nada apagado: a solicitação e o item entregue ficam travados também no banco, e o histórico fica na auditoria.
- A entrega do estoque pelo mesmo `lancar` da P4c, na transação da entrega, sem outro caminho para o livro-razão.
- O contador congelado com a leitura que já existe, sem coleta nova.
- As telas no padrão do Operação, com a `Tabela` e a `BarraDaTabela` da biblioteca, sem componente novo.

**Non-Goals:**
- As situações configuráveis por tipo, os prazos, a prioridade e o responsável pelo atendimento.
- A notificação da pessoa que pediu, que fica para o portal do A1.
- O equipamento entregue como ativo ligado à solicitação.

## Decisions

### 1. A solicitação no domínio

O domínio (`packages/domain/src/solicitacoes/`) traz:
- **listas e limites:** os tipos, as situações, as cores (as do consumível) e os limites da quantidade, das impressoras e dos textos;
- **situações:** a tabela das mudanças permitidas, com Aguardando entrega só no toner e no equipamento, e a mensagem de cada recusa;
- **conferência:** a do registro e a da alteração de cada tipo, campo a campo, com as mensagens da spec;
- **sugestão:** dado o modelo, a cor e os compatíveis com o saldo, o consumível sugerido: o de maior saldo e, no empate, o de menor código;
- **textos:** o resumo do pedido ("PAT-00412: 1 Preto", "2 Notebook"), o contador congelado e o retorno do lote ("3 solicitações mudaram. A 42 não: já está concluída.").

O domínio ganha também:
- `solicitacoes.ver` e `solicitacoes.atender` no catálogo, com escopo de local; a segunda inclui a primeira;
- as ações da auditoria `solicitacao.registrada`, `solicitacao.alterada`, `solicitacao.pedida`, `solicitacao.entregue`, `solicitacao.situacao`, `solicitacao.concluida` e `solicitacao.cancelada`, com os rótulos;
- o evento `solicitacoes.mudaram`, que todas elas gravam.

### 2. As tabelas

A migration 0038 cria quatro tabelas da organização, com `orgScoped()` e o RLS forçado.

**`solicitacoes`:**
- as colunas: o número, o tipo, a situação, a pessoa que pediu, a observação, o ativo e o defeito (conserto), o tipo de ativo, a quantidade, o motivo e o local (equipamento), o fornecedor e a OS, o que foi feito, o motivo do cancelamento, quem registrou e quando, e quem encerrou e quando;
- `locais uuid[]` e `sem_local boolean`, os locais da solicitação (decisão 6), com um índice GIN;
- as checagens dizem o que cada tipo preenche, na forma de implicação (`tipo <> 'conserto' OR ativo_id IS NOT NULL`), para a primeira checagem a reprovar ser a do campo, e não a do tipo, como aprendido na P4c;
- o número é único na organização;
- `REVOKE DELETE ... FROM grafite_app`: a solicitação não se apaga no banco.

**`impressoras_das_solicitacoes`:** a solicitação, o ativo, o contador (as páginas e o momento da leitura, os dois vazios sem leitura) e o momento em que a impressora entrou. O par solicitação e ativo é único.

**`itens_das_solicitacoes`:**
- a impressora aponta para o par da tabela acima, por uma chave estrangeira composta; assim o item só existe para uma impressora da solicitação;
- as colunas: a cor, a quantidade, o consumível sugerido ou escolhido e a entrega (a origem, a movimentação do estoque, o fornecedor, quem entregou e quando);
- o trio solicitação, impressora e cor é único;
- as checagens: o entregue tem a origem e o momento; o do estoque tem a movimentação e o consumível; o do fornecedor tem o fornecedor;
- um gatilho recusa o `UPDATE` e o `DELETE` do item entregue, como o livro-razão é só de inclusão.

**`numeracao_das_solicitacoes`:** o último número de cada organização. O registro faz `INSERT ... ON CONFLICT (org_id) DO UPDATE SET ultimo = ultimo + 1 RETURNING ultimo` na transação dele. A linha fica travada até o commit, e o rollback devolve o número. Assim não há buraco nem repetição.

**Alternativa:** `max(numero) + 1` com o único e uma nova tentativa no conflito. Ela pede um laço de repetição em todo registro concorrente, e a numeração não ganha nada com isso.

### 3. O registro e a alteração

Cada um roda numa transação:
1. a conferência do domínio;
2. as referências:
   - a pessoa ativa;
   - as impressoras e o ativo ativos que a conta vê, e o tipo de cada impressora com `consumiveis.compatibilidade`;
   - o tipo de ativo e o local ativos.
   Não achar uma referência dá 400, e uma referência inativa dá 409 no campo, como na P4c;
3. `solicitacoes.atender` em todos os locais da solicitação; na alteração, nos de antes e nos de depois;
4. o contador de cada impressora que entra. `lerContador` sai do lançamento para um módulo da coleta, e o lançamento e a solicitação o usam;
5. a sugestão de cada item que entra ou muda de cor, por `compativeisDoAtivo` com o alcance de `estoque.ver`;
6. a gravação, a auditoria e o evento. A auditoria guarda o "antes → depois" da visão da solicitação, sem os vazios.

A impressora com item entregue e o item entregue ficam como estão. A recusa vem do domínio, e o gatilho é a guarda do banco.

### 4. A entrega

A entrega roda numa transação só:
1. **conferência:** a solicitação pendente, os itens pendentes escolhidos, e a origem e os campos de cada um;
2. **ordem:** os itens do estoque são ordenados pelo consumível e pelo local de origem. Duas entregas ao mesmo tempo travam os saldos na mesma ordem e não se bloqueiam em ciclo;
3. **itens do estoque:** cada um chama `lancar(tx, { tipo: 'saida', consumivelId, origemId, ativoId, quantidade, observacao: 'Solicitação 42' })`. A permissão, o saldo, o contador, a auditoria e o evento da saída são os da P4c. O item guarda o id da movimentação;
4. **recusas:** a recusa do `lancar` (`ProblemaDaApi`) volta com o campo do item, como `itens.1.quantidade`, e desfaz a transação inteira;
5. **itens do fornecedor:** cada um guarda o fornecedor, o do pedido ou o escolhido, ativo;
6. **situação:** Concluída, com todos os itens entregues, ou Aguardando entrega. Depois vêm a auditoria da solicitação e o evento.

**Alternativa:** a entrega gravar a movimentação por conta própria. Ela duplicaria a regra do saldo e a do contador, que a P4c já testa.

### 5. O lote

`POST /solicitacoes/situacao` recebe até 200 números, a situação e o motivo. Cada solicitação vai num ponto de retorno (`tx.transaction`) dentro de uma transação só:
- a que passa muda, com a auditoria dela;
- a que é recusada volta ao ponto, e a recusa entra na lista do retorno com o número e o motivo do domínio.

O toner com o pedido ao fornecedor, na Concluída, tem os itens pendentes entregues por esse fornecedor. O evento sai uma vez por solicitação que mudou.

**Alternativa:** uma transação por solicitação, fora de uma comum. Ela daria o mesmo resultado parcial, com N commits e sem o ponto de falha único do pedido.

### 6. Quem vê e quem atende, no banco

Os locais da solicitação ficam na própria linha:
- **`locais`:** os locais das impressoras, o do ativo ou o escolhido;
- **`sem_local`:** se alguma impressora ou o ativo não tem local.

As duas colunas mudam junto com o que muda os locais, na mesma transação. A consulta filtra assim:
- **ver:** `locais && alcance` (algum local), e `sem_local` só com o alcance da organização inteira;
- **atender:** `locais <@ alcance` (todos).

**Alternativa:** uma tabela de locais por solicitação, com `EXISTS`. Daria o mesmo filtro com uma junção a mais em toda lista, e o GIN no array atende as duas formas.

### 7. As rotas

No escopo do Operação:
- `GET /solicitacoes`: os filtros (situação, com "pendentes" por padrão, tipo, local), a busca e o cursor pelo momento do registro e pelo id. A busca usa `semAcento` no número, no nome de quem pediu, no nome, no patrimônio e na série dos ativos e na OS;
- `GET /solicitacoes/{numero}`: a ficha;
- `GET /solicitacoes/impressoras`: a escolha das impressoras, os ativos ativos que a conta vê e usam consumíveis;
- `GET /solicitacoes/impressoras/{ativoId}`: o contador e, para cada cor, os compatíveis com o saldo, para a sugestão na tela;
- `POST /solicitacoes` e `PATCH /solicitacoes/{numero}`: o registro e a alteração;
- `POST /solicitacoes/{numero}/pedido`, `/entrega`, `/conclusao`, `/cancelamento` e `/situacao`: as ações de uma solicitação;
- `POST /solicitacoes/situacao`: o lote;
- `GET /ativos/{id}/solicitacoes`: a seção da ficha do ativo, com as pendentes, as 5 encerradas mais novas e se o tipo do ativo usa consumíveis, que decide se "Nova solicitação" abre o Toner ou o Conserto.

Na auditoria, o alvo `solicitacao` tem o nome como a solicitação está agora, "42 · Toner · Joana Prado", como o ativo e o segredo: as mudanças de situação guardam só o que mudou.

A web usa o número no endereço e nas rotas, porque é ele que as pessoas citam.

### 8. A web

O Operação ganha:
- **menu e endereço:** "Solicitações" no menu, a rota `/operacao/solicitacoes` e a ficha em `/operacao/solicitacoes/$numero`. O endereço do Operação leva às Solicitações para quem vê só elas;
- **busca:** a tela e as ações "Nova solicitação de toner", "de conserto" e "de equipamento", que abrem `/operacao/solicitacoes?nova=toner`;
- **lista:** a `Tabela` com a seleção para quem atende, e a `BarraDaTabela` com "Mudar a situação". A linha usa o número como chave, que é o que o lote manda. Com as pendentes vazias e sem outro filtro, a tela pede uma solicitação de todas as situações (`limite=1`) para dizer se não há nenhuma ainda ou só nenhuma pendente;
- **gavetas:** a da solicitação, a do pedido, a da entrega, a da conclusão e a do cancelamento, no padrão da gaveta do estoque. O que foi preenchido fica fora da gaveta, e "Cadastrar nova pessoa" e "Cadastrar novo fornecedor" vêm pelo `useCadastro`, com a gaveta saindo da frente enquanto a aba está aberta;
- **relação:** a seção "Solicitações" no alvo `ativo` (contrato de módulo, "Relações"), com "Nova solicitação" levando ao Toner ou ao Conserto com `?nova=toner&ativo=<id>`;
- **eventos:** `solicitacoes.mudaram` invalida `['solicitacoes']`, a chave de todas as consultas das solicitações, também a da seção da ficha do ativo, que é uma relação do Operação.

## Risks / Trade-offs

- **Ver por algum local mostra a impressora de outro local.**
  - Mitigação: a impressora aparece pela referência, o nome e o patrimônio, como na movimentação do estoque, sem a ficha a quem não a vê.
- **Lote grande numa transação.**
  - Mitigação: o limite de 200 por lote, e os pontos de retorno mantêm a recusa de um sem desfazer os outros.
- **Duas entregas sobre o mesmo saldo.**
  - Mitigação: o `UPDATE` condicional da P4c recusa o que passaria do saldo, e a ordem dos itens evita o ciclo de travas.
- **Sugestão velha:** o consumível sugerido no registro pode não ter mais saldo na entrega.
  - Mitigação: a gaveta da entrega mostra o saldo de cada local e escolhe o de maior saldo na hora, e quem atende troca o consumível.
- **Número travado:** a linha da numeração fica travada até o commit do registro, então dois registros ao mesmo tempo esperam um pelo outro.
  - Mitigação: o registro é curto, sem chamada externa, e a espera dura milissegundos.

## Migration Plan

A migration 0038 só cria as tabelas, sem mudar os dados. As permissões novas entram no catálogo, e o Administrador as ganha sozinho. O runbook ("A versão com as solicitações") diz a quem dar `solicitacoes.ver` e `solicitacoes.atender`. A volta à versão anterior pede o backup de antes da atualização, como nas versões do P4.
