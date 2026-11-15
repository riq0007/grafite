## MODIFIED Requirements

### Requirement: Painel Suprimentos

A ficha de um ativo de um tipo com a capacidade SHALL ter o painel "Suprimentos" no grupo da capacidade, com:
- a resposta do SNMP, "Respondeu" ou "Não respondeu", com desde quando e a idade da última leitura;
- os suprimentos como cartuchos, na ordem da impressora. Cada cartucho SHALL ter:
  - o nível;
  - a tinta do toner, tirada da descrição (ciano, magenta, amarelo ou preto), ou neutro no cilindro, no fusor e no que não diz a cor;
  - a estimativa de quando acaba, quando a série permite;
- os contadores;
- as condições do equipamento e as mensagens do fabricante.

Embaixo de cada cartucho SHALL ficar a descrição do suprimento, a idade da leitura dele e, com a leitura velha, o "Desatualizado", um embaixo do outro e centrados. A coluna do cartucho SHALL caber o rótulo, e os rótulos de dois cartuchos vizinhos SHALL NOT encostar um no outro.

Sem leitura, o painel SHALL dizer "Não verificado", com o motivo, como a disponibilidade na rede (spec disponibilidade-de-rede): "Sem IP", "Nenhum coletor alcança o IP 10.9.0.5." ou "Aguardando a primeira leitura.". A leitura mais antiga que 30 minutos, 3 intervalos, SHALL mostrar "Desatualizado" (spec leituras-e-estado): ao lado da idade, na resposta do SNMP, e embaixo dela, em cada cartucho. O ativo inativo SHALL NOT mostrar o painel.

#### Scenario: Painel da impressora
- **WHEN** alguém abre a ficha da PAT-00412, lida há 3 minutos com o toner a 8%, o cilindro a 60% e o total de 12.500 páginas
- **THEN** o painel Suprimentos mostra "Respondeu", "há 3 min", o cartucho do toner com 8%, o do cilindro com 60% e o total de páginas

#### Scenario: Aguardando a primeira leitura
- **WHEN** uma impressora acabou de receber um IP numa faixa de um coletor
- **THEN** o painel diz "Não verificado", com "Aguardando a primeira leitura."

#### Scenario: Toner colorido
- **WHEN** a impressora informa "Cyan Toner", "Magenta Toner", "Yellow Toner" e "Black Toner"
- **THEN** o painel mostra os quatro cartuchos com as letras C, M, Y e K, cada um na tinta dele

#### Scenario: Quando o toner acaba
- **WHEN** o toner preto caiu, sem troca, de 75% para 25% em 25 dias, 2 pontos por dia
- **THEN** o cartucho mostra "Acaba em cerca de 13 dias", com "pelas leituras desde" e a data da primeira leitura usada

#### Scenario: Cartuchos com a leitura velha
- **WHEN** a ficha mostra o toner e o cilindro, lidos há 16 dias
- **THEN** embaixo de cada cartucho aparecem a descrição, "há 16 d" e "Desatualizado", e cada rótulo fica dentro da coluna do seu cartucho, sem encostar no do lado

### Requirement: Medidor na coluna dos suprimentos

A coluna dos suprimentos da lista dos ativos SHALL mostrar, ao lado do texto do menor nível, o medidor compacto dele, na tinta do suprimento. O medidor SHALL vir antes do número e SHALL NOT cobri-lo, nas três densidades. O texto copiado da célula SHALL continuar o de hoje.

#### Scenario: Menor nível na lista
- **WHEN** a lista mostra a PAT-00412 com o toner preto a 8%
- **THEN** a célula traz o medidor compacto do preto e "8% · Black Toner Cartridge"

#### Scenario: Número à vista ao lado do medidor
- **WHEN** a lista mostra a impressora com o toner preto a 8%
- **THEN** a régua do medidor acaba antes do "8%", e o número fica inteiro à vista
