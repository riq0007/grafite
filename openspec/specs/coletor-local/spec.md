# coletor-local Specification

## Purpose

Ligar à organização os coletores que leem os equipamentos na rede dela, com o token, as faixas de rede que cada um alcança e a conversa com a API: a configuração da coleta, os lotes que não duplicam e a fila em disco para quando a API está fora do ar.

## Requirements

### Requirement: Coletor da organização

Cada organização SHALL cadastrar os coletores dela. Cada coletor SHALL ter:
- o nome, de até 60 caracteres, único na organização, sem diferenciar acento e maiúsculas;
- as faixas de rede que ele pode alcançar, até 50, em IPv4 ou IPv6 com o prefixo, como `10.0.0.0/24`, guardadas na forma canônica e sem repetir;
- a situação, ativo ou inativo;
- o último contato com a API e a versão que ele informou nesse contato.

Um coletor SHALL poder ficar sem faixas; nesse caso, ele não recebe nada para coletar. Uma faixa inválida SHALL ser recusada com "Use uma faixa como 10.0.0.0/24.".

O cadastro SHALL gerar um token aleatório, com pelo menos 32 bytes, mostrado uma vez só. O banco SHALL guardar só o hash do token. "Trocar o token" SHALL gerar um token novo, mostrado uma vez só, e o anterior SHALL parar de valer na hora. Inativar o coletor SHALL fazer o token parar de valer; reativá-lo SHALL fazer o mesmo token valer de novo.

O coletor SHALL NOT ser excluído, só inativado.

#### Scenario: Coletor cadastrado
- **WHEN** quem administra os coletores cadastra o "Coletor de Jundiaí" com a faixa `10.0.0.0/24`
- **THEN** o token aparece uma vez, e a lista mostra o coletor ativo, com a faixa e "Sem contato ainda"

#### Scenario: Faixa inválida
- **WHEN** alguém grava o coletor com a faixa `10.0.0.300/24`
- **THEN** a gravação é recusada no campo das faixas com "Use uma faixa como 10.0.0.0/24."

#### Scenario: Faixa na forma canônica
- **WHEN** alguém grava a faixa `10.0.0.77/24`
- **THEN** a faixa é guardada como `10.0.0.0/24`

#### Scenario: Token trocado
- **WHEN** quem administra os coletores troca o token do "Coletor de Jundiaí"
- **THEN** o token novo aparece uma vez, e o coletor que ainda usa o anterior passa a ser recusado

### Requirement: Identificação do coletor na API

O coletor SHALL falar com a API pelo endereço de acesso da organização, como as telas, e SHALL se identificar pelo token, sem sessão nem cookie. A API SHALL reconhecer o token só entre os coletores ativos da organização do endereço. Um token desconhecido, de um coletor inativo ou de outra organização SHALL ser recusado com "Token do coletor recusado.", sem dizer o motivo.

Cada pedido aceito SHALL gravar o último contato do coletor e a versão que ele informa. As rotas do coletor SHALL NOT aceitar a sessão de uma conta, e as rotas das telas SHALL NOT aceitar o token de um coletor.

#### Scenario: Token de outra organização
- **WHEN** o coletor da organização A pede a configuração pelo endereço da organização B
- **THEN** a API recusa com "Token do coletor recusado.", e nada da organização B é lido

#### Scenario: Coletor inativo
- **WHEN** um coletor inativado manda um lote
- **THEN** a API recusa o lote com "Token do coletor recusado."

#### Scenario: Último contato
- **WHEN** o coletor da versão 0.3.0 pede a configuração
- **THEN** a tela dos coletores passa a mostrar o contato de agora e a versão 0.3.0

### Requirement: Configuração da coleta

O coletor SHALL buscar na API o que coletar quando inicia e depois a cada 5 minutos. Cada alvo SHALL trazer o ativo, o IP, as coletas e o intervalo de cada uma. A coleta SNMP (spec impressoras-por-snmp) SHALL trazer também a versão e a comunidade, e a sondagem do Control iD (spec saude-do-control-id), a porta, o usuário e a senha. O coletor SHALL guardar a comunidade, o usuário e a senha só na memória.

