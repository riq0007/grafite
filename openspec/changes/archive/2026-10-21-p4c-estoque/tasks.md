## 1. Domínio

- [x] 1.1 Escrever primeiro os testes e depois o estoque no domínio (design, decisão 1). Verificar: os testes do domínio passam com os cenários "Ajuste sem a observação", "Toner que saiu de linha", "Abaixo do mínimo pela saída", "Mínimo zerado" e "Toner acabando", no texto da ocorrência. O domínio cobre:
  - os tipos da movimentação e os motivos do ajuste, com os rótulos, e os limites;
  - a conferência de cada tipo, com as mensagens da spec, e os inativos que cada tipo aceita;
  - o efeito nos saldos, a situação e o abaixo do mínimo;
  - os textos da ocorrência do Início e do contador de páginas.
- [x] 1.2 Escrever primeiro os testes e depois `estoque.ver` e `estoque.movimentar` no catálogo, as ações da auditoria do estoque, com os rótulos, e o evento `estoque.mudou`, com o público pelos locais (decisão 1). Verificar: os testes do domínio passam com os cenários "Permissão nova no Administrador", com as vinte, e "Movimentar o estoque de um local".

## 2. Banco

- [x] 2.1 Escrever primeiro o teste de integração e depois a migration 0037 (decisão 2). Verificar: os testes de integração do banco passam, com o teste-guarda do RLS e o cenário "Movimentação lançada" pelo banco. A migration cria:
  - o livro-razão, com as checagens de cada tipo, as chaves estrangeiras, os índices e o `REVOKE UPDATE, DELETE` do papel da aplicação;
  - os saldos, com o par único, o saldo nunca negativo e o índice parcial dos que estão abaixo do mínimo;
  - o RLS forçado nas duas.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 Escrever primeiro o teste de integração e depois a entrada e o ajuste (decisões 3 e 5): o escopo do Operação, a transação, o saldo condicional, o momento do abaixo do mínimo, os inativos que cada tipo aceita, a auditoria, o evento e o 403. Verificar: os testes de integração passam com os cenários "Entrada de toners", "Ajuste do inventário", "Ajuste sem a observação", "Fornecedor inativo na entrada" e "Almoxarife de Jundiaí".
- [x] 3.2 Escrever primeiro o teste de integração e depois a saída e a transferência (decisões 3 a 5): o ativo que a conta vê, o contador de páginas, a ordem dos locais da transferência e os lançamentos ao mesmo tempo. Verificar: os testes de integração passam com os cenários "Saída para a impressora", "Transferência para a Expedição", "Saída maior que o saldo", "Duas saídas ao mesmo tempo", "Toner que saiu de linha", "Toner trocado na impressora monitorada", "Ativo sem leitura", "Transferência para outra unidade", "Saída sem a permissão" e "Saída registrada".
- [x] 3.3 Escrever primeiro o teste de integração e depois o mínimo e as leituras do estoque (decisão 5): o mínimo, os saldos e as movimentações com os filtros e o cursor, e o abaixo do mínimo. Verificar: os testes de integração passam com os cenários "Mínimo zerado", "Mínimo mudado", "Toners abaixo do mínimo", "Toners da PAT-00412", "Entradas da HP Brasil", "Fornecedor como referência" e "Saída lançada com o estoque aberto", no público do evento.
- [x] 3.4 Escrever primeiro o teste de integração e depois as referências (decisão 6): a escolha dos consumíveis, os ativos para a saída com a compatibilidade, o estoque na ficha do consumível, o saldo dos compatíveis na ficha do ativo e os consumíveis e as entradas do fornecedor. Verificar: os testes de integração passam com os cenários "Almoxarife sem os consumíveis", na escolha, "Impressoras sugeridas na saída", "CF258A em dois locais", "Toner em estoque", "Toners da HP Brasil" e "Sem ver os consumíveis".

## 4. Web

