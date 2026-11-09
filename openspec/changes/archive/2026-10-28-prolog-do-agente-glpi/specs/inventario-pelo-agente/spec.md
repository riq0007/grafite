## MODIFIED Requirements

### Requirement: Protocolo do agente do GLPI

A API SHALL falar o protocolo JSON do agente do GLPI no endereço dos agentes, sem a sessão. A organização vem pelo endereço de acesso, e o token pelo caminho. A API SHALL aceitar o corpo:
- comprimido com o zlib (`application/x-compress-zlib`);
- comprimido com o gzip (`application/x-compress-gzip`);
- em JSON puro;

até 20 MB.

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
