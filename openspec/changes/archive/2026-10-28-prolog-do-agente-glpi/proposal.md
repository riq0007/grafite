## Why

O teste com o agente do GLPI de verdade (a versão 1.21, oficial) mostrou que ele não começa pelo CONTACT: o primeiro pedido a um servidor novo é o PROLOG em XML, comprimido com o zlib e com o cabeçalho `GLPI-Agent-ID`. O servidor do GLPI responde a esse PROLOG em JSON, e só então o agente passa ao protocolo JSON (o CONTACT, o inventário e o Deploy). O Grafite recusava o PROLOG com 400, como pedido fora do protocolo, e o agente parava ali: nenhuma máquina com o agente instalado chegaria a mandar o inventário nem a receber uma distribuição.

O agente simulado das changes inventario-pelo-agente-glpi e distribuicao-de-software começava direto pelo CONTACT e não pegou a falha.

## What Changes

- O endereço dos agentes responde ao PROLOG em XML com o JSON do servidor do GLPI: `status` "ok" e a `expiration` de 24 horas. O agente reconhece o protocolo e segue com o CONTACT.
- O PROLOG passa pelas mesmas conferências do resto: o token do caminho e o tamanho do corpo. O XML que não é um PROLOG continua recusado com 400.
- O agente simulado dos testes começa pelo PROLOG, como o de verdade.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `inventario-pelo-agente`: o protocolo do agente do GLPI aceita o PROLOG em XML, que o agente manda primeiro.

## Impact

- `apps/api/src/rotas/agentes-glpi.ts`: o PROLOG antes do JSON.
- `apps/api/src/rotas/agentes-glpi.int.test.ts`: o PROLOG com o cabeçalho do agente, como a versão 1.21 manda.
- `docs/operacao/runbook.md`: nada muda para quem opera; o agente já vem assim.
- Sem migration, sem mudança no contrato da API (a rota fica fora do OpenAPI).
