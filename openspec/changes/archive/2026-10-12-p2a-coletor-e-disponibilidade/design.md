## Context

O motivo está em `proposal.md`. O ponto de partida:

- **O coletor** (`apps/collector`) existe desde o F0 só com a configuração validada na partida (`GRAFITE_COLETOR_API_URL` e `GRAFITE_COLETOR_TOKEN`) e a saúde. O F2d já o instala como serviço da produção (`grafite-coletor`, em 127.0.0.1:3100), com um token aleatório no `coletor.env`, que a API ainda não conhece.
- **A organização** de cada requisição vem do endereço pedido (spec isolamento-organizacoes). Só duas consultas atravessam organizações: a descoberta pelo endereço e a lista das organizações para as tarefas.
- **As rotas das telas** ficam no escopo do acesso: sessão no cookie, proteção contra outros sites e permissão declarada por rota (`config.permissao`).
- **As capacidades** são código (`packages/domain/src/ativos/catalogo.ts`), e o tipo guarda as chaves das que liga num `text[]`. Os campos da organização ficam no JSONB `ativos.valores`, pelo id do campo; o "IP" é um desses campos.
- **A tabela dos ativos** monta as colunas pelo catálogo do domínio (`colunasDosAtivos`), e a API ordena e filtra no SQL. O `RotuloDeSituacao`, do `packages/ui`, já mostra uma situação com texto, ícone e cor.
- **A manutenção diária** roda por organização na fila (pg-boss). A web relê as consultas pelos eventos, uma vez por vez numa rajada (P1e).

## Goals / Non-Goals

**Goals:**
- Um caminho de coleta que o P2b e o P2c só estendem com métricas novas: a configuração por alvo, o lote com chave, a fila em disco, a série e o estado atual.
- Nenhuma consulta nova entre organizações, nenhum segredo fora do `.env` e nenhuma leitura duplicada.
- O ping funcionando no servidor Windows da produção, no desenvolvimento e no CI (Linux).

**Non-Goals:**
- Intervalos configuráveis por organização e tipo. O intervalo vem da API na configuração, então mudar isso depois não toca no coletor.
- Partições da série temporal e agregados por hora (P2b).
- A coleta manual na hora, o "coleta atrasada" e qualquer alerta (P3).
- O IPv6 no ping: as faixas aceitam IPv6, e o ping de um IPv6 usa o mesmo comando do sistema, sem teste dedicado no CI.

## Decisions

### 1. O coletor fala pelo endereço da organização

O coletor manda o cabeçalho `Host` com o endereço de acesso da organização (`GRAFITE_COLETOR_ENDERECO`), mesmo quando se conecta a 127.0.0.1. A API descobre a organização pelo endereço, como faz com as telas, e procura o token só entre os coletores ativos dela, com o RLS.

- **Por quê:** o isolamento continua com as duas consultas entre organizações. Um token de outra organização simplesmente não é achado.
- **No produto,** o coletor remoto usa `https://<endereço>` e o `Host` coincide sozinho. O `GRAFITE_COLETOR_ENDERECO` é opcional e vale, por padrão, o host da URL.
- **Alternativas:**
  - o token com o id do coletor e uma função estreita `app.organizacao_do_coletor(id)`, que seria a terceira consulta entre organizações e mudaria a spec isolamento-organizacoes;
  - o coletor da produção passando pelo Caddy, com HTTPS, que exige o Node confiar na AC interna e acrescenta uma peça que pode falhar.
- **Implementação:** o `fetch` do Node ignora o `Host` pedido (conferido no Node 24), então o cliente do coletor usa o `request` do `node:http` e do `node:https`, com o `Host` e o `servername` do endereço.

### 2. Token aleatório com o hash no banco, numa porta própria da API

O token tem 32 bytes aleatórios em base64url (43 caracteres) e é guardado como o hash SHA-256, como os tokens de sessão (`hashDoToken`). Um token com essa entropia dispensa um hash lento.

As rotas do coletor (`/api/coleta/configuracao` e `/api/coleta/lotes`) ficam num escopo próprio do Fastify, fora do `instalarAcesso`:
- a organização vem do endereço;
- o token vem de `Authorization: Bearer`;
- não há cookie nem a proteção contra outros sites, porque o navegador não manda esse cabeçalho sozinho;
- o limite de requisições é o geral.

