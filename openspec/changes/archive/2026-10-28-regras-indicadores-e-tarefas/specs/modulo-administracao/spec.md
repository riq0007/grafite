## MODIFIED Requirements

### Requirement: Tela de tarefas com falha

A tela de tarefas SHALL mostrar primeiro as rotinas: o que o sistema faz sozinho, num horário. Cada rotina SHALL mostrar:
- o nome dela, como "Manutenção diária", e uma frase do que ela faz;
- quando roda, como "Todo dia às 03:30" ou "A cada 5 minutos";
- a última execução, com o momento e a situação em texto, "Concluída", "Em andamento" ou "Falhou", ou "Ainda não rodou";
- a próxima execução.

Na organização que opera o servidor, as rotinas SHALL trazer também as do servidor que estão agendadas, como o backup.

Embaixo, a tela SHALL listar as tarefas com falha da organização, da mais recente para a mais antiga. Na organização que opera o servidor, a lista SHALL trazer também as tarefas do servidor com falha, como o backup, o teste de restauração e a vigilância do certificado. Cada tarefa SHALL mostrar:
- o nome dela;
- quando falhou;
- o número de tentativas;
- a mensagem do erro;
- "Tentar de novo".

A lista SHALL ter "Carregar mais" ao fim e se atualizar sozinha quando uma tarefa entra ou sai dela. Sem tarefas com falha, a tela SHALL dizer "Nenhuma tarefa com falha." e explicar que a rotina ou a tarefa que falha em todas as tentativas aparece ali, com o erro e "Tentar de novo".

#### Scenario: Nenhuma tarefa com falha
- **WHEN** quem administra as tarefas abre a tela, e nenhuma tarefa da organização falhou
- **THEN** a tela diz "Nenhuma tarefa com falha." e explica o que aparece ali

#### Scenario: Tentar de novo pela tela
- **WHEN** quem administra as tarefas escolhe "Tentar de novo" na manutenção diária com falha
- **THEN** a tarefa sai da lista, e um aviso diz "Tarefa de volta na fila."

#### Scenario: Tarefa do servidor
- **WHEN** o backup falha em todas as tentativas
- **THEN** a falha aparece nas tarefas da organização que opera o servidor, e não nas das outras organizações

#### Scenario: Rotinas
- **WHEN** quem administra as tarefas abre a tela
- **THEN** ela vê a "Manutenção diária", com "Todo dia às 03:30", a última execução e a próxima