- [x] 4.1 Escrever primeiro os testes e depois o registro do Operação com o estoque (decisão 7): as permissões, o menu, o endereço pela permissão, a busca com as telas, as ações de lançar e o provedor dos consumíveis, e o Novo consumível numa aba, no alvo `consumivel`. Verificar: os testes da web passam com os cenários "Conta sem a permissão", "Almoxarife sem os consumíveis", no menu, "Consumível pela busca", "Novo consumível pela busca" e "Código repetido na aba".
- [x] 4.2 Escrever primeiro os testes e depois a tela do estoque (decisão 7): a tabela, a busca, os filtros, o "carregar mais", a tela vazia, quem só vê e os eventos. Verificar: os testes da web passam com os cenários "Toners abaixo do mínimo", "Primeira entrada", "Quem só vê o estoque" e "Saída lançada com o estoque aberto".
- [x] 4.3 Escrever primeiro os testes e depois a entrada e a saída na gaveta (decisão 7): o saldo da origem, os locais do alcance, o "Cadastrar novo consumível" e o "Cadastrar novo fornecedor" nos campos, os sugeridos da saída, as recusas no campo, os retornos e o lançamento aberto pelo endereço. Verificar: os testes da web passam com os cenários "Toner novo na entrada", "Consumível criado pelo campo da entrada", "Impressoras sugeridas na saída" e "Saída maior que o saldo", na recusa do campo.
- [x] 4.4 Escrever primeiro os testes e depois a transferência, o ajuste e o mínimo na gaveta (decisão 7). Verificar: os testes da web passam com os cenários "Transferência para a Expedição", "Ajuste sem a observação" e "Mínimo zerado", com os retornos.
- [x] 4.5 Escrever primeiro os testes e depois a tela das movimentações (decisão 7): a tabela, os filtros no endereço, o período, o "carregar mais" e a tela vazia. Verificar: os testes da web passam com os cenários "Toners da PAT-00412" e "Entradas da HP Brasil".
- [x] 4.6 Escrever primeiro os testes e depois o estoque fora das telas do Operação (decisões 6 e 7). Verificar: os testes da web passam com os cenários "CF258A em dois locais", "Toner acabando", "Entrada que repõe", "Ocorrência de um consumível", "Toners da HP Brasil", "Sem ver os consumíveis", "Toner em estoque" e "Troca do toner pela ficha". Entram:
  - a seção da ficha do consumível;
  - a fonte do Início;
  - a relação na ficha do fornecedor;
  - o cartão da ficha do ativo, com o saldo e "Registrar saída";
  - o `estoque.mudou` no registro do Ativos;
  - o alvo do estoque na tela da auditoria.

## 5. Ponta a ponta

- [x] 5.1 A ponta a ponta com a API simulada. Verificar: `pnpm test:e2e` passa. Ela cobre:
  - o estoque, com a entrada, a saída, a transferência, o ajuste e o mínimo;
  - a ocorrência no Início e as movimentações filtradas;
  - a seção da ficha do consumível;
  - o cartão da ficha da impressora, com "Registrar saída", e a ficha do fornecedor.
- [x] 5.2 A ponta a ponta da pilha: a administradora lança a entrada de 10 CF258A no Almoxarifado, define o mínimo 5, lança a saída de 6 para a PAT-00412 e vê a ocorrência no Início. Verificar: `pnpm test:e2e:pilha` passa.

## 6. Fechamento

- [x] 6.1 Atualizar a documentação. Verificar: `pnpm test` passa, com o teste-guarda do mapa e o dos trechos do contrato.
  - A spec mestre: a P4c na divisão do P4 (seção 3.2).
  - O runbook ("A versão com o estoque"): as permissões, o inventário inicial pelo ajuste e os mínimos.
  - O contrato de módulo (`docs/casca/modulos.md`): a ocorrência que fala de um registro que não é um ativo e a relação do Operação na ficha do fornecedor.
  - O mapa (`docs/mapa.md`): a change, a capacidade `estoque` e o glossário.
  - Os comandos do `CLAUDE.md`, se a ponta a ponta simulada passar a simular o estoque.
- [x] 6.2 Conferir as verificações. Verificar: os comandos passam, e o CI do PR fica verde.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes;
  - `contrato:verificar` em dia;
  - `openspec validate p4c-estoque --strict` sem erros.
