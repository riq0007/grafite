## Purpose

Guardar o conteúdo dos controles de acesso Control iD (usuários, grupos, cartões, biometria, regras de acesso, horários e fotos) em backups ZIP feitos pelo coletor, de forma manual, em lote e agendada, com histórico, retenção, download e a visualização do conteúdo na tela.

## ADDED Requirements

### Requirement: Backup do Control iD no tipo

A capacidade `controlid.backup` (Backup do Control iD) SHALL ter a descrição "Guarda, todo dia, os usuários, os grupos, os cartões, a biometria, as regras de acesso, os horários e as fotos do controle de acesso.". Ela SHALL NOT trazer campos. Ela SHALL usar o campo de IP, a porta e o login da saúde do Control iD do mesmo tipo (spec saude-do-control-id), e a configuração dela SHALL ser só o horário do backup diário, em `HH:MM`, com 02:00 já escolhido.

Ligar o backup sem a saúde do Control iD no tipo SHALL ser recusado com "Ligue a saúde do Control iD no tipo: o backup usa o mesmo IP, a mesma porta e o mesmo login.". Um horário fora do formato SHALL ser recusado com "Informe o horário como 02:00.".

#### Scenario: Backup ligado no tipo
- **WHEN** quem administra o catálogo liga o backup do Control iD no tipo "Controle de acesso", que já tem a saúde do Control iD, com o horário 03:30
- **THEN** o tipo é salvo, e os controles dele entram na agenda das 03:30

#### Scenario: Sem a saúde do Control iD
- **WHEN** alguém pede para ligar o backup num tipo sem a saúde do Control iD
- **THEN** o pedido é recusado com "Ligue a saúde do Control iD no tipo: o backup usa o mesmo IP, a mesma porta e o mesmo login."

### Requirement: Backup na fila

Um backup SHALL entrar na fila de três formas:
- pelo "Fazer backup agora" da ficha do controle, com a origem Manual;
- pelo "Backup de todos os controles" da tela dos backups, um por controle que a conta pode fazer, com a origem Manual;
- pela agenda, uma vez por dia, a partir do horário do tipo, no fuso de São Paulo, com a origem Agendado. Com a API fora do ar no horário, o backup do dia entra quando ela volta, no mesmo dia.

Um controle que já tem um backup na fila ou em andamento SHALL NOT ganhar outro, e o pedido manual SHALL ser recusado com "Já há um backup deste controle na fila.". Um controle sem IP, sem login válido ou fora do alcance de qualquer coletor SHALL ter o backup registrado como Falha, com o motivo da saúde do Control iD ou "Nenhum coletor alcança o IP deste controle.".

#### Scenario: Backup pedido pela ficha
- **WHEN** a técnica com `controlid.backup` no local do controle PAT-00778 pede "Fazer backup agora"
- **THEN** o backup entra na fila com a origem Manual, a ficha mostra "Na fila", e a auditoria registra o pedido

#### Scenario: Pedido repetido
- **WHEN** alguém pede o backup de um controle que já tem um na fila
- **THEN** o pedido é recusado com "Já há um backup deste controle na fila."

#### Scenario: Agenda depois de um servidor parado
- **WHEN** a API volta às 08:00 depois de ficar parada das 01:00 às 07:59, e o horário do tipo é 02:00
- **THEN** o backup agendado do dia entra na fila logo na volta, uma vez só

### Requirement: Resultado do backup

O coletor SHALL ler, nesta ordem, as informações do sistema e as categorias `users`, `groups`, `user_groups`, `cards`, `templates`, `access_rules`, `group_access_rules`, `time_zones`, `time_spans` e `access_rule_time_zones`, e depois a foto de cada usuário, aceitando só o conteúdo que começa com a assinatura do JPEG. Uma categoria que falha SHALL ficar com a situação Erro e a mensagem, sem parar as outras.

O arquivo SHALL ser um ZIP no formato do PMG:
- o `metadata.json`, com o formato, o momento, o controle, a série, o firmware, a origem, o resultado, o total de registros, as categorias e os erros;
- o `device_info.json`;
- um JSON por categoria;
- as fotos em `face_images/user_<id>.jpg`.

O backup SHALL ser:
- **Sucesso:** nenhuma categoria falhou;
- **Parcial:** parte das categorias falhou;
- **Falha:** todas falharam, ou o login, a leitura das informações ou o envio falharam, com a mensagem.

O backup concluído SHALL guardar o arquivo, o tamanho, o total de registros, a série, o firmware, o modelo, as categorias com a quantidade, a duração e o coletor.

#### Scenario: Backup completo
- **WHEN** o coletor lê todas as categorias e 312 fotos do controle PAT-00778
- **THEN** o backup fica Sucesso, com o total de registros, as 312 fotos e o ZIP guardado

#### Scenario: Biometria que falha
- **WHEN** a leitura de `templates` falha e as outras categorias são lidas
- **THEN** o backup fica Parcial, e a categoria Biometria mostra Erro, com a mensagem

#### Scenario: Login recusado
- **WHEN** o controle recusa o login do cofre
- **THEN** o backup fica Falha, com "O controle recusou o login do cofre.", sem arquivo

### Requirement: Pedido sem resposta do coletor

Um backup na fila que nenhum coletor buscou em 2 horas SHALL virar Falha, com "O coletor não buscou o pedido em 2 horas.". Um backup em andamento que o coletor não terminou em 30 minutos SHALL virar Falha, com "O coletor não terminou o backup em 30 minutos.". A resposta que chega depois disso SHALL ser recusada.

