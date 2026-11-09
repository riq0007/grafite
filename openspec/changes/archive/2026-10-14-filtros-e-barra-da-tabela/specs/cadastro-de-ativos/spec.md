## ADDED Requirements

### Requirement: Filtros encadeados dos ativos

Com um filtro de Tipo ativo:
- o filtro de Modelo SHALL oferecer primeiro os modelos daqueles tipos, com o texto "Modelos de Impressora" ou "Modelos dos tipos filtrados", e depois os outros, numa seção à parte;
- um modelo já escolhido que não é de nenhum dos tipos filtrados SHALL continuar no filtro, marcado "de outro tipo" no rótulo do filtro ativo;
- o painel de filtros e o painel "Colunas" SHALL mostrar primeiro os grupos dos campos daqueles tipos e das capacidades deles, depois os campos comuns, e por último os campos dos outros tipos, num grupo recolhido "Outros tipos".

O encadeamento SHALL ir só do Tipo para o Modelo e para os campos, e nunca no sentido contrário.

#### Scenario: Modelos do tipo filtrado
- **WHEN** a tabela está filtrada por "Tipo: Impressora", e o usuário abre o filtro de Modelo
- **THEN** o editor mostra primeiro "Modelos de Impressora", com os modelos de impressora, e os outros modelos depois

#### Scenario: Modelo de outro tipo
- **WHEN** a tabela está filtrada por "Modelo: Dell OptiPlex 7010", e o usuário acrescenta "Tipo: Impressora"
- **THEN** o filtro do modelo continua, e o rótulo dele diz "Dell OptiPlex 7010 (de outro tipo)"

#### Scenario: Colunas do tipo primeiro
- **WHEN** a tabela está filtrada por "Tipo: Impressora", e o usuário abre o painel "Colunas"
- **THEN** o painel mostra primeiro os campos de impressora e os da capacidade dela, e os campos dos outros tipos ficam em "Outros tipos", recolhido
