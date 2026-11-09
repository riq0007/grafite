## 1. Domínio

- [x] 1.1 Escrever primeiro os testes e depois as métricas novas (design, decisão 1), com o item e os detalhes na leitura, e o `lerLote` com os limites da decisão 7: o item em texto inteiro, o percentual de 0 a 100, as páginas não negativas e as listas em JSON. Verificar: os testes do domínio passam, com a leitura inconsistente e a recusa do item fora do formato.
- [x] 1.2 Escrever primeiro os testes e depois as regras da impressora (`coleta/impressoras.ts`, decisão 5), com os casos do PMG e as diferenças da spec:
  - o nível: medido, "há suprimento", desconhecido e o item descartado;
  - o tipo do suprimento pela descrição;
  - os bits das condições, com os rótulos e as severidades;
  - as páginas em preto e branco, inclusive na impressora de uma cor.

  Verificar: os testes do domínio passam com os cenários da spec impressoras-por-snmp.
- [x] 1.3 Escrever primeiro os testes e depois:
  - a capacidade `snmp.suprimentos` no catálogo e a conferência da configuração dela (decisão 3), com o campo de IP preso por qualquer capacidade;
  - a coluna coletada numérica (decisão 8);
  - o tipo de segredo Comunidade SNMP.

  Verificar: os testes do domínio passam, com as recusas da spec.

## 2. Banco

- [x] 2.1 Escrever primeiro o teste de integração e depois a migration 0027 (decisão 2): o item e os detalhes nas leituras e no estado atual, com a chave nova, e a tabela `leituras_por_hora`, com o isolamento e as exportações. Verificar: `pnpm --filter @grafite/db test:integration` passa, com o teste-guarda do isolamento e a leitura do ping com o item vazio.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 Escrever primeiro o teste de integração e depois o tipo com a configuração dos suprimentos e contadores e as recusas, e a rota `GET /catalogo/comunidades-snmp`, com o módulo Cofre ligado e desligado. Verificar: os testes de integração passam com os cenários da capacidade.
- [x] 3.2 Escrever primeiro o teste de integração e depois a configuração da coleta com a coleta SNMP e a comunidade decifrada (decisão 4): a comunidade escolhida, a `public` sem segredo, a `public` com o segredo inativo, e o cofre desligado. Verificar: os testes de integração passam, e a auditoria não registra revelação.
- [x] 3.3 Escrever primeiro o teste de integração e depois o lote com as métricas novas (decisão 7):
  - o estado por item;
  - a leitura de quem não é alvo da coleta SNMP, ignorada;
  - o número de série com a origem "coleta", a trava respeitada, a auditoria pelo coletor e o evento.

  Verificar: os testes de integração passam.
- [x] 3.4 Escrever primeiro o teste de integração e depois o painel Suprimentos na ficha do ativo e as colunas Suprimentos e Total de páginas, com o filtro "de e até" e a ordem (decisão 8). Verificar: os testes de integração passam, inclusive o desempenho da lista com 10 mil ativos e as duas colunas à vista.
- [x] 3.5 Escrever primeiro o teste de integração e depois os agregados por hora e a retenção de 13 meses na manutenção diária (decisão 9): o último valor da hora, a hora sem leitura válida, a repetição idempotente e o agregado antes de apagar. Verificar: os testes de integração da manutenção passam.

## 4. Coletor

- [x] 4.1 O simulador de agente SNMP v1 e v2c e as três gravações (decisão 6), com o teste do próprio simulador pelo `net-snmp`: GET, GETNEXT, GETBULK e a comunidade errada sem resposta. Verificar: `pnpm --filter @grafite/collector test` passa.
- [x] 4.2 Escrever primeiro os testes contra o simulador e depois a leitura SNMP, as leituras montadas pelas regras do domínio e a coleta `snmp` no agendador, com o limite de 32 dividido com o ping (decisão 5). Os casos:
  - a impressora que responde, no v1 e no v2c;
  - a que não responde;
  - a comunidade errada;
  - a comunidade fora da fila em disco e do log.

  Verificar: os testes do coletor passam.
- [x] 4.3 Escrever primeiro o teste e depois o comando `gravar`, que lê uma impressora nas subárvores da decisão 5 e grava o snmprec. Verificar: o comando grava o simulador, e o simulador alimentado pela gravação responde igual.

## 5. Web

- [x] 5.1 Escrever primeiro os testes e depois a capacidade na ficha do tipo, com o campo de IP, a versão e a comunidade, e o aviso da comunidade inativa (decisão 10). Verificar: os testes da web passam.
- [x] 5.2 Escrever primeiro os testes e depois o painel Suprimentos na ficha do ativo, com cada estado: medido, há suprimento, sem dado, inconsistente, não respondeu, não verificado e desatualizado. Verificar: os testes da web passam, e o painel não comunica nenhum estado só pela cor.
- [x] 5.3 Escrever primeiro os testes e depois as colunas Suprimentos e Total de páginas na tabela, com o filtro "de e até" em percentual e em páginas. Verificar: os testes da web passam.

## 6. Ponta a ponta

- [x] 6.1 A ponta a ponta com a API simulada: o painel Suprimentos da impressora e a coluna Suprimentos filtrada até 20%. Verificar: `pnpm test:e2e` passa.
- [x] 6.2 A ponta a ponta da pilha: o coletor de verdade lê o simulador numa porta alta, e a ficha da impressora mostra o toner e o total de páginas, e o número de série gravado pela coleta, com "Coleta · <coletor>": a ficha mostra o coletor no lugar do autor do valor coletado (spec impressoras-por-snmp, "Série lida"). Verificar: `pnpm test:e2e:pilha` passa.

## 7. Fechamento

- [x] 7.1 O mapa (`docs/mapa.md`), o contrato de módulo (`docs/casca/modulos.md`), com o valor coletado de vários itens, e o runbook, com a 161/UDP das impressoras. Verificar: `pnpm test` passa, com o teste-guarda do mapa.
- [x] 7.2 Conferir as verificações: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes; `contrato:verificar`, `fila:verificar` e `tokens:verificar` em dia; `openspec validate p2b-impressoras-por-snmp --strict` sem erros. Verificar: os comandos passam, e o CI do PR fica verde.
