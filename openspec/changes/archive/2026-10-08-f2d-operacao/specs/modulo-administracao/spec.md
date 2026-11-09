## MODIFIED Requirements

### Requirement: Administração no dock

A casca SHALL ter o módulo Administração, entre os módulos e Ajustes, visível só para quem tem ao menos uma destas permissões: `pessoas.ver`, `acessos.ver`, `locais.editar`, `organizacao.editar`, `auditoria.ver`, `tarefas.administrar` ou, na organização que opera o servidor, `backup.administrar`. O menu em árvore do dock SHALL ter, nesta ordem, Pessoas, Perfis, Grupos, Locais, Padrões, Auditoria, Tarefas e Backup, cada um só para quem tem a permissão da tela:
- **Pessoas:** `pessoas.ver`;
- **Perfis e Grupos:** `acessos.ver`;
- **Locais:** `locais.editar`;
- **Padrões:** `organizacao.editar`;
- **Auditoria:** `auditoria.ver`;
- **Tarefas:** `tarefas.administrar`;
- **Backup:** `backup.administrar`, e só na organização que opera o servidor.

No celular, a Administração SHALL ficar em "Mais".

#### Scenario: Conta sem permissão de administração
- **WHEN** uma conta sem nenhuma dessas permissões abre a casca
- **THEN** o dock não mostra Administração, e a busca não oferece as telas dela

#### Scenario: Conta só com a auditoria
- **WHEN** uma conta só com `auditoria.ver` abre o menu de Administração
- **THEN** o menu mostra só Auditoria

#### Scenario: Conta só com os padrões
- **WHEN** uma conta só com `organizacao.editar` abre o menu de Administração
- **THEN** o menu mostra só Padrões

#### Scenario: Organização que não opera o servidor
- **WHEN** a administradora de uma organização cliente, com o perfil Administrador, abre o menu de Administração
- **THEN** o menu não mostra Backup, mesmo com `backup.administrar` no perfil

### Requirement: Tela de tarefas com falha

A tela de tarefas SHALL listar as tarefas com falha da organização, da mais recente para a mais antiga. Na organização que opera o servidor, a lista SHALL trazer também as tarefas do servidor com falha, como o backup, o teste de restauração e a vigilância do certificado. Cada tarefa SHALL mostrar:
- o nome dela;
- quando falhou;
- o número de tentativas;
- a mensagem do erro;
- "Tentar de novo".

A lista SHALL ter "Carregar mais" ao fim e se atualizar sozinha quando uma tarefa entra ou sai dela. Sem tarefas com falha, a tela SHALL dizer "Nenhuma tarefa com falha.".

#### Scenario: Nenhuma tarefa com falha
- **WHEN** quem administra as tarefas abre a tela, e nenhuma tarefa da organização falhou
- **THEN** a tela diz "Nenhuma tarefa com falha."

#### Scenario: Tentar de novo pela tela
- **WHEN** quem administra as tarefas escolhe "Tentar de novo" na manutenção diária com falha
- **THEN** a tarefa sai da lista, e um aviso diz "Tarefa de volta na fila."

#### Scenario: Tarefa do servidor
- **WHEN** o backup falha em todas as tentativas
- **THEN** a falha aparece nas tarefas da organização que opera o servidor, e não nas das outras organizações

## ADDED Requirements

### Requirement: Tela de backup

A tela de backup SHALL mostrar:
- os backups guardados, do mais novo para o mais antigo, cada um com quando foi feito, o tamanho, os destinos e o resultado;
- o horário do próximo backup;
- o último teste de restauração, com quando rodou, o backup testado e o resultado.

Ela SHALL oferecer:
- "Fazer backup agora", que põe um backup na fila e o mostra na lista quando termina;
- a mudança do horário do backup e do dia do teste de restauração, dentro dos limites da configuração do servidor (spec backup).

A tela SHALL se atualizar sozinha quando um backup ou um teste de restauração termina. Ela SHALL NOT mostrar os destinos que a configuração não tem, nem oferecer a restauração, que é só pelo comando de operação.

Numa organização que não opera o servidor, a tela SHALL NOT existir: o endereço dela leva à primeira seção da Administração.

#### Scenario: Backup pedido pela tela
- **WHEN** quem administra o backup escolhe "Fazer backup agora"
- **THEN** um aviso diz "Backup na fila.", e o backup aparece na lista ao terminar, com o tamanho e os destinos

#### Scenario: Horário mudado
- **WHEN** quem administra o backup muda o horário de 02:00 para 03:30, dentro da janela da configuração
- **THEN** a tela mostra o próximo backup às 03:30, e um aviso diz "Horário do backup salvo."

#### Scenario: Teste de restauração com falha
- **WHEN** o último teste de restauração falhou
- **THEN** a tela mostra a falha em texto, com o motivo e o backup testado
