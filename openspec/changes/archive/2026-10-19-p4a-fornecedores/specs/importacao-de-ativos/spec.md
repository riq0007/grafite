## MODIFIED Requirements

### Requirement: Valores da planilha

Cada célula SHALL ser lida pelas regras do tipo do campo (spec campos-personalizados), as mesmas da tela. As referências SHALL ser lidas pelo texto:
- **local:** pelo caminho, com "›" ou ">" entre os níveis, como "Jundiaí › Expedição", ou pelo nome, quando só um local ativo tem esse nome;
- **pessoa:** pela matrícula, pelo e-mail ou pelo nome, entre as pessoas ativas;
- **ativo**, num campo do tipo ativo: pelo patrimônio;
- **fornecedor:** pelo CNPJ, com ou sem a pontuação, ou pelo nome, sem diferenciar acento, maiúsculas e espaços repetidos, entre os fornecedores ativos;
- **modelo:** pelo fabricante e pelo nome, como "HP LaserJet M404", ou só pelo nome, quando só um modelo ativo do tipo tem esse nome, entre os modelos ativos do tipo.

A célula vazia SHALL NOT mudar o valor guardado. A recusa SHALL dizer o que fazer:
- "Local não encontrado: Expedição." e "Há mais de um local Expedição: use o caminho, como Jundiaí › Expedição.";
- "Pessoa não encontrada: João." e "Há mais de uma pessoa com o nome João Silva: use a matrícula ou o e-mail.";
- "Ativo não encontrado: PAT-09999.";
- "Fornecedor não encontrado: HP Brazil.";
- "Modelo não encontrado: HP LaserJet M405." e "Há mais de um modelo L3250: use o fabricante e o nome, como Epson L3250.";
- as recusas dos tipos de campo, como "Use um IP, como 192.168.0.10.".

#### Scenario: Local pelo caminho
- **WHEN** a coluna do local traz "Jundiaí > Expedição"
- **THEN** o valor é o local Expedição, dentro de Jundiaí

#### Scenario: Nome de local repetido
- **WHEN** a organização tem os locais "Jundiaí › Expedição" e "Campinas › Expedição", e a célula traz "Expedição"
- **THEN** a célula é recusada com "Há mais de um local Expedição: use o caminho, como Jundiaí › Expedição."

#### Scenario: Célula vazia
- **WHEN** a coluna do hostname está vazia na linha de um ativo que tem o hostname "IMP-01"
- **THEN** o hostname continua "IMP-01"

#### Scenario: Fornecedor pelo CNPJ
- **WHEN** a coluna do fornecedor traz "12345678000195", o CNPJ da "HP Brasil"
- **THEN** o valor é o fornecedor "HP Brasil"

#### Scenario: Fornecedor que não existe
- **WHEN** a coluna do fornecedor traz "HP Brazil", e nenhum fornecedor ativo tem esse nome nem esse CNPJ
- **THEN** a célula é recusada com "Fornecedor não encontrado: HP Brazil."
