## Context

O motivo está em `proposal.md`. O ponto de partida, do P2a:

- **O coletor** (`apps/collector`) busca a configuração na API a cada 5 minutos. O agendador lê cada alvo no intervalo dele, com até 32 leituras ao mesmo tempo. Os lotes vão à API a cada 10 s, e a fila em disco guarda o que a API não aceitou. Hoje, a única coleta é o `ping`.
- **A API** calcula os alvos de cada coletor pelos tipos com a capacidade, o IP no campo escolhido e a faixa mais específica. O lote é conferido pelo domínio (`lerLote`), e cada leitura vai à série (`leituras`) e ao estado atual (`estado_dos_ativos`, uma linha por ativo e métrica).
- **A tabela dos ativos** tem a coluna coletada da disponibilidade, uma escolha entre situações. A ficha mostra a disponibilidade num grupo da capacidade.
- **O cofre (P6)** cifra cada valor com a chave do segredo, e essa chave com a chave mestra. Só a API tem a chave mestra.
- **O PMG** lê as impressoras com o `net-snmp`, pela comunidade `public`, nos OIDs do Printer-MIB e do Host Resources MIB:
  - os suprimentos em `1.3.6.1.2.1.43.11.1.1`: a descrição na coluna 6, a capacidade na 8 e o nível na 9;
  - os contadores em `1.3.6.1.2.1.43.10.2.1.4`;
  - as condições em `1.3.6.1.2.1.25.3.5.1.2`, um campo de bits em que o bit 0 é o mais alto do primeiro octeto;
  - as mensagens em `1.3.6.1.2.1.43.18.1.1.8`.

  As regras de classificação dele estão em `src/lib/snmp-rules.js`.

## Goals / Non-Goals

**Goals:**
- A leitura SNMP pelo mesmo caminho do ping: a configuração, o agendador, o lote, a fila em disco, a série e o estado atual, sem uma via paralela.
- Paridade com o PMG no que ele lê, com as diferenças que a spec pede: o nível que a impressora não mede não vira 100%, e a impressora de uma cor é reconhecida pela própria impressora, e não pelo nome do tipo.
- A comunidade nunca fora da memória do coletor.

**Non-Goals:**
- O SNMP v3, os alertas, a previsão de troca e os gráficos (proposta, "Ficam fora").
- Partições da série: o volume continua o de uma tabela comum (risco abaixo).

## Decisions

### 1. As métricas da impressora, com o item e os detalhes

A leitura ganha o `item`, texto vazio quando a métrica tem um valor por ativo, e os `detalhes`, um JSON opcional. Cada leitura SNMP gera:

| Métrica | Item | Valor | Detalhes |
|---|---|---|---|
| `snmp.resposta` | — | `respondeu` ou `nao-respondeu`, em texto | — |
| `impressora.suprimento` | o índice do suprimento no Printer-MIB | o percentual, ou nenhum | a descrição, a capacidade e o nível como a impressora informou |
| `impressora.contador` | o índice do marcador | as páginas | o número de cores do marcador, quando informado |
| `impressora.condicoes` | — | a lista das condições ativas, em JSON, pelas chaves do domínio | — |
| `impressora.mensagens` | — | a lista das mensagens do fabricante, em JSON | — |
| `impressora.serie` | — | o número de série | — |

O suprimento de nível "há suprimento" é válido e sem número, com o nível bruto nos detalhes. O de nível desconhecido é "sem dado". Quando a impressora não responde, vai só o `snmp.resposta`, e o estado dos suprimentos, dos contadores e das condições fica o da última resposta (spec impressoras-por-snmp, "Leitura das impressoras").

**Alternativa:** uma leitura por impressora, com todos os suprimentos num JSON. O estado atual ficaria simples, mas a coluna do menor nível, o agregado por hora e as regras do P3 por item (`toner:1`, spec mestre, seção 6.4) teriam de abrir o JSON em cada consulta.

### 2. O banco

A migration 0027 é aditiva:
- `leituras` e `estado_dos_ativos` ganham `item text not null default ''` e `detalhes jsonb`. A chave do estado passa a `(org_id, ativo_id, metrica, item)`, e o índice da série, a `(org_id, ativo_id, metrica, item, momento desc)`.
- A tabela nova `leituras_por_hora` é criada com `orgScoped()` e o isolamento, com a chave estrangeira do ativo com o `org_id`, e tem as colunas:
  - `ativo_id`, `metrica`, `item` e `hora`;
  - `leituras`, `validas`, `minimo`, `maximo` e `media`;
  - `ultimo` e `ultimo_momento`.

  A chave única é `(org_id, ativo_id, metrica, item, hora)`.

