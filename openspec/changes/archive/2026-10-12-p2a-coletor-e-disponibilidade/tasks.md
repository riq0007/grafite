## 1. Spec mestre e domínio

- [x] 1.1 Atualizar a spec mestre:
  - na seção 3.2, o P2 em três changes (P2a · Coletor e disponibilidade, P2b · Impressoras por SNMP, P2c · Saúde do Control iD), com a entrega de cada uma;
  - a ordem P2a → P6 · Cofre → P2b → P2c, com o P2b e o P2c dependendo do P6;
  - na seção 5.4, a `rede.disponibilidade` com o campo de IP escolhido pelo tipo.

  Verificar: o teste do mapa passa, com as seções citadas ainda com título.
- [x] 1.2 Domínio, as faixas, com o teste antes:
  - `lerFaixa`: IPv4 e IPv6 com o prefixo, a forma canônica e a recusa "Use uma faixa como 10.0.0.0/24.";
  - `ipNaFaixa`;
  - `coletorDoIp`: a faixa de maior prefixo, o empate pelo coletor mais antigo e o IPv4 só nas faixas IPv4.

  Verificar: os testes do domínio passam, com os cenários das faixas e das faixas que se cruzam.
- [x] 1.3 Domínio, o lote e a situação, com o teste antes:
  - `lerLote`: a chave, até 1.000 leituras, as métricas `rede.disponibilidade` e `rede.latencia`, o momento até 5 min no futuro e até 30 dias no passado, e a latência fora de 0 a 2.000 ms como inconsistente;
  - `situacaoDaDisponibilidade`: online, offline, sem dado, não verificado com o motivo, e o "desatualizado" depois de 3 intervalos.

  Verificar: os testes do domínio passam, com os cenários da spec.
- [x] 1.4 Domínio, o catálogo e o acesso, com o teste antes:
  - a capacidade `rede.disponibilidade`, sem campos;
  - a conferência da configuração das capacidades no tipo: o `campoDoIp` ativo, do tipo IP e no tipo, com as recusas da spec;
  - a coluna `coleta.disponibilidade` no catálogo das colunas;
  - a permissão `coletores.administrar`;
  - os eventos `disponibilidade.mudou` e `coletores.mudaram`, com o público;
  - as ações do coletor na auditoria.

  Verificar: os testes do domínio passam.

## 2. Banco

- [x] 2.1 A migration 0024, com o teste de integração antes:
  - `coletores`, `lotes_da_coleta`, `leituras` e `estado_dos_ativos`, com o isolamento, as chaves compostas com o `org_id` e os índices;
  - `configuracao_das_capacidades` no tipo;
  - as exportações.

  Verificar: `pnpm --filter @grafite/db test:integration` passa, com o teste-guarda do isolamento e o das chaves compostas.

## 3. API

Cada tarefa entra com os esquemas das rotas dela e o cliente gerado de novo (`pnpm contrato:gerar`).

- [x] 3.1 Os tipos com a configuração das capacidades, com o teste de integração antes:
  - a gravação do tipo com `configuracaoDasCapacidades`, e as recusas;
  - o campo de IP da disponibilidade, que não sai do tipo nem é inativado;
  - a configuração na auditoria do tipo.

  Verificar: os testes de integração do catálogo passam, com os cenários das capacidades e dos campos.
- [x] 3.2 A administração dos coletores, com o teste de integração antes:
  - as rotas `GET` e `POST /coletores`, `PATCH /coletores/:id`, `POST /coletores/:id/token`, e a inativação e a reativação;
  - o token mostrado uma vez e guardado só pelo hash;
  - as faixas canônicas e o nome único;
  - a permissão, a auditoria e o evento `coletores.mudaram`.

  Verificar: os testes de integração passam.
- [x] 3.3 A identificação do coletor e a configuração, com o teste de integração antes:
  - o escopo da coleta, com a organização pelo endereço e o token no `Authorization`;
  - as recusas do token de outra organização, do coletor inativo e do token trocado;
  - o último contato e a versão, gravados no máximo uma vez por minuto;
  - `GET /coleta/configuracao`, com os alvos pela faixa mais específica, o módulo desligado e o ativo inativo.

  Verificar: os testes de integração passam, e a configuração com 10 mil ativos responde abaixo de 300 ms no p95, com a tabela analisada depois da carga.
- [x] 3.4 Os lotes, com o teste de integração antes:
  - `POST /coleta/lotes` numa transação, com a chave que não duplica;
  - as leituras ignoradas (o ativo inexistente, o inativo e o de outro coletor) e as recusas (mais de 1.000, a métrica desconhecida, o futuro e o antigo);
  - o estado atual, com o "desde" e a leitura atrasada;
  - o evento `disponibilidade.mudou` só na transição.

  Verificar: os testes de integração passam, com os cenários dos lotes e do estado atual.
- [x] 3.5 A disponibilidade na lista e na ficha, com o teste de integração antes:
  - a coluna `coleta.disponibilidade`, com o filtro "é qualquer de" e a ordenação;
  - o motivo do "Não verificado";
  - a ficha com as duas métricas, o coletor e o motivo;
  - o acesso pelo local do ativo.

  Verificar: os testes de integração da lista e da ficha passam.
- [x] 3.6 A retenção e o comando, com o teste de integração antes:
  - a manutenção diária apaga, em blocos, as leituras e as chaves dos lotes com mais de 30 dias, sem tocar no estado atual;
  - `pnpm grafite coletor criar` com `--faixa`, `--token-do-ambiente` e `--se-nao-existir`, com a auditoria e o evento.

  Verificar: os testes de integração da manutenção e do comando passam.

## 4. Coletor

