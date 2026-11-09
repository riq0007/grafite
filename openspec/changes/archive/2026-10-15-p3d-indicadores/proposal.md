## Why

O P3a abre e resolve os alertas, e o P3b e o P3c levam cada um a quem cuida dele. Falta dizer se a operação está dando conta: se o toner é trocado a tempo, se os Críticos são vistos, quais ativos caem demais e quais alertas voltam sempre. O PMG mostrava contagens no painel inicial, sem dizer o que fazer com elas. A spec mestre pede o contrário: o indicador só existe com uma decisão ligada a ele (seção 7.6 e ANTISLOP, §5 e §30), e as metas dos indicadores ficaram para o P3 e o P4 (seção 15).

O P3d · Indicadores é a quarta e última change do P3 · Alertas e notificações (spec mestre, seção 3.2). Ele lê o histórico dos alertas, que já existe, e dá a retenção dos alertas resolvidos, que a seção 6.7 ainda não tem.

Ficam fora desta change:
- as páginas por toner, que pedem o rendimento do cartucho, um dado do consumível: vão para o P4, com os consumíveis;
- os indicadores das ordens de serviço (P4), dos backups do Control iD (P5) e da revisão de acessos (A2);
- os gráficos de tendência: nenhuma decisão desta change pede a evolução mês a mês;
- o indicador na tela inicial: "O que resolver agora" continua com as ocorrências, e o indicador fora da meta chega pela notificação;
- a meta por local: a meta é da organização.

## What Changes

- **A tela Indicadores no Alertas,** com os últimos 30 dias comparados aos 30 anteriores, para quem vê os alertas, sobre os alertas que a conta vê. São quatro indicadores, cada um com a meta, a situação em texto e a decisão:
  - **Tempo de atendimento do toner:** a mediana do tempo entre o alerta do toner e a troca, com os toners que esperaram mais que a meta e os que ainda esperam;
  - **Tempo até reconhecer o Crítico:** a mediana do tempo entre o alerta Crítico abrir e alguém o reconhecer, com os que passaram da meta;
  - **Disponibilidade dos ativos:** os ativos que ficaram fora do ar mais do que a meta permite, pelo alerta de ativo offline;
  - **Alertas que voltam:** os ativos em que o mesmo alerta abriu a quantidade de vezes da meta ou mais.
- **As metas da organização,** com as de fábrica (2 dias, 30 minutos, 99% e 3 vezes), mudadas na própria tela por quem administra os alertas, com os limites de cada uma e a auditoria.
- **O indicador fora da meta avisa:** uma avaliação por dia, às 7h, notifica quem administra os alertas quando um indicador da organização sai da meta, uma vez a cada saída. A notificação segue pelos canais do P3b e do P3c.
- **A retenção dos alertas resolvidos:** 13 meses depois do fim, apagados pela manutenção diária.

## Capabilities

### New Capabilities

- `indicadores`: os indicadores dos alertas, com o período, a comparação, as metas da organização, a situação, quem os vê, a tela e o aviso do indicador fora da meta.

### Modified Capabilities

- `alertas`: a retenção dos alertas resolvidos.
- `modulo-alertas`: o item Indicadores no menu do Alertas e na busca.
- `fila-de-tarefas`: a manutenção diária apaga os alertas resolvidos há mais de 13 meses.
- `auditoria`: a mudança da meta de um indicador registrada.
- `eventos-em-tempo-real`: o evento `alertas.mudaram` também na mudança da meta de um indicador.
- `permissoes`: a descrição de `alertas.administrar` inclui as metas dos indicadores.
- `componentes-base`: o indicador com meta e decisão na biblioteca, para os indicadores do P3 e dos subprojetos seguintes.

## Impact

- **`packages/domain`:** os indicadores, com as metas de fábrica e os limites, o cálculo de cada um sobre os alertas do período, a situação e o texto dos valores e da notificação.
- **`packages/db`:** a tabela das metas e da situação dos indicadores de cada organização, com RLS, e o índice dos alertas pelo momento em que abriram, na migration.
- **`apps/api`:**
  - `GET /alertas/indicadores` e `PUT /alertas/indicadores/{indicador}/meta`;
  - a avaliação diária pela fila, com a notificação;
  - a retenção na manutenção diária;
  - o contrato e o cliente gerados de novo.
- **`packages/ui`:** o componente do indicador, com a história no catálogo.
- **`apps/web`:** a tela Indicadores no módulo Alertas, com a meta pela própria tela, o item no menu e a entrada da busca.
- **Documentação:** a spec mestre (seções 6.5, 6.7, 7.6 e 15), o contrato de módulo e o mapa.
- **Dependências:** nenhuma nova.
