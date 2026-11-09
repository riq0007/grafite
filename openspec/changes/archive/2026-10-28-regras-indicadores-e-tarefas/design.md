## Context

**As regras.**
- Uma regra tem um escopo só: a organização, um tipo, um modelo, um ativo ou um local.
- A avaliação (`apps/api/src/alertas/avaliacao.ts`) monta o filtro SQL do escopo e lê o estado atual das métricas, com os parâmetros da regra no SQL e na recuperação.
- Para um modelo com outro limite, hoje é preciso outra regra e tirar o modelo da primeira, o que não dá: o escopo não exclui.

**Os indicadores.**
- Eles são sete fixos, em dois grupos, com a meta da organização em `indicadores_da_organizacao`.
- O cálculo é do domínio (`calcularIndicadores`), genérico no alvo, sobre os alertas que a API lê no alcance da conta.

**As tarefas.**
- A tela das tarefas lista só as falhas.
- As rotinas ficam na agenda do pg-boss, na tabela `fila.schedule`. Ela tem o `cron`, o fuso e o `last_job_id`, e a execução fica em `fila.job`, onde o papel `grafite_app` já lê.

## Goals / Non-Goals

**Goals:**
- as exceções da regra, que não alertam ou dão outro limite do toner, num tipo, num modelo, num ativo ou num local;
- os indicadores criados pela organização sobre as medidas dos alertas e a dos backups do Control iD;
- a explicação nas telas das regras, dos indicadores e das tarefas;
- as rotinas na tela das tarefas.

**Non-Goals:**
- Exceção com outra severidade ou outra duração. Ela mudaria o motor, que decide a abertura pela duração da regra. Se precisar, é outra regra com o escopo dela.
- Indicadores criados sobre as medidas da operação, como as OS. Elas têm o alcance de outras permissões e a tela delas, e entram depois, com o mesmo modelo.
- A notificação diária dos indicadores criados.
- Rodar uma rotina pela tela.

## Decisions

1. **A exceção é JSON na regra.**
   - A coluna `excecoes jsonb not null default '[]'` guarda a lista `{ lugar: { tipo: 'tipo' | 'modelo' | 'ativo' | 'local', id }, efeito: 'nao-alertar' } | { lugar, efeito: 'outro-limite', limite, folga }`.
   - A regra e as exceções mudam juntas, numa gravação e numa linha da auditoria, e a lista é curta (até 50).
   - Uma tabela própria custaria uma junção na avaliação de cada minuto sem ganho.
   - A conferência da forma e dos limites fica no domínio (`conferirExcecoes`). A API confere que o lugar existe e está ativo com as mesmas mensagens do escopo.
2. **A exceção mais específica vence, no domínio.**
   - `excecaoDoAtivo(excecoes, ativo, ramos)` escolhe pela ordem ativo, modelo, tipo e local. Entre os locais, vence o de ramo menor, o mais fundo.
   - A avaliação lê, junto com cada linha do estado, o tipo, o modelo e o local do ativo, e aplica a exceção em memória.
   - "Não alertar" põe o ativo fora da regra, como o ativo que saiu do escopo, e o alerta aberto termina como "regra deixou de valer".
   - "Outro limite" troca os parâmetros da linha. O SQL busca até o maior limite entre a regra e as exceções, e a conferência fina é a do domínio.
   - A coleta atrasada aplica só o "Não alertar".
3. **Os indicadores criados são a medida mais o recorte.**
   - A tabela `indicadores_criados` (orgScoped, RLS) tem o nome, o nome normalizado único, a medida, o tipo ou o modelo, o local e a meta.
   - O cálculo reaproveita o da medida:
     - a API lê os alertas do período no alcance da conta, como a tela;
     - ela filtra os alvos pelos ativos do recorte, que uma consulta resolve: o tipo ou o modelo e o ramo do local;
     - ela chama a mesma função do domínio com a meta do indicador.
   - A medida dos backups em dia é uma função nova do domínio, `indicadorDosBackups`, que recebe os controles com o último backup bom e o momento.
   - As rotas ficam em `/indicadores/criados` (GET da lista calculada, POST, PATCH e DELETE).
4. **As rotinas pela agenda da fila.**
   - `GET /tarefas/rotinas` lê `fila.schedule`, junta o rótulo e a nova `descricao` do catálogo de tarefas e a última execução pelo `last_job_id` em `fila.job`.
   - Ela esconde a rotina agendada para outra organização: o `data.orgId` diferente da conta.
   - O texto da agenda e a próxima execução saem do domínio (`agendaEmTexto`, `proximaExecucao`), para os padrões que o Grafite usa: a cada minuto, a cada N minutos e todo dia a uma hora. Outro padrão mostra o cron e nenhuma próxima.
5. **As telas explicam com texto curto e fixo,** no alto da tela das regras e dos indicadores e no estado vazio das tarefas e dos indicadores criados, sem tutorial nem ajuda à parte.

## Risks / Trade-offs

- **[A avaliação com exceções lê mais linhas: o maior limite]** → É o estado atual, uma linha por ativo e item, filtrada pelo escopo. A diferença é a faixa entre os limites.
- **[O indicador criado recalcula a cada abertura da tela]** → O cálculo é o mesmo dos quatro, sobre os alertas já lidos. Só o recorte custa uma consulta de ids por indicador.
- **[A execução sai da `fila.job` depois de 7 dias]** → A rotina sem a execução lida mostra "Ainda não rodou" só se nunca rodou. Com a linha apagada, ela mostra a última que a fila ainda guarda.
