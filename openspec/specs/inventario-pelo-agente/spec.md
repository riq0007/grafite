# inventario-pelo-agente Specification

## Purpose

Receber o inventário das máquinas pelo agente do GLPI e cadastrar novos computadores conforme a configuração da organização. Identificação, rede, hardware e sistema entram no ativo; os softwares instalados aparecem na ficha.

## Requirements

### Requirement: Endereço dos agentes

Quem tem `coletores.administrar` SHALL gerar o endereço dos agentes da organização. O endereço SHALL ser formado pelo endereço de acesso da organização, pelo caminho `/api/agentes/glpi/` e por um token aleatório. O token SHALL ser guardado só como hash. O endereço SHALL aparecer uma vez só, com a instrução: acrescentar o endereço ao `server` do agente, separado do GLPI por vírgula.

A organização SHALL ter no máximo um endereço ativo. Gerar outro SHALL desligar o anterior: os agentes com o endereço antigo passam a ser recusados. A geração SHALL ir para a auditoria, sem o token.

#### Scenario: Endereço gerado
- **WHEN** quem administra os coletores gera o endereço dos agentes
- **THEN** a tela mostra o endereço com o token uma vez só, com a instrução do `server` do agente

### Requirement: Protocolo do agente do GLPI

A API SHALL falar o protocolo JSON do agente do GLPI no endereço dos agentes, sem a sessão. A organização vem pelo endereço de acesso, e o token pelo caminho. A API SHALL aceitar o corpo:
- comprimido com o zlib (`application/x-compress-zlib`);
- comprimido com o gzip (`application/x-compress-gzip`);
- em JSON puro;
- PROLOG XML puro, com `application/xml` ou `text/xml`;

até 20 MB, também após descompressão.

- O PROLOG em XML, que o agente do GLPI manda primeiro a um servidor novo, SHALL ser respondido em JSON com `status` "ok" e a `expiration` de 24 horas, para o agente passar ao protocolo JSON.
- O CONTACT SHALL ser respondido com `status` "ok", com as tarefas `inventory` e `deploy` e com a `expiration` de 24 horas. As outras tarefas do agente SHALL vir em `disabled`.
- O INVENTORY SHALL ser gravado e respondido com `status` "ok".
- O token desconhecido ou desligado SHALL ser recusado com 403 e `status` "error", sem gravar nada.
- O pedido fora do protocolo, inclusive o XML que não é um PROLOG, SHALL ser recusado com 400 e `status` "error".

#### Scenario: Agente com dois servidores
- **WHEN** o agente de uma máquina tem o GLPI e o endereço do Grafite no `server`, separados por vírgula
- **THEN** ele manda o CONTACT e o inventário ao Grafite, e o Grafite responde no formato que o agente espera

#### Scenario: Tarefas anunciadas
- **WHEN** o agente manda o CONTACT
- **THEN** a resposta traz o `inventory` e o `deploy`, e o `netdiscovery`, o `netinventory`, o `esx`, o `collect` e o `wakeonlan` vêm em `disabled`

#### Scenario: Primeiro contato do agente
- **WHEN** o agente do GLPI fala com o Grafite pela primeira vez e manda o PROLOG em XML, com o cabeçalho `GLPI-Agent-ID`
- **THEN** a resposta é o JSON com `status` "ok" e a `expiration` de 24 horas, e o agente segue com o CONTACT

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

### Requirement: Inventário no ativo

O inventário do agente ligado SHALL gravar no ativo os campos do inventário de hardware, quando o tipo dele tem a capacidade:
- o processador;
- a memória em GB;
- os discos, um por linha, com o tamanho;
- o sistema operacional e a versão do sistema;
- as licenças do Windows e do Office, pela chave;
- o antivírus, com "ativo" ou "desligado" e "atualizado" ou "desatualizado".

A origem desses valores SHALL ser "Agente do GLPI". O campo travado e o campo só manual SHALL NOT mudar. A série e o hostname do ativo SHALL ser preenchidos pelo agente só quando estão vazios.

A mudança SHALL ir para a auditoria, com o autor "Agente do GLPI". O inventário sem mudança SHALL NOT gravar nada no ativo. Os softwares instalados SHALL ser trocados pelos do inventário a cada inventário completo.

#### Scenario: Campo travado
- **WHEN** o técnico travou o campo "Processador" de um computador, e o agente manda outro processador
- **THEN** o processador fica como estava, e os outros campos do inventário mudam

### Requirement: Softwares na ficha do ativo

A ficha do ativo com softwares SHALL ter a aba "Softwares", para quem tem `ativos.ver` no local dele. Ela SHALL ter:
- a busca pelo nome ou pelo editor;
- a tabela na largura toda, com o nome, a versão, o editor e a data da instalação, em ordem de nome;
- quantos softwares a máquina tem;
- a data do inventário que trouxe a lista.

