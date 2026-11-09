## Context

O F1b deixou a central de notificações, o sino e os avisos atrás do `useNotificacoes()`, com as notificações na memória da sessão e a troca pelo servidor prevista para o P3, sem mudar a casca. A fila dos avisos já tem o limite de três na tela, o crítico persistente e o `fechar` de um aviso pela chave. A preferência das notificações (Atenção, Informação e o tempo) já fica na conta desde o F2c.

O P3a deixou os alertas: a avaliação de cada organização a cada minuto, numa transação, abre, atualiza, resolve e encerra os alertas; o alerta guarda se abriu no silêncio, e o evento `alertas.mudaram` vai a quem vê os alertas no escopo do local do ativo. As rotas do reconhecimento e do adiamento já conferem `alertas.tratar` no escopo do alerta.

Os eventos de saída já aceitam como público as contas e as sessões, além da permissão com os locais (F2c). Uma aba escondida por mais de 5 minutos fecha a conexão e, ao voltar, recebe os eventos que perdeu.

## Goals / Non-Goals

**Goals:**
- A central e o sino lidos do servidor, com a leitura em todo aparelho da conta.
- A notificação de cada alerta que abre, para quem o vê, sem inundar a conta numa avaliação com muitos alertas.
- O aviso numa aba só, que sai da tela quando deixa de pedir ação.
- O modo Foco e a etapa "Conectando alertas".
- Um caminho único para qualquer módulo notificar, pela API.

**Non-Goals:**
- O e-mail e o push, com as escolhas de cada pessoa (P3c).
- Uma conexão de eventos só para todas as abas do navegador: com o HTTP/2 do Caddy, cada aba abrir a sua não esbarra no limite de conexões, e a aba da vez dos avisos se resolve sem ela.
- Notificar a mudança de um alerta que já estava aberto, ou o fim de um silêncio.

## Decisions

### 1. O P3 em quatro changes

O P3 passa a entrar em quatro changes, nesta ordem:
- **P3a · Regras e alertas**, já proposto;
- **P3b · Notificações no servidor**, esta change;
- **P3c · E-mail e push**: o e-mail imediato do crítico, o resumo e o push no celular, com as escolhas de cada pessoa, a configuração do SMTP e as chaves do push;
- **P3d · Indicadores**: os indicadores com as metas da seção 15 e a retenção dos alertas resolvidos.

O antigo P3b juntava a central e os canais de fora. Os canais de fora pedem configuração do servidor e escolhas que leem a central já gravada, e separá-los deixa esta change testável de ponta a ponta sem SMTP nem chaves.

### 2. Uma linha por conta

A tabela `notificacoes` guarda uma linha por conta e por notificação:
- a conta, a severidade, o título, a descrição, a origem e o endereço;
- o alerta, quando houver;
- o momento em que foi gravada e o da leitura.

Ela tem RLS por organização, um índice pela conta e pelo momento, da mais recente para a mais antiga, e outro só das não lidas de cada conta, para a contagem.

**Alternativas:**
- uma linha por notificação, com as leituras numa tabela à parte;
- montar as notificações na hora a partir dos alertas.

A linha por conta deixa a leitura, a contagem e a retenção numa consulta simples pela conta. O custo, uma linha por conta em cada alerta, fica limitado pelo agrupamento (decisão 4).

### 3. Quem recebe: o acesso na hora da abertura

Quando uma avaliação abre alertas fora do silêncio, ela carrega uma vez, para todas as contas ativas da organização:
- as atribuições diretas e as dos grupos, com os perfis, numa consulta cada;
- a árvore de locais.

O domínio decide, com o `podeEm` que a API já usa, quem tem `alertas.ver` no local de cada ativo. O alerta de um coletor, ou de um ativo sem local, alcança só quem tem a permissão na organização inteira.

A conta que ganha o acesso depois não recebe a notificação dos alertas que já abriram, e a que perde o acesso continua com as que já tem. As ações são conferidas de novo pela API no momento em que a conta age.

**Alternativa:** carregar o acesso conta por conta, que faria uma consulta por conta a cada avaliação com alertas novos.

### 4. A notificação nasce com o alerta, e o agrupamento passa de 5

A avaliação junta os alertas que abriram, que são os criados já abertos e os pendentes que abriram, sem os abertos no silêncio. No fim, na mesma transação, ela:
1. monta a notificação de cada um para cada conta que o vê;
2. troca as de uma conta que passam de 5 por uma só, "N alertas abertos", com a severidade mais alta, o endereço `/alertas` e sem alerta;
3. grava as notificações em lotes;
4. grava um evento `notificacoes.mudaram` com as contas notificadas.

A descrição vem do rótulo do ativo, que é o nome, ou o fabricante e o modelo, ou o tipo, com o patrimônio, como "HP LaserJet M404 · PAT-00412". No alerta de um coletor, vem o nome do coletor.

Uma avaliação que falha não grava nem os alertas nem as notificações, e a do minuto seguinte refaz as duas coisas.

### 5. A notificação não copia o estado do alerta

A notificação guarda só o alerta. A rota da lista junta o alerta atual de cada notificação, com uma consulta só:
- a situação;
- o reconhecimento, com o nome de quem reconheceu;
- o adiamento;
- se a conta pode tratar o alerta, por `alertas.tratar` no escopo dele.

A central e o aviso decidem as ações e o texto da situação a partir disso. "Reconhecer" e "Adiar 15 min" chamam as rotas do P3a e depois marcam a notificação como lida.

### 6. Notificar pela API, em qualquer módulo

`apps/api/src/notificacoes/notificar.ts` grava uma lista de notificações novas, em lotes, e o evento das contas delas, na transação de quem notifica. A avaliação dos alertas a usa, e também a entrada com o último código de recuperação, que deixa de notificar só na sessão. A tela de entrada continua com o aviso dela, como retorno da operação.

