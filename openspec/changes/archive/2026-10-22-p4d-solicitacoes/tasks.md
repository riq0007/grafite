## 1. Domínio

- [x] 1.1 Escrever primeiro os testes e depois a solicitação no domínio (design, decisão 1). Verificar: os testes do domínio passam com os cenários "Quem pediu em texto livre", "Conserto aguardando entrega", "Cancelamento sem o motivo", "Cor repetida", "Toner sugerido" e "Cor sem compatível", na sugestão, e "Uma que não pode mudar", no texto do retorno. O domínio cobre:
  - os tipos, as situações, as cores e os limites;
  - as mudanças da situação, com as recusas;
  - a conferência do registro e da alteração de cada tipo;
  - a sugestão do consumível;
  - os textos do pedido, do contador e do retorno do lote.
- [x] 1.2 Escrever primeiro os testes e depois `solicitacoes.ver` e `solicitacoes.atender` no catálogo, as ações da auditoria, com os rótulos, e o evento `solicitacoes.mudaram`, com o público pelos locais (decisão 1). Verificar: os testes do domínio passam com os cenários "Permissão nova no Administrador", com as vinte e duas, e "Atender as solicitações de um local".

## 2. Banco

- [x] 2.1 Escrever primeiro o teste de integração e depois a migration 0038 (decisão 2). Verificar: os testes de integração do banco passam, com o teste-guarda do RLS e os cenários "Solicitação não se apaga" e "Impressora com item entregue", pelo gatilho. A migration cria:
  - as solicitações, com as checagens de cada tipo, os locais com o índice GIN e o `REVOKE DELETE` do papel da aplicação;
  - as impressoras, com o contador, e os itens, com a chave composta, as checagens da entrega e o gatilho do item entregue;
  - a numeração por organização;
  - o RLS forçado nas quatro.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 Escrever primeiro o teste de integração e depois o registro e a alteração (decisões 2, 3 e 6): a numeração, as referências, o alcance de todos os locais, o contador, a sugestão, a auditoria e o evento. Verificar: os testes de integração passam com os cenários:
  - "Toner pedido pela Joana", com dois registros ao mesmo tempo sem número repetido;
  - "Pessoa inativa", "Conserto do notebook", "Equipamento para a Expedição" e "Ativo sem consumíveis";
  - "Contador na abertura", "Coleta depois do registro", "Impressora sem coleta" e "Impressora incluída depois";
  - "Quantidade corrigida antes da entrega" e "Toner registrado";
  - "Solicitação registrada com a lista aberta", no público do evento.
- [x] 3.2 Escrever primeiro o teste de integração e depois a situação, o pedido ao fornecedor, a conclusão, o cancelamento e o lote (decisão 5). Verificar: os testes de integração passam com os cenários:
  - "Notebook consertado", "Pedido cancelado com o motivo", "Concluída não muda" e "Concluída não se altera";
  - "Toner pedido à locadora" e "OS informada depois";
  - "Lote aplicado", "Uma que não pode mudar", "Toners entregues pela locadora", "Toner sem fornecedor no lote" e "Lote na auditoria".
- [x] 3.3 Escrever primeiro o teste de integração e depois a entrega (decisão 4): `lerContador` num módulo comum, o `lancar` da P4c para cada item do estoque, na ordem dos saldos, a recusa no campo do item e a situação no fim. Verificar: os testes de integração passam com os cenários "Toner do estoque", "Entrega maior que o saldo", "Entrega em parte", "Toner que veio da locadora", "Sem movimentar o estoque" e "Impressora com item entregue", e os testes do estoque continuam verdes.
- [x] 3.4 Escrever primeiro o teste de integração e depois as leituras (decisões 6 e 7): a lista com os filtros, a busca e o cursor, a ficha, a escolha das impressoras com a sugestão e o contador, e as solicitações na ficha do ativo. Verificar: os testes de integração passam com os cenários "Atendente de Jundiaí", "Solicitação de dois locais", "Quem só vê", "Pendentes por padrão", "Busca pelo patrimônio", "Toner sugerido", "Ativo sem solicitações" e "Quem pediu escolhido por quem atende".

## 4. Web