Sem nenhum software, a aba SHALL dizer que o agente ainda não mandou a lista.

#### Scenario: Softwares do computador
- **WHEN** a técnica abre a aba Softwares de um computador inventariado pelo agente e busca "office"
- **THEN** a tabela mostra só os softwares com "office" no nome ou no editor, com a versão de cada um

### Requirement: Orientação para a conexão do agente

A tela do endereço SHALL orientar reiniciar o serviço após mudar o registro, executar o inventário e conferir o log local. Para HTTPS interno ou inspecionado, SHALL orientar configurar a CA aprovada pela TI com `ca-cert-file`, mantendo a validação TLS ligada. SHALL explicar que uma falha de certificado ocorre antes de o agente chegar à API.

#### Scenario: Certificado não confiável
- **WHEN** o agente registra `certificate verify failed`
- **THEN** a orientação permite identificar a falha de confiança, sem gerar outro token nem desligar a verificação TLS

### Requirement: Configuração do cadastro automático

Quem tem `coletores.administrar` SHALL configurar por organização um tipo de ativo ativo com `hardware.inventario` e um local ativo opcional para cadastrar computadores novos. Tipo nulo SHALL desligar o cadastro e SHALL ser o padrão. As referências SHALL pertencer à organização e a alteração SHALL ser auditada. A Administração SHALL mostrar essa configuração, o IP e o último contato dos agentes.

#### Scenario: Tipo e local de entrada
- **WHEN** a TI escolhe Computador e o local Entrada de equipamentos
- **THEN** os novos computadores inventariados são cadastrados nesse tipo e local, sem alterar o local dos existentes

#### Scenario: Referência de outra organização
- **WHEN** a configuração aponta um tipo ou local de outra organização
- **THEN** a API recusa e não altera a configuração

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

### Requirement: Identificação e rede pelo inventário

A capacidade `hardware.inventario` SHALL receber UUID, IPv4 utilizável, MAC correspondente, usuário informado pelo agente e última inicialização, além dos campos técnicos existentes. Fabricante e modelo SHALL preencher o catálogo do tipo quando o ativo não tiver modelo; modelos existentes SHALL ser preservados e modelos inativos SHALL NOT ser reativados. A escrita SHALL respeitar campos travados e manuais. O usuário informado pelo agente SHALL NOT definir automaticamente o responsável do ativo.

O IPv4 principal informado pelo agente SHALL ter preferência quando válido. IPv4 inválido, loopback, zero e APIPA SHALL ser ignorados. O IP de transporte SHALL NOT substituir um IP de inventário conhecido em contatos posteriores.

#### Scenario: IP atualizado
- **WHEN** o computador envia novo IPv4 válido no inventário
- **THEN** o agente e o campo de IP do ativo mostram o endereço novo, respeitando trava; o contato pelo proxy não o substitui

#### Scenario: Modelo recebido
- **WHEN** o computador sem modelo informa fabricante LENOVO e modelo ThinkPad E14
- **THEN** o Grafite aproveita ou cadastra esse modelo no tipo do ativo e registra a origem do agente

### Requirement: Orientação para habilitar o cadastro

A tela dos agentes SHALL mostrar os seletores de tipo e local sem sobreposição. Quando faltar um tipo elegível, ela SHALL indicar como habilitar Inventário de hardware em um tipo ativo e oferecer acesso aos Tipos de ativo a quem administra o catálogo. A tela SHALL explicar que, após salvar, máquinas sem ativo precisam enviar um inventário completo.

#### Scenario: Inventário recebido com o cadastro desligado
- **WHEN** uma máquina sem ativo envia um inventário enquanto o cadastro está desligado, a TI configura o tipo e chega outro inventário completo da máquina
- **THEN** o Grafite cadastra e liga o computador se ele atender às regras de identidade e do tipo

### Requirement: Local em árvore e diagnóstico do cadastro

A configuração SHALL usar o seletor de local em árvore padrão, com escolha opcional. A lista SHALL mostrar, para um agente ainda sem ativo, o motivo observado no último inventário com o cadastro ligado, quando houver. Identidade em conflito, hostname ausente, configuração indisponível e recusa pelo motor de campos SHALL ser distinguíveis. A aplicação SHALL persistir apenas a causa e os campos recusados, sem guardar o inventário bruto. Ao ligar o agente, a pendência SHALL deixar de aparecer.

#### Scenario: Inventário parcial
- **WHEN** o cadastro está ligado e o agente sem ativo envia inventário parcial sem se identificar como computador
- **THEN** a lista indica que aguarda inventário completo

#### Scenario: Campo obrigatório ausente
- **WHEN** o agente envia inventário completo mas o motor de campos recusa o cadastro
- **THEN** a lista mostra o motivo e os campos a revisar, e o inventário é aceito
