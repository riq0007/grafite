## Context

O P3a guarda cada alerta numa linha, com a regra, o ativo ou o coletor, a severidade, quando a condição começou (`observado_em`), quando o alerta abriu, quem o reconheceu e quando, quando terminou e como: "voltou ao normal" ou "a regra deixou de valer". O alerta que termina antes de abrir é apagado pelo motor, e o que abre com o ativo silenciado fica marcado (`aberto_no_silencio`) e não notifica. A lista dos alertas filtra pelo alcance de `alertas.ver`: os ativos dos locais do alcance e, só com a organização inteira, os coletores e os ativos sem local. Nada apaga os alertas resolvidos hoje.

O P3b grava as notificações pelo `notificar`, e o P3c as leva ao e-mail e ao push pela fila. A fila (F2c) tem as tarefas agendadas pelo cron no fuso de São Paulo, as novas tentativas e a manutenção diária das 03:30, que já apaga as leituras, os agregados e as notificações antigas.

## Goals / Non-Goals

**Goals:**
- Os indicadores calculados com as mesmas regras na tela e na avaliação diária, testáveis sem o banco.
- A tela barata de abrir com os alertas de 60 dias de uma organização grande.
- Uma notificação a cada saída da meta, e nenhuma enquanto o indicador continua fora.
- O componente do indicador na biblioteca, para os indicadores do P4, do P5 e do A2 entrarem sem um desenho novo.

**Non-Goals:**
- O período escolhido pela pessoa: são sempre os últimos 30 dias, comparados com os 30 anteriores.
- O histórico das metas: a auditoria guarda cada mudança, e o indicador sempre compara com a meta atual.
- A meta por local ou por tipo de ativo.
- Os indicadores calculados no banco por uma visão materializada.

## Decisions

### 1. O cálculo no domínio, sobre os alertas do período

A API lê, pelo alcance da conta, os alertas que abriram fora do silêncio e que tocam os 60 dias: os que abriram no período ou no anterior, os que terminaram neles e os ainda abertos. Para cada um, ela lê a condição da regra, a severidade, os momentos, quem reconheceu, pelo nome atual da pessoa, e o alvo, com o local. O domínio recebe esses alertas, o momento da consulta e as metas, e devolve os quatro indicadores, com o valor do período, o do anterior, a situação, a base do cálculo e as listas, já ordenadas e cortadas em 20, com quantos ficaram de fora.

A avaliação diária usa a mesma função, com o alcance da organização inteira. Assim, a tela e a notificação nunca discordam.

Alternativa descartada: as medianas e as somas em SQL, com o `percentile_cont`. Seria mais rápido com centenas de milhares de alertas, mas as regras de cada indicador, como cortar a queda no começo do período e deixar de fora o Crítico que se resolveu sozinho, ficariam presas a consultas, testadas só com o banco. Os alertas de 60 dias de uma organização ficam na casa dos milhares, e o índice novo pelo momento de abertura limita a leitura.

### 2. As unidades das metas

A meta fica num inteiro, na unidade do indicador:
- os tempos, em minutos: o toner com 2.880 (2 dias), de 60 a 43.200; o Crítico com 30, de 1 a 1.440;
- a disponibilidade, em décimos de ponto percentual: 990 (99%), de 900 a 999;
- os alertas que voltam, em vezes: 3, de 2 a 20.

O domínio diz a unidade, a meta de fábrica e os limites de cada indicador, confere a meta com a mensagem da spec e escreve a meta em texto, como "2 dias" ou "99,5%". O formulário da tela escolhe a unidade do tempo, como "dias" ou "horas", e converte para minutos antes de mandar.

### 3. As metas e a situação numa tabela da organização

A tabela `indicadores_da_organizacao` guarda, por organização e indicador, a meta escolhida, quem a mudou e quando, e `fora_da_meta_desde`, a marca da avaliação diária. Sem linha, vale a meta de fábrica, e o indicador nunca foi avaliado. A chave única é a organização com o indicador, e a checagem limita o indicador aos quatro do domínio.

Alternativa descartada: as metas nos padrões da organização, junto das preferências. As preferências são da interface, resolvidas campo a campo sobre as da conta, e a meta não tem escolha da conta; a marca da avaliação também não é uma preferência.

### 4. A avaliação diária pela fila

A tarefa agendada `indicadores-diarios` roda às 07:00 no fuso de São Paulo e põe uma `avaliar-indicadores` por organização, com a chave do dia. Cada uma pula a organização com o módulo Alertas desligado, calcula os indicadores com a organização inteira e, numa transação:
- grava `fora_da_meta_desde` e notifica, quando o indicador está fora da meta e a marca está vazia;
- limpa a marca, quando o indicador está dentro da meta ou sem dado.