A mesma migration acrescenta o tipo Comunidade SNMP aos tipos de segredo.

As leituras do ping continuam com o item vazio, sem migrar nada.

### 3. A capacidade e a configuração no tipo

A configuração da capacidade no tipo é `{"snmp.suprimentos": {"campoDoIp": "<uuid>", "versao": "1" | "2c", "segredoId": "<uuid>" | null}}`. A conferência do domínio cresce com:
- o campo de IP, pelas mesmas regras da disponibilidade;
- a versão, só 1 ou 2c;
- o segredo, que a API confere no banco: ativo e do tipo Comunidade SNMP.

O campo de IP escolhido por qualquer capacidade não sai do tipo nem é inativado, e a recusa diz qual capacidade o usa.

A lista das comunidades para a ficha do tipo é uma rota do catálogo, `GET /catalogo/comunidades-snmp`, com a permissão de administrar o catálogo. Ela devolve só o id e o nome dos segredos ativos do tipo, e vem vazia, com o motivo, quando o módulo Cofre está desligado.

O segredo é conferido só quando a escolha muda, e o já escolhido fica, mesmo inativo, para a edição do resto do tipo continuar:
- a escolha nova pede um segredo ativo do tipo Comunidade SNMP;
- com o Cofre desligado, ela é recusada com "Com o módulo Cofre desligado, a escolha de outra comunidade espera o módulo ser ligado.".

A auditoria do tipo guarda o campo de IP pelo rótulo, a versão e o nome da comunidade, ou "public".

### 4. A comunidade só na memória

A rota de configuração da coleta recebe as chaves do cofre, como as rotas do cofre, e decifra a comunidade de cada tipo uma vez por pedido. A coleta SNMP do alvo leva `{tipo: 'snmp', intervalo: 600, versao, comunidade}`.

No coletor, a configuração fica na memória, como hoje. O lote, a fila em disco, o log e a saúde levam só o ativo, a métrica e o valor. Um teste do coletor confere que nenhum arquivo da fila nem linha do log contém a comunidade.

### 5. A leitura no coletor

O coletor usa o `net-snmp` (dependência nova, só dele), com até 2 s de espera e uma tentativa a mais. Ele lê, por subárvore, o número de série (`43.5.1.1.17`), os suprimentos (`43.11.1.1`), os contadores e as cores dos marcadores (`43.10.2.1.4` e `43.10.2.1.6`), as condições (`25.3.5.1.2`) e as mensagens (`43.18.1.1.8`). No v2c usa o GETBULK; no v1, o GETNEXT.

As leituras SNMP dividem com o ping o limite de 32 leituras ao mesmo tempo. A porta é a 161; a variável `GRAFITE_COLETOR_PORTA_DO_SNMP` muda a porta só para o simulador dos testes.

A interpretação do que a impressora informa fica no domínio (`packages/domain/src/coleta/impressoras.ts`), em funções puras:
- o nível;
- o tipo do suprimento pela descrição, com as palavras do PMG;
- os bits das condições, com os rótulos e as severidades;
- as páginas em preto e branco.

O coletor usa essas funções ao montar as leituras, e a tela, ao mostrar.

### 6. O simulador e as gravações

Os testes do coletor e a ponta a ponta da pilha usam um simulador de agente SNMP v1 e v2c (`apps/collector/test/simulador-snmp.ts`):
- ele responde GET, GETNEXT e GETBULK a partir de uma gravação no formato do snmpsim (`oid|tipo|valor`, em ordem de OID);
- confere a comunidade e não responde a uma comunidade errada, como uma impressora de verdade.

Ele monta e lê as mensagens BER direto, em código próprio, porque o agente do `net-snmp` exige modelar cada tabela do MIB.

As gravações iniciais (`apps/collector/test/gravacoes/`) são três:
- uma laser de uma cor, com a série;
- uma multifuncional colorida, com um suprimento "há suprimento", um de nível desconhecido e uma condição de sem papel;
- uma térmica, sem suprimentos medidos.

Elas são montadas pelo Printer-MIB, com valores como os do parque do PMG, e dizem isso no cabeçalho. O comando `pnpm --filter @grafite/collector gravar -- --ip <ip> --comunidade <c> --saida <arquivo>` lê uma impressora de verdade nas mesmas subárvores e grava a gravação. Assim, as gravações reais entram no lugar das montadas quando houver acesso às impressoras.

### 7. O lote, o estado e a série

