## MODIFIED Requirements

### Requirement: Histórico dos backups

A ficha de um controle com o backup ligado SHALL ter a seção Backups:
- no topo, o resumo do controle (requisito "Resumo dos backups por controle"):
  - a contagem dos rostos e a dos usuários, com a variação desde o backup anterior;
  - a tendência dos rostos;
  - a faixa dos últimos 30 dias;
- os backups do mais recente para o mais antigo;
- o momento, a origem, a situação escrita por extenso, os registros, as fotos e o tamanho;
- as ações "Fazer backup agora", "Ver conteúdo", "Baixar" e "Apagar", conforme a permissão.

A tela "Backups do Control iD" da Gestão de ativos (spec modulo-gestao-de-ativos) SHALL mostrar os backups dos controles que a conta vê. Acima da lista, ela SHALL ter a tabela "Últimos 30 dias", com uma linha por controle: a faixa, os rostos, os usuários e o último backup. Primeiro vem quem tem mais dias sem backup. A lista SHALL ter:
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

#### Scenario: Rostos na ficha
- **WHEN** o último backup Sucesso do PAT-00778 leu 412 fotos e 98 usuários, e o anterior, 409 fotos e 100 usuários
- **THEN** a ficha mostra "412" rostos com "+3 desde o backup anterior" e "98" usuários com "−2 desde o backup anterior"

#### Scenario: Controle sem backup
- **WHEN** a tela "Backups do Control iD" abre, e o Controle do almoxarifado não tem backup há 5 dias
- **THEN** ele aparece primeiro na tabela "Últimos 30 dias", com os 5 dias só com o contorno na faixa

## ADDED Requirements

### Requirement: Resumo dos backups por controle

A API SHALL devolver, para cada controle com o backup ligado que a conta vê (`controlid.ver` no local):
- **os dias:** cada dia de São Paulo dos últimos 30, ou de 7 a 90 a pedido, com a melhor situação dos backups concluídos nele: concluído, parcial, falha ou nada;
- **o último e o anterior:** os dois últimos backups Sucesso ou Parcial, com os usuários e os rostos, que são a quantidade das categorias "Usuários" e "Fotos". Uma categoria com erro SHALL contar como sem dado, e nunca como zero;
- **a série dos rostos:** os backups com as fotos lidas, para a tendência.

O filtro por ativo SHALL dar um controle só.

#### Scenario: Dia com falha e sucesso
- **WHEN** o PAT-00778 teve um backup Falha às 2h e um Sucesso às 9h do mesmo dia
- **THEN** o dia aparece como concluído

#### Scenario: Fotos com erro
- **WHEN** o último backup Parcial leu os usuários, mas a categoria das fotos deu erro
- **THEN** os usuários aparecem, e os rostos aparecem como sem dado
