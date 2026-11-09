## MODIFIED Requirements

### Requirement: Alertas na ficha do ativo

A Visão geral da ficha do ativo (spec cadastro-de-ativos, "Aba Dados em cartões") SHALL ter o bloco Alertas, para quem tem `alertas.ver` no escopo do local do ativo, com:
- os alertas não resolvidos do ativo, com a severidade, o texto, há quanto tempo e a situação, e as ações de quem pode tratá-los;
- "Nenhum alerta aberto." quando não há nenhum;
- "Ver os resolvidos", que leva à lista dos resolvidos do ativo;
- o silêncio: "Alertas silenciados até <data e hora>", ou "até alguém retomar", com o motivo, e "Retomar alertas"; ou, sem silêncio, "Silenciar alertas", para quem pode tratá-los.

O cartão da Visão geral SHALL resumir o bloco em texto: "1 alerta aberto" ou "N alertas abertos", e "Alertas silenciados" com o silêncio. Sem alerta aberto e sem silêncio, o bloco SHALL NOT entrar no resumo.

"Silenciar alertas" SHALL pedir até quando, com uma data e hora ou "Até alguém retomar", e o motivo, e SHALL dar o retorno "Alertas silenciados.". "Retomar alertas" SHALL dar o retorno "Alertas retomados.".

#### Scenario: Ficha com alerta
- **WHEN** o usuário abre a ficha da impressora com o alerta "Toner preto em 8%"
- **THEN** o bloco Alertas, na Visão geral, mostra o alerta, Crítico, com há quanto tempo está aberto

#### Scenario: Silenciar pela ficha
- **WHEN** Ana silencia os alertas da impressora até 20/10 às 18:00, com o motivo "Em manutenção"
- **THEN** o bloco mostra "Alertas silenciados até 20/10/2026 18:00", com o motivo e "Retomar alertas"

#### Scenario: Resumo no cartão
- **WHEN** a impressora tem dois alertas abertos, e o usuário vê os alertas
- **THEN** o cartão da Visão geral diz "2 alertas abertos"
