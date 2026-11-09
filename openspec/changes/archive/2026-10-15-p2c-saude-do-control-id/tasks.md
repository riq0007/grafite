## 1. Domínio

- [x] 1.1 Escrever primeiro os testes e depois as métricas da sondagem (design, decisão 1) e o `lerLote` com os limites da decisão 6: as quatro situações, o firmware, o produto e a série com até 100 caracteres. Verificar: os testes do domínio passam, com a recusa da situação desconhecida.
- [x] 1.2 Escrever primeiro os testes e depois:
  - a capacidade `controlid.saude` no catálogo e a conferência da configuração dela (decisão 2), com a porta, o login obrigatório e o campo de IP preso;
  - o `loginDoControle` (decisão 3), com o login próprio, o do tipo, os dois ligados e o do tipo inativo;
  - a situação do Control iD, com os rótulos, os motivos do "Não verificado" e a ordem da coluna (decisão 7).

  Verificar: os testes do domínio passam com os cenários da spec saude-do-control-id.

## 2. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 2.1 Escrever primeiro o teste de integração e depois o tipo com a configuração da saúde do Control iD e as recusas, e a rota `GET /catalogo/logins-do-control-id`, com o módulo Cofre ligado e desligado. Verificar: os testes de integração passam com os cenários da capacidade, e a lista não traz o usuário nem a senha.
- [x] 2.2 Escrever primeiro o teste de integração e depois a configuração da coleta com a sondagem e o login decifrado (decisão 3): o login do tipo, o próprio do controle, os dois ligados, o do tipo inativo e o cofre desligado. Verificar: os testes de integração passam, e a auditoria não registra revelação.
- [x] 2.3 Escrever primeiro o teste de integração e depois o lote com as métricas da sondagem (decisão 6): o estado, a leitura de quem não é alvo da sondagem ignorada, e o número de série do controle com a origem "coleta", a trava respeitada, a auditoria pelo coletor e o evento. Verificar: os testes de integração passam.
- [x] 2.4 Escrever primeiro o teste de integração e depois a saúde do Control iD na ficha do ativo, com o último contato, o firmware, o produto, a origem do login e os motivos, e a coluna Control iD, com o filtro e a ordem (decisão 7). Verificar: os testes de integração passam, inclusive o desempenho da lista com 10 mil ativos e a coluna à vista.

## 3. Coletor

- [x] 3.1 O simulador da API do Control iD e as gravações montadas (decisão 5), com o teste do próprio simulador: cada modo e as sessões abertas. Verificar: `pnpm --filter @grafite/collector test` passa.
- [x] 3.2 Escrever primeiro os testes contra o simulador e depois a sondagem e a coleta `controlid` no agendador, com o limite de 32 dividido com o ping e o SNMP (decisão 4). Os casos:
  - o controle que responde, com o firmware pelos dois nomes;
  - o login recusado, pelo 401 e pela resposta sem a sessão;
  - o que não responde, com a tentativa a mais;
  - a resposta inesperada, pelo 404 e pelo corpo que não é JSON;
  - a saída da sessão, mesmo com a leitura falhando;
  - o usuário e a senha fora da fila em disco e do log.

  Verificar: os testes do coletor passam.
- [x] 3.3 Escrever primeiro o teste e depois o comando `gravar-control-id`, que lê um controle e grava a resposta das informações do sistema, sem a sessão, com a senha pela variável de ambiente. Verificar: o comando grava a resposta do simulador, e o simulador alimentado pela gravação responde igual.

## 4. Web

- [x] 4.1 Escrever primeiro os testes e depois a capacidade na ficha do tipo, com o campo de IP, a porta, o login e o aviso do login inativo (decisão 8). Verificar: os testes da web passam.
- [x] 4.2 Escrever primeiro os testes e depois a saúde do Control iD na ficha do ativo, com cada situação, o último contato, o firmware, a origem do login, o "Não verificado" com cada motivo e o "Desatualizado". Verificar: os testes da web passam, e nenhum estado é comunicado só pela cor.
- [x] 4.3 Escrever primeiro os testes e depois a coluna Control iD na tabela, com o filtro "é qualquer de". Verificar: os testes da web passam.

## 5. Ponta a ponta

- [x] 5.1 A ponta a ponta com a API simulada: a saúde do Control iD na ficha de um controle e a coluna Control iD filtrada por "Sem resposta". Verificar: `pnpm test:e2e` passa.
- [x] 5.2 A ponta a ponta da pilha: o coletor de verdade sonda o simulador, e a ficha do controle mostra "Respondendo", o firmware e o número de série gravado pela coleta. Verificar: `pnpm test:e2e:pilha` passa.

## 6. Fechamento

- [x] 6.1 O mapa (`docs/mapa.md`), o contrato de módulo (`docs/casca/modulos.md`), com a coluna de situação de outra capacidade, e o runbook, com a porta dos controles e a rede só da TI. Verificar: `pnpm test` passa, com o teste-guarda do mapa.
- [x] 6.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes; `contrato:verificar` em dia; `openspec validate p2c-saude-do-control-id --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
