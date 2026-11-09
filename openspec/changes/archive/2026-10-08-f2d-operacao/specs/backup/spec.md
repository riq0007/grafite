## Purpose

Guardar todo dia uma cópia do banco e dos arquivos da produção, em destinos que quem opera o servidor escolhe, com a retenção, a prova periódica de que a cópia restaura e a restauração guardada da produção.

## ADDED Requirements

### Requirement: Backup diário

Todo dia, no horário escolhido, a produção SHALL fazer um backup com:
- o banco inteiro, de todas as organizações;
- os arquivos;
- um manifesto com a versão, as migrations aplicadas, o número de linhas de cada tabela e o hash de cada parte.

O backup SHALL ser gravado em cada destino da configuração do servidor. Ele SHALL contar como feito só quando chegou a todos os destinos. Uma falha SHALL ser tentada de novo, como as outras tarefas, e, esgotadas as tentativas, SHALL aparecer na tela de backup e em Tarefas.

#### Scenario: Backup no horário
- **WHEN** chega o horário do backup, com dois destinos configurados
- **THEN** o banco, os arquivos e o manifesto são gravados nos dois destinos, e a tela de backup mostra o backup com o tamanho e os destinos

#### Scenario: Destino fora do ar
- **WHEN** o compartilhamento de rede de um dos destinos não responde em nenhuma tentativa
- **THEN** o backup não conta como feito, e a tela de backup e Tarefas mostram a falha, com o destino

### Requirement: Limites na configuração do servidor

A configuração do servidor SHALL definir:
- os destinos, como uma pasta local e compartilhamentos de rede;
- a retenção;
- a janela em que o horário do backup pode ficar;
- a frequência do teste de restauração.

A tela de backup SHALL NOT sair desses limites (spec modulo-administracao).

#### Scenario: Horário fora da janela
- **WHEN** a janela é de 00:00 a 06:00, e alguém tenta pôr o backup às 14:00 pela tela
- **THEN** a mudança é recusada com "Escolha um horário entre 00:00 e 06:00."

### Requirement: Retenção

Depois de cada backup feito, os mais antigos SHALL ser apagados de cada destino, guardando, por padrão:
- os 7 últimos dias;
- o último de cada uma das 4 últimas semanas;
- o último de cada um dos 12 últimos meses.

A retenção SHALL NOT apagar o backup mais novo nem rodar depois de um backup que falhou.

#### Scenario: Oitavo dia
- **WHEN** o backup do oitavo dia é feito
- **THEN** o do primeiro dia é apagado, a menos que seja o último da semana ou do mês dele

#### Scenario: Backups falhando
- **WHEN** o backup falha vários dias seguidos
- **THEN** nenhum backup antigo é apagado nesses dias

### Requirement: Teste de restauração periódico

Na frequência configurada, a produção SHALL testar o backup mais novo:
1. conferir o hash de cada parte;
2. restaurar o banco num banco descartável da instância do teste;
3. comparar o número de linhas de cada tabela com o manifesto;
4. conferir os arquivos;
5. apagar o banco descartável.

O resultado SHALL ficar registrado, e uma falha SHALL aparecer na tela de backup e em Tarefas. O teste SHALL NOT tocar no banco nem nos arquivos da produção.

#### Scenario: Backup que restaura
- **WHEN** o teste de restauração roda sobre um backup bom
- **THEN** a tela de backup mostra o teste bem-sucedido, com a data e o backup testado

#### Scenario: Backup corrompido
- **WHEN** o arquivo do banco do backup mais novo foi alterado depois de gravado
- **THEN** o teste falha no hash, e a tela de backup e Tarefas mostram a falha

### Requirement: Restauração da produção

Restaurar a produção a partir de um backup SHALL ser um pedido do comando de operação, nunca da tela. O comando SHALL:
- pedir o nome do banco da produção digitado;
- parar o app e o coletor;
- guardar o banco atual com outro nome, sem apagá-lo;
- restaurar o banco e os arquivos do backup e conferir as linhas com o manifesto;
- iniciar os serviços e conferir a saúde.

#### Scenario: Banco atual guardado
- **WHEN** a produção é restaurada a partir do backup de ontem
- **THEN** o banco que estava no ar continua no servidor com outro nome, e o runbook diz como apagá-lo depois de conferir

### Requirement: Chaves fora do backup

O backup SHALL NOT incluir a configuração dos ambientes nem as chaves dela, como a chave que cifra as chaves dos apps autenticadores. O runbook SHALL dizer como guardar essas chaves à parte. Sem elas, um backup restaurado SHALL perder só o que elas cifram, e o resto dos dados SHALL continuar legível.

#### Scenario: Backup sem a chave
- **WHEN** alguém tem só os arquivos de um backup
- **THEN** ele não tem a chave dos dois passos nem as senhas dos bancos, que ficam só na configuração do servidor
