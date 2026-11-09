## Why

Cada fila da fila de tarefas guarda as opções de quando foi criada: as novas tentativas, as esperas, a duração máxima, a retenção e o destino das falhas. Na partida, a API cria a fila que falta, mas a que já existe fica como estava. Uma versão nova que muda essas opções no catálogo, como as novas tentativas do backup, não chega às filas de um servidor já instalado. Além disso, nada avisa disso. O CI achou o problema: a fila do backup, criada antes por outro teste com as tentativas padrão, não esgotava a falha a tempo.

Esta change corrige o F2c · Plataforma (spec mestre, seção 3.2), na fila de tarefas, e vale para as tarefas do servidor que o F2d · Operação pôs nela.

## What Changes

- **Opções do catálogo na partida:** a cada partida, a API aplica a cada fila do catálogo as opções que o catálogo dá a ela, também à fila que já existia. A opção que o catálogo não dá volta ao padrão de uma fila nova, e a fila fica igual à que a partida criaria do zero.
- **Política conferida:** a política da fila, como a de uma tarefa de cada vez do backup, não muda depois de criada. Se a fila tem outra política, a API avisa no log, com a fila, a política dela e a esperada, e sobe.
- **Teste da falha esgotada:** sai o contorno que apagava a fila do backup antes do teste, porque a partida passa a resolver.
- Nada muda no banco, nas rotas, no contrato nem na web.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `fila-de-tarefas`: um requisito novo, "Opções das filas aplicadas na partida", com as opções do catálogo aplicadas às filas que já existem e o aviso da política diferente.

## Impact

- **`apps/api/src/fila/fila.ts`:** a partida aplica as opções e confere a política, com os padrões de uma fila nova da versão fixada do pg-boss.
- **Testes de integração da fila:** os casos novos e o teste da falha esgotada sem o contorno.
- O papel da aplicação já pode alterar as filas: nenhuma migration nem permissão nova.
