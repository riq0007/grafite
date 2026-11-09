## MODIFIED Requirements

### Requirement: Leitura das impressoras

O coletor SHALL ler cada impressora dos tipos com a capacidade a cada 10 minutos, com a versão e a comunidade do tipo, até 2 segundos de espera e uma tentativa a mais. Quando uma impressora recusa GETBULK, o coletor SHALL tentar GETNEXT com a mesma versão e comunidade. Erros persistentes SHALL NOT ser tratados como tabelas vazias bem-sucedidas. Uma impressora nova na configuração SHALL ser lida logo, sem esperar o intervalo.

Cada leitura SHALL dizer se a impressora respondeu ao SNMP. Quando ela responde, a leitura SHALL trazer os suprimentos, os contadores de páginas, as condições do equipamento, as mensagens do fabricante e o número de série que ela informa. Quando ela não responde, a leitura SHALL ser "Não respondeu", e os suprimentos, os contadores e as condições SHALL continuar os da última resposta, com a idade deles, sem virar zero nem sumir.

A comunidade SHALL ir ao coletor só na configuração dos alvos dele e ficar só na memória: ela SHALL NOT ir à fila em disco, ao log nem à saúde do coletor.

#### Scenario: Impressora que responde
- **WHEN** o coletor lê a impressora PAT-00412, e ela responde
- **THEN** a ficha dela mostra "Respondeu", com a idade da leitura, e os suprimentos e os contadores dessa leitura

#### Scenario: Impressora que deixa de responder
- **WHEN** a PAT-00412 respondeu às 10:22 com o toner a 40% e não responde às 10:32
- **THEN** a ficha mostra "Não respondeu desde 10:32" e o toner a 40%, com a idade da leitura das 10:22

#### Scenario: Comunidade fora do disco
- **WHEN** a API fica fora do ar, e o coletor guarda os lotes na fila em disco
- **THEN** nenhum arquivo da fila nem linha do log do coletor contém a comunidade

#### Scenario: HP que recusa GETBULK
- **WHEN** uma impressora responde GeneralError ao GETBULK mas responde GETNEXT
- **THEN** seus suprimentos e contadores aparecem com os valores informados pelo GETNEXT