A web perde o `notificar` local: toda notificação vem do servidor. O contrato de módulo passa a mostrar a notificação pela API.

### 7. As rotas

As rotas só leem e mudam as notificações da conta da sessão, sem permissão própria, com a sessão valendo:
- `GET /api/notificacoes`, com a severidade, "só não lidas", o cursor e o limite (50 de fábrica, até 100). Devolve os itens, o próximo cursor e a contagem das não lidas da conta.
- `POST /api/notificacoes/:id/leitura` marca uma como lida e repete sem erro. A de outra conta responde 404.
- `POST /api/notificacoes/leitura` marca todas as não lidas da conta e devolve quantas.

As duas leituras gravam o evento `notificacoes.mudaram` das sessões da conta, e as outras abas e aparelhos atualizam o sino.

### 8. Na web, duas consultas

- **As recentes:** a primeira página sem filtro, com a contagem das não lidas. Ficam sempre ativas e alimentam o sino e os avisos.
- **A da central:** a lista filtrada, em páginas, ativa só com a central aberta.

Os eventos `notificacoes.mudaram` e `alertas.mudaram` invalidam as duas, porque o segundo muda a situação dos alertas que as notificações mostram. O `useNotificacoes()` continua a fonte única da casca, agora com o TanStack Query por trás.

### 9. Os avisos: as novas, na aba da vez

A aba guarda os identificadores que já viu. Na primeira leitura das recentes, ela marca todas como vistas, sem aviso. Depois, cada notificação não lida e ainda não vista, gravada depois da abertura da casca, vira aviso conforme as preferências e o Foco, se a aba é a da vez. Assim a notificação que chega numa aba escondida, pela retomada dos eventos, avisa quando ela volta.

A aba da vez é a usada por último. Cada aba anuncia, num `BroadcastChannel` da origem, quando ganha o foco ou fica visível, e avisa quando fecha. As outras guardam a mais recente. Sem anúncio nenhum, como numa aba única, a aba é a da vez.

A aba guarda a chave de cada aviso na fila. A cada leitura das recentes, ela fecha o aviso cuja notificação foi lida ou cujo alerta foi reconhecido, adiado ou se resolveu.

**Alternativa:** o Web Locks, com uma aba dona do aviso enquanto viva. Ela daria o aviso a uma aba escondida, e a regra é a aba em uso.

### 10. O Foco é uma preferência

`notificacoes.foco` entra nas preferências, desligado de fábrica, validado como as outras e gravado na conta. Ele vale em todo aparelho, e os padrões da organização podem ligá-lo como fazem com as outras preferências. O sino recebe o Foco e mostra o texto "Foco". A central e a seção Notificações dos Ajustes têm o interruptor.

### 11. "Conectando alertas" dentro dos 5 s da chegada

A etapa entra pela opção `etapas` da chegada, depois de "Validando sessão". Sem a sessão valendo, ela termina na hora, e o carregamento não a mostra. Com a sessão valendo, ela espera duas coisas: a primeira leitura das recentes e a conexão de eventos aberta.

O prazo é dividido com a etapa da sessão: ela marca quando a chegada começou a esperar o servidor, e a dos alertas termina, no máximo, 5 s depois dessa marca. Sem resposta, a casca abre com o sino sem número, e as recentes chegam depois.

### 12. A retenção na manutenção diária

A manutenção diária de cada organização apaga, em lotes, as notificações gravadas há mais de 90 dias, lidas ou não. O índice pelo momento serve à consulta, e rodar duas vezes não muda nada.

### 13. A central e o sino na biblioteca

`packages/ui` muda três componentes:
- **`CentralDeNotificacoes`:**
  - os filtros passam a ser de quem a usa, porque o servidor filtra;
  - ela ganha a página seguinte ao fim da lista, o estado de erro com "Tentar de novo", o interruptor do Foco e o texto da situação do alerta;
  - "Marcar todas como lidas" segue a contagem do servidor.
- **`SinoDeNotificacoes`:** ganha o Foco, com o texto e o nome acessível.
- **O aviso:** ganha o rótulo do adiar, "Adiar 15 min" nas notificações dos alertas.

O catálogo e as referências visuais mudam junto.

## Risks / Trade-offs

- [Um prédio sem energia abre centenas de alertas para dezenas de contas] → o agrupamento acima de 5 por conta dá uma notificação por conta, e a escrita vai em lotes.
- [A aba da vez fecha sem avisar, como num travamento] → a próxima aba a ganhar o foco se anuncia. Até lá, um aviso pode não aparecer, e a notificação fica na central e no sino.
- [Duas abas se acham a da vez ao mesmo tempo] → o aviso pode aparecer nas duas. É raro, e a notificação é uma só, com a leitura comum.
- [O acesso muda depois da notificação] → a notificação fica. "Abrir" leva à tela, que diz que falta a permissão, e as ações são conferidas pela API na hora.
- [A avaliação fica mais lenta] → o acesso das contas só é carregado quando algum alerta abriu fora do silêncio. O teste de desempenho do P3a mede de novo com a notificação.
- [Notificações demais numa conta antiga] → a retenção de 90 dias e o índice das não lidas mantêm a contagem e a lista rápidas.

## Migration Plan

1. A migration cria `notificacoes`, com RLS forçado e os índices. Não há dado a migrar, porque as notificações da sessão nunca foram ao servidor.
2. A versão nova passa a notificar os alertas que abrirem dali em diante, e os que já estavam abertos ficam só na lista e na tela inicial.
3. A volta à versão anterior deixa a tabela sem uso. A central volta a ser só da sessão.
