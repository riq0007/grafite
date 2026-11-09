## Context

A motivação está em `proposal.md`, e o requisito, na spec desta change. Pontos de partida:
- **Partida da fila (`apps/api/src/fila/fila.ts`):** a API liga o pg-boss 12.37.0 com o papel da aplicação e chama `createQueue` para cada tarefa do catálogo. Ela cria antes as filas que recebem as falhas de outras.
- **`create_queue` (migration `0014_fila.sql`, gerada da versão fixada):** grava a fila com `ON CONFLICT DO NOTHING`. Na fila que já existe, as opções novas não entram. A opção que falta recebe o padrão: 2 novas tentativas, nenhuma espera, sem dobrar, 900 s de duração máxima, 14 dias de retenção, 7 dias até apagar a concluída e nenhum destino das falhas.
- **`updateQueue`:** muda as opções de uma fila que já existe, menos a política e a tabela própria, que ficam como foram criadas. A opção que não vai na chamada fica como estava, e `null` limpa o destino das falhas, o teto das esperas e o intervalo do sinal de vida.
- **Papel da aplicação:** já tem `UPDATE` nas tabelas do esquema `fila`.
- **Opções do catálogo:**
  - a manutenção e a fila das falhas: 5 novas tentativas, a partir de 1 min, dobrando até 1 h;
  - a distribuição da manutenção: só o destino das falhas;
  - as tarefas do servidor: uma de cada vez, com as novas tentativas, a duração máxima e o destino das falhas.

## Goals / Non-Goals

**Goals:**
- Depois da partida, cada fila do catálogo tem as opções que uma fila nova teria com as opções do catálogo.
- A política diferente aparece no log, sem derrubar a API.

**Non-Goals:**
- Mudar a política de uma fila que já existe. Isso pede apagar a fila e as tarefas dela, e fica para a versão que mudar uma política, numa migration.
- Mexer nas filas que não estão no catálogo.

## Decisions

### 1. `updateQueue` com todas as opções, a cada partida
- **Escolha:**
  - Depois do `createQueue`, a partida chama `updateQueue` com as opções do padrão de uma fila nova, cobertas pelas que o catálogo dá à fila, sem a política.
  - Os padrões ficam numa constante ao lado da fila, com os valores do `create_queue` da versão fixada.
  - Um teste de integração cria uma fila sem opções e confere que ela fica igual à constante. Uma versão nova do pg-boss com outros padrões reprova esse teste antes de chegar ao servidor.
- **Por quê:**
  - Mandar só as opções do catálogo deixaria para trás a opção que ele deixou de dar, porque o `updateQueue` guarda a que não vai na chamada.
  - Com todas, a fila fica igual à que a partida criaria do zero, e a regra é uma só.
- **Alternativas:**
  - **Comparar e atualizar só o que mudou:** mais código para o mesmo resultado. A atualização é uma linha por fila, e o catálogo tem poucas.
  - **Apagar e recriar a fila:** perderia as tarefas que estão nela.

### 2. A política conferida, com aviso no log
- **Escolha:**
  - Depois da atualização, a partida lê a fila e compara a política dela com a do catálogo, `standard` quando ele não dá nenhuma.
  - Se forem diferentes, ela avisa pelo mesmo `avisar` das falhas da fila: "A fila <nome> tem a política <dela>, e o catálogo pede <esperada>; a política não muda depois de criada." E segue.
- **Por quê:** a política garante coisas como um backup de cada vez. Sem o aviso, a garantia sumiria calada. Recusar a partida derrubaria a produção por uma fila.

## Risks / Trade-offs

- **[Os padrões copiados do pg-boss]** → O teste de integração da decisão 1 reprova a constante que não bate com a versão fixada. A migration da fila e a versão do pg-boss já só mudam juntas (`pnpm fila:verificar`).
- **[Uma escrita por fila a cada partida]** → São poucas filas, e só na partida.
- **[Tarefa que está na fila durante a atualização]** → As opções novas valem para as tentativas seguintes. A tarefa em andamento termina como começou.

## Migration Plan

Nenhuma migration. Na primeira partida da versão com esta change, as filas de um servidor instalado passam a ter as opções do catálogo.
