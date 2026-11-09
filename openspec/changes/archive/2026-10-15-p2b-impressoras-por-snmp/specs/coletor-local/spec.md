## MODIFIED Requirements

### Requirement: Configuração da coleta

O coletor SHALL buscar na API o que coletar quando inicia e depois a cada 5 minutos. Cada alvo SHALL trazer o ativo, o IP, as coletas e o intervalo de cada uma. A coleta SNMP (spec impressoras-por-snmp) SHALL trazer também a versão e a comunidade, e o coletor SHALL guardar a comunidade só na memória.

Um ativo SHALL ser alvo de uma coleta quando:
- ele está ativo;
- o tipo dele liga uma capacidade coletada, como a disponibilidade na rede (spec disponibilidade-de-rede) ou os suprimentos e contadores (spec impressoras-por-snmp);
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
