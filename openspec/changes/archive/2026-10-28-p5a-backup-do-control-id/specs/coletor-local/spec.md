## ADDED Requirements

### Requirement: Pedidos ao coletor

Além da configuração e dos lotes, o coletor SHALL buscar na API, a cada 15 segundos, os pedidos de trabalho dos ativos que ele alcança, pela mesma regra de alcance da configuração (a faixa mais específica e, no empate, o coletor cadastrado primeiro).

Ao entregar um pedido, a API SHALL:
- marcá-lo como em andamento, com o coletor e o momento;
- mandar o que ele precisa para executar, com as credenciais do cofre só no corpo da resposta.

O coletor SHALL executar um pedido por vez e responder:
- com o arquivo, quando houver;
- ou com a falha e a mensagem.

A API SHALL recusar a resposta:
- de um coletor que não é o do pedido;
- de um pedido que já terminou.

O coletor parado, ou com o token recusado, SHALL NOT buscar pedidos.

#### Scenario: Backup buscado pelo coletor da rede
- **WHEN** o backup do controle 10.20.1.40 entra na fila, e o coletor da faixa 10.20.0.0/16 busca os pedidos
- **THEN** a API entrega o backup a esse coletor, com o IP, a porta e o login, e o marca como em andamento

#### Scenario: Resposta de outro coletor
- **WHEN** um coletor responde a um pedido que foi entregue a outro
- **THEN** a API recusa a resposta, e o pedido segue com o coletor dele
