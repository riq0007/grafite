## ADDED Requirements

### Requirement: Opções das filas aplicadas na partida

A cada partida, a API SHALL aplicar a cada fila do catálogo as opções que o catálogo dá a ela: as novas tentativas, as esperas, a duração máxima, a retenção e o destino das falhas. Isso SHALL valer também para a fila que já existia, criada por uma versão anterior ou com outra configuração. A opção que o catálogo não dá SHALL voltar ao padrão de uma fila nova, e a fila SHALL ficar igual à que a partida criaria do zero.

A política da fila, como a de uma tarefa de cada vez, SHALL NOT mudar depois de criada. Se a fila tem outra política, a API SHALL avisar no log, com o nome da fila, a política dela e a esperada, e SHALL subir mesmo assim.

#### Scenario: Novas tentativas mudadas numa versão nova
- **WHEN** uma versão nova muda as novas tentativas do backup, e a fila do backup já existe com as da versão anterior
- **THEN** depois da partida, o backup que falha é tentado de novo com as tentativas da versão nova

#### Scenario: Opção que o catálogo deixou de dar
- **WHEN** a fila já existe com um destino das falhas que o catálogo não dá mais a ela
- **THEN** depois da partida, a fila fica sem o destino das falhas, como uma fila nova

#### Scenario: Política diferente
- **WHEN** a fila do backup existe com outra política que não a de uma tarefa de cada vez
- **THEN** a API sobe, e o log avisa com o nome da fila, a política dela e a esperada
