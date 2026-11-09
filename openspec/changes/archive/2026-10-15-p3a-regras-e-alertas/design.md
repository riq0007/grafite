## Context

O P2 deixou o estado atual da coleta em `estado_dos_ativos`: para cada ativo, métrica e item, a leitura mais recente, com a situação (válida, sem dado ou inconsistente), o valor e desde quando a situação e o texto são os mesmos. Os coletores guardam o último contato. A fila de tarefas (pg-boss, F2c) roda tarefas agendadas por cron e põe uma tarefa por organização, como a manutenção diária. A casca já tem a tela "O que resolver agora" com as fontes de ocorrências dos módulos (F1c), as relações nas fichas de outros módulos (relacoes-vivas) e os eventos de saída com o público filtrado por permissão e local (F2c).

O PMG avisa o toner em 10% ou menos e cada alerta válido do equipamento, só na primeira observação ou depois da normalização confirmada, não trata a falta de resposta como normalização e respeita a pausa de cada impressora, sem avisar depois o que aconteceu durante ela.

## Goals / Non-Goals

**Goals:**
- As regras como dados da organização, com as de fábrica, editáveis e auditadas.
- Um motor que abre, atualiza, resolve e encerra os alertas sem duplicar e sem piscar.
- O ciclo do alerta com o reconhecimento, o adiamento e o silêncio do ativo.
- O módulo Alertas, o bloco na ficha do ativo e as ocorrências da tela inicial.
- A avaliação de uma organização com 10 mil ativos em poucos segundos.

**Non-Goals:**
- Os canais: a central gravada no servidor, os avisos, o e-mail, o push e o modo Foco (P3b). O alerta já guarda o que o P3b precisa para não avisar o que abriu no silêncio.
- Os indicadores (P3c) e a limpeza dos alertas resolvidos antigos.
- A avaliação a cada leitura: um minuto de atraso não muda o que a operação faz.

## Decisions

### 1. A divisão do P3

O P3 entra em três changes, nesta ordem:
- **P3a · Regras e alertas:** esta change.
- **P3b · Notificações e canais:** as notificações gravadas no servidor e a central delas, os avisos dos alertas na tela, uma aba só com o aviso, o modo Foco, o e-mail imediato do crítico e o resumo, o push no celular por severidade e a etapa "Conectando alertas".
- **P3c · Indicadores:** os indicadores com uma decisão ligada, com as metas da seção 15 da spec mestre, e a retenção dos alertas resolvidos.

Os canais dependem de haver alertas, e os indicadores, do histórico deles; a ordem segue a dependência.

### 2. As condições no domínio

O `packages/domain/src/alertas/` define as seis condições: a chave, o rótulo, o alvo (ativo ou coletor), a capacidade que a liga no tipo, os parâmetros, se aceita a duração e o escopo. As chaves são estáveis:
- `rede.offline`, a disponibilidade;
- `toner.nivel`, o nível do toner;
- `impressora.condicao`, as condições do equipamento;
- `controlid.situacao`, a saúde do Control iD;
- `coleta.atrasada`, a coleta atrasada;
- `coletor.sem-contato`, o coletor sem contato.

A conferência da regra (`conferirRegra`) devolve as mensagens por campo, e a API e a web usam a mesma. O toner é reconhecido pela mesma regra do painel Suprimentos (`tipoDoSuprimento`), e as condições da impressora vêm do `CONDICOES_DA_IMPRESSORA` do P2b.

Alternativa descartada: condições livres, com a métrica e o operador escolhidos na tela. A folga, o item e o que conta como recuperação mudam de uma condição para outra, e o PMG tem regras de fato específicas, como só o toner.

### 3. As tabelas

- **`regras_de_alerta`:**
  - o nome e o nome normalizado, único na organização;
  - a condição e os parâmetros, em JSONB, com até 2 KB;
  - a duração em minutos, a severidade, o escopo e o id dele (nulo na organização inteira) e a situação;
  - a chave da regra de fábrica, única na organização, ou nula;
  - quem criou e os momentos.
