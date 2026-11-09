## Why

O Operação já guarda o que a TI faz: as ordens de serviço da P4e, com o histórico das situações, e as saídas do estoque da P4c, com o total de páginas lido na hora da troca do toner. Ninguém vê, porém, se a TI está dando conta: quanto tempo um ativo fica parado até a OS ser resolvida, que ativo volta a quebrar e que toner rende menos do que devia. A spec mestre adiou essas metas para cá (seção 15).

A P4f · Indicadores da operação é a última change do P4 (spec mestre, seção 3.2): o tempo de resolução das OS, as OS repetidas e as páginas por toner, com as metas, como os indicadores dos alertas do P3d. Em 22/10, o usuário escolheu:
- **onde e quem decide:** uma tela "Indicadores" no Operação, e uma permissão nova, `operacao.administrar`, que muda as metas e recebe o aviso de fora da meta, como o `alertas.administrar` do P3d;
- **o tempo de resolução:** da abertura à resolução, com a espera pela peça e pelo fornecedor dentro, que é o tempo em que o ativo ficou parado;
- **as OS repetidas:** os ativos com várias OS abertas no período, como os alertas que voltam;
- **as páginas por toner:** os toners trocados no período que renderam menos que a meta, em porcentagem do rendimento do consumível.

## What Changes

- **Três indicadores da operação**, calculados nos últimos 30 dias e comparados com os 30 anteriores, como os dos alertas:
  - **Tempo de resolução das OS:** a mediana da abertura à resolução das OS resolvidas no período, com a lista das em aberto há mais que a meta e das resolvidas depois dela, e quanto de cada uma foi espera pela peça ou pelo fornecedor. Meta de fábrica: 3 dias;
  - **OS repetidas:** os ativos com a quantidade de OS da meta ou mais, abertas no período, com as OS de cada um. Meta de fábrica: 2 OS;
  - **Páginas por toner:** as páginas de cada toner trocado no período, pela diferença do total de páginas entre a saída dele e a seguinte da mesma cor para a mesma impressora, em porcentagem do rendimento do consumível; o indicador conta e lista os que ficaram abaixo da meta. Meta de fábrica: 80%.
- **A situação e a decisão:** cada indicador mostra a meta, "Dentro da meta", "Fora da meta" ou "Sem dado", em texto, e, fora da meta, o que fazer.
- **As metas da organização:** quem tem `operacao.administrar` muda cada meta, dentro dos limites, pela tela; a mudança vai para a auditoria e atualiza a tela aberta dos outros.
- **O aviso:** a avaliação diária das 07:00, nas organizações com o Operação ligado, notifica quem tem `operacao.administrar` quando um indicador sai da meta, uma vez a cada saída.
- **A tela "Indicadores" no Operação:** os indicadores das OS para quem vê as OS e o das páginas para quem vê o estoque, calculados com o que a conta vê, com a lista de cada um levando à OS ou ao ativo; também na busca.
- **Permissão** `operacao.administrar`, na organização inteira, que inclui `ordens.ver` e `estoque.ver`.
- **Evento:** a meta de qualquer indicador, dos alertas ou da operação, passa a sair no evento novo `metas.mudaram`, para quem vê aquele indicador.
- **Banco:** a migration 0040 aceita os três indicadores novos na tabela das metas da organização, do P3d.

**Fora desta change:**
- o tempo de atendimento das solicitações, que a P4d deixou para os indicadores: o conserto já é medido pela OS dele, e o toner, pelo tempo de atendimento do toner do P3d;
- a notificação e a ocorrência no Início da OS parada: a OS em aberto há mais que a meta aparece na lista do tempo de resolução;
- as páginas em preto e branco e em cores de cada impressora, porque a coleta da P2b traz só o total: o toner de cor conta pelo total de páginas;
- o toner entregue pelo fornecedor, que não passa pelo estoque e não tem o total de páginas da troca;
- outros períodos além dos últimos 30 dias e os gráficos de tendência;
- os indicadores dos backups do Control iD e da revisão de acessos, que a seção 15 deixa para o P5 e o A2.

## Capabilities

### New Capabilities

- `indicadores-da-operacao`: o tempo de resolução das OS, as OS repetidas e as páginas por toner, com o período, a situação, a decisão, as metas da organização, quem vê, a tela e o aviso de fora da meta.

### Modified Capabilities

- `modulo-operacao`:
  - "Operação no dock" ganha "Indicadores" no menu e na busca, também para quem tem `operacao.administrar`;
  - a atualização pelos eventos ganha a tela dos indicadores, relida pelas OS, pelo estoque, pelos consumíveis e pelas metas.
- `permissoes`: `operacao.administrar` no catálogo.
- `eventos-em-tempo-real`: o evento `metas.mudaram`, que leva a meta mudada de qualquer indicador no lugar do `alertas.mudaram`.
- `auditoria`: a meta dos indicadores da operação registrada como a dos alertas.
- `modulos-da-organizacao`: a descrição do Operação, com os indicadores.

## Impact

- **Domínio (`packages/domain`):** os três indicadores, com as definições, as metas, os limites, as unidades e as decisões; o cálculo de cada um, puro, para a tela e a avaliação diária; os textos e a notificação; a permissão e o evento.
- **Banco (`packages/db`):** a migration 0040, com os indicadores novos na verificação da tabela `indicadores_da_organizacao`.
- **API (`apps/api`):** a leitura dos indicadores no escopo do Operação, pelas OS e pelas saídas que a conta vê; a mudança da meta; a avaliação diária com os indicadores da operação; o evento da meta dos alertas no tipo novo; o contrato e o cliente gerados de novo.
- **Web (`apps/web`):** a tela dos indicadores do Operação, no menu e na busca, com "Mudar a meta" e o foco pelo endereço; o Alertas relendo os indicadores pelo evento novo.
- **Documentação:** a spec mestre (seções 3.2, 7.6 e 15), o runbook ("A versão com os indicadores da operação"), o contrato de módulo e o mapa.
- **Depois da atualização:** quem administra dá `operacao.administrar` a quem decide a operação da TI, como quem cuida dela.
