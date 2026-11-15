## MODIFIED Requirements

### Requirement: Espécie da coluna da tabela

Cada coluna da tabela base SHALL poder declarar a espécie do que mostra: texto, número, código, data, situação ou ações. A célula SHALL seguir a espécie da coluna dela, sem declarar de novo:
- **número:** o cabeçalho e o valor à direita, na fonte da interface, com algarismos tabulares;
- **código:** o valor na fonte mono;
- **data:** o valor numa linha só, com algarismos tabulares;
- **ações:** o cabeçalho "Ações" e os botões à direita, lado a lado, numa linha só.

O texto é a espécie de fábrica. A célula SHALL poder trocar o alinhamento e a fonte só dela.

#### Scenario: Número alinhado
- **WHEN** a tabela do estoque mostra a coluna Saldo, da espécie número, com o saldo 2
- **THEN** o cabeçalho "Saldo" e o valor "2" ficam à direita, e o 2 vem na fonte da interface, com algarismos tabulares

#### Scenario: Ações numa linha
- **WHEN** um alerta aberto tem "Reconhecer" e "Adiar" na coluna Ações
- **THEN** os dois botões ficam lado a lado, e a linha tem a mesma altura das linhas sem botão
