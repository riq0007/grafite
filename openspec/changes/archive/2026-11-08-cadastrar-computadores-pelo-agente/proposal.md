## Why

O S5 já recebe o inventário do GLPI Agent, mas uma máquina nova fica sem ativo e o IP recebido não aparece na lista. O operador precisa cadastrar e ligar cada computador à mão para aproveitar o inventário.

## What Changes

- Configuração por organização do tipo e do local de entrada de novos computadores; sem tipo escolhido, permanece a ligação manual.
- Cadastro no primeiro inventário completo, aproveitando ativos existentes e preservando ambiguidades e cadastros inativos para revisão.
- IP, MAC, UUID, usuário informado pelo agente e última inicialização nos campos do inventário; fabricante e modelo no catálogo de modelos.
- IP e último contato na lista de agentes; configuração e instruções na mesma tela.
- Entrega somente na GPT, sem merge e sem CI, conforme a autorização da conversa.

Ficam fora: descobrir máquinas sem agente, instalar o agente por GPO, deduzir localização ou responsável pelo IP e alterar dados administrativos preenchidos pela TI.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `inventario-pelo-agente`: configuração e cadastro automático, dados de identificação e de rede visíveis no ativo e no agente.
- `catalogo-de-ativos`: campos de identificação e rede na capacidade Inventário de hardware.

## Impact

Domínio do inventário e capacidade hardware, migration da configuração com RLS e referências da organização, API dos agentes e contrato, Administração e guias de operação. Reutiliza o motor de escrita, as travas, a auditoria e os componentes do ANTISLOP v3. Sem dependências novas.
