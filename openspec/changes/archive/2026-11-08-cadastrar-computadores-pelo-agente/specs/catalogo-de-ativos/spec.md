## MODIFIED Requirements

### Requirement: Capacidades

Uma capacidade SHALL existir só no código. Ela SHALL trazer:
- o nome em pt-BR;
- a descrição;
- os campos dela, cada um com uma chave fixa no código, um rótulo, um tipo de campo e um grupo;
- a configuração que o tipo escolhe ao ligá-la, quando ela pede uma.

Um tipo SHALL poder ligar só as capacidades que já têm código. As capacidades SHALL ser:
- a `hardware.inventario` (Inventário de hardware), com os campos:
  - **Hardware:** UUID (texto), IP do computador (IP), MAC (MAC), Processador (texto), Memória (GB) (número inteiro de 0 a 100.000) e Discos (texto longo);
  - **Software:** Sistema operacional (texto), Versão do sistema (texto), Licença do Windows (licença), Licença do Office (licença), Antivírus (texto), Último usuário informado (texto) e Última inicialização (texto).

  Esses campos SHALL aceitar a importação e a coleta.
- a `rede.disponibilidade` (Disponibilidade na rede), sem campos, com o campo de IP do ping escolhido pelo tipo (spec disponibilidade-de-rede).
- a `snmp.suprimentos` (Suprimentos e contadores), sem campos, com o campo de IP, a versão do SNMP e a comunidade escolhidos pelo tipo (spec impressoras-por-snmp).
- a `controlid.saude` (Saúde do Control iD), sem campos, com o campo de IP, a porta e o login escolhidos pelo tipo (spec saude-do-control-id).
- a `consumiveis.compatibilidade` (Consumíveis compatíveis), sem campos e sem configuração, que deixa os modelos do tipo terem consumíveis compatíveis (spec consumiveis), mostrados na ficha do modelo (spec modulo-operacao) e na de cada ativo dele (spec cadastro-de-ativos).

Ligar uma capacidade num tipo SHALL acrescentar os campos dela aos ativos desse tipo, no grupo da capacidade. Eles SHALL NOT poder ser editados nem tirados um a um.

Desligar a capacidade SHALL esconder os campos dela, sem apagar os valores, e tirar do tipo a configuração dela.

O campo do tipo IP escolhido por uma capacidade SHALL NOT sair do tipo nem ser inativado enquanto ela estiver ligada com ele, com a recusa que diz qual capacidade o usa.

#### Scenario: Inventário ligado no computador
- **WHEN** o tipo "Computador" liga o Inventário de hardware
- **THEN** a ficha do tipo mostra os treze campos da capacidade no grupo dela, sem a opção de tirá-los um a um

#### Scenario: Capacidade sem código
- **WHEN** se pede para ligar a capacidade `controlid.backup`, que ainda não tem código, num tipo
- **THEN** o pedido é recusado com "Capacidade desconhecida: controlid.backup."

#### Scenario: Disponibilidade desligada
- **WHEN** o tipo "Impressora" desliga a disponibilidade na rede
- **THEN** o tipo deixa de guardar o campo de IP do ping, as impressoras deixam de ser alvo do coletor, e o "IP" continua no tipo

#### Scenario: Suprimentos ligados na impressora
- **WHEN** o tipo "Impressora" liga os suprimentos e contadores com o campo "IP"
- **THEN** a ficha do tipo mostra a capacidade com o campo de IP, a versão e a comunidade, e o "IP" não pode sair do tipo enquanto ela estiver ligada

#### Scenario: Saúde do Control iD ligada
- **WHEN** o tipo "Controle de acesso" liga a saúde do Control iD com o campo "IP"
- **THEN** a ficha do tipo mostra a capacidade com o campo de IP, a porta e o login, e o "IP" não pode sair do tipo enquanto ela estiver ligada

#### Scenario: Consumíveis compatíveis ligados na impressora
- **WHEN** o tipo "Impressora" liga os consumíveis compatíveis
- **THEN** a ficha do tipo mostra a capacidade, sem campos e sem configuração, e os modelos de impressora passam a poder ser escolhidos nos consumíveis
