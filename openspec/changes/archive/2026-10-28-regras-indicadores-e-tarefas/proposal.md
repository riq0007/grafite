## Why

Em 28/10 o usuário apontou três telas que não se explicam:
- **As regras.** Ele não via a diferença entre a regra e o alerta. Para tratar um modelo de impressora diferente, teria de criar outra regra do toner, e ele não quer várias regras do toner, só separar por tipo ou modelo quando precisar.
- **Os indicadores.** Eles estão confusos e não há como criar um. O indicador dos backups do Control iD em dia, que ficou fora do P5, cabe aqui.
- **As tarefas.** Vazia, a tela só diz que nenhuma falhou e não mostra o que o sistema faz sozinho.

A change é ligada ao P3 (alertas e indicadores) e ao F2c (fila de tarefas) da spec mestre, seções 6.4, 6.6 e 4.3.

## What Changes

- **As exceções da regra.**
  - Uma regra dos ativos ganha as exceções, cada uma num tipo, num modelo, num ativo ou num local.
  - A exceção diz que a regra não vale ali ("Não alertar") ou, na regra do toner, dá outro limite e outra folga.
  - A exceção mais específica vence: a do ativo, depois a do modelo, a do tipo e a do local mais fundo.
  - Assim a regra do toner de fábrica atende o modelo que acaba antes, sem uma regra nova.
- **A tela das regras explica.**
  - Ela diz o que é a regra e o que é o alerta.
  - A lista mostra quantas exceções cada regra tem.
  - O formulário inclui e tira as exceções.
- **Os indicadores criados pela organização.**
  - Quem administra os alertas cria um indicador a partir de uma medida do sistema, com um recorte opcional (um tipo, um modelo ou um local), uma meta própria e um nome.
  - As medidas são as quatro dos alertas e a nova "Backups do Control iD em dia".
  - O indicador criado aparece na tela dos indicadores, com o mesmo cálculo, a situação e a decisão.
  - A tela passa a explicar o que é um indicador e a meta.
- **As rotinas na tela das tarefas.**
  - A tela mostra o que roda sozinho, com o nome, o que faz, quando roda, a última execução e a próxima.
  - As falhas continuam embaixo.
  - O estado vazio explica o que aparece ali.

## Capabilities

### New Capabilities
Nenhuma.

### Modified Capabilities
- `alertas`: as exceções da regra e como a avaliação as aplica.
- `modulo-alertas`: as regras na tela, com a explicação e as exceções.
- `indicadores`: os indicadores criados pela organização, a medida dos backups do Control iD e a tela que explica.
- `modulo-administracao`: a tela das tarefas, com as rotinas e as falhas.

## Impact

- **`packages/domain`:**
  - as exceções e a escolha da mais específica;
  - as medidas dos indicadores criados e o cálculo dos backups em dia;
  - o texto da agenda e a próxima execução.
- **`packages/db`:** a coluna das exceções nas regras e a tabela dos indicadores criados, com o RLS.
- **`apps/api`:**
  - as exceções nas rotas das regras e na avaliação;
  - as rotas dos indicadores criados;
  - a rota das rotinas, que lê a agenda e a última execução na fila;
  - o contrato gerado de novo.
- **`apps/web`:** o formulário e a lista das regras, a tela dos indicadores e a tela das tarefas.
