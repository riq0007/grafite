## MODIFIED Requirements

### Requirement: Histórico dos backups

A ficha de um controle com o backup ligado SHALL ter a seção Backups:
- os backups do mais recente para o mais antigo;
- o momento, a origem, a situação escrita por extenso, os registros, as fotos e o tamanho;
- as ações "Fazer backup agora", "Ver conteúdo", "Baixar" e "Apagar", conforme a permissão.

A tela "Backups do Control iD" da Gestão de ativos (spec modulo-gestao-de-ativos) SHALL mostrar os backups dos controles que a conta vê, com:
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

#### Scenario: Backups pelo dock
- **WHEN** a técnica escolhe "Gestão de ativos › Control iD › Backups" no dock
- **THEN** a tela "Backups do Control iD" abre, com os backups dos controles que ela vê
