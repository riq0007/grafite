## MODIFIED Requirements

### Requirement: Leituras em série temporal

Cada leitura aceita SHALL ser gravada com:
- o ativo e a métrica;
- o item, quando a métrica tem vários por ativo, como os suprimentos e os contadores de uma impressora;
- o momento em que foi feita, no coletor;
- o valor, quando houver;
- os detalhes do item, quando a métrica os tem, como a descrição e a capacidade de um suprimento;
- a situação da leitura: válida, sem dado ou inconsistente;
- o coletor que a fez.

Uma leitura SHALL NOT ser alterada nem substituir outra: a série guarda todas, na ordem do momento. As leituras SHALL seguir o acesso do ativo: só quem vê o ativo, pelo local dele (spec cadastro-de-ativos), vê as leituras e o estado dele.

#### Scenario: Duas leituras do mesmo ativo
- **WHEN** a impressora PAT-00412 é lida às 10:00 e às 10:02
- **THEN** a série guarda as duas leituras, cada uma com o seu momento

#### Scenario: Ativo fora do acesso
- **WHEN** Bruno vê ativos só em "Jundiaí", e um ativo de "Campinas" é lido
- **THEN** a tabela de Bruno não mostra esse ativo nem a situação dele

#### Scenario: Itens da mesma métrica
- **WHEN** a PAT-00412 é lida com o toner a 8% e o cilindro a 60%
- **THEN** a série guarda uma leitura para cada suprimento, cada uma com o item e a descrição dele

### Requirement: Estado atual

Para cada ativo, métrica e item, o estado atual SHALL guardar a leitura de momento mais recente, com:
- o momento dela;
- o momento desde quando a situação é a mesma, como "Offline desde 10:32".

Uma leitura que chega atrasada, mais antiga que a do estado atual, como a de um lote que estava na fila em disco, SHALL entrar na série sem mudar o estado atual.

As listas e as fichas SHALL ler o estado atual, e nunca a série, para mostrar a situação de agora.

#### Scenario: Leitura atrasada
- **WHEN** o estado atual da PAT-00412 é de 10:30, e chega da fila em disco uma leitura dela de 10:10
- **THEN** a leitura de 10:10 entra na série, e o estado atual continua o de 10:30

#### Scenario: Desde quando
- **WHEN** um switch está online, fica offline às 10:32 e continua offline nas leituras seguintes
- **THEN** a ficha dele diz "Offline desde" 10:32

### Requirement: Retenção das leituras

As leituras SHALL ser guardadas por 30 dias e apagadas depois pela manutenção diária (spec fila-de-tarefas). Antes de apagá-las, a manutenção SHALL guardar os agregados por hora (requisito "Agregados por hora"). O estado atual SHALL ficar, mesmo com a leitura dele apagada da série.

#### Scenario: Leitura antiga
- **WHEN** a manutenção diária roda, e há leituras de 31 dias atrás
- **THEN** essas leituras são apagadas, o agregado da hora delas continua, e o estado atual de cada ativo continua o mesmo

## ADDED Requirements

### Requirement: Agregados por hora

Para cada ativo, métrica, item e hora completa, a manutenção diária SHALL guardar, das leituras daquela hora:
- quantas leituras houve e quantas foram válidas;
- o mínimo, o máximo e a média dos valores válidos;
- o último valor válido e o momento dele.

O último valor SHALL guardar o contador de páginas do fim da hora, para as páginas de um período saírem dos agregados depois que as leituras forem apagadas. Uma hora sem nenhuma leitura válida SHALL ter o agregado sem os valores, e nunca com zero. Agregar de novo uma hora já agregada SHALL dar o mesmo resultado. Os agregados SHALL ser guardados por 13 meses, seguir o acesso do ativo, como as leituras, e SHALL NOT entrar na auditoria.

#### Scenario: Hora de uma impressora
- **WHEN** a PAT-00412 teve seis leituras do total de páginas entre 10:00 e 11:00, de 12.400 a 12.500
- **THEN** o agregado das 10:00 guarda seis leituras, o mínimo 12.400, o máximo 12.500 e o último 12.500

#### Scenario: Hora sem resposta
- **WHEN** o ping de um switch deu "sem dado" a hora inteira
- **THEN** o agregado daquela hora guarda as leituras e nenhuma válida, sem mínimo, máximo nem média

#### Scenario: Agregado antigo
- **WHEN** a manutenção diária roda, e há agregados de 14 meses atrás
- **THEN** esses agregados são apagados, e os de 12 meses ficam