Cada pedido aceito grava `ultimo_contato_em` e a versão, que vem no cabeçalho `x-grafite-versao-do-coletor`. A gravação só acontece se passou 1 minuto do último contato, para não gravar a cada lote. O log padrão do Fastify não registra cabeçalhos, e o token nunca vai na URL.

### 3. Tabelas

Todas as tabelas são criadas com `orgScoped()` e o isolamento, e o `org_id` vai nas chaves estrangeiras.

| Tabela | O que guarda |
|---|---|
| `coletores` | id, nome e nome normalizado (único na organização), `token_hash` (único), `faixas text[]` na forma canônica, situação, quem criou (a conta, ou nada pelo comando), `ultimo_contato_em` e versão |
| `lotes_da_coleta` | coletor, `chave uuid` única na organização, `recebido_em`, gravadas e ignoradas: a prova de que o lote já entrou |
| `leituras` | ativo, métrica, momento, `valor_numero double precision`, `valor_texto text`, situação (`valida`, `sem-dado` ou `inconsistente`) e coletor; índice `(org_id, ativo_id, metrica, momento desc)` e BRIN em `momento` para a retenção |
| `estado_dos_ativos` | chave `(org_id, ativo_id, metrica)`, com a última leitura (momento, valores, situação, coletor) e o `desde` |

O tipo ganha `configuracao_das_capacidades jsonb not null default '{}'`, como `{"rede.disponibilidade": {"campoDoIp": "<uuid>"}}`.

**Volume e partições:**
- **Volume esperado:** com 200 ativos pingados a cada 2 minutos, são 144 mil leituras por dia, 4,3 milhões em 30 dias. Uma tabela comum com o índice composto aguenta, e a retenção apaga em blocos de 10 mil, sem travar a coleta.
- **Por que sem partições agora:** as partições por dia (alternativa) exigem SQL à mão nas migrations, porque o drizzle-kit não as gera. Exigem também o isolamento e o RLS forçado em cada partição criada pela manutenção, que o teste-guarda reprovaria se faltasse.
- **Quando particionar:** ficam para quando o volume pedir. O P2b reavalia com os agregados por hora.

### 4. A disponibilidade em duas métricas

O ping vira duas leituras:
- **`rede.disponibilidade`:** `valor_texto` com `online` ou `offline`, ou sem dado;
- **`rede.latencia`:** só quando online, com o valor em ms. Fora de 0 a 2.000, ela é inconsistente.

Assim, a situação de cada leitura vale para um valor só, e a latência inconsistente não contamina a disponibilidade. O "desde" e o evento de transição olham só a `rede.disponibilidade`.

A alternativa, uma linha com os dois valores, deixaria ambígua a situação da leitura.

### 5. Estado atual por upsert condicional, e evento só na transição

O lote grava as leituras e, para cada ativo e métrica, a mais recente dele. O estado atual é gravado com:

```sql
insert ... on conflict (org_id, ativo_id, metrica) do update
set ... , desde = case when estado.valor_texto is distinct from excluded.valor_texto
                       or estado.situacao <> excluded.situacao then excluded.momento
                  else estado.desde end
where excluded.momento > estado.momento
```

Um CTE devolve a situação de antes. Só a mudança na `rede.disponibilidade` grava `disponibilidade.mudou` na mesma transação, com o público "quem vê ativos no local do ativo", como o `ativos.mudaram`. A leitura atrasada não passa do `where`, então não muda o estado nem gera evento.

**A idade do dado na tela:**
- a idade na tela anda na virada do minuto, como o relógio da barra e a coluna Há do Início;
- as consultas que mostram valores coletados, como a lista dos ativos com a coluna, a ficha e a tela dos coletores, relêem a cada 60 s com a aba visível. Isso dá o "no máximo 1 minuto atrás" da spec sem um evento por leitura.

### 6. Quem coleta cada ativo

A API calcula os alvos de um coletor a cada pedido de configuração:
1. os coletores ativos da organização, com as faixas, que são poucos;
2. os ativos ativos dos tipos com a capacidade e o IP preenchido no campo escolhido, lido do JSONB;
3. a regra do domínio `coletorDoIp(ip, coletores)`: a faixa de maior prefixo que alcança o IP e, no empate, o coletor de id menor (UUIDv7: o mais antigo).

O lote confere de novo, com a mesma regra, cada leitura contra o ativo de agora, e ignora a de quem não é mais alvo desse coletor. Com o módulo Ativos desligado, a configuração vem vazia e as leituras são ignoradas.

