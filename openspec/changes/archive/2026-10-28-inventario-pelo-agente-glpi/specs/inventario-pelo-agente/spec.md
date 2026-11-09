## Purpose

Receber o inventário das máquinas pelo agente do GLPI que já está instalado nelas, sem instalar nada novo: o hardware, o sistema, as licenças e o antivírus entram nos campos do ativo, e os softwares instalados entram na ficha.

## ADDED Requirements

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

até 20 MB.

- O CONTACT SHALL ser respondido com `status` "ok", a tarefa `inventory` e a `expiration` de 24 horas.
- O INVENTORY SHALL ser gravado e respondido com `status` "ok".
- O token desconhecido ou desligado SHALL ser recusado com 403 e `status` "error", sem gravar nada.
- O pedido fora do protocolo SHALL ser recusado com 400 e `status` "error".

#### Scenario: Agente com dois servidores
- **WHEN** o agente de uma máquina tem o GLPI e o endereço do Grafite no `server`, separados por vírgula
- **THEN** ele manda o CONTACT e o inventário ao Grafite, e o Grafite responde no formato que o agente espera

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

No inventário, o agente sem ativo SHALL ser ligado ao ativo ativo da organização cuja série confere com a da máquina. Sem a série, ou sem nenhum ativo com ela, a ligação SHALL ser pelo hostname. Ela SHALL acontecer só quando um único ativo confere. Quem tem `coletores.administrar` SHALL ligar o agente a um ativo à mão e desligá-lo. A ligação à mão SHALL valer até ser desfeita.

#### Scenario: Ligado pela série
- **WHEN** o primeiro inventário da máquina chega com a série "BRJ1234567", e só o ativo PAT-00321 tem essa série
- **THEN** o agente fica ligado ao PAT-00321, e o inventário entra nele

#### Scenario: Máquina sem ativo
- **WHEN** nenhum ativo tem a série nem o hostname da máquina
- **THEN** o agente aparece como "Sem ativo", e a tela oferece "Ligar a um ativo"

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