A notificação vai, pelo `notificar` com a fila, para as contas ativas com `alertas.administrar`, com o título, a descrição e o endereço que o domínio monta, como `/alertas/indicadores?foco=indicador-toner`. Às 07:00, a notificação de Atenção entra no resumo das 08:00 do P3c no mesmo dia. A tarefa tem as novas tentativas da manutenção, e a que falha em todas aparece em Tarefas com falha.

Alternativa descartada: avaliar a cada mudança de um alerta. A mediana muda a cada alerta que termina, e o indicador entraria e sairia da meta várias vezes num dia, com uma notificação a cada saída. A decisão de um indicador não é de minutos.

### 5. A retenção na manutenção diária

A manutenção de cada organização apaga, depois das notificações, os alertas resolvidos com o fim há mais de 13 meses, em blocos, só os que nenhuma notificação cita. As notificações saem em 90 dias, então, na prática, nenhuma cita um alerta tão antigo; a condição só protege a chave estrangeira. Os 13 meses são os mesmos dos agregados por hora: um ano inteiro de histórico na lista dos resolvidos e na ficha, com um mês de folga.

### 6. As rotas dos indicadores

`GET /alertas/indicadores` responde para quem tem `alertas.ver`, com o período, as metas, os quatro indicadores e se a conta pode mudar a meta. Os valores vão em números, os tempos em minutos e a disponibilidade em décimos de ponto percentual, e a web os escreve com as funções do domínio, as mesmas do título da notificação.

`PUT /alertas/indicadores/{indicador}/meta` recebe a meta na unidade do indicador, exige `alertas.administrar`, confere os limites, registra `meta-de-indicador.alterada` na auditoria, com o "antes → depois" em texto, e grava o evento `alertas.mudaram`, que já atualiza as telas do Alertas. Assim, a tela dos indicadores de quem está com ela aberta se atualiza sem um evento novo. Mudar a meta não mexe na marca da avaliação: a avaliação do dia seguinte compara com a meta nova.

### 7. O indicador na biblioteca e a tela no Alertas

O `Indicador` do `@grafite/ui` mostra o nome, o que mede, o valor ou o motivo sem valor, o anterior, a meta, a situação pelo `RotuloDeSituacao` e a decisão, e recebe a lista e a ação de quem o usa. Ele não sabe de alertas: o P4 e o P5 o usam com os indicadores deles.

A tela `/alertas/indicadores` do módulo Alertas lê a rota com o TanStack Query, sob a chave dos alertas, que o evento `alertas.mudaram` já invalida. Cada indicador fica numa seção com o `data-foco` dele, para o `?foco=` da notificação levar até ele pela casca. As listas usam a tabela base, com a linha que leva à ficha do ativo. "Mudar a meta" abre um diálogo com o número e, nos tempos, a unidade, conferido pelo domínio antes de mandar.

## Risks / Trade-offs

- [Um ativo que pisca abre milhares de alertas] → a leitura de 60 dias cresce com ele, mas o índice limita a leitura ao período, e o indicador dos alertas que voltam aponta justamente esse ativo.
- [A mediana com poucos alertas] → a base do cálculo fica à vista, como "Mediana de 2 trocas", e quem lê sabe o peso do número.
- [A regra muda no meio do período] → o indicador lê os alertas como aconteceram, com a regra de cada momento. A mudança da regra fica na auditoria.
- [A disponibilidade depende da regra de ativo offline] → a queda mais curta que a duração da regra não abre alerta e não entra; sem a regra ativa, o indicador diz que não tem dado, em vez de mostrar 100%.
- [O servidor desligado às 07:00] → a tarefa agendada roda uma vez quando ele volta, como a manutenção.
- [A notificação no ambiente de teste] → ela fica na central do teste; o P3c não manda e-mail nem push no teste.

## Migration Plan

1. A migration cria a tabela dos indicadores da organização, com RLS, e o índice dos alertas pelo momento de abertura. Nenhum dado é copiado.
2. Na primeira avaliação das 07:00 depois da atualização, cada indicador fora da meta notifica uma vez, porque ainda não tem a marca.
3. A primeira manutenção diária apaga os alertas resolvidos há mais de 13 meses, se houver.
4. A volta à versão anterior roda no banco novo: a tabela e o índice ficam sem uso, e os alertas apagados pela retenção não voltam.