Um ativo SHALL ser alvo de uma coleta quando:
- ele está ativo;
- o tipo dele liga uma capacidade coletada, como a disponibilidade na rede (spec disponibilidade-de-rede), os suprimentos e contadores (spec impressoras-por-snmp) ou a saúde do Control iD (spec saude-do-control-id);
- o campo de IP que o tipo escolheu para ela está preenchido;
- o IP está numa faixa do coletor.

Cada ativo SHALL ser coletado por um coletor ativo só: o que tem a faixa mais específica que alcança o IP dele e, no empate, o cadastrado primeiro. Com o módulo Ativos desligado na organização, a configuração SHALL vir vazia.

O coletor SHALL conferir de novo, antes de cada leitura, que o IP está numa das faixas dele, e SHALL recusar o alvo que não estiver.

#### Scenario: IP fora das faixas
- **WHEN** uma impressora tem o IP `10.9.0.5`, e o único coletor tem só a faixa `10.0.0.0/24`
- **THEN** a configuração do coletor não traz a impressora

#### Scenario: Faixas que se cruzam
- **WHEN** o coletor A tem a faixa `10.0.0.0/16`, o coletor B tem a `10.0.5.0/24`, e um switch tem o IP `10.0.5.20`
- **THEN** só a configuração do coletor B traz o switch

#### Scenario: Ativo inativado
- **WHEN** um ativo é inativado
- **THEN** a configuração seguinte não o traz, e ele deixa de ser coletado

#### Scenario: Alvo fora das faixas no coletor
- **WHEN** a configuração recebida traz um alvo com um IP fora das faixas do coletor
- **THEN** o coletor não lê esse alvo e registra a recusa no log dele

#### Scenario: Impressora com o ping e o SNMP
- **WHEN** o tipo "Impressora" liga a disponibilidade na rede e os suprimentos e contadores, e a PAT-00412 está numa faixa do coletor
- **THEN** o alvo da PAT-00412 traz o ping a cada 2 minutos e o SNMP a cada 10 minutos, com a versão e a comunidade do tipo

#### Scenario: Controle de acesso com o ping e a sondagem
- **WHEN** o tipo "Controle de acesso" liga a disponibilidade na rede e a saúde do Control iD, e a PAT-00777 está numa faixa do coletor
- **THEN** o alvo da PAT-00777 traz o ping a cada 2 minutos e a sondagem do Control iD a cada 5 minutos, com a porta e o login do tipo

### Requirement: Lotes de leituras

O coletor SHALL mandar as leituras em lotes de até 1.000, a cada 10 segundos enquanto houver leituras novas. Cada lote SHALL ter uma chave única, gerada pelo coletor.

Cada leitura SHALL trazer o ativo, a métrica, o item, quando a métrica tem vários por ativo, como um suprimento ou um contador, o momento e o valor. A leitura de um suprimento SHALL trazer também a descrição e a capacidade que a impressora informa.

A API SHALL gravar o lote inteiro numa transação. Reenviar um lote com a mesma chave SHALL ser aceito sem gravar nada de novo. A resposta SHALL dizer quantas leituras foram gravadas e quantas foram ignoradas.

SHALL ser ignorada, sem recusar o lote, a leitura de um ativo que:
- não existe;
- não é mais alvo desse coletor naquela coleta, como o ativo inativado, o de um tipo que desligou a capacidade e o que passou a outro coletor.

SHALL ser recusado o lote com mais de 1.000 leituras, com uma métrica desconhecida, com um item fora do formato da métrica, ou com uma leitura de momento mais de 5 minutos no futuro ou mais de 30 dias no passado.

#### Scenario: Lote reenviado
- **WHEN** o coletor reenvia um lote que a API já gravou, porque a resposta se perdeu
- **THEN** a API aceita o lote, e nenhuma leitura fica duplicada

#### Scenario: Ativo que passou a outro coletor
- **WHEN** um lote traz a leitura de um ativo que, desde a última configuração, passou ao outro coletor
- **THEN** a leitura é ignorada, e as outras do lote são gravadas

#### Scenario: Leitura do futuro
- **WHEN** um lote traz uma leitura com o momento 10 minutos no futuro
- **THEN** a API recusa o lote e diz qual leitura está fora do prazo

