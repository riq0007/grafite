## Context

A motivação está na proposta. O P3d deixou as peças dos indicadores:
- **Domínio:** as definições (o nome, o que mede, a unidade, a meta de fábrica, os limites e a decisão), o cálculo puro sobre os alertas do período e os textos, os mesmos da tela e da notificação (`packages/domain/src/indicadores`).
- **Banco:** a tabela `indicadores_da_organizacao`, com a meta escolhida, quem a mudou e a marca `fora_da_meta_desde` da avaliação diária, com a checagem dos quatro indicadores dos alertas.
- **API:** `GET /alertas/indicadores` e `PUT /alertas/indicadores/{indicador}/meta`, e a avaliação diária, a `indicadores-diarios` das 07:00 com uma `avaliar-indicadores` por organização, que notifica quem tem `alertas.administrar`.
- **Web:** o `Indicador` do `@grafite/ui` e a tela do Alertas, com o diálogo "Mudar a meta" (`apps/web/src/modulos/alertas/MudarAMeta.tsx` e `metas.ts`).

Os dados já estão gravados:
- **As OS (P4e):** o momento da abertura e o da última resolução, que a reabertura limpa, o motivo do encerramento sem resolver, o local da OS e o histórico das situações, que só cresce, com o momento de cada mudança.
- **As saídas do estoque (P4c):** o ativo, o consumível, a quantidade, a origem, o momento e o total de páginas lido na transação da saída, com o momento da leitura, quando a impressora tinha a leitura válida. As movimentações têm o índice pelo ativo e pelo momento.
- **Os consumíveis (P4b):** o tipo, a cor e o rendimento em páginas.

## Goals / Non-Goals

**Goals:**
- Os três indicadores com as peças do P3d: o cálculo puro no domínio, as metas na mesma tabela, a mesma avaliação diária e o mesmo componente.
- A tela e a notificação calculadas pela mesma função, com o alcance da conta na tela e o da organização inteira na avaliação.
- A leitura das saídas limitada aos 60 dias e à saída anterior de cada impressora em cada cor.

**Non-Goals:**
- O período escolhido pela pessoa, o histórico das metas e a meta por local, como no P3d.
- Corrigir as páginas do toner de cor: a coleta da P2b traz só o total.
- Os indicadores no banco, por uma visão materializada.

## Decisions

### 1. O cálculo no domínio, sobre as OS e as saídas do período

A API lê, pelo alcance da conta:
- **as OS que tocam os 60 dias:** as abertas no período ou no anterior, as resolvidas neles e as ainda em aberto, com o histórico de cada uma, o ativo e o local;
- **as saídas de toner:** as feitas nos 60 dias para um ativo e, para cada impressora e cada cor delas, a última saída antes dos 60 dias, que abre a vida do primeiro toner trocado no período.

O domínio recebe isso, o momento da consulta e as metas, e devolve os três indicadores com o valor do período, o do anterior, a situação, a base do cálculo e as listas, já ordenadas e cortadas em 20, com quantos ficaram de fora. A avaliação diária usa a mesma função, com a organização inteira.

**Alternativa descartada:** as medianas e as diferenças em SQL. As regras de cada indicador, como a OS encerrada sem resolver que não entra e a saída de dois toners que não mede nada, ficariam presas a consultas, testadas só com o banco.

### 2. As páginas de um toner

A vida de um toner vai da saída dele para a impressora até a saída seguinte de um toner da mesma cor para a mesma impressora, na ordem do momento e do identificador. A chave é a impressora com a cor do consumível, ou com o próprio consumível quando ele não tem cor. Assim, o compatível que entra no lugar do original fecha a vida do original.

O toner entra no indicador quando:
- a saída seguinte, a troca, está no período;
- o consumível da saída dele é do tipo Toner e tem o rendimento;
- as duas saídas têm o total de páginas, e o da troca não é menor;
- a saída dele levou um toner só.

As páginas são a diferença dos dois totais, comparadas com o rendimento do consumível da saída dele. A porcentagem fica em décimos de ponto, como a disponibilidade, e é escrita pela mesma função, como "61,7%".

No alcance da conta, o toner entra pela troca: a conta vê a saída que o trocou, pelo local de origem. Da saída anterior só entram o total de páginas e o consumível, qualquer que seja o local dela.

**Alternativa descartada:** a vida pelo mesmo consumível, e não pela cor. O compatível que substitui o original deixaria o original sem troca, e a vida dele iria até a volta do original, somando dois toners.

### 3. A espera de uma OS

A espera é a soma dos intervalos do histórico em Aguardando peça e em Aguardando fornecedor: cada intervalo vai da mudança para a situação até a mudança seguinte, ou até a resolução, ou até o momento da consulta na OS em aberto. O domínio a separa em peça e fornecedor, para o texto "1 dia esperando a peça e 4 dias esperando o fornecedor".

A OS reaberta conta da abertura até a última resolução, com todas as esperas do caminho: é o tempo em que o ativo ficou sem o conserto. A OS sem resolução, encerrada sem resolver, fica fora; a encerrada depois de resolvida entra pela resolução.

### 4. As unidades das metas

A meta fica num inteiro, na unidade do indicador, como no P3d:
- o tempo de resolução, em minutos: 4.320 (3 dias), de 60 a 43.200;
- as OS repetidas, numa unidade nova, a quantidade de OS: 2, de 2 a 10, escrita "2 OS";
- as páginas por toner, em décimos de ponto percentual, como a disponibilidade: 800 (80%), de 500 a 1.000.

O formulário escolhe a unidade do tempo, como na tela do Alertas, e converte antes de mandar.

