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

Sem leitura, o painel SHALL dizer "Não verificado", com o motivo, como a disponibilidade na rede (spec disponibilidade-de-rede): "Sem IP", "Nenhum coletor alcança o IP 10.9.0.5." ou "Aguardando a primeira leitura.". A leitura mais antiga que 30 minutos, 3 intervalos, SHALL mostrar "Desatualizado" ao lado (spec leituras-e-estado). O ativo inativo SHALL NOT mostrar o painel.

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

## ADDED Requirements

### Requirement: Série dos suprimentos

A API SHALL devolver, para um ativo com a capacidade, a série de cada suprimento: o último percentual válido de cada dia de São Paulo, nos últimos 30 dias, com a descrição. O acesso SHALL ser o da ficha do ativo: o ativo fora do alcance da conta SHALL responder 403, e o que não existe, 404.

#### Scenario: Série de 30 dias
- **WHEN** o toner preto da PAT-00412 foi lido a cada 10 minutos nos últimos 30 dias
- **THEN** a série traz 30 pontos para ele, um por dia, com o último percentual válido do dia

### Requirement: Estimativa de quando o suprimento acaba

A estimativa SHALL usar a série desde a última troca, que é a subida de mais de 10 pontos. Ela SHALL exigir pelo menos 3 pontos em pelo menos 3 dias, com o nível caindo pelo menos 0,1 ponto por dia, e SHALL contar os dias até o zero pela regressão linear. Sem essas condições, ou com mais de 365 dias, SHALL NOT haver estimativa. A estimativa SHALL ser escrita como estimativa e SHALL NOT tomar o lugar do nível medido.

#### Scenario: Toner trocado
- **WHEN** o toner caiu até 5%, foi trocado e está em 96%, com 2 leituras depois da troca
- **THEN** não há estimativa, porque a série depois da troca tem menos de 3 pontos

#### Scenario: Nível parado
- **WHEN** o toner está em 50% há 20 dias
- **THEN** não há estimativa

### Requirement: Medidor na coluna dos suprimentos

A coluna dos suprimentos da lista dos ativos SHALL mostrar, ao lado do texto do menor nível, o medidor compacto dele, na tinta do suprimento. O texto copiado da célula SHALL continuar o de hoje.

#### Scenario: Menor nível na lista
- **WHEN** a lista mostra a PAT-00412 com o toner preto a 8%
- **THEN** a célula traz o medidor compacto do preto e "8% · Black Toner Cartridge"