#### Scenario: Suprimentos de uma leitura
- **WHEN** um lote traz, da mesma leitura SNMP da PAT-00412, o toner como item 1 e o cilindro como item 2
- **THEN** a API grava as duas leituras, e o estado atual guarda cada suprimento à parte

### Requirement: Fila em disco

Quando a API não responde ou responde com um erro do servidor, o coletor SHALL guardar o lote numa fila em disco e continuar coletando. Ele SHALL reenviar os lotes guardados, o mais antigo primeiro, com intervalos crescentes entre as tentativas, até 5 minutos. A fila SHALL sobreviver ao reinício do coletor.

A fila SHALL guardar até 7 dias de lotes. O lote mais antigo que isso SHALL ser descartado, e a saúde do coletor SHALL contar os descartados.

Um lote recusado pela API como inválido SHALL ser descartado, com o motivo no log. Com o token recusado, o coletor SHALL parar de mandar lotes e de coletar, guardar a fila e dizer na saúde que o token foi recusado, e SHALL voltar sozinho quando a API aceitar o token de novo.

#### Scenario: API fora do ar por uma hora
- **WHEN** a API fica fora do ar por uma hora e volta
- **THEN** as leituras dessa hora chegam à API, na ordem em que foram feitas, sem duplicar nenhuma

#### Scenario: Coletor reiniciado com a fila cheia
- **WHEN** o coletor reinicia com lotes guardados na fila
- **THEN** ele os reenvia depois de reiniciar

#### Scenario: Token trocado com o coletor no ar
- **WHEN** o token do coletor é trocado na tela, e o coletor continua com o anterior
- **THEN** o coletor para de coletar, guarda a fila e mostra na saúde que o token foi recusado

### Requirement: Coletor pelo comando no servidor

O comando no servidor SHALL criar um coletor numa organização, pelo endereço dela, com o nome e as faixas, e SHALL mostrar o token uma vez. Com a opção de usar o token do ambiente, ele SHALL ligar ao coletor novo o token que a configuração do coletor já tem, sem mostrá-lo. Com a opção de não repetir, ele SHALL terminar sem mudar nada se a organização já tiver um coletor com esse token.

A criação pelo comando SHALL entrar na auditoria e gravar o evento dos coletores, como a criação pela tela.

#### Scenario: Coletor criado pelo comando
- **WHEN** quem opera o servidor cria o coletor "Servidor" na organização do endereço `grafite.empresa.local`
- **THEN** o comando mostra o token uma vez, e a tela dos coletores da organização mostra o "Servidor"

#### Scenario: Comando repetido
- **WHEN** o comando liga o token do ambiente à organização, com a opção de não repetir, e o coletor já existe
- **THEN** o comando termina sem erro e sem mudar nada

### Requirement: Pedidos ao coletor

Além da configuração e dos lotes, o coletor SHALL buscar na API, a cada 15 segundos, os pedidos de trabalho dos ativos que ele alcança, pela mesma regra de alcance da configuração (a faixa mais específica e, no empate, o coletor cadastrado primeiro).

Ao entregar um pedido, a API SHALL:
- marcá-lo como em andamento, com o coletor e o momento;
- mandar o que ele precisa para executar, com as credenciais do cofre só no corpo da resposta.

O coletor SHALL executar um pedido por vez e responder:
- com o arquivo, quando houver;
- ou com a falha e a mensagem.

A API SHALL recusar a resposta:
- de um coletor que não é o do pedido;
- de um pedido que já terminou.

O coletor parado, ou com o token recusado, SHALL NOT buscar pedidos.

#### Scenario: Backup buscado pelo coletor da rede
- **WHEN** o backup do controle 10.20.1.40 entra na fila, e o coletor da faixa 10.20.0.0/16 busca os pedidos
- **THEN** a API entrega o backup a esse coletor, com o IP, a porta e o login, e o marca como em andamento

#### Scenario: Resposta de outro coletor
- **WHEN** um coletor responde a um pedido que foi entregue a outro
- **THEN** a API recusa a resposta, e o pedido segue com o coletor dele
