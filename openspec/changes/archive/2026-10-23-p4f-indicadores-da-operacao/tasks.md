## 1. Domínio

- [x] 1.1 Escrever primeiro os testes e depois os indicadores da operação no domínio (decisões 4, 5 e 8). Verificar: os testes do domínio passam com os cenários "Meta fora dos limites", "Resolução fora da meta", na decisão, e "Resolução sai da meta", no título da notificação, e com os títulos das OS repetidas e das páginas por toner no singular e no plural. O domínio cobre:
  - os dois grupos, os quatro indicadores dos alertas e os três da operação, com a conferência da meta de cada grupo;
  - as definições: o nome, o que mede, a unidade, a meta de fábrica, os limites e a decisão;
  - a unidade nova, a quantidade de OS, escrita "2 OS";
  - os textos do valor, com "1 ativo" e "2 toners", da meta e da base do cálculo, e a notificação, com a origem "Operação" e o endereço com o foco.
- [x] 1.2 Escrever primeiro os testes e depois o cálculo do tempo de resolução e das OS repetidas (decisões 1 e 3). Verificar: os testes do domínio passam com os cenários "Comparação com os 30 dias anteriores", "Mediana das OS resolvidas", "Espera pelo fornecedor", "OS ainda em aberto", "OS aberta por engano", "Problema que voltou" e "OS no ativo errado", e a OS reaberta conta da abertura até a última resolução.
- [x] 1.3 Escrever primeiro os testes e depois o cálculo das páginas por toner (decisão 2). Verificar: os testes do domínio passam com os cenários "Toner que rendeu pouco", "Troca sem o total de páginas", "Saída de dois toners", "Compatível na troca" e "Lista longa", e o toner sem rendimento ou com o total menor na troca não entra.
- [x] 1.4 Escrever primeiro os testes e depois a permissão `operacao.administrar` no catálogo, com `ordens.ver` e `estoque.ver` incluídas, o evento `metas.mudaram`, com o público dado por quem grava, a ação da meta no evento novo e a descrição do Operação com os indicadores (decisões 6 e 7). Verificar: os testes do domínio passam com os cenários:
  - "Permissão nova no Administrador", com as vinte e cinco, e "Administrar a operação";
  - "Operação numa organização que já existia", na descrição.

## 2. Banco

- [x] 2.1 Escrever primeiro o teste de integração e depois a migration 0040 (decisão 5): a checagem da tabela `indicadores_da_organizacao` com os sete indicadores e o índice das OS pela resolução. Verificar: os testes de integração do banco passam, com o teste-guarda do RLS, a meta de um indicador da operação gravada e a de um indicador desconhecido recusada pela checagem.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 Escrever primeiro o teste de integração e depois a leitura dos indicadores da operação, `GET /operacao/indicadores` (decisões 1, 2 e 9): as OS que tocam os 60 dias, com o histórico, e as saídas de toner, com a anterior de cada impressora em cada cor, pelo alcance da conta. Verificar: os testes de integração passam com os cenários:
  - "Mediana das OS resolvidas" e "Toner que rendeu pouco", com as OS, as saídas e os totais de páginas gravados no banco;
  - "Técnico de Jundiaí" e "Almoxarife", com os indicadores que cada conta vê;
  - a conta sem `ordens.ver` e sem `estoque.ver` recusada com 403.
- [x] 3.2 Escrever primeiro o teste de integração e depois a meta, `PUT /operacao/indicadores/{indicador}/meta`, com a auditoria e o evento `metas.mudaram`, e o evento da meta dos alertas no tipo novo (decisões 5 e 6). Verificar: os testes de integração passam com os cenários:
  - "Meta mudada", "Meta fora dos limites" e "Quem atende sem administrar", com o 403;
  - "Meta das OS repetidas mudada", na auditoria;
  - "Meta das OS mudada" e "Meta de um indicador mudada", no público do evento `metas.mudaram`;
  - a rota de cada grupo recusa o indicador do outro com 404.
- [x] 3.3 Escrever primeiro o teste de integração e depois a avaliação diária com os dois grupos (decisão 8). Verificar: os testes de integração passam com os cenários "Resolução sai da meta", "Continua fora da meta" e "Módulo desligado", e os indicadores dos alertas continuam avaliados com o Alertas ligado e o Operação desligado.

## 4. Web

- [x] 4.1 Escrever primeiro os testes e depois o registro do Operação (decisões 6 e 10): "Indicadores" no menu e na busca, a rota da tela e os eventos `ordens.mudaram`, `estoque.mudou`, `consumiveis.mudaram` e `metas.mudaram` relendo os indicadores, e o Alertas relendo os dele pelo `metas.mudaram`. Verificar: os testes da web passam com os cenários "Indicadores pela busca", "Quem administra a operação" e "Meta de um indicador mudada", na tela do Alertas.
- [x] 4.2 Escrever primeiro os testes e depois a tela dos indicadores da operação (decisão 10): as seções do `Indicador`, as listas com o caminho para a OS e para o ativo, o esqueleto, a falha e o foco pelo endereço. Verificar: os testes da web passam com os cenários "Abrir pela notificação", "Lista longa", "Técnico de Jundiaí", "Almoxarife", "Sem dado" e "OS resolvida com os indicadores abertos".
- [x] 4.3 Escrever primeiro os testes e depois "Mudar a meta" compartilhado entre o Alertas e o Operação, em `apps/web/src/modulos/indicadores/`, com as unidades e a conferência pelo domínio (decisão 10). Verificar: os testes da web passam com os cenários "Meta mudada", "Meta fora dos limites" e "Quem atende sem administrar", e os testes da tela dos indicadores do Alertas continuam passando.

## 5. Ponta a ponta

- [x] 5.1 A ponta a ponta com a API simulada. Verificar: `pnpm test:e2e` passa. Ela cobre:
  - a tela com os três indicadores, as listas e as situações;
  - "Mudar a meta" das OS repetidas, com "Meta salva.";
  - o foco pelo endereço da notificação.
- [x] 5.2 A ponta a ponta da pilha: depois do passo das OS, a administradora abre os indicadores da operação, vê o tempo de resolução com a OS 1 e muda a meta das OS repetidas, que a auditoria registra. Verificar: `pnpm test:e2e:pilha` passa.

## 6. Fechamento

- [x] 6.1 Atualizar a documentação. Verificar: `pnpm test` passa, com o teste-guarda do mapa e o dos trechos do contrato.
  - A spec mestre: a P4f na divisão do P4 (seção 3.2), os indicadores da operação na tela inicial (seção 7.6) e as metas que deixam de estar adiadas (seção 15).
  - O runbook ("A versão com os indicadores da operação"): a quem dar `operacao.administrar`.
  - O contrato de módulo (`docs/casca/modulos.md`): os indicadores de dois módulos, o "Mudar a meta" compartilhado e o evento `metas.mudaram`.
  - O mapa (`docs/mapa.md`): a change e o glossário.
- [x] 6.2 Conferir as verificações. Verificar: os comandos passam, e o CI do PR fica verde.
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual` verdes;
  - `contrato:verificar` em dia;
  - `openspec validate p4f-indicadores-da-operacao --strict` sem erros.