- [x] 4.1 Escrever primeiro os testes e depois o registro do Operação com as solicitações (decisão 8): as permissões, o menu, o endereço pela permissão, a busca com a tela e as ações de registrar, e o evento. Verificar: os testes da web passam com os cenários "Conta sem a permissão", "Atendente só das solicitações", "Toner pela busca" e "Conserto pela busca".
- [x] 4.2 Escrever primeiro os testes e depois a tela das solicitações (decisão 8): a tabela, os filtros e a busca no endereço, o "Carregar mais", as telas vazias, a seleção e o lote na barra. Verificar: os testes da web passam com os cenários "Pendentes por padrão", "Busca pelo patrimônio", "Primeira solicitação", "Nenhuma pendente", "Lote pela lista" e "Solicitação registrada com a lista aberta".
- [x] 4.3 Escrever primeiro os testes e depois a nova solicitação na gaveta (decisão 8): os três tipos, "Pedida por" com "Cadastrar nova pessoa" numa aba, as impressoras com as cores, a sugestão e o contador, e as recusas no campo. Verificar: os testes da web passam com os cenários "Toner com a sugestão", "Pessoa nova pelo campo", "Cor sem compatível" e "Cor repetida", na recusa do campo.
- [x] 4.4 Escrever primeiro os testes e depois o pedido ao fornecedor, a entrega, a conclusão e o cancelamento na gaveta, abertos pelas ações de cada linha da lista (decisão 8), com os retornos. Verificar: os testes da web passam com os cenários "Entrega pela gaveta", "Entrega maior que o saldo", na recusa do item, "Toner que veio da locadora", "Notebook consertado" e "Cancelamento sem o motivo".
- [x] 4.5 Escrever primeiro os testes e depois a ficha da solicitação, com as ações, e a alteração e a mudança da situação de uma solicitação na gaveta, que a ficha e as ações da linha abrem (decisão 8). Verificar: os testes da web passam com os cenários "Toner entregue na ficha", "Ações do conserto", "Solicitação que não existe" e "Quem só vê", e a alteração volta com "Solicitação alterada.", com os itens entregues sem mudar.
- [x] 4.6 Escrever primeiro os testes e depois as solicitações fora das telas do Operação (decisão 8): a seção da ficha do ativo, com "Nova solicitação" pelo tipo do ativo, relida pelo evento das solicitações, e o alvo da solicitação na tela da auditoria, com o nome dela pela API. Verificar: os testes da web passam com os cenários "Toner pela ficha da impressora", "Conserto pela ficha do notebook" e "Ativo sem solicitações".

## 5. Ponta a ponta

- [x] 5.1 A ponta a ponta com a API simulada. Verificar: `pnpm test:e2e` passa. Ela cobre:
  - o registro do toner com a sugestão, o pedido ao fornecedor e a entrega do estoque;
  - o conserto, a conclusão e o cancelamento;
  - a lista com o filtro, a busca e o lote;
  - a ficha e a seção da ficha do ativo.
- [x] 5.2 A ponta a ponta da pilha: a administradora registra um Toner da PAT-00412 pedido por uma pessoa, entrega o preto do Almoxarifado e vê a solicitação concluída e a saída nas movimentações. Verificar: `pnpm test:e2e:pilha` passa.

## 6. Fechamento

- [x] 6.1 Atualizar a documentação. Verificar: `pnpm test` passa, com o teste-guarda do mapa e o dos trechos do contrato.
  - A spec mestre: a P4d na divisão do P4 (seção 3.2).
  - O runbook ("A versão com as solicitações"): as permissões dos perfis da TI.
  - O contrato de módulo (`docs/casca/modulos.md`): a relação do Operação na ficha do ativo e o lote pela barra da tabela.
  - O mapa (`docs/mapa.md`): a change e o glossário.
- [x] 6.2 Conferir as verificações. Verificar: os comandos passam, e o CI do PR fica verde numa instância só, que é a conferência da tarefa 5.2 da change `ci-paralelo`.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes no PC-DEV;
  - `contrato:verificar` em dia e `openspec validate p4d-solicitacoes --strict` sem erros;
  - o #65 mergeado com os sete jobs verdes na primeira tentativa, numa instância só, em 25 min 56 s.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes;
  - `contrato:verificar` em dia;
  - `openspec validate p4d-solicitacoes --strict` sem erros.
