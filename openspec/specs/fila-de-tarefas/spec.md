# fila-de-tarefas Specification

## Purpose

Rodar as tarefas em segundo plano numa fila no próprio PostgreSQL, com novas tentativas e a lista das tarefas com falha. A primeira tarefa é a manutenção diária de cada organização, e a fila fica pronta para os alertas, os e-mails e os backups da fase 2.

## Requirements

### Requirement: Fila no próprio banco

As tarefas em segundo plano SHALL ficar numa fila no próprio PostgreSQL, sem outro serviço. A estrutura da fila SHALL ser criada pelas migrations, na versão fixada da biblioteca da fila. A aplicação SHALL usar a fila com o papel dela, que inclui, lê e altera as tarefas, mas SHALL NOT criar nem mudar a estrutura da fila.

Uma tarefa SHALL levar só o tipo e identificadores, como o da organização, nunca dados de negócio. O trabalho de uma tarefa de uma organização SHALL rodar no contexto dela.

#### Scenario: API com o papel da aplicação
- **WHEN** a API sobe com o papel da aplicação e o banco já migrado
- **THEN** a fila funciona, sem que a API crie ou altere nenhuma tabela

#### Scenario: Conteúdo de uma tarefa
- **WHEN** a manutenção diária de uma organização é posta na fila
- **THEN** a tarefa guarda só o tipo e o identificador da organização

### Requirement: Tentativas com intervalos crescentes

Uma tarefa que falha SHALL ser tentada de novo até 5 vezes. O intervalo SHALL dobrar a cada tentativa, a partir de 1 min, com uma variação aleatória para as tarefas não voltarem todas juntas, e nenhum intervalo SHALL passar de 1 h. Depois da última tentativa, a tarefa SHALL ficar com falha. Uma tarefa interrompida pelo encerramento da API SHALL voltar à fila e rodar de novo.

#### Scenario: Falha passageira
- **WHEN** a manutenção de uma organização falha na primeira tentativa por um erro passageiro
- **THEN** ela roda de novo em até 5 min, conclui, e não aparece nas tarefas com falha

#### Scenario: Falha que continua
- **WHEN** a manutenção de uma organização falha em todas as 6 tentativas
- **THEN** ela fica com falha e aparece nas tarefas com falha da organização

#### Scenario: API reiniciada no meio
- **WHEN** a API é reiniciada enquanto a manutenção de uma organização roda
- **THEN** a manutenção roda de novo depois, e o trabalho não fica pela metade

### Requirement: Tarefas com falha

Cada tarefa de uma organização que fica com falha SHALL entrar na lista de tarefas com falha da organização, com:
- o nome da tarefa em pt-BR, como "Manutenção diária";
- quando a última tentativa falhou;
- o número de tentativas;
- a mensagem do último erro.

Quem administra as tarefas SHALL poder escolher "Tentar de novo" numa delas. A tarefa SHALL voltar à fila na hora, com as tentativas do começo, e sair da lista. A auditoria SHALL registrar quem repetiu, a tarefa e o erro.

As tarefas da instalação, que não são de uma organização, SHALL registrar a falha no log da API, com o código da tarefa e o erro.

#### Scenario: Tentar de novo
- **WHEN** quem administra as tarefas escolhe "Tentar de novo" na manutenção diária com falha
- **THEN** a manutenção volta à fila e sai da lista, e a auditoria registra a repetição

#### Scenario: Lista de outra organização
- **WHEN** a manutenção da organização A fica com falha
- **THEN** ela aparece só na lista de tarefas com falha de A

### Requirement: Manutenção diária de cada organização