### 5. Dois grupos de indicadores, na mesma tabela das metas

O domínio separa os indicadores dos alertas, os quatro do P3d, dos da operação, `resolucao-das-os`, `os-repetidas` e `paginas-por-toner`, e cada rota aceita só os do grupo dela. A tabela `indicadores_da_organizacao` guarda os dois grupos, com a checagem dos sete pela migration 0040, que cria também o índice das OS pela resolução, para a leitura das resolvidas no período. A auditoria usa a mesma ação, `meta-de-indicador.alterada`, com o nome do indicador nos dados.

**Alternativa descartada:** uma tabela das metas da operação. A meta, a marca da avaliação e a auditoria são as mesmas; duas tabelas dobrariam a leitura das metas e a avaliação.

### 6. O evento `metas.mudaram`

A meta de qualquer indicador passa a gravar o evento novo `metas.mudaram`, com o público de quem vê aquele indicador: `alertas.ver` nos dos alertas, `ordens.ver` no tempo de resolução e nas OS repetidas, `estoque.ver` nas páginas por toner. O Alertas e o Operação ligam o evento à chave dos indicadores de cada um. A ação da auditoria deixa de gravar o `alertas.mudaram`.

**Alternativas descartadas:**
- o `alertas.mudaram` nos dois grupos: quem vê só as OS não recebe os eventos dos alertas, e a tela dele não se atualizaria;
- o `ordens.mudaram` e o `estoque.mudou` nos indicadores da operação: o evento é de cada ação da auditoria, e seriam duas ações para a mesma mudança, com a meta do toner passando por um evento do estoque.

### 7. A permissão `operacao.administrar`

A permissão vale na organização inteira e inclui `ordens.ver` e `estoque.ver`: quem decide a operação vê as OS e o estoque de todos os locais, como `alertas.administrar` inclui `alertas.ver`. Ela entra no catálogo na área "Operação", e o Administrador a ganha sozinho.

### 8. A avaliação diária com os dois grupos

A `avaliar-indicadores` de cada organização avalia cada grupo com o módulo dele ligado: os dos alertas com o Alertas, os da operação com o Operação. Cada grupo marca e limpa os indicadores dele na mesma tabela, pela mesma regra, e notifica as contas ativas com a permissão dele: `alertas.administrar`, com a origem "Alertas", e `operacao.administrar`, com a origem "Operação", com o endereço `/operacao/indicadores?foco=indicador-<id>`. A notificação de Atenção das 07:00 entra no resumo das 08:00, como a dos alertas.

**Alternativa descartada:** uma tarefa agendada para a operação. As duas rodariam na mesma hora, com a mesma distribuição por organização e a mesma tabela.

### 9. As rotas

`GET /operacao/indicadores`, no escopo do Operação, responde para quem tem `ordens.ver` ou `estoque.ver` em algum escopo, com o período, as metas, os indicadores que a conta vê e se ela pode mudar a meta. O indicador que a conta não vê não vem na resposta. Os valores vão em números, os tempos em minutos e as porcentagens em décimos de ponto, e a web os escreve com as funções do domínio.

`PUT /operacao/indicadores/{indicador}/meta` recebe a meta na unidade do indicador, exige `operacao.administrar`, confere os limites, registra a auditoria e grava o evento `metas.mudaram`.

### 10. A tela no Operação

A tela `/operacao/indicadores` lê a rota com o TanStack Query, sob a chave dos indicadores da operação, que os eventos `ordens.mudaram`, `estoque.mudou`, `consumiveis.mudaram` e `metas.mudaram` invalidam. Cada indicador fica numa seção do `Indicador`, com o `data-foco` dele, e a lista leva à ficha da OS ou do ativo.

"Mudar a meta" sai do Alertas para `apps/web/src/modulos/indicadores/`, com a unidade e a conferência pelo domínio, e cada módulo passa a rota da meta dele. O menu e a busca ganham "Indicadores", no caminho "Operação".

## Risks / Trade-offs

- [O toner de cor conta pelo total de páginas, que inclui as páginas em preto] → ele parece render mais do que rende e raramente fica abaixo da meta; o preto, que imprime todas as páginas, é o que o indicador mede bem. A coleta das páginas por cor fica para quando a P2b as trouxer.
- [O toner entregue pelo fornecedor entre duas saídas] → as páginas somam os dois toners, e o do estoque parece render mais; a entrega pelo fornecedor não tem o total de páginas da troca para fechar a vida.
- [A saída lançada dias depois da troca] → o total é o da hora da saída, e a vida de um toner fica mais longa e a do seguinte, mais curta; a lista mostra as páginas de cada um, para quem confere.
- [Poucas OS resolvidas] → a base fica à vista, como "Mediana de 2 OS resolvidas", e quem lê sabe o peso do número.
- [O evento da meta dos alertas muda de tipo] → a tela dos indicadores do Alertas passa a ouvir o `metas.mudaram`, e os testes dela cobrem a releitura.
- [Quem tem `operacao.administrar` vê as OS e o estoque da organização inteira] → é quem decide a operação; o runbook diz a quem dar a permissão.

## Migration Plan

1. A migration 0040 recria a checagem da tabela dos indicadores com os sete e cria o índice das OS pela resolução. Nenhum dado é copiado.
2. A permissão nova entra no catálogo, e o Administrador a ganha sozinho; o runbook ("A versão com os indicadores da operação") diz a quem dar `operacao.administrar`.
3. Na primeira avaliação das 07:00 depois da atualização, cada indicador da operação fora da meta notifica uma vez, porque ainda não tem a marca.
4. A volta à versão anterior pede o backup de antes da atualização, como nas versões do P4.
