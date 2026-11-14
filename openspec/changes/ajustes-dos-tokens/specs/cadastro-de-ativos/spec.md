## MODIFIED Requirements

### Requirement: Colunas da tabela dos ativos

A tabela dos ativos SHALL oferecer as colunas:
- **do ativo:** Ativo, a coluna principal, Tipo, Modelo, Situação, e "Cadastrado em" e "Atualizado em";
- **os campos comuns:** Patrimônio, Número de série, Hostname, Local, Responsável e os administrativos;
- **os campos da organização** ativos que algum tipo ativo usa, nos grupos deles;
- **os campos das capacidades** ligadas a algum tipo ativo, um grupo por capacidade;
- **a coleta:**
  - Disponibilidade, no grupo "Disponibilidade na rede", quando algum tipo ativo liga a capacidade (spec disponibilidade-de-rede);
  - Suprimentos e Total de páginas, no grupo "Suprimentos e contadores", quando algum tipo ativo liga a capacidade (spec impressoras-por-snmp);
  - Control iD, no grupo "Saúde do Control iD", quando algum tipo ativo liga a capacidade (spec saude-do-control-id).

Cada coluna SHALL mostrar o valor como a ficha o mostra:
- a pessoa, o local e o ativo pelo nome atual, e um ativo que a conta não pode ver como "Ativo fora do seu acesso";
- os identificadores (patrimônio, série, hostname, IP e MAC) na fonte monoespaçada, e os números (inteiro, decimal e moeda) na fonte da interface, alinhados à direita e com algarismos tabulares;
- as datas em dd/mm/aaaa, na fonte da interface e com algarismos tabulares, e "Cadastrado em" e "Atualizado em" com a hora, na fonte monoespaçada, no fuso escolhido;
- o arquivo pelo nome, e a imagem pela miniatura, no tamanho da miniatura da linha;
- a disponibilidade pela situação, com o ícone e o texto, e a idade da última leitura, com "Desatualizado" quando for o caso (spec leituras-e-estado). Num ativo de um tipo sem a capacidade, ou inativo, a coluna fica vazia;
- Suprimentos pelo menor nível medido entre os suprimentos da impressora, em percentual, com o suprimento ao lado, e Total de páginas pelo último total lido, cada um com a idade da leitura e "Desatualizado" quando for o caso. Sem nível medido nem total, ou num ativo de um tipo sem a capacidade, ou inativo, a coluna fica vazia;
- Control iD pela situação, com o ícone e o texto, e a idade da última sondagem, como a disponibilidade.

A coluna de um campo restrito SHALL ser oferecida só a quem tem `ativos.restritos` em algum ramo. Ela SHALL mostrar o valor só nos ativos em que a conta tem `ativos.restritos`, e "Fora do seu acesso" nos outros.

#### Scenario: Campo da capacidade
- **WHEN** o tipo "Computador" liga o inventário de hardware, e o usuário abre o painel "Colunas"
- **THEN** o painel mostra o grupo "Inventário de hardware", com o processador, a memória e os outros campos da capacidade

#### Scenario: Restrito em parte
- **WHEN** Bruno tem `ativos.restritos` só em "Jundiaí" e mostra a coluna "Valor de compra"
- **THEN** os ativos de Jundiaí mostram o valor de compra, e os de Campinas mostram "Fora do seu acesso"

#### Scenario: Sem os restritos
- **WHEN** uma conta sem `ativos.restritos` abre o painel "Colunas"
- **THEN** o painel não oferece as colunas dos campos restritos

#### Scenario: Coluna de arquivo
- **WHEN** alguém mostra a coluna "PDF da nota fiscal", um campo de arquivo
- **THEN** cada ativo com a nota mostra o nome do arquivo, e os outros ficam com a coluna vazia

#### Scenario: Coluna da disponibilidade
- **WHEN** o tipo "Impressora" liga a disponibilidade na rede, e o usuário mostra a coluna "Disponibilidade"
- **THEN** cada impressora mostra "Online", "Offline", "Sem dado" ou "Não verificado", com o ícone e a idade da última leitura, e os computadores ficam com a coluna vazia

#### Scenario: Coluna do Control iD
- **WHEN** o tipo "Controle de acesso" liga a saúde do Control iD, e o usuário mostra a coluna "Control iD"
- **THEN** cada controle mostra "Respondendo", "Login recusado", "Sem resposta", "Resposta inesperada", "Sem dado" ou "Não verificado", com o ícone e a idade da sondagem, e os outros ativos ficam com a coluna vazia

#### Scenario: Coluna dos suprimentos
- **WHEN** a PAT-00412 tem o toner a 8% e o cilindro a 60%, e o usuário mostra a coluna "Suprimentos"
- **THEN** a linha da PAT-00412 mostra "8%" com o toner ao lado e a idade da leitura

#### Scenario: Número e identificador na mesma linha
- **WHEN** a tabela mostra a coluna Patrimônio e a coluna de um campo decimal com o valor 15,5
- **THEN** o 15,5 fica à direita, na fonte da interface, com algarismos tabulares, e o patrimônio fica na fonte monoespaçada

#### Scenario: Data e momento na mesma linha
- **WHEN** a tabela mostra a coluna de um campo de data com o valor 12/03/2024 e a coluna "Atualizado em" com 14/11/2026 14:30
- **THEN** a data fica na fonte da interface, com algarismos tabulares, e o "Atualizado em", com a hora, fica na fonte monoespaçada
