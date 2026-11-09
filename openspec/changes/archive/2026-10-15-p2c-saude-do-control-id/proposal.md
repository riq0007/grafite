## Why

Os controles de acesso Control iD abrem as portas da organização. Quando um deles para de responder, ou quando a senha dele muda sem ninguém saber, o problema só aparece na portaria, e o backup do P5 falha em silêncio. O PMG sonda cada controle em segundo plano e mostra se ele responde e quando foi o último contato. A virada (P8) precisa dessa paridade.

O P2c · Saúde do Control iD é a terceira e última change do P2 · Coletor local (spec mestre, seção 3.2), depois do P2b. O login do Control iD é um segredo e mora no cofre (seção 5.2, decisão 7). Por decisão desta change, tomada pelo que o PMG faz e pelo que o P2b já decidiu:
- o login é um segredo do cofre escolhido no tipo, como a comunidade do SNMP, e o segredo ligado ao próprio controle no cofre vale no lugar dele, para os controles com uma senha própria;
- o coletor sonda cada controle a cada 5 minutos, pelo login e pelas informações do sistema, e sai da sessão em seguida;
- a tela mostra a situação, desde quando ela vale, o último contato e a versão do firmware;
- o número de série lido grava o campo do ativo com a origem "coleta", como no P2b.

Ficam fora desta change:
- o teste de conexão feito na hora, por um botão: a API não fala com os controles, e o canal de ordens ao coletor nasce no P5, que precisa dele para o backup manual;
- o HTTPS dos controles: o PMG fala HTTP, e o login viaja aberto na rede local, como hoje (risco no design);
- a porta e o login escolhidos em cada controle fora do cofre;
- os alertas e as notificações de um controle sem resposta (P3);
- o backup, a comparação e a restauração (P5).

## What Changes

- **A capacidade `controlid.saude`** (Saúde do Control iD):
  - o tipo que a liga escolhe o campo de IP, a porta, com a 80 já escolhida, e o login: um segredo ativo do cofre do tipo Usuário e senha ou Conta administrativa, com o usuário preenchido;
  - o segredo de um desses tipos ligado ao controle no cofre vale no lugar do login do tipo.
- **A sondagem:** a cada 5 minutos, o coletor entra no controle (`login.fcgi`), lê as informações do sistema (`system_information.fcgi`) e sai (`logout.fcgi`), com até 10 segundos de espera e uma tentativa a mais, como o PMG.
- **A situação:**
  - Respondendo;
  - Login recusado, quando o controle responde e recusa o usuário e a senha;
  - Sem resposta;
  - Resposta inesperada, quando o endereço responde, mas não como um Control iD;
  - Sem dado e Não verificado, com o motivo, como a disponibilidade na rede.
- **O que a tela mostra:** a situação, desde quando ela vale, o último contato, a versão do firmware, o produto e o coletor, no grupo da capacidade na ficha, e a coluna Control iD na tabela, com a ordem e o filtro.
- **O número de série** lido grava o campo comum Número de série com a origem "coleta", respeitando a trava, e a mudança entra na auditoria.
- **O login** vai ao coletor só na configuração dos alvos dele e fica só na memória: nunca na fila em disco nem no log.
- **Os testes** usam um simulador da API do Control iD, com o login, as informações do sistema e a saída.

## Capabilities

### New Capabilities

- `saude-do-control-id`: a capacidade `controlid.saude`, com a sondagem dos controles pelo login do cofre, a situação, o último contato, o firmware e o número de série.

### Modified Capabilities

- `catalogo-de-ativos`: a capacidade `controlid.saude` entra no catálogo, com o campo de IP, a porta e o login escolhidos no tipo.
- `cadastro-de-ativos`: a saúde do Control iD na ficha e a coluna Control iD, com a ordem e o filtro; o valor gravado pela coleta vem também da sondagem.
- `coletor-local`: a configuração da coleta traz a sondagem do Control iD, com a porta, o usuário e a senha, que o coletor guarda só na memória.
- `cofre-de-segredos`: o uso do login pelo coletor, sem revelação, e o segredo ligado ao controle no lugar do login do tipo.

## Impact

- **`packages/domain`:**
  - a capacidade e a configuração dela no tipo;
  - as métricas novas e os limites de cada valor;
  - a situação da sondagem, com os rótulos em pt-BR e a ordem;
  - a escolha do login: o do controle ou o do tipo.
- **`packages/db`:** sem migration; as leituras usam o item e os detalhes do P2b.
- **`apps/collector`:**
  - a sondagem pelo cliente HTTP do Node, sem dependência nova;
  - um simulador da API do Control iD para os testes.
- **`apps/api`:**
  - a configuração da coleta com o login decifrado;
  - o lote com as métricas novas e o número de série;
  - a ficha, a coluna, o filtro e a ordem;
  - a lista dos logins para a ficha do tipo;
  - o contrato e o cliente gerados de novo.
- **`apps/web`:** a configuração da capacidade na ficha do tipo, a saúde do Control iD na ficha do ativo e a coluna.
- **Documentação:** a spec mestre (seção 5.4, a capacidade nova), o mapa, o contrato de módulo e o runbook, com a porta dos controles que o coletor precisa alcançar.
