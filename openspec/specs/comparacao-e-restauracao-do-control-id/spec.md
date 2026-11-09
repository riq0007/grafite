# comparacao-e-restauracao-do-control-id Specification

## Purpose

Usar os backups do Control iD na hora do problema: comparar um backup com o controle, restaurar um backup num controle na ordem das dependências, sem duplicar o que já existe, e comparar dois backups ou arquivos exportados pelo controle.

## Requirements

### Requirement: Operações no controle

A restauração e a comparação com o controle SHALL ser pedidos ao coletor, como o backup (spec coletor-local, "Pedidos ao coletor"), guardados como operações. Cada operação SHALL ter:
- o backup e o controle de destino;
- o tipo, quem pediu e os momentos;
- a situação: Na fila, Em andamento, Sucesso, Parcial ou Falha;
- o resultado por categoria.

O coletor SHALL baixar o ZIP do backup pela API e responder com o resultado ou com a falha. Um controle SHALL ter só uma operação aberta, e o pedido seguinte SHALL ser recusado com "Já há uma operação aberta neste controle.". A operação que o coletor não busca em 2 horas, ou não termina em 30 minutos, SHALL virar Falha, como o backup.

#### Scenario: Operação na fila
- **WHEN** a técnica pede a comparação do backup de ontem com o controle PAT-00778
- **THEN** a operação entra na fila, e a seção Backups da ficha a mostra "Na fila"

#### Scenario: Operação repetida
- **WHEN** alguém pede uma operação num controle que já tem uma aberta
- **THEN** o pedido é recusado com "Já há uma operação aberta neste controle."

### Requirement: Comparação com o controle

Para cada categoria, a comparação SHALL contar:
- os itens iguais nos dois lados;
- os que estão só no backup;
- os que estão só no controle;
- os divergentes: o mesmo item com o conteúdo diferente.

O item SHALL ser o id. Nas categorias de ligação, sem id, o item SHALL ser os ids que ela liga, como o usuário e o grupo. A senha e o sal SHALL ficar de fora. A categoria que o controle não deixa ler SHALL ser comparada como vazia do lado dele. O resultado SHALL trazer só as contagens.

#### Scenario: Controle com uma pessoa a menos
- **WHEN** a comparação roda num controle em que a Marina foi apagada depois do backup
- **THEN** a categoria Usuários mostra 1 só no backup, e as outras pessoas como iguais

### Requirement: Restauração num controle

Quem tem `controlid.restaurar` no local do controle de destino SHALL restaurar um backup com arquivo:
- no próprio controle;
- ou em outro controle com o backup ligado.

A restauração SHALL:
- processar as categorias nesta ordem: `users`, `groups`, `user_groups`, `time_zones`, `time_spans`, `access_rules`, `group_access_rules`, `access_rule_time_zones`, `cards`, `templates` e, por último, as fotos;
- pular, como Pulado, as categorias não escolhidas;
- consultar o que o controle já tem e contar como ignorado o item cujo id já existe, sem recriá-lo;
- contar cada item que falha, com o id, sem parar os outros.

O resultado SHALL ser Sucesso sem erro, Falha quando todas as categorias processadas falharem ou o login falhar, e Parcial no meio. O modelo do backup diferente do modelo do controle de destino SHALL gerar o aviso "O backup é de outro modelo de controle; a restauração pode ter resultados inesperados.", sem bloquear.

A restauração SHALL pedir o código do app autenticador da conta, conferido como na liberação do Cofre. Sem a verificação em dois passos, o pedido SHALL ser recusado com "Ative a verificação em dois passos para restaurar um backup.". O código errado SHALL ser recusado com "Código incorreto.". A auditoria SHALL registrar o pedido, com o backup, o destino e as categorias, e o resultado.

#### Scenario: Controle trocado
- **WHEN** o controle da portaria queima, e a técnica restaura o backup de ontem no controle novo, com o código do app
- **THEN** o coletor cria as pessoas, os grupos, as regras, os horários, os cartões, a biometria e as fotos, nessa ordem, e o resultado mostra os criados por categoria

#### Scenario: Restauração no mesmo controle
- **WHEN** a restauração roda num controle que já tem 300 das 312 pessoas do backup
- **THEN** as 300 são contadas como ignoradas, e as 12 que faltam são criadas

#### Scenario: Sem o código do app
- **WHEN** alguém pede a restauração com o código errado
- **THEN** o pedido é recusado com "Código incorreto.", e nada vai ao coletor

### Requirement: Comparador de backups

Quem tem `controlid.ver` SHALL comparar dois lados. Cada lado SHALL ser:
- um backup do histórico que a conta vê;
- ou um arquivo enviado: o ZIP do Grafite ou do PMG, até 512 MB, ou o CSV exportado pelo controle.

Outro formato SHALL ser recusado com "Envie um ZIP de backup ou o CSV exportado pelo controle.". O arquivo enviado SHALL ficar só na memória da API por 30 minutos.

A comparação SHALL cobrir as pessoas (`users`) e os cartões (`cards`), pelo id, com os valores como texto e o nulo igual ao vazio, sem a senha e o sal. Para cada tabela, ela SHALL mostrar:
- quantos registros são idênticos;
- os divergentes, com o nome e os campos diferentes lado a lado;
- os que estão só em cada lado, com o id e o nome.

#### Scenario: Backup do PMG contra o CSV do controle
- **WHEN** a técnica compara o ZIP do PMG com o CSV exportado pelo controle
- **THEN** a tela mostra as pessoas idênticas, as divergentes com os campos lado a lado e as que estão só num dos lados

#### Scenario: Diferença só na senha
- **WHEN** duas pessoas diferem só na senha e no sal
- **THEN** elas contam como idênticas

### Requirement: Permissão de restaurar

O catálogo de permissões SHALL ter `controlid.restaurar`, "Restaurar os backups do Control iD nos controles", na área Control iD, por local, incluindo `controlid.ver`. O perfil Administrador SHALL tê-la.

#### Scenario: Quem faz o backup sem restaurar
- **WHEN** uma conta com `controlid.backup` e sem `controlid.restaurar` abre as ações de um backup
- **THEN** ela vê "Comparar com o controle" e não vê "Restaurar…"
