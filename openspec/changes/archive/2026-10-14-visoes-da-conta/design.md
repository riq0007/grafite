## Context

O motivo está em `proposal.md`. O ponto de partida, do P1c (design, decisões 6 a 10):

- **A visão** (tabela `visoes`, da organização ou de uma conta) guarda a definição: as colunas com a largura, a ordenação e os filtros, com os limites do domínio (`packages/domain/src/visoes/visoes.ts`, 32 KB).
- **O estado da tabela** (`apps/web/src/tabelas/useEstadoDaTabela.ts`) compõe a visão aberta com o endereço (`endereco.ts`): o que difere da visão vai ao endereço e marca "Alterada".
- **A visão que abre** é a escolhida pela conta, guardada nas preferências (`tabelas.visoes.ativos`), depois a padrão da organização e depois a de fábrica.
- **Os eventos:** `visoes.mudaram` relê o menu, com o público da organização ou o da conta dona.
- **As preferências da conta** têm o limite de 8 KB e são gravadas 400 ms depois da última mudança. As definições de visão passam disso, por isso não cabem nelas.

## Goals / Non-Goals

**Goals:**
- O que a pessoa muda na tabela continua lá quando ela volta, por qualquer caminho e em qualquer aparelho, sem um "Salvar".
- O "Salvar" explícito só onde a mudança afeta outras pessoas: a visão da organização.
- O endereço continua reproduzindo a tabela exata de um link.

**Non-Goals:**
- Abas de visões, a tabela em contexto, as visões de outras tabelas e os conjuntos de colunas (proposta, "Ficam fora").
- Mudar a forma da definição da visão: as mudanças da conta usam a mesma.

## Decisions

### 1. As mudanças da conta numa guarda própria

A tabela nova `mudancas_das_visoes`, com `orgScoped()` e o isolamento, tem uma linha por conta, tabela e visão. Ela guarda:
- `conta_id`;
- `tabela`, como `ativos`;
- `visao_id`, nula para a de fábrica;
- `definicao`, um `jsonb` com a mesma forma e os mesmos limites da definição de uma visão;
- `atualizada_em`.

A chave única é `(org_id, conta_id, tabela, coalesce(visao_id, nil))`. A chave estrangeira da visão é com o `org_id` e apaga em cascata: remover a visão apaga as mudanças de todos sobre ela. As mudanças não vão à auditoria.

A guarda grava a definição inteira, e não a diferença: a composição fica simples, e a visão da organização que muda depois não reinterpreta uma diferença antiga.

**Alternativa:** as preferências da conta. Elas têm 8 KB, e uma definição com dezenas de colunas e filtros passa disso; e elas são lidas a cada sessão, sem precisar das visões.

### 2. As rotas

- `GET /visoes?tabela=ativos` passa a trazer `mudancas`: as da conta, por visão, com a de fábrica como `fabrica`.
- `PUT /visoes/mudancas` grava as mudanças da conta sobre uma visão, com a tabela, a visão e a definição conferida pelo domínio. A visão tem de existir e ser usável pela conta.
- `DELETE /visoes/mudancas?tabela=&visao=` restaura uma visão, e sem a visão restaura todas da tabela, para os Ajustes.
- `POST /visoes/{id}/publicar` grava as mudanças da conta na visão da organização, com a permissão `organizacao.editar` e a auditoria, e apaga essas mudanças, numa transação.
- Mudar uma visão de "Minhas visões" continua pelo `PATCH /visoes/{id}` de hoje, agora chamado sozinho pela tela.

Cada gravação de mudanças grava o evento `visoes.mudaram` com o público `contas: [a dona]`. A publicação usa o público de hoje, a organização.

### 3. A composição no estado da tabela

O estado passa a compor três camadas: o endereço, depois as mudanças da conta, depois a visão salva.
- **Sem mudanças no endereço,** vale a visão com as mudanças da conta, e o estado é "Personalizada" quando elas existem.
- **Com mudanças no endereço,** vale o endereço, e o estado é "Do link". A primeira mudança do usuário grava na conta a tabela como está, e o estado passa a "Personalizada".
- **Numa visão da conta,** a mudança vai à própria visão, e não às mudanças da conta.

A gravação espera 400 ms depois da última mudança, como as preferências, e cancela a anterior. Ela também roda na saída da página, pelo `keepalive` do `fetch`, para a última mudança não se perder ao fechar a aba.

O endereço continua levando só o que difere da visão salva com as mudanças da conta, para o link reproduzir a tabela de quem o mandou.

### 4. A linha de estado e o menu

Sob a barra da tabela, quando a visão está personalizada ou veio do link, uma linha em texto diz o estado e as ações à vista:
- **personalizada:** o que a conta mudou, pelas partes que diferem da visão salva (as colunas, com a largura, a ordem e os filtros), como "Você mudou as colunas e a ordem. As mudanças ficam guardadas para você.", e "Restaurar a visão", "Salvar como nova visão…";
- **do link:** "Esta tabela veio de um link." e "Voltar à minha tabela".

O menu da visão (`EscolhaDaVisao`, `packages/ui`) mostra a marca em texto ("Personalizada" ou "Do link") e as ações de cada caso (spec visoes-de-tabela, "Tabela alterada"), com "Duplicar…" sempre. Nada é mostrado só por cor.

A cópia de "Duplicar…" abre com o nome da origem seguido de "(cópia)", para ficar ao lado dela no menu. "Salvar na visão da organização" grava antes, na hora, a mudança que ainda espera os 400 ms, porque a publicação grava o que a API tem.

### 5. As outras sessões e a visão da organização mudada

O evento das mudanças relê `GET /visoes` nas sessões da conta, e a tabela aberta recompõe. Quando a visão da organização aberta muda, e a conta tem mudanças sobre ela, a tabela passa à visão nova com as mudanças por cima. O aviso sai uma vez por mudança, pelo `atualizadaEm` da visão.

### 6. Ajustes › Tabelas

A seção lê `GET /visoes?tabela=ativos` para contar as visões com mudanças, e "Restaurar as minhas mudanças nas tabelas" chama o `DELETE` sem a visão, com a confirmação.

## Risks / Trade-offs

- **[A camada pessoal esconde a mudança da organização]** → É o problema clássico do ServiceNow. O aviso da visão atualizada pela organização e o "Restaurar a visão" à vista o atenuam, e o estado "Personalizada" fica sempre em texto.
- **[Muitas gravações ao arrastar a largura]** → A espera de 400 ms junta o arraste numa gravação só, e a rota é leve: um upsert por linha.
- **[Um link com mudanças grava na conta sem querer]** → Só a primeira mudança do usuário sobre o link grava, e não a simples abertura.

## Migration Plan

- A migration é aditiva: a tabela nova, com o isolamento.
- Quem tinha mudanças só no endereço continua com elas no endereço até mudar algo; aí elas passam à conta.
- **Volta:** a tabela nova fica sem uso, e a tela antiga volta ao "Alterada" pelo endereço.