- [x] 4.1 O cliente da API e a configuração, com o teste antes:
  - `GRAFITE_COLETOR_ENDERECO` e `GRAFITE_COLETOR_PASTA` validados na partida;
  - o pedido pelo `node:http` e pelo `node:https`, com o `Host`, o token e a versão;
  - a configuração na partida e a cada 5 min;
  - a recusa do alvo fora das faixas, e o 401.

  Verificar: os testes unitários do coletor passam, contra um servidor HTTP de teste que confere o `Host`.
- [x] 4.2 O ping e o agendador, com o teste antes:
  - a leitura das saídas reais do `ping` do Windows (pt-BR e en-US), do Linux e do BusyBox, além do código de saída e da falha ao executar;
  - o intervalo de cada alvo, a primeira leitura logo e o atraso aleatório;
  - o limite de 32 pings ao mesmo tempo, com o relógio falso.

  Verificar: os testes unitários passam.
- [x] 4.3 Os lotes e a fila em disco, com o teste antes:
  - o lote a cada 10 s ou a cada 1.000 leituras, com a chave;
  - a fila em disco, com o reenvio do mais antigo, os intervalos crescentes até 5 min, o reinício e o descarte depois de 7 dias;
  - o 400, que descarta o lote, e o 401, que para a coleta até a API aceitar o token de novo.

  Verificar: os testes unitários passam, com uma pasta temporária.
- [x] 4.4 A saúde do coletor, com o teste antes:
  - o `/health` com a última configuração, os alvos, o último lote aceito, a fila, os descartados e o token recusado;
  - o "degradado" com a API fora há mais de 10 min;
  - sem o token nem as faixas.

  Verificar: os testes unitários passam.

## 5. Web

- [x] 5.1 A ficha do tipo com o campo de IP, com o teste antes:
  - a capacidade "Disponibilidade na rede", com a descrição;
  - a escolha do campo entre os do tipo IP que estão no tipo;
  - o aviso do tipo sem campo de IP, e as recusas no campo.

  Verificar: os testes das telas do catálogo passam.
- [x] 5.2 A seção Coletores, com o teste antes:
  - a lista, com as faixas, a situação, o último contato com a idade e o "Sem contato há", e o vazio;
  - o cadastro e o diálogo do token, com "Copiar";
  - a ficha, com a edição, "Trocar o token", a inativação e a reativação, com as confirmações e os retornos;
  - o evento `coletores.mudaram` e a releitura a cada 60 s.

  Verificar: os testes da seção e do módulo Administração passam.
- [x] 5.3 A disponibilidade na tabela e na ficha, com o teste antes:
  - a coluna, com o `RotuloDeSituacao`, a idade e o "Desatualizado";
  - o filtro "é qualquer de";
  - a ficha com a situação, o "desde", a idade, a latência, o coletor e o motivo;
  - o evento `disponibilidade.mudou`, e a releitura a cada 60 s com a aba visível.

  Verificar: os testes da tabela e da ficha passam.

## 6. Desenvolvimento e operação

- [x] 6.1 O `pnpm dev` com o coletor, com o teste antes:
  - o `GRAFITE_COLETOR_TOKEN` gerado uma vez no `.env`;
  - o coletor de desenvolvimento garantido pelo comando, com a faixa `127.0.0.0/8` na criação;
  - o processo do coletor no ar junto com a API e a web.

  Verificar: os testes do `scripts/dev.ts` passam, e no `pnpm dev` um ativo em 127.0.0.1 aparece "Online".
- [x] 6.2 A instalação e a atualização com o coletor, com o teste antes:
  - o `coletor.env` com o endereço e a pasta;
  - a instalação liga o "Servidor" à primeira organização, sem faixas, com o token passado pelo ambiente;
  - a atualização liga o coletor da organização que opera o servidor uma vez só;
  - o fim da instalação diz para cadastrar as faixas;
  - a imagem `coletor` com o `ping`;
  - o runbook.

  Verificar: os testes do comando de operação passam, e o `docker build --target coletor` funciona.

## 7. Ponta a ponta

- [x] 7.1 Estender a ponta a ponta com a API simulada. A simulação ganha os coletores e a disponibilidade. Os cenários:
  - cadastrar um coletor e copiar o token, e trocar o token;
  - ligar a disponibilidade num tipo escolhendo o IP;
  - filtrar a coluna por "Offline".

  Verificar: `pnpm test:e2e` passa.
- [x] 7.2 Estender a ponta a ponta da pilha:
  - a administradora cadastra o coletor com as faixas e liga a disponibilidade na impressora;
  - o processo do coletor, de verdade e com o token, pinga um ativo em 127.0.0.1, que fica "Online", e um em 192.0.2.1, que fica "Offline";
  - os dois aparecem na tabela aberta da conta nova, pelo evento.

  Verificar: `pnpm test:e2e:pilha` passa.

## 8. Fechamento

- [x] 8.1 Documentação:
  - os termos novos e a change no mapa (as capacidades `coletor-local`, `leituras-e-estado` e `disponibilidade-de-rede` entram no mapa no arquivamento, junto com a sincronização das specs);
  - o contrato de módulo, com a situação coletada de um ativo e a idade do dado;
  - o runbook, com o coletor da produção.

  Verificar: o teste do mapa passa.
- [ ] 8.2 Conferir:
  - verdes: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm test:stories`, `pnpm test:e2e`, `pnpm test:e2e:pilha` e `pnpm test:visual`;
  - em dia: `tokens:verificar`, `marca:verificar`, `contrato:verificar` e `fila:verificar`;
  - sem erros: `openspec validate p2a-coletor-e-disponibilidade --strict`.

  Verificar: os comandos passam, e o CI fica verde no PR para a `main`.
