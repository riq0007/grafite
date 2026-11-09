## ADDED Requirements

### Requirement: Relações do ativo à vista

O local, o responsável, o modelo e o tipo de um ativo SHALL aparecer como referências com cartão (spec componentes-base) na tabela dos ativos, na prévia e na aba Dados da ficha, quando só leitura. O cabeçalho da ficha SHALL ter uma linha com o local, o responsável, o modelo e "Ligados" com a quantidade, cada um como referência ou link para a aba.

#### Scenario: Linha de relações
- **WHEN** alguém abre a ficha da PAT-00412, em "Jundiaí › Expedição", sob a responsabilidade de Ana Souza, com cinco ativos ligados
- **THEN** o cabeçalho mostra "Jundiaí › Expedição · Ana Souza · HP LaserJet M404 · Ligados (5)", e "Ligados (5)" leva à aba Ligados

### Requirement: Tabela a partir de uma origem

"Ver na tabela" e "Ver ativos", nas fichas e nos cartões, SHALL abrir a tabela dos ativos com o filtro da origem e uma faixa de origem acima dos filtros:
- **local:** "Ativos de Jundiaí › Expedição (vindo do local)", com "Incluir os locais de dentro";
- **pessoa:** "Ativos sob responsabilidade de Ana Souza";
- **modelo e tipo:** "Ativos do modelo HP LaserJet M404" e "Ativos do tipo Impressora".

A faixa SHALL ter "Limpar origem", que tira a origem e o filtro dela. A origem SHALL ficar no endereço, fora da visão e das mudanças da conta, e o link com ela SHALL reproduzir a tabela. "Novo ativo" na tabela com uma origem SHALL abrir o cadastro com o campo da origem preenchido e o cabeçalho "Novo ativo em Expedição", ou o equivalente da origem, e o valor preenchido SHALL poder ser trocado.

Uma origem que a conta não vê, ou de um registro que não existe mais, SHALL dar "A origem desta tabela não está disponível." e a tabela sem a origem.

#### Scenario: Ativos de um local
- **WHEN** alguém escolhe "Ver ativos" no local "Jundiaí › Expedição"
- **THEN** a tabela abre com a faixa "Ativos de Jundiaí › Expedição (vindo do local)" e só os ativos daquele local

#### Scenario: Cadastro a partir da origem
- **WHEN** a tabela está com a origem do local "Expedição", e o usuário escolhe "Novo ativo"
- **THEN** o cadastro abre com o local "Jundiaí › Expedição" preenchido e o cabeçalho "Novo ativo em Expedição"

#### Scenario: Limpar a origem
- **WHEN** o usuário escolhe "Limpar origem"
- **THEN** a faixa some, o filtro do local sai, e a tabela volta à visão