A manutenção SHALL rodar uma vez por dia em cada organização, às 03:30 no horário de Brasília, como uma tarefa separada para cada uma. Ela SHALL:
- apagar os eventos com mais de 24 h;
- apagar do armazenamento o conteúdo dos arquivos removidos e registrar o apagamento;
- descartar as importações de ativos em rascunho com mais de 7 dias, apagando o conteúdo da planilha (spec importacao-de-ativos);
- guardar os agregados por hora das horas completas que ainda não têm agregado (spec leituras-e-estado);
- apagar as leituras da coleta com mais de 30 dias e as chaves dos lotes recebidos há mais de 30 dias, depois de agregá-las (spec leituras-e-estado);
- apagar os agregados por hora com mais de 13 meses;
- apagar as notificações com mais de 90 dias, lidas ou não (spec notificacoes);
- apagar os alertas resolvidos há mais de 13 meses (spec alertas);
- apagar os rascunhos do cadastro do ativo parados há mais de 30 dias (spec cadastro-de-ativos);
- apagar os aparelhos confiáveis marcados há mais de 90 dias, o teto do prazo da confiança, mesmo os usados há pouco (spec verificacao-em-dois-passos).

Rodar a manutenção duas vezes SHALL ter o mesmo efeito que rodar uma vez. Se o servidor estava desligado na hora marcada, a manutenção SHALL rodar uma vez quando ele voltar. Ela SHALL NOT apagar registros de auditoria, sessões nem nenhum outro registro de negócio além dos alertas resolvidos há mais de 13 meses: a importação descartada continua na lista de quem importou, e o estado atual de cada ativo continua, mesmo com as leituras dele apagadas.

#### Scenario: Manutenção do dia
- **WHEN** são 03:30 no horário de Brasília
- **THEN** cada organização ganha a sua manutenção na fila, e cada uma roda no contexto da própria organização

#### Scenario: Servidor desligado na hora
- **WHEN** o servidor fica desligado das 02:00 às 05:00 e volta
- **THEN** a manutenção daquele dia roda uma vez, logo depois da volta

#### Scenario: Rascunho de importação esquecido
- **WHEN** a manutenção diária roda, e uma importação está em rascunho há 8 dias
- **THEN** a importação fica "Descartada", sem o conteúdo da planilha, e continua na lista de quem importou

#### Scenario: Manutenção repetida
- **WHEN** a manutenção de uma organização roda duas vezes seguidas
- **THEN** a segunda não encontra nada para apagar nem para agregar e conclui sem erro

#### Scenario: Leituras com mais de 30 dias
- **WHEN** a manutenção diária roda, e a organização tem leituras de 31 dias atrás
- **THEN** essas leituras são apagadas, as de 29 dias ficam, e a disponibilidade de cada ativo continua a mesma

#### Scenario: Notificações com mais de 90 dias
- **WHEN** a manutenção diária roda, e uma conta tem uma notificação de 91 dias e outra de 89
- **THEN** a de 91 dias é apagada, e a de 89 fica

#### Scenario: Alertas resolvidos há mais de 13 meses
- **WHEN** a manutenção diária roda, e um alerta terminou há 13 meses e 1 dia, e outro há 12 meses
- **THEN** o primeiro é apagado, e o segundo fica

#### Scenario: Agregar antes de apagar
- **WHEN** o servidor ficou desligado por 3 dias, e a manutenção roda com leituras de 31 dias atrás ainda sem agregado
- **THEN** a manutenção guarda os agregados dessas horas antes de apagar as leituras

#### Scenario: Rascunho do cadastro esquecido
- **WHEN** a manutenção diária roda, e o rascunho do cadastro de uma conta não muda há 31 dias, e o de outra, há 29
- **THEN** o rascunho de 31 dias é apagado, e o de 29 fica

#### Scenario: Aparelho confiável marcado há mais de 90 dias
- **WHEN** a manutenção diária roda, e uma conta tem um aparelho marcado há 91 dias e usado ontem, e outro marcado há 89
- **THEN** o de 91 dias é apagado, e o de 89 fica

### Requirement: Encerramento sem perder tarefas

Ao encerrar, a API SHALL parar de pegar tarefas novas e esperar as que estão em andamento por até 30 s. Uma tarefa que não terminou nesse prazo SHALL voltar à fila.

#### Scenario: Encerramento com uma tarefa em andamento
- **WHEN** a API recebe o pedido de encerramento durante a manutenção de uma organização, que termina em 5 s
- **THEN** a API espera a manutenção terminar e só então encerra

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