Para 10 mil ativos, o cálculo em memória fica bem abaixo do limite de 300 ms das listas. Um teste de integração mede isso com 10 mil ativos, como o da lista.

### 7. Faixas e IPs no domínio

Um módulo novo, `packages/domain/src/coleta/faixas.ts`, faz o seguinte:
- lê `a.b.c.d/n` e o IPv6 com prefixo;
- devolve a forma canônica (o endereço da rede, em minúsculas e comprimido);
- confere se um IP canônico está na faixa, comparando os bits com `BigInt`, e diz a especificidade.

Um IPv4 só cai em faixas IPv4. O módulo reusa a `lerIp` dos campos (`campos/rede.ts`) para o IP.

O domínio também ganha:
- a leitura do lote, com os limites: 1.000 leituras, as métricas conhecidas, até 5 min no futuro e até 30 dias no passado;
- a situação da disponibilidade, com o motivo e o "desatualizado" depois de 3 intervalos;
- a conferência da configuração das capacidades no tipo.

### 8. O ciclo do coletor

`apps/collector` ganha módulos pequenos, cada um com as dependências injetadas, como o relógio, o ping, o HTTP e a pasta, para o teste:

| Módulo | Faz |
|---|---|
| `api.ts` | cliente com `Host`, token e versão; tempo limite de 10 s |
| `configuracao.ts` | busca na partida e a cada 5 min; guarda os alvos |
| `agendador.ts` | cada alvo num intervalo próprio, com a primeira leitura logo e um atraso aleatório de até 10% para espalhar os pings; até 32 pings ao mesmo tempo |
| `ping.ts` | o comando do sistema (`ping -n 1 -w 2000` no Windows, `ping -c 1 -W 2` no Linux), lido pelo TTL e pelo tempo; falha ao executar dá "sem dado" |
| `lotes.ts` | junta as leituras e manda a cada 10 s ou a cada 1.000 |
| `fila.ts` | um arquivo JSON por lote, com o momento e a chave no nome; reenvio do mais antigo, com espera de 5 s que dobra até 5 min; descarte depois de 7 dias |
| `saude.ts` | o estado para o `/health` |

A pasta da fila vem de `GRAFITE_COLETOR_PASTA`, com o padrão `./.grafite/coletor` no desenvolvimento e `C:\Grafite\producao\coletor` na produção.

As respostas da API decidem o que acontece com o lote:
- **sem resposta ou 5xx:** o lote vai para a fila;
- **400:** o lote é descartado, com o motivo no log;
- **401:** a coleta para, a saúde avisa, e o coletor pede a configuração de novo a cada 1 min até a API aceitar o token.

O ping pelo comando do sistema evita privilégio de socket ICMP cru, que o serviço do Windows e o CI não dão, e já é o que o PMG usa.

### 9. O comando no servidor e a operação

O `pnpm grafite coletor criar` aceita:
- `--endereco`, `--nome` e `--faixa` (repetível);
- `--token-do-ambiente`, que lê o `GRAFITE_COLETOR_TOKEN` sem mostrá-lo;
- `--se-nao-existir`, que procura pelo hash do token.

O mesmo comando serve:
- **à instalação,** com o endereço da primeira organização;
- **à atualização da produção,** com o endereço de `GRAFITE_ORGANIZACAO_OPERADORA`;
- **ao `pnpm dev`,** com `localhost` e a faixa `127.0.0.0/8`.

A operação grava `GRAFITE_COLETOR_ENDERECO` e `GRAFITE_COLETOR_PASTA` no `coletor.env`. A instalação e a atualização passam o token pelo ambiente do processo, nunca pela linha de comando, que aparece na lista de processos.

### 10. Tipos com a configuração das capacidades

A API dos tipos continua com `capacidades: string[]` e ganha `configuracaoDasCapacidades`. A conferência do domínio exige que o `campoDoIp` seja:
- um campo ativo;
- do tipo IP;
- incluído no tipo.

A recusa vem no campo, como as outras do tipo. Desligar a capacidade apaga a configuração dela.

Duas recusas consultam `configuracao_das_capacidades->'rede.disponibilidade'->>'campoDoIp'`:
- tirar o campo do tipo, na gravação do tipo;
- inativar o campo, na rota dos campos, com o nome dos tipos que o usam.

### 11. A coluna e o filtro na lista dos ativos

A coluna `coleta.disponibilidade` entra no catálogo das colunas do domínio, no grupo da capacidade, quando algum tipo ativo a liga. A lista junta o `estado_dos_ativos` da métrica com um `left join`.

