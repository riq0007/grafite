# impressoras-por-snmp Specification

## Purpose
Ler por SNMP, a cada 10 minutos, as impressoras dos tipos que ligam a capacidade de suprimentos e contadores, com a comunidade guardada no cofre, e mostrar na ficha e na tabela os suprimentos, os contadores, as condições do equipamento e as mensagens do fabricante, sempre com a idade do dado e sem inventar valor.

## Requirements

### Requirement: Suprimentos e contadores

A capacidade `snmp.suprimentos` (Suprimentos e contadores) SHALL ter a descrição "Lê por SNMP, a cada 10 minutos, os suprimentos, os contadores e as condições da impressora.". Ela SHALL NOT trazer campos. Ao ligá-la num tipo, quem administra o catálogo SHALL escolher:
- o campo do tipo IP que a leitura usa, entre os ativos que estão no tipo;
- a versão do SNMP: 1 ou 2c, com a 2c já escolhida;
- a comunidade: um segredo ativo do cofre do tipo "Comunidade SNMP", ou nenhum, e então vale a comunidade `public`.

Ligar a capacidade sem o campo SHALL ser recusado com "Escolha o campo de IP que o SNMP usa.". Um segredo inativo ou de outro tipo SHALL ser recusado com "Escolha uma comunidade SNMP ativa do cofre.". Um tipo sem nenhum campo do tipo IP SHALL ver a capacidade com "Inclua no tipo um campo do tipo IP para ligar os suprimentos e contadores.", sem poder ligá-la. Mudar o campo, a versão ou a comunidade SHALL valer na configuração seguinte do coletor.

#### Scenario: Impressoras com a comunidade do cofre
- **WHEN** quem administra o catálogo liga os suprimentos e contadores no tipo "Impressora", com o campo "IP", a versão 2c e o segredo "Comunidade das impressoras"
- **THEN** o tipo é salvo, e as impressoras com o IP preenchido passam a ser lidas por SNMP pelo coletor que alcança o IP delas, com essa comunidade

#### Scenario: Sem comunidade escolhida
- **WHEN** a capacidade é ligada sem nenhum segredo
- **THEN** a ficha do tipo mostra "Comunidade: public (padrão)", e o coletor lê as impressoras com a comunidade `public`

#### Scenario: Segredo de outro tipo
- **WHEN** alguém pede para usar como comunidade um segredo do tipo "Conta administrativa"
- **THEN** o pedido é recusado com "Escolha uma comunidade SNMP ativa do cofre."

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

### Requirement: Nível dos suprimentos

Cada suprimento SHALL ter a descrição que a impressora informa e o tipo, tirado da descrição: Toner, Cilindro, Fusor ou Outro. Uma descrição que fala de outra peça, como "drum", "cilindro", "fuser", "waste", "kit" ou "roller", SHALL NOT ser Toner; uma descrição só com a cor, como "Black" ou "Ciano", SHALL ser Toner.

O nível SHALL ser:
- o percentual da capacidade, arredondado, quando a impressora informa a capacidade e o nível;
- "Há suprimento", quando a impressora diz só que ainda há suprimento, sem medir quanto;
- "Sem dado", quando a impressora não informa o nível.

O nível SHALL NOT ser inventado: o que a impressora não mede SHALL NOT virar 100% nem 0%. Um nível acima da capacidade SHALL ser gravado como inconsistente (spec leituras-e-estado). O item sem capacidade e sem nenhuma indicação de nível SHALL ficar fora da lista. A tela SHALL mostrar o nível em texto, com a barra apenas ao lado, e SHALL NOT classificar o nível como baixo ou crítico (P3).

#### Scenario: Toner medido
- **WHEN** a impressora informa o toner preto com capacidade 1.000 e nível 80
- **THEN** o painel mostra "Toner · Black Toner Cartridge" com "8%"

#### Scenario: Nível que a impressora não mede
- **WHEN** a impressora diz que ainda há toner, sem informar quanto
- **THEN** o painel mostra o toner com "Há suprimento", e nenhum percentual

