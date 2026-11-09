## ADDED Requirements

### Requirement: Espécie da coluna da tabela

Cada coluna da tabela base SHALL poder declarar a espécie do que mostra: texto, número, código, data, situação ou ações. A célula SHALL seguir a espécie da coluna dela, sem declarar de novo:
- **número:** o cabeçalho e o valor à direita, na fonte mono, com algarismos tabulares;
- **código:** o valor na fonte mono;
- **data:** o valor numa linha só, com algarismos tabulares;
- **ações:** o cabeçalho "Ações" e os botões à direita, lado a lado, numa linha só.

O texto é a espécie de fábrica. A célula SHALL poder trocar o alinhamento e a fonte só dela.

#### Scenario: Número alinhado
- **WHEN** a tabela do estoque mostra a coluna Saldo, da espécie número, com o saldo 2
- **THEN** o cabeçalho "Saldo" e o valor "2" ficam à direita, e o 2 vem na mono

#### Scenario: Ações numa linha
- **WHEN** um alerta aberto tem "Reconhecer" e "Adiar" na coluna Ações
- **THEN** os dois botões ficam lado a lado, e a linha tem a mesma altura das linhas sem botão

### Requirement: Situação, tempo e contagem nas tabelas

Nas tabelas do app:
- toda coluna Situação SHALL mostrar o rótulo de situação;
- o tempo desde um momento SHALL ter uma escrita só: "Agora", "Há 32 min", "Há 1 h" e "Há 2 d";
- cada lista SHALL dizer quantos itens tem, acima da tabela, como "4 pessoas" ou "1 fornecedor".

#### Scenario: Situação do alerta
- **WHEN** a tabela dos alertas mostra um alerta aberto
- **THEN** a situação aparece no selo "Aberto", como nas outras tabelas

#### Scenario: Último contato do coletor
- **WHEN** um coletor falou há 3 horas, e uma ordem de serviço mudou há 3 horas
- **THEN** as duas tabelas mostram "Há 3 h"

#### Scenario: Lista dos perfis
- **WHEN** a organização tem 3 perfis
- **THEN** a tela dos perfis diz "3 perfis" acima da tabela, como a das pessoas diz "4 pessoas"
