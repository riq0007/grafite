## Why

Com o P1, a organização cadastra e cuida dos ativos, mas não sabe se eles estão funcionando: quem atende descobre que a impressora caiu quando alguém reclama. O PMG pinga as impressoras a cada ciclo e mostra quem está fora. O Grafite precisa disso para todo ativo com IP, e precisa do caminho que o P2b (SNMP das impressoras), o P2c (saúde do Control iD) e o P3 (alertas) vão usar: um coletor que fala com a API, leituras guardadas como histórico e um estado atual para as listas.

O P2a · Coletor e disponibilidade é a primeira das três changes do P2 · Coletor local (spec mestre, seção 3.2): o coletor ligado à organização e a disponibilidade por ping. Por decisão do usuário, a ordem é P2a → P6 · Cofre → P2b → P2c: o SNMP e o Control iD pedem credenciais, que moram no cofre, e o P2a só usa ping, sem segredo.

Ficam fora desta change:
- o SNMP das impressoras, com os suprimentos, os contadores e os alertas do equipamento, e os agregados por hora (P2b);
- a saúde do Control iD (P2c);
- as regras de alerta, a "coleta atrasada" e as notificações (P3);
- a atualização de campos do ativo pela coleta, com a origem "coleta", que chega com o SNMP (P2b);
- os gráficos do histórico das leituras na ficha.

## What Changes

- **Spec mestre:** a seção 3.2 divide o P2 em três changes e diz a ordem com o P6.
- **O coletor da organização:**
  - Administração › Coletores cadastra cada coletor, com o nome e as faixas de rede que ele pode alcançar. O token aparece uma vez só, pode ser trocado, e o coletor pode ser inativado e reativado.
  - O comando no servidor cria coletores. A instalação e a atualização da produção o usam para ligar o coletor do servidor à organização que opera o servidor, com o token que ele já tem, sem faixas até alguém cadastrá-las na tela.
  - A tela mostra o último contato e a versão de cada coletor.
- **A coleta:**
  - o coletor fala com a API pelo endereço da organização e se identifica pelo token;
  - ele busca na API o que coletar, só os alvos dentro das faixas dele, e confere as faixas de novo antes de cada leitura;
  - envia as leituras em lotes com chave única, que nunca duplicam;
  - guarda os lotes numa fila em disco enquanto a API estiver fora do ar e os reenvia depois, com intervalos crescentes.
- **Leituras e estado atual:**
  - cada leitura entra numa série temporal;
  - o estado atual de cada ativo e métrica mantém as listas rápidas;
  - "sem dado" nunca vira um valor, e a idade do dado fica sempre visível;
  - a manutenção diária apaga as leituras com mais de 30 dias.
- **Disponibilidade na rede:**
  - a capacidade `rede.disponibilidade`, que o tipo liga escolhendo qual dos campos de IP dele o ping usa: o "IP" da organização continua como está, e o que já foi cadastrado ou importado vale sem migrar;
  - o coletor pinga cada ativo dela a cada 2 minutos;
  - a tabela dos ativos ganha a coluna Disponibilidade ("Online", "Offline", "Sem dado" ou "Não verificado", com a idade do dado) e a ficha mostra a situação;
  - a lista e a ficha abertas se atualizam pelo evento quando a situação muda.
- **Desenvolvimento:** o `pnpm dev` sobe o coletor da organização de desenvolvimento junto com a API e a web.

## Capabilities

### New Capabilities

- `coletor-local`: o coletor da organização, com o cadastro, o token, as faixas de rede e o último contato; a conversa com a API, com a configuração da coleta, os lotes que não duplicam, a fila em disco e as tentativas; o comando no servidor que cria o coletor da produção.
- `leituras-e-estado`: as leituras em série temporal e o estado atual de cada ativo e métrica, o "sem dado", o valor inconsistente, a idade do dado e a retenção das leituras.
- `disponibilidade-de-rede`: a capacidade `rede.disponibilidade`, com o campo de IP escolhido pelo tipo, o ping a cada 2 minutos e a situação do ativo na tabela e na ficha.

### Modified Capabilities

- `catalogo-de-ativos`: a capacidade `rede.disponibilidade` entra no catálogo; ligá-la num tipo pede o campo de IP do ping, e o campo escolhido não sai do tipo nem é inativado enquanto for o IP da disponibilidade.
- `cadastro-de-ativos`: a coluna Disponibilidade na tabela dos ativos, com o filtro pela situação, e a situação na ficha.
- `permissoes`: a permissão de cuidar dos coletores.
- `modulo-administracao`: a seção Coletores.
- `eventos-em-tempo-real`: o evento da mudança da disponibilidade e o da mudança dos coletores.
- `modulo-ativos`: a lista e a ficha abertas se atualizam quando a disponibilidade de um ativo muda.
- `fila-de-tarefas`: a manutenção diária apaga as leituras com mais de 30 dias.
- `auditoria`: o cadastro, a edição, a troca do token, a inativação e a reativação do coletor entram na auditoria; as leituras, não.
- `plataforma-base`: o `pnpm dev` sobe o coletor de desenvolvimento.
- `operacao-servicos`: a instalação e a atualização ligam o coletor da produção à organização que opera o servidor, e o serviço do coletor passa a coletar.

## Impact

- **`packages/domain`:**
  - as faixas de rede, com a leitura de IPv4 e IPv6 em CIDR;
  - a regra do lote e da leitura, com o "sem dado" e o valor inconsistente;
  - a situação da disponibilidade;
  - a capacidade `rede.disponibilidade`, com a configuração dela no tipo;
  - a permissão nova e os eventos novos.
- **`packages/db`:**
  - as tabelas dos coletores, dos lotes recebidos, das leituras e do estado atual, com o isolamento por organização;
  - a migration.
- **`apps/api`:**
  - as rotas da Administração dos coletores;
  - as rotas da coleta, guardadas pelo token do coletor, fora da sessão;
  - a coluna e o filtro da disponibilidade na lista dos ativos;
  - o comando `coletor criar`;
  - a retenção na manutenção diária;
  - o contrato e o cliente gerados de novo.
- **`apps/collector`:**
  - o ciclo de coleta: a configuração, o ping, os lotes, a fila em disco e as tentativas;
  - a saúde com o estado da coleta;
  - a configuração do endereço da organização e da pasta da fila.
- **`apps/web`:**
  - a seção Coletores da Administração;
  - a coluna Disponibilidade, o filtro e a situação na ficha, com o `RotuloDeSituacao` que já existe (texto, ícone e cor);
  - os eventos novos.
- **`apps/operacao` e `scripts/dev.ts`:**
  - a instalação cria o coletor da produção;
  - o `pnpm dev` sobe o coletor.
- **Dependências:** nenhuma nova; o ping usa o comando do sistema.
- **Documentação:**
  - a spec mestre, o mapa (`docs/mapa.md`) e o contrato de módulo (`docs/casca/modulos.md`), com a situação de um ativo;
  - o runbook, com o coletor da produção.