#### Scenario: Coletor desligado
- **WHEN** o coletor da rede do controle fica desligado das 02:00 às 05:00
- **THEN** o backup das 02:00 vira Falha às 04:00, com "O coletor não buscou o pedido em 2 horas."

### Requirement: Retenção dos backups

Depois de cada backup Sucesso ou Parcial, de cada controle SHALL ficar:
- o backup bom mais recente;
- o último backup bom de cada um dos últimos 7 dias;
- o último de cada uma das últimas 4 semanas;
- o último de cada um dos últimos 12 meses.

Os dias, as semanas (de segunda a domingo) e os meses SHALL ser contados no fuso de São Paulo. Os outros backups bons SHALL ser apagados, com o arquivo. As falhas SHALL ficar 30 dias. A retenção SHALL NOT entrar na auditoria um por um: ela registra só quantos saíram.

#### Scenario: Oitavo dia
- **WHEN** o controle tem um backup bom por dia há 8 dias, e o de hoje termina
- **THEN** o backup de 8 dias atrás fica só se for o último da semana ou do mês dele; senão, ele sai com o arquivo

#### Scenario: Dois backups no mesmo dia
- **WHEN** um backup manual termina às 15:00, depois do agendado das 02:00 do mesmo dia
- **THEN** o das 15:00 passa a ser o do dia, e o das 02:00 sai, com o arquivo

### Requirement: Histórico dos backups

A ficha de um controle com o backup ligado SHALL ter a seção Backups:
- os backups do mais recente para o mais antigo;
- o momento, a origem, a situação escrita por extenso, os registros, as fotos e o tamanho;
- as ações "Fazer backup agora", "Ver conteúdo", "Baixar" e "Apagar", conforme a permissão.

A tela "Backups do Control iD" do Ativos SHALL mostrar os backups dos controles que a conta vê, com:
- o filtro pelo controle e pela situação;
- o "Carregar mais";
- o "Backup de todos os controles";
- o "Baixar os filtrados", que confirma a quantidade, baixa um por um e diz quantos falharam.

Um backup na fila ou em andamento SHALL aparecer com "Na fila" ou "Em andamento" e o tempo desde o pedido.

#### Scenario: Histórico na ficha
- **WHEN** a técnica abre a ficha do controle PAT-00778, que tem 9 backups
- **THEN** a seção Backups mostra os 9, do mais recente para o mais antigo, com a situação por extenso

#### Scenario: Primeiro backup
- **WHEN** a seção Backups de um controle sem nenhum backup é aberta
- **THEN** ela diz "Nenhum backup deste controle ainda. O primeiro sai no horário do tipo, ou agora, pelo Fazer backup agora."

### Requirement: Download do backup

Quem tem `controlid.ver` no local do controle SHALL baixar o ZIP de um backup Sucesso ou Parcial, com o nome `controlid-<patrimônio ou nome>-<AAAA-MM-DD-HHmm>.zip`, e o download SHALL entrar na auditoria. Um backup sem arquivo SHALL responder "Este backup não tem arquivo.".

#### Scenario: ZIP baixado
- **WHEN** o técnico baixa o backup de ontem do PAT-00778
- **THEN** o navegador recebe o ZIP com o nome do controle e a data, e a auditoria registra o download

### Requirement: Conteúdo do backup na tela

Quem tem `controlid.ver` SHALL ver o conteúdo de um backup com arquivo, sem baixar, em abas:
- **Pessoas:** cada usuário com a foto, o nome, a matrícula, os cartões e os grupos;
- **Grupos;**
- **Regras de acesso;**
- **Horários:** os horários e os intervalos deles.

Cada aba SHALL ter a busca pelo texto e a contagem, e as listas longas SHALL carregar em páginas de 100. O conteúdo SHALL ser lido do ZIP guardado, sem falar com o controle. A senha e o sal dos usuários SHALL NOT aparecer.

#### Scenario: Pessoa procurada no backup
- **WHEN** a técnica abre o conteúdo do backup e procura "Marina"
- **THEN** a aba Pessoas mostra a Marina com a foto, a matrícula, o cartão e o grupo dela

### Requirement: Exclusão de um backup

Quem tem `controlid.backup` no local do controle SHALL apagar um backup que não está na fila nem em andamento, com a confirmação, e o arquivo SHALL sair junto. A exclusão SHALL entrar na auditoria. Os dados de um backup SHALL NOT ser alterados por ninguém.

#### Scenario: Backup apagado
- **WHEN** o técnico apaga o backup errado e confirma
- **THEN** o backup e o arquivo saem, e a auditoria registra a exclusão

### Requirement: Permissões do Control iD

O catálogo de permissões SHALL ter, na área Control iD:
- `controlid.ver`, "Ver os backups do Control iD e o conteúdo deles", por local;
- `controlid.backup`, "Fazer e apagar os backups do Control iD", por local, que inclui ver.

O perfil Administrador SHALL ter as duas. O local de um backup SHALL ser o local do controle.

#### Scenario: Quem só vê
- **WHEN** uma conta com `controlid.ver` e sem `controlid.backup` abre a seção Backups
- **THEN** ela vê, baixa e abre o conteúdo, sem "Fazer backup agora" nem "Apagar"

### Requirement: Telas atualizadas pelo evento dos backups

Cada mudança de um backup SHALL gravar o evento `controlid.mudaram`, entregue a quem vê o controle, e a seção da ficha e a tela dos backups SHALL se reler por ele.

#### Scenario: Backup que termina com a ficha aberta
- **WHEN** a ficha do controle está aberta com o backup "Em andamento", e o coletor termina
- **THEN** a seção passa a mostrar o backup Sucesso, sem recarregar a página
