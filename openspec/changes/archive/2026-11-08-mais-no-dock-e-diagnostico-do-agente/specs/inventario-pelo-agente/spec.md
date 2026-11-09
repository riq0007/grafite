## ADDED Requirements

### Requirement: Local em árvore e diagnóstico do cadastro

A configuração SHALL usar o seletor de local em árvore padrão, com escolha opcional. A lista SHALL mostrar, para um agente ainda sem ativo, o motivo observado no último inventário com o cadastro ligado, quando houver. Identidade em conflito, hostname ausente, configuração indisponível e recusa pelo motor de campos SHALL ser distinguíveis. A aplicação SHALL persistir apenas a causa e os campos recusados, sem guardar o inventário bruto. Ao ligar o agente, a pendência SHALL deixar de aparecer.

#### Scenario: Inventário parcial
- **WHEN** o cadastro está ligado e o agente sem ativo envia inventário parcial sem se identificar como computador
- **THEN** a lista indica que aguarda inventário completo

#### Scenario: Campo obrigatório ausente
- **WHEN** o agente envia inventário completo mas o motor de campos recusa o cadastro
- **THEN** a lista mostra o motivo e os campos a revisar, e o inventário é aceito

## MODIFIED Requirements

### Requirement: Primeiro inventário cria o computador

Com o cadastro ligado, um INVENTORY completo com hostname, ou um INVENTORY parcial explicitamente do tipo `Computer` com hostname de `hardware.name`, SHALL cadastrar e ligar um ativo quando nenhuma identidade corresponde. Um inventário parcial SHALL gravar somente os dados presentes. CONTACT e inventário parcial sem essa identificação SHALL NOT criar ativo. A busca por série e depois hostname SHALL reutilizar correspondência única e ativa. Identidade ambígua ou ligada a ativo inativo SHALL manter o agente para revisão, sem criar duplicata. Reenvios, concorrência e reinstalação do agente SHALL NOT duplicar o computador. A ligação manual SHALL prevalecer.

O cadastro SHALL usar o motor de campos com ator `Agente do GLPI`, origem `agente`, auditoria e eventos. Tipo/local inativo ou campo obrigatório não conhecido SHALL impedir somente o cadastro, preservando o recebimento e registrando a pendência. Patrimônio, responsável e outros dados administrativos SHALL NOT ser inventados.

#### Scenario: Novo computador
- **WHEN** chega um inventário completo com hostname ESTACAO-01, sem ativo correspondente e com cadastro configurado
- **THEN** o Grafite cria um ativo, liga o agente e grava os dados técnicos e os softwares recebidos

#### Scenario: Reenvio ou reinstalação
- **WHEN** o mesmo computador envia novamente, inclusive por novo deviceid com mesma série ou hostname
- **THEN** o Grafite reutiliza o ativo, também sob requisições concorrentes

#### Scenario: Identidade em conflito
- **WHEN** há dois ativos com a série ou há um ativo inativo com a identidade
- **THEN** o agente continua disponível para ligação manual e nenhum ativo novo é criado

#### Scenario: Série genérica da BIOS
- **WHEN** dois computadores com hostnames distintos informam a série genérica `To be filled by O.E.M.`
- **THEN** o Grafite ignora essa série na identificação e cadastra cada hostname separadamente

#### Scenario: Computador identificado em inventário parcial
- **WHEN** chega um inventário parcial do tipo `Computer` com hostname, sem ativo correspondente e com cadastro configurado
- **THEN** o Grafite cria e liga o computador com os dados recebidos e aproveita as categorias dos próximos envios
