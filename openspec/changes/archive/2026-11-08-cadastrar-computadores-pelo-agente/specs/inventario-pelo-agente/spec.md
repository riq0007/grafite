## ADDED Requirements

### Requirement: Configuração do cadastro automático

Quem tem `coletores.administrar` SHALL configurar por organização um tipo de ativo ativo com `hardware.inventario` e um local ativo opcional para cadastrar computadores novos. Tipo nulo SHALL desligar o cadastro e SHALL ser o padrão. As referências SHALL pertencer à organização e a alteração SHALL ser auditada. A Administração SHALL mostrar essa configuração, o IP e o último contato dos agentes.

#### Scenario: Tipo e local de entrada
- **WHEN** a TI escolhe Computador e o local Entrada de equipamentos
- **THEN** os novos computadores inventariados são cadastrados nesse tipo e local, sem alterar o local dos existentes

#### Scenario: Referência de outra organização
- **WHEN** a configuração aponta um tipo ou local de outra organização
- **THEN** a API recusa e não altera a configuração

### Requirement: Primeiro inventário cria o computador

Com o cadastro ligado, o primeiro INVENTORY completo de computador com hostname SHALL cadastrar e ligar um ativo quando nenhuma identidade corresponde. A busca por série e depois hostname SHALL reutilizar correspondência única e ativa. Identidade ambígua ou ligada a ativo inativo SHALL manter o agente para revisão, sem criar duplicata. CONTACT e inventário parcial SHALL NOT criar ativo. Reenvios, concorrência e reinstalação do agente SHALL NOT duplicar o computador. A ligação manual SHALL prevalecer.

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

### Requirement: Identificação e rede pelo inventário

A capacidade `hardware.inventario` SHALL receber UUID, IPv4 utilizável, MAC correspondente, usuário informado pelo agente e última inicialização, além dos campos técnicos existentes. Fabricante e modelo SHALL preencher o catálogo do tipo quando o ativo não tiver modelo; modelos existentes SHALL ser preservados e modelos inativos SHALL NOT ser reativados. A escrita SHALL respeitar campos travados e manuais. O usuário informado pelo agente SHALL NOT definir automaticamente o responsável do ativo.

O IPv4 principal informado pelo agente SHALL ter preferência quando válido. IPv4 inválido, loopback, zero e APIPA SHALL ser ignorados. O IP de transporte SHALL NOT substituir um IP de inventário conhecido em contatos posteriores.

#### Scenario: IP atualizado
- **WHEN** o computador envia novo IPv4 válido no inventário
- **THEN** o agente e o campo de IP do ativo mostram o endereço novo, respeitando trava; o contato pelo proxy não o substitui

#### Scenario: Modelo recebido
- **WHEN** o computador sem modelo informa fabricante LENOVO e modelo ThinkPad E14
- **THEN** o Grafite aproveita ou cadastra esse modelo no tipo do ativo e registra a origem do agente

## MODIFIED Requirements

### Requirement: Agentes da organização

Cada agente SHALL ser guardado pelo `deviceid`, com:
- o nome da máquina;
- a versão do agente;
- a série;
- o sistema;
- o último IP;
- o primeiro contato, o último contato e o último inventário.

A situação do agente SHALL vir em texto:
- "Em dia", com o inventário das últimas 48 horas;
- "Parado há N dias", depois disso;
- "Sem inventário", só com o contato.

No inventário, o agente sem ativo SHALL ser ligado ao único ativo ativo da organização cuja série válida confere com a da máquina. Sem série válida ou correspondência, a ligação SHALL ser pelo hostname. Série genérica, correspondência ambígua ou cadastro inativo seguem as regras do primeiro inventário. Quem tem `coletores.administrar` SHALL ligar o agente a um ativo à mão e desligá-lo. A ligação à mão SHALL valer até ser desfeita.

#### Scenario: Ligado pela série
- **WHEN** o primeiro inventário da máquina chega com a série "BRJ1234567", e só o ativo PAT-00321 tem essa série
- **THEN** o agente fica ligado ao PAT-00321, e o inventário entra nele

#### Scenario: Máquina sem ativo
- **WHEN** nenhum ativo corresponde e o cadastro automático está desligado ou não é possível
- **THEN** o agente aparece como "Sem ativo", e a tela oferece "Ligar"