- **`alertas`:**
  - a regra, o ativo ou o coletor (exatamente um) e o item;
  - a situação: `pendente`, `aberto` ou `resolvido`;
  - a severidade e o texto (até 200 caracteres), copiados da regra e do valor a cada avaliação;
  - quando foi visto pela primeira vez, quando abriu e quando terminou, e como terminou: `voltou-ao-normal` ou `regra-deixou-de-valer`;
  - quem reconheceu e quando, até quando está adiado e quem adiou;
  - se abriu com o ativo silenciado (para o P3b).
  - Um índice único parcial sobre a regra, o alvo e o item, sem os resolvidos, garante que nunca há dois iguais abertos.
- **`silencios_dos_ativos`:** o ativo (único), até quando (nulo é até alguém retomar), o motivo, quem silenciou e quando.

As três são criadas com `orgScoped()` e RLS forçado. O alerta pendente é a condição vista que ainda não durou a duração da regra: ele não aparece em nenhuma lista, e a condição que some o apaga.

### 4. As regras de fábrica

O `REGRAS_DE_FABRICA` do domínio dá cada regra com uma chave estável, como `toner-10`. A API garante as regras de fábrica de uma organização inserindo as que faltam pela chave, sem tocar nas que existem, com a auditoria do sistema ("regras de fábrica"). Ela roda:
- no comando que cria a organização, para as regras existirem desde o começo;
- no começo de cada avaliação, o que cria as regras nas organizações que já existiam, e uma regra de fábrica nova numa versão futura, sem migration de dados.

Como a regra nunca é apagada (só inativada), a regra que existe nunca volta à de fábrica.

### 5. O motor

- **A tarefa agendada:** a `alertas-a-cada-minuto` (cron `* * * * *`) põe uma `avaliar-alertas` para cada organização, com a chave da organização e do minuto, e a avaliação pula a organização com o módulo Alertas desligado. A agenda entra na partida do servidor, como as tarefas do servidor: os testes ligam a fila sem ela, para nenhuma avaliação rodar sozinha. A falha de uma avaliação vai só para o log, e a do minuto seguinte tenta de novo. A mudança de uma regra também põe uma avaliação, na transação dela, para a mudança valer logo.
- **A avaliação de uma organização** roda numa transação, com o trinco de aviso da organização (`pg_advisory_xact_lock`), para duas avaliações dela não se cruzarem:
  1. garante as regras de fábrica;
  2. tira os adiamentos vencidos e apaga os silêncios vencidos;
  3. para cada regra ativa, lê as observações da condição;
  4. decide cada alvo e item;
  5. grava as mudanças e, se algo que a tela mostra mudou, um evento `alertas.mudaram`.
- **As observações** de cada condição vêm de uma consulta só ao estado atual, com o escopo da regra, os ativos ativos dos tipos com a capacidade e o módulo Ativos ligado:
  - as linhas que disparam pelo SQL, como o nível no limite ou abaixo ou o texto offline;
  - as linhas dos alertas não resolvidos da regra, para conferir a recuperação.

  A Coleta atrasada usa os alvos da coleta do P2 (`alvosDaColeta`) e o último contato dos coletores; o Coletor sem contato lê os coletores.
- **A decisão** é pura e mora no domínio (`decidirAlerta`). Ela recebe o alerta que existe (ou nenhum), a observação (dispara, normal, sem dado ou fora da regra), a regra, o silêncio do ativo e o momento, e devolve:
  - para criar: o pendente ou, sem duração, o aberto;
  - para manter ou atualizar: o texto, a severidade e a abertura quando a duração passa;
  - para resolver: voltou ao normal;
  - para encerrar: a regra deixou de valer;
  - para descartar o pendente.

  Os testes do domínio cobrem cada combinação, e os da API, a leitura do banco.

Alternativa descartada: avaliar no lote da coleta. A Coleta atrasada e o Coletor sem contato dependem do tempo que passa sem leitura, então a avaliação periódica seria necessária de qualquer forma; com ela, o lote continua só gravando.

### 6. A recuperação e a folga

A observação "normal" exige uma leitura válida além da folga: no toner, o nível acima do limite mais a folga; nas outras, a leitura válida sem a condição. A leitura sem dado, a inconsistente e o nível dentro da folga mantêm o alerta como está. A Coleta atrasada se recupera pela leitura nova, e o Coletor sem contato, pelo contato.

### 7. O texto e a severidade

O texto vem de `textoDoAlerta(condicao, item, valor, detalhes)`, no domínio. O motor grava o texto e a severidade a cada avaliação, e só conta como mudança, para o evento, o texto ou a severidade diferente. A lista ordena pelo texto gravado.

