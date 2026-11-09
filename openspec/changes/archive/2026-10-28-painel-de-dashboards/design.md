## Context

O S1 · Salas de reunião deixou o molde de um módulo opcional novo:
- as permissões, as ações e o evento no domínio;
- a tabela `orgScoped`, as rotas na guarda do módulo e o fornecedor da camada no mapa, com a permissão;
- o módulo na web.

Os painéis acrescentam duas coisas:
- a verificação periódica, uma tarefa agendada da fila (spec fila-de-tarefas), como a avaliação dos alertas;
- a exibição do conteúdo de outro endereço dentro do Grafite.

## Goals / Non-Goals

**Goals:**
- o cadastro dos painéis, com o endereço;
- a verificação a cada minuto e na hora, com a situação em texto;
- a grade que aproveita a janela, com o expandir e o abrir em outra aba;
- a camada do mapa.

**Non-Goals:**
- Um proxy reverso no Grafite para os painéis em `http://`. Ele precisaria reescrever os endereços de cada ferramenta (o caminho base, os WebSockets) e não funciona de modo geral. O caminho é dar ao painel um endereço `https://`, pelo Caddy da instalação ou pela própria ferramenta. Até lá, o bloco diz o motivo e abre o painel em outra aba.
- Escolher que painéis aparecem na grade por conta. A grade mostra os ativos, na ordem do cadastro.
- Alertar quando um painel cai. A situação aparece na grade e no mapa, e a regra de alerta de painéis pode vir depois.

## Decisions

1. **A situação na própria linha do painel.** A tabela `paineis` guarda o cadastro e a última verificação: a situação (`no-ar | fora-do-ar | sem-verificacao`), o momento, o tempo da resposta em ms e o motivo. Não há histórico. A grade e o mapa leem a linha, sem juntar outra tabela.
2. **A verificação na API, numa tarefa a cada minuto.**
   - A tarefa `verificacao-dos-paineis` (`* * * * *`, fuso de São Paulo) percorre as organizações com o módulo ligado.
   - Ela pede cada painel com o `fetch` do Node: um `GET` com 5 s pelo `AbortSignal.timeout` e `redirect: 'follow'`. O corpo da resposta é descartado.
   - O servidor do Grafite fica na rede das VMs, então não há coletor no meio.
   - A leitura da resposta (`situacaoDaResposta`) é do domínio, testada sem rede.
   - A linha só é gravada, com o evento, quando a situação muda. Na mesma situação, a tarefa grava só o momento e o tempo, sem evento.
3. **A forma da grade no domínio.** `formaDaGrade(quantos)` dá as colunas e as linhas:
   - um painel dá 1 × 1, e dois e três ficam numa linha (n × 1);
   - de quatro em diante, as colunas são `ceil(sqrt(n))`, e as linhas, `ceil(n / colunas)`.

   A web aplica a forma em `grid-template-columns` e `grid-template-rows` com frações, na altura da área da janela.
4. **O conteúdo num `iframe`.**
   - O bloco usa um `iframe` com `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` e `referrerpolicy="no-referrer"`.
   - Com o Grafite em `https:` e o painel em `http:`, o navegador bloquearia o conteúdo misto. A web nem monta o `iframe` e mostra o motivo, com "Abrir em outra aba".
   - O painel que recusa o `iframe` (`X-Frame-Options`) aparece em branco, e "Abrir em outra aba" continua lá.
5. **O expandir pelo endereço.** `?expandido=<id>` mostra o painel na área inteira. O mapa leva a esse endereço, e Esc e "Voltar à grade" tiram o parâmetro.

## Risks / Trade-offs

- **[A verificação com muitos painéis passa do minuto]** → Os pedidos saem em paralelo, até 10 por vez, cada um com 5 s de prazo: 100 painéis levam no máximo uns 50 s. A tarefa seguinte espera a anterior, pela fila.
- **[O endereço interno no cadastro fica à vista de quem vê os painéis]** → É o mesmo endereço que a pessoa abriria, e a rede é a interna. Endereço com senha na URL é recusado.
- **[O painel que não aceita o `iframe`]** → "Abrir em outra aba" fica sempre no bloco.
