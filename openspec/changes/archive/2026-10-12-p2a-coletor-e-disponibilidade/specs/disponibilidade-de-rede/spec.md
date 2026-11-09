## Purpose

Dizer se cada ativo com IP responde na rede, pelo ping do coletor a cada 2 minutos, com a situação, desde quando ela vale e a idade da última leitura na tabela e na ficha do ativo.

## ADDED Requirements

### Requirement: Disponibilidade na rede

A capacidade `rede.disponibilidade` (Disponibilidade na rede) SHALL ter a descrição "Confere pelo ping, a cada 2 minutos, se o ativo responde na rede.". Ela SHALL NOT trazer campos: ao ligá-la num tipo, quem administra o catálogo SHALL escolher qual dos campos do tipo IP do tipo o ping usa, entre os ativos que estão no tipo.

Ligar a capacidade sem o campo SHALL ser recusado com "Escolha o campo de IP que o ping usa.". Um tipo sem nenhum campo do tipo IP SHALL ver a capacidade com "Inclua no tipo um campo do tipo IP para ligar a disponibilidade na rede.", sem poder ligá-la. Trocar o campo escolhido SHALL valer na configuração seguinte do coletor.

#### Scenario: Disponibilidade ligada na impressora
- **WHEN** o tipo "Impressora" usa o campo "IP", do tipo IP, e quem administra o catálogo liga a disponibilidade na rede escolhendo o "IP"
- **THEN** o tipo é salvo, e as impressoras com o IP preenchido passam a ser alvo do coletor que alcança o IP delas

#### Scenario: Sem o campo escolhido
- **WHEN** alguém pede para ligar a disponibilidade na rede num tipo sem dizer o campo de IP
- **THEN** o pedido é recusado com "Escolha o campo de IP que o ping usa."

#### Scenario: Tipo sem campo de IP
- **WHEN** o tipo "Nobreak" não usa nenhum campo do tipo IP
- **THEN** a ficha do tipo mostra a disponibilidade na rede com "Inclua no tipo um campo do tipo IP para ligar a disponibilidade na rede.", sem poder ligá-la

### Requirement: Ping

O coletor SHALL pingar cada alvo da disponibilidade a cada 2 minutos, com um pacote e até 2 segundos de espera. Um alvo novo na configuração SHALL ser pingado logo, sem esperar o intervalo.

A leitura SHALL ser:
- **online**, com a latência em milissegundos, quando o ativo responde;
- **offline**, quando ele não responde no prazo;
- **sem dado**, quando o ping não pôde ser feito, como numa falha do comando de ping no servidor do coletor.

A latência fora de 0 a 2.000 ms SHALL ser gravada como inconsistente (spec leituras-e-estado).

#### Scenario: Ativo que responde
- **WHEN** a impressora PAT-00412 responde ao ping em 3 ms
- **THEN** a leitura é online, com a latência de 3 ms

#### Scenario: Ativo que não responde
- **WHEN** o switch PAT-00610 não responde ao ping em 2 segundos
- **THEN** a leitura é offline

#### Scenario: IP novo
- **WHEN** alguém preenche o IP de uma câmera de um tipo com a disponibilidade, numa faixa do coletor
- **THEN** a câmera é pingada logo depois da configuração seguinte do coletor, sem esperar os 2 minutos

### Requirement: Situação da disponibilidade

A disponibilidade de um ativo de um tipo com a capacidade SHALL ser uma destas situações, sempre em texto e com o ícone, nunca só pela cor:
- **Online:** a última leitura foi online;
- **Offline:** a última leitura foi offline;
- **Sem dado:** a última leitura foi sem dado;
- **Não verificado:** o ativo ainda não tem leitura, com o motivo:
  - "Sem IP", com o campo de IP vazio;
  - "Nenhum coletor alcança o IP 10.9.0.5.", com o IP fora das faixas dos coletores ativos;
  - "Aguardando a primeira leitura.", com um coletor que alcança o IP.

O ativo inativo SHALL NOT mostrar a disponibilidade. A última leitura mais antiga que 6 minutos, 3 intervalos do ping, SHALL mostrar "Desatualizado" ao lado da situação (spec leituras-e-estado).

#### Scenario: Ainda sem leitura
- **WHEN** um switch acabou de receber um IP numa faixa de um coletor
- **THEN** a disponibilidade dele é "Não verificado", com "Aguardando a primeira leitura."

#### Scenario: IP sem coletor
- **WHEN** uma câmera tem o IP `10.9.0.5`, fora das faixas de todos os coletores ativos
- **THEN** a disponibilidade dela é "Não verificado", com "Nenhum coletor alcança o IP 10.9.0.5."

#### Scenario: Situação sem depender da cor
- **WHEN** alguém que não distingue o verde do vermelho olha a tabela dos ativos
- **THEN** cada ativo diz "Online" ou "Offline" em texto, com um ícone diferente para cada situação