#### Scenario: Nível desconhecido
- **WHEN** a impressora informa a capacidade do cilindro e diz que o nível é desconhecido
- **THEN** o painel mostra o cilindro com "Sem dado", e não com 100%

#### Scenario: Peça que não é toner
- **WHEN** a descrição é "Imaging Drum Unit"
- **THEN** o suprimento aparece como Cilindro, e não como Toner

### Requirement: Contadores de páginas

Cada contador que a impressora informa SHALL aparecer, um independente do outro: o primeiro como "Total de páginas", o segundo como "Páginas coloridas" e os demais como "Contador" com o número. As páginas em preto e branco SHALL aparecer como a diferença entre o total e as coloridas, quando a impressora informa os dois. Na impressora que diz ter uma cor só e não informa as coloridas, o total SHALL aparecer também como "Páginas em preto e branco". Um contador negativo SHALL ser gravado como inconsistente.

#### Scenario: Total e coloridas
- **WHEN** a impressora informa o total 12.500 e as coloridas 2.300
- **THEN** o painel mostra o total, as coloridas e "Páginas em preto e branco: 10.200"

#### Scenario: Impressora de uma cor
- **WHEN** a impressora diz ter uma cor só, informa o total 8.000 e não informa as coloridas
- **THEN** o painel mostra o total e "Páginas em preto e branco: 8.000", e nada de coloridas

#### Scenario: Colorida sem o contador de cor
- **WHEN** uma impressora colorida informa só o total
- **THEN** o painel mostra só o total, sem inferir as páginas em preto e branco

### Requirement: Condições do equipamento

As condições que a impressora informa SHALL aparecer em texto, cada uma com a severidade em texto, "Atenção" ou "Crítico":

| Condição | Severidade |
|---|---|
| Pouco papel | Atenção |
| Sem papel | Crítico |
| Toner baixo | Atenção |
| Sem toner | Crítico |
| Tampa aberta | Crítico |
| Atolamento de papel | Crítico |
| Serviço solicitado | Crítico |
| Bandeja de entrada ausente | Crítico |
| Bandeja de saída ausente | Atenção |
| Suprimento de impressão ausente | Crítico |
| Bandeja de saída quase cheia | Atenção |
| Bandeja de saída cheia | Crítico |
| Bandeja de entrada vazia | Atenção |
| Manutenção preventiva vencida | Atenção |

A condição "fora de linha" SHALL NOT aparecer: a disponibilidade vem do ping. Sem nenhuma condição, o painel SHALL dizer "Nenhuma condição informada.". As mensagens de texto do fabricante SHALL aparecer num bloco próprio, "Mensagens do fabricante", e SHALL NOT contar como condição.

As condições SHALL ser só estado: elas SHALL NOT abrir alerta, ocorrência nem notificação (P3).

#### Scenario: Sem papel e tampa aberta
- **WHEN** a impressora informa as condições "sem papel" e "tampa aberta"
- **THEN** o painel mostra "Sem papel" e "Tampa aberta", cada uma com "Crítico" em texto

#### Scenario: Economia de energia
- **WHEN** a impressora informa a mensagem "Modo de economia de energia" e nenhuma condição
- **THEN** o painel mostra "Nenhuma condição informada." e a mensagem no bloco "Mensagens do fabricante"

### Requirement: Número de série pela coleta

O número de série que a impressora informa SHALL gravar o campo comum Número de série do ativo com a origem "coleta" e o coletor como autor, só quando ele muda. A gravação SHALL respeitar a trava e a política de escrita do campo (spec cadastro-de-ativos) e SHALL entrar na auditoria, com o "antes → depois" e o coletor como quem fez.

#### Scenario: Série lida
- **WHEN** a PAT-00412 está sem o número de série, e a impressora informa "VNB3K12345"
- **THEN** a ficha mostra o Número de série "VNB3K12345", com "Coleta · Coletor de Jundiaí" e o momento

#### Scenario: Série travada
- **WHEN** o Número de série da PAT-00412 está travado com "ABC123", e a impressora informa "VNB3K12345"
- **THEN** o campo continua "ABC123", e nada vai para a auditoria

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