### 8. O escopo e a visibilidade

- **O escopo da regra** vira um filtro do SQL:
  - o tipo, o modelo ou o ativo pelo id;
  - o local pelos ids dele e dos locais de baixo, tirados da árvore dos locais.
- **Quem vê:** a lista e a ficha filtram os alertas dos ativos pelo escopo de `alertas.ver` da conta, como a lista dos ativos filtra pelo de `ativos.ver`. O alerta de um coletor só aparece com `alertas.ver` na organização inteira.
- **Quem trata:** reconhecer, adiar e silenciar conferem `alertas.tratar` no local do ativo, e na organização inteira no alerta de um coletor.

### 9. O evento

O tipo `alertas.mudaram` entra no domínio, com o público por `alertas.ver` e os locais dos ativos dos alertas que mudaram. O alerta de um coletor e o ativo sem local entram como o registro sem local, que só a organização inteira alcança. As ações auditadas (a regra, o reconhecimento, o adiamento e o silêncio) gravam o mesmo evento pelo mapa das ações. A avaliação grava um evento só por organização, sem alvo, quando algo que a tela mostra mudou.

### 10. A API

- **Os alertas:**
  - `GET /api/alertas`, com a situação (abertos ou resolvidos), a severidade, a regra, o ativo, o "para resolver" (sem os adiados e sem os dos ativos silenciados), a ordem e o cursor;
  - `POST /api/alertas/:id/reconhecimento` e `POST /api/alertas/:id/adiamento`, com os minutos: 15, 30 ou 60.
- **O silêncio:** `GET`, `PUT` e `DELETE /api/ativos/:id/silencio`.
- **As regras:**
  - `GET` e `POST /api/regras-de-alerta`;
  - `PATCH /api/regras-de-alerta/:id`;
  - `POST /api/regras-de-alerta/:id/inativacao` e `.../reativacao`.

As rotas exigem o módulo Alertas ligado. Cada item da lista traz:
- o alvo: o ativo, com o rótulo, o patrimônio, o tipo e as imagens, ou o coletor;
- o texto, a severidade, a regra e as datas;
- o reconhecimento, o adiamento e o silêncio do ativo;
- o `permite.tratar`.

### 11. A web

- **O módulo `alertas`** fica no registro, com as rotas:
  - `/alertas`: os abertos;
  - `/alertas/resolvidos`;
  - `/alertas/regras`, `/alertas/regras/nova` e `/alertas/regras/$regraId`.

  As listas usam a tabela base do `@grafite/ui`, como a tela inicial.
- **O bloco da ficha** entra por uma relação com o alvo novo `ativo` no contrato de módulo, que a ficha do ativo mostra pelo `RelacoesDaFicha`, como as outras fichas.
- **A fonte de ocorrências:**
  - lê os alertas para resolver, até 500, que é o teto da tela inicial;
  - assina o evento `alertas.mudaram` pelo canal de eventos da casca.

### 12. As permissões e o módulo

- `alertas.ver`: local, pelo local do ativo.
- `alertas.tratar`: local, inclui `alertas.ver`.
- `alertas.administrar`: organização, inclui `alertas.ver`.

O Administrador as recebe sozinho. O Alertas entra nos módulos opcionais, ligado de fábrica.

## Risks / Trade-offs

- **[A avaliação de uma organização grande demora]** → as consultas trazem só o que dispara e o que tem alerta não resolvido, e o teste de desempenho avalia 10 mil ativos, com 2 mil impressoras, abaixo de 2 s.
- **[Um alerta a cada minuto de atraso]** → a duração das regras de fábrica é de minutos, e o PMG coleta a cada 10; o atraso não muda a operação.
- **[Muitos alertas abertos de uma vez, como um prédio sem energia]** → cada ativo offline abre o seu, e a tela inicial lista até 500; a regra por local com a severidade certa e o silêncio cobrem a manutenção programada. A correlação fica para depois.
- **[Os alertas resolvidos crescem sem limpeza]** → cada alerta é uma linha pequena, e o P3c decide a retenção junto dos indicadores que leem o histórico.
- **[Uma regra de fábrica nova numa versão futura surpreende quem administra]** → ela entra ativa, com a auditoria do sistema, e pode ser inativada; a nota da versão a anuncia.
