## Context

O motivo está em `proposal.md`. O P2c parte do P2b implementado:

- **A coleta** tem o caminho completo: a configuração dos alvos, o agendador com até 32 leituras ao mesmo tempo, o lote, a fila em disco, a série e o estado atual por ativo, métrica e item, com os detalhes. A coleta SNMP já leva um segredo decifrado ao coletor, só na memória.
- **O número de série** lido pela coleta já grava o campo `serie` com a origem "coleta", a trava respeitada e a auditoria pelo coletor.
- **A tabela** tem a coluna coletada de situação (a disponibilidade) e a numérica (os suprimentos).
- **O cofre (P6)** guarda os segredos com o identificador, que é o usuário, e os vínculos com os ativos (`segredos_dos_ativos`).
- **O PMG** fala com os controles pelo HTTP, em `http://<ip>:<porta>`, com pedidos `POST` em JSON (`src/lib/controlid-client.ts`):
  - `login.fcgi`, com `{login, password}`, devolve `{session}`;
  - `system_information.fcgi?session=<sessão>` devolve as informações do sistema, como `serial`, `firmware` e `product_name`;
  - `logout.fcgi?session=<sessão>` encerra a sessão.

  Cada pedido espera até 10 s, com uma tentativa a mais depois de 1 s. A sondagem de presença não entra na auditoria (spec `controlid-dispositivos` do PMG).

## Goals / Non-Goals

**Goals:**
- A sondagem pelo mesmo caminho do ping e do SNMP, sem uma via paralela.
- Distinguir o controle desligado do que recusa a senha e do endereço errado, que pedem ações diferentes de quem atende.
- O login nunca fora da memória do coletor, e a sessão do controle sempre encerrada.

**Non-Goals:**
- O teste na hora, o HTTPS, a porta por controle, os alertas e o backup (proposta, "Ficam fora").
- Ler mais do controle do que a saúde pede, como os usuários, os cartões e os registros de acesso (P5).

## Decisions

### 1. As métricas da sondagem

| Métrica | Quando | Valor | Detalhes |
|---|---|---|---|
| `controlid.sondagem` | toda sondagem | `respondendo`, `login-recusado`, `sem-resposta` ou `resposta-inesperada`, em texto | na resposta inesperada, a etapa (`login` ou `informacoes`) e o código HTTP, quando houver |
| `controlid.firmware` | só respondendo | a versão do firmware, ou nenhum valor quando o controle não a informa | o produto, quando informado |
| `controlid.serie` | só respondendo, com a série informada | o número de série | — |

O item é vazio nas três. A sondagem que não pôde ser feita vai como `controlid.sondagem` sem dado.

**O último contato** é o momento do estado de `controlid.firmware`, que só muda quando o controle responde: a ficha e a tabela o leem do estado atual, sem consultar a série (spec leituras-e-estado, "Estado atual").

**Alternativa:** o firmware nos detalhes da `controlid.sondagem`. A sondagem sem resposta trocaria o estado e apagaria o firmware e o último contato da tela.

### 2. A capacidade e a configuração no tipo

A configuração no tipo é `{"controlid.saude": {"campoDoIp": "<uuid>", "porta": 80, "segredoId": "<uuid>"}}`. A conferência do domínio cresce com:
- o campo de IP, pelas regras da disponibilidade, preso ao tipo enquanto a capacidade estiver ligada;
- a porta, inteira de 1 a 65535;
- o segredo, obrigatório no domínio, que a API confere no banco: ativo, do tipo `usuario-e-senha` ou `conta-administrativa`, com o identificador preenchido.

A lista dos logins para a ficha do tipo é `GET /catalogo/logins-do-control-id`, com a permissão de administrar o catálogo, como a das comunidades do P2b. Ela devolve só o id e o nome, e vem vazia, com o motivo, quando o módulo Cofre está desligado.

### 3. O login de cada controle

A API escolhe o login na configuração da coleta, numa consulta:
- os segredos ativos dos dois tipos, com o identificador, ligados a cada controle em `segredos_dos_ativos`;
- um só ligado: ele vale;
- nenhum: vale o do tipo, se ativo;
- dois ou mais, ou o do tipo inativo sem nenhum ligado: o controle fica fora da configuração, com o motivo.

A regra é uma função pura do domínio (`coleta/control-id.ts`, `loginDoControle`), que a configuração, a ficha e a tabela usam. Assim, o motivo do "Não verificado" é o mesmo nas três.

A rota de configuração decifra cada segredo uma vez por pedido, com as chaves do cofre, como no P2b. A coleta do alvo leva `{tipo: 'controlid', intervalo: 300, porta, usuario, senha}`.

**Alternativa:** o login só no tipo. Ela é mais simples, mas a organização com um controle de senha própria teria de criar um tipo só para ele. O PMG guarda o login em cada controle, e a virada (P8) leva cada login diferente para um segredo ligado ao controle.

### 4. A sondagem no coletor

A sondagem usa o `fetch` do Node, sem dependência nova, com o `AbortController` para os 10 s. Cada pedido tem uma tentativa a mais, depois de 1 s.

