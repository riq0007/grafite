## MODIFIED Requirements

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