`lerLote` passa a conferir as métricas novas, com os limites:
- o item de suprimento e de contador é um número inteiro positivo, em texto;
- o percentual vai de 0 a 100, e acima disso é inconsistente;
- as páginas são inteiras e não negativas, e negativas são inconsistentes;
- as listas de condições e de mensagens vêm em JSON, com até 32 itens de até 200 caracteres.

O lote confere, por métrica, que o ativo é alvo daquela coleta para o coletor: as métricas `snmp.*` e `impressora.*` só valem para os alvos da coleta SNMP. O estado atual é gravado por ativo, métrica e item, com o mesmo upsert condicional do P2a.

**O número de série:** a leitura mais recente de cada ativo no lote é comparada ao campo `serie`. Quando muda e a política de escrita permite (`podeGravar`), a API:
- grava o campo, com o estado `{origem: 'coleta', momento, autorId: null, coletorId, trava}`;
- registra `ativo.alterado` na auditoria, com o ator do sistema "coletor: <nome>", como os comandos no servidor;
- grava o evento `ativos.mudaram`.

O `coletorId` entra no estado do campo para a ficha mostrar "Coleta · <nome do coletor>".

### 8. As colunas, a ordem e o filtro

A coluna coletada do domínio (`ColunaColetada`) ganha o tipo do valor:
- `situacao`, a de hoje, com as opções e o filtro "é qualquer de";
- `numero`, com o filtro "de e até", a ordem pelo número e o sufixo da unidade.

Na API, uma subconsulta no estado atual dá:
- o menor percentual válido entre os itens de `impressora.suprimento`, para a coluna Suprimentos;
- o valor do item 1 de `impressora.contador`, para Total de páginas.

A ordem usa essas subconsultas, como a disponibilidade, com os ativos sem valor no fim.

### 9. Os agregados na manutenção diária

A manutenção agrega numa consulta só, por organização, as horas completas desde a última hora agregada, ou desde a leitura mais antiga quando ainda não há agregado. Ela grava com `on conflict do update`, o que torna a repetição idempotente. O "último valor" é o da leitura válida de maior momento na hora. Depois, ela apaga as leituras com mais de 30 dias e os agregados com mais de 13 meses, em blocos de 10 mil, como já faz.

**Alternativa:** uma tarefa a cada hora. Ela dá agregados mais cedo, mas ninguém os lê antes do P3, e as leituras ficam 30 dias: um dia de atraso não perde nada.

### 10. A tela

- **A ficha do tipo:** a capacidade mostra o campo de IP (a escolha que a disponibilidade já tem), a versão num segmentado e a comunidade numa seleção. A seleção traz "public (padrão)" e as comunidades do cofre, com o aviso quando a escolhida está inativa.
- **A ficha do ativo:** o painel Suprimentos tem a linha da resposta, como a da disponibilidade, a tabela dos suprimentos e os blocos dos contadores, das condições e das mensagens:
  - o nível é sempre texto, com uma barra só ao lado, na cor de destaque, nunca vermelha nem verde;
  - as condições usam o `RotuloDeSituacao`, com "Atenção" ou "Crítico" em texto.
- **A tabela:** as duas colunas mostram o número em fonte mono, a descrição do suprimento ao lado e a idade, como a disponibilidade.
- **Atualização:** a ficha e a tabela relêem a cada 60 s com a aba visível, como já fazem com a disponibilidade, sem evento por leitura.

## Risks / Trade-offs

- **[Cada fabricante responde de um jeito]** → As regras são as do PMG, provadas no parque, e o comando de gravação traz as impressoras reais para os testes.
- **[A série cresce mais]** → São cerca de 12 leituras por impressora a cada 10 minutos. Com 100 impressoras, dão 170 mil por dia, além das 144 mil do ping de 200 ativos. Os índices por item e a retenção em blocos seguram; a partição continua para quando o volume pedir, e os agregados tiram dela as consultas longas.
- **[A comunidade v2c viaja aberta na rede]** → É assim no SNMP v1 e v2c; o cofre guarda a comunidade e só aceita o tipo Comunidade SNMP na escolha do tipo, de modo que uma senha de outro tipo nunca vai para a rede por esse caminho.
- **[O firewall do servidor do coletor]** → A leitura usa uma porta de saída qualquer, e as respostas UDP voltam pelo estado da conexão. O runbook ganha a nota de que o coletor precisa alcançar a 161/UDP das impressoras.

## Migration Plan

- A migration 0027 é aditiva. As leituras e o estado do ping ficam com o item vazio.
- A capacidade nova não muda nenhum tipo sozinha: quem administra o catálogo a liga.
- **Volta:** as colunas e a tabela novas ficam sem uso, e o coletor antigo ignora a coleta `snmp` da configuração.