| Ação | Como é feita |
|---|---|
| Filtro "é qualquer de" | Online, Offline e Sem dado olham o estado. Não verificado é a ausência de estado num ativo ativo de tipo com a capacidade |
| Ordenação | um `case` (offline 0, sem dado 1, online 2, sem estado 3) e depois `momento` crescente |
| Motivo do "Não verificado" | calculado depois da página: sem IP, ou sem coletor que alcance, com as faixas carregadas uma vez por pedido |

A ficha do ativo traz o estado das duas métricas, o nome do coletor e o motivo.

### 12. Testes

| Onde | O que cobre |
|---|---|
| Domínio, antes do código | faixas (IPv4, IPv6, canônica, inválida, especificidade), coletor do IP, leitura do lote, situação com o motivo e o desatualizado, configuração das capacidades |
| Banco (integração) | o RLS das quatro tabelas, o upsert com a leitura atrasada e a chave do lote única |
| API (integração) | <ul><li>a tela dos coletores, com o token uma vez, a troca e a inativação;</li><li>o token de outra organização recusado;</li><li>os alvos com as faixas que se cruzam;</li><li>o lote reenviado sem duplicar e a leitura de quem passou a outro coletor;</li><li>o evento só na transição;</li><li>a coluna, o filtro e a ordenação;</li><li>a retenção;</li><li>o comando, com o `--se-nao-existir`;</li><li>o desempenho da configuração com 10 mil ativos</li></ul> |
| Coletor (unidade) | a leitura da saída do ping do Windows e do Linux, os lotes, a fila em disco (reinício, ordem, descarte, intervalos), as respostas 400 e 401, e a saúde |
| Web | a seção Coletores, a ficha do tipo com o campo de IP, a coluna, o filtro e a ficha do ativo |
| Ponta a ponta simulada | a seção Coletores e a coluna na tabela |
| Pilha | o processo do coletor de verdade, com a faixa `127.0.0.0/8` e `192.0.2.0/24`. Um ativo em 127.0.0.1 fica "Online", e um em 192.0.2.1 (TEST-NET-1) fica "Offline", na tabela aberta, pelo evento |

## Risks / Trade-offs

- **[A saída do `ping` muda com o idioma do Windows]** → A leitura procura o que não se traduz, e os testes usam saídas reais em pt-BR e en-US:
  - a resposta é a linha com o `TTL=` ou, no IPv6 do Windows, que vem sem ele, a linha com o IP do alvo e o tempo; a latência é o número antes de `ms`;
  - sem a resposta, a estatística com o `%` da perda dá offline, mesmo quando o Windows sai com 0 porque o roteador respondeu que o destino está inacessível;
  - sem nenhuma das duas, o código de saída decide: 0 é online, sem a latência, e outro código é sem dado, como no "não pôde encontrar o host" do Windows e no "permission denied" do BusyBox, que saem com 1.
- **[Muitos processos de ping ao mesmo tempo]** → No máximo 32 pings ao mesmo tempo, com os alvos espalhados no intervalo. Com 1.000 alvos, são cerca de 8 por segundo.
- **[A série cresce mais que o previsto]** → O BRIN em `momento` e a retenção em blocos seguram. O P2b reavalia as partições com os agregados.
- **[Relógio do coletor adiantado]** → A tolerância é de 5 min no futuro, com a recusa explícita do lote. No servidor da produção, o coletor e a API dividem o relógio.
- **[O token no `coletor.env`]** → O arquivo já é legível só para os administradores e a conta dos serviços (F2d). O token troca pela tela, e o coletor antigo para na hora.
- **[O estado atual fica para sempre]** → Ele é um registro por ativo e métrica, pequeno. O ativo inativo não mostra a disponibilidade.

## Migration Plan

A migration é só aditiva:
- cria as quatro tabelas, com o isolamento;
- cria a coluna `configuracao_das_capacidades`, com o padrão `{}`.

Ela traz a permissão `coletores.administrar`, que o Administrador ganha sozinho porque tem todas as permissões.

**Na atualização da produção:**
1. o comando liga o coletor à organização que opera o servidor, sem faixas, antes de iniciá-lo;
2. até alguém cadastrar as faixas, a configuração vem vazia e o coletor fica ocioso, com a saúde ok.

**Na volta a uma versão anterior:** as tabelas novas ficam sem uso e o coletor antigo só responde à saúde, como antes.