A classificação:
- **login recusado:** o `login.fcgi` responde 401 ou 403, ou responde 200 sem a `session`;
- **resposta inesperada:** um código diferente desses no `login.fcgi` ou no `system_information.fcgi`, ou um corpo que não é JSON;
- **sem resposta:** o tempo esgotado, a conexão recusada ou a rede inalcançável, depois da tentativa a mais;
- **respondendo:** o `system_information.fcgi` responde 200 com JSON.

O `logout.fcgi` vai no `finally` sempre que houve sessão, sem tentativa a mais, e a falha dele não muda a leitura.

**As informações do sistema:** a versão do firmware é o primeiro texto entre `firmware` e `version`; o produto, o `product_name`; a série, o `serial`. O que não vier fica vazio, sem inventar valor.

A sondagem divide com o ping e o SNMP o limite de 32 leituras ao mesmo tempo. O pior caso, com os três pedidos esgotando o tempo duas vezes, ocupa uma vaga por cerca de 1 minuto, dentro do intervalo de 5.

O lote, a fila em disco, o log e a saúde levam só o ativo, a métrica e o valor. Um teste do coletor confere que nenhum arquivo da fila nem linha do log contém o usuário ou a senha.

### 5. O simulador e a gravação

Os testes do coletor e a ponta a ponta da pilha usam um simulador da API do Control iD (`apps/collector/test/simulador-control-id.ts`), um servidor HTTP do Node numa porta livre, com os modos:
- `aceita`, que dá a sessão e as informações de uma gravação;
- `recusa`, com 401;
- `sem-sessao`, com 200 sem a `session`;
- `cala`, que não responde;
- `outro`, que responde 404 a tudo, como uma impressora.

Ele guarda as sessões abertas, para o teste conferir que cada sondagem sai da sua.

As gravações (`apps/collector/test/gravacoes/control-id/`) são as respostas do `system_information.fcgi`, montadas pelos campos que o PMG lê e marcadas assim no cabeçalho. O comando `pnpm --filter @grafite/collector gravar-control-id -- --ip <ip> --porta <p> --usuario <u> --saida <arquivo>` lê um controle de verdade, com a senha pela variável `GRAFITE_SENHA_DO_CONTROLE`, para ela não ficar no histórico do terminal. Ele grava a resposta sem a sessão, e a gravação real entra no lugar da montada quando houver acesso aos controles.

### 6. O lote, a série e o estado

`lerLote` passa a conferir as métricas novas:
- a situação da sondagem só entre as quatro;
- o firmware e o produto com até 100 caracteres;
- a série com até 100 caracteres.

O lote confere, por métrica, que o ativo é alvo da coleta `controlid` daquele coletor. A gravação do número de série do P2b passa a valer para as métricas de série, `impressora.serie` e `controlid.serie`, com a mesma comparação, a mesma trava e a mesma auditoria.

### 7. A coluna, a ordem e o filtro

A coluna coletada Control iD é de situação, como a disponibilidade, com as opções Respondendo, Login recusado, Sem resposta, Resposta inesperada, Sem dado e Não verificado. A ordem crescente põe primeiro Sem resposta, depois Login recusado, Resposta inesperada, Sem dado, Respondendo e Não verificado, e, na mesma situação, a sondagem mais antiga. O "Não verificado" e o motivo dele vêm da mesma conta da disponibilidade, mais o login (decisão 3).

### 8. A tela

- **A ficha do tipo:** a capacidade mostra o campo de IP, a porta num campo numérico e o login numa seleção com os nomes do cofre, e o aviso "O login escolhido está inativo: os controles sem login próprio não são sondados." quando é o caso.
- **A ficha do ativo:** o grupo "Saúde do Control iD" tem a linha da situação, como a da disponibilidade, com o `RotuloDeSituacao`, desde quando e a idade, e abaixo:
  - "Último contato", com a hora e a idade;
  - "Firmware", com o produto ao lado;
  - "Login do tipo" ou "Login próprio do controle";
  - o coletor.
- **A tabela:** a coluna Control iD mostra a situação, com o ícone e o texto, e a idade, como a disponibilidade.
- **Atualização:** a ficha e a tabela relêem a cada 60 s com a aba visível, como já fazem, sem evento por leitura.

## Risks / Trade-offs

- **[O login viaja aberto na rede]** → É o que o PMG faz hoje, e o HTTPS dos controles fica para depois. O runbook recomenda manter os controles e o coletor numa rede só da TI, e o cofre guarda o login só para isso.
- **[O controle tem poucas sessões]** → A sondagem sai sempre da sessão, e o intervalo de 5 minutos deixa folga para o uso da portaria e o backup do P5.
- **[A senha errada tentada a cada 5 minutos]** → O controle não bloqueia a conta por tentativas, e o "Login recusado" pede a troca do segredo; a sondagem continua para mostrar quando ele voltar a aceitar.
- **[Cada modelo responde de um jeito]** → A leitura aceita os dois nomes do firmware e deixa vazio o que não vier, e o comando de gravação traz as respostas reais para os testes.
- **[O firewall do servidor do coletor]** → O runbook ganha a nota de que o coletor precisa alcançar a porta HTTP dos controles, a 80 por padrão.

## Migration Plan

- Sem migration: as leituras usam o item e os detalhes da migration 0027 do P2b.
- A capacidade nova não muda nenhum tipo sozinha: quem administra o catálogo a liga.
- **Volta:** o coletor antigo ignora a coleta `controlid` da configuração, e as leituras dela ficam sem uso.
