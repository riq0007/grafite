## Context

O motivo está em `proposal.md`. O ponto de partida, do P1c:

- **Na tabela dos ativos** (`apps/web/src/modulos/ativos/tabela/TabelaDosAtivos.tsx`), o menu "Filtros" lista as colunas filtráveis, e escolher uma abre o `EditorDeFiltro` (`packages/ui`) num popover preso ao botão. O "Filtrar…" do menu da coluna faz o mesmo.
- **O editor** troca os campos pelo operador e tem "Aplicar filtro" e "Tirar filtro". As opções do "é qualquer de" vêm do catálogo, ou da busca, para as pessoas e os modelos (`filtros.tsx`).
- **Os filtros ativos** (`FiltrosAtivos`) são rótulos com o botão de limpar.
- **A seleção** mostra "N selecionados · Limpar seleção" numa linha; as ações estão no menu de contexto e num botão terciário.
- **Na API,** `GET /ativos` filtra, ordena e pagina no servidor, no escopo de quem pede, com os campos restritos só onde a conta os vê (`apps/api/src/ativos/colunas.ts`).

## Goals / Non-Goals

**Goals:**
- Filtrar com um passo a menos e o editor perto do que se filtra.
- As contagens só quando ajudam a decidir e só da coluna aberta, para não custar uma consulta por coluna.
- Nenhum estado só por cor: "Filtrada", "(0)" e "de outro tipo" em texto.

**Non-Goals:**
- O "ou", os grupos de condições e os operadores novos de texto (proposta, "Ficam fora").

## Decisions

### 1. O painel de duas colunas

O painel de filtros é um `PainelFlutuante` com:
- a lista das colunas filtráveis à esquerda, uma `ListBox` com as seções dos grupos do painel "Colunas" e o campo de filtro no topo;
- o `EditorDeFiltro` à direita.

Escolher uma coluna troca o editor sem fechar o painel. O painel abre preso ao botão "Filtros" ou, pelo "Filtrar…" da coluna, ao cabeçalho dela. Na janela estreita, as duas colunas viram duas telas do mesmo painel, a lista e depois o editor, com "Voltar".

### 2. As contagens por opção

A rota nova `GET /ativos/contagens?coluna=<chave>&busca=&filtros=` devolve, para uma coluna de escolha, a contagem de cada opção e o total:
- a contagem usa os mesmos filtros e a mesma busca da lista, menos o filtro da própria coluna;
- ela vale no escopo de quem pede, e nos restritos só onde a conta os vê;
- é um `GROUP BY` sobre a mesma consulta da lista.

A tela pede a contagem só quando o editor da coluna abre, guarda no TanStack Query por 30 s, e relê pelo evento `ativos.mudaram`, com a espera que os eventos já têm. O botão de aplicar mostra o total que a contagem dá para as opções marcadas, pela soma delas: cada ativo tem uma opção só. Na lista múltipla, um ativo com duas opções marcadas contaria duas vezes, e o botão fica "Aplicar filtro".

As colunas de escolha são o Tipo, o Modelo, a situação de uso, os campos de lista e de lista múltipla e a Disponibilidade. As pessoas, com centenas de opções, continuam pela busca, sem contagem.

### 3. Os filtros ativos no lugar

O `FiltrosAtivos` ganha:
- o operador no rótulo, quando a coluna tem mais de um;
- o clique no rótulo, que abre o editor daquele filtro num popover preso a ele, o mesmo do painel, só com o editor;
- Backspace com o foco no rótulo, que limpa o filtro.

O botão de limpar continua com o nome acessível de hoje.

### 4. Tipo antes de Modelo

Com um filtro de Tipo, a busca dos modelos do editor manda os tipos (`GET /modelos?tipos=`). A tela separa:
- a seção "Modelos de <tipo>", quando há um tipo filtrado;
- a seção "Modelos dos tipos filtrados", quando há vários;
- a seção dos outros modelos.

O rótulo de um modelo escolhido de outro tipo leva "(de outro tipo)", calculado pelo tipo de cada modelo escolhido, que a lista passa a devolver nas referências (`tiposDosModelos`), ao lado do nome dele. Os painéis de filtros e de colunas recebem os tipos filtrados e reordenam os grupos, pela regra do domínio (`colunasDosAtivos`), que ganha a ordem por tipos filtrados.

### 5. A barra em duas faixas

A barra (`BarraDaTabela`, nova em `packages/ui`) tem duas faixas:
- a primeira é a de hoje, com a contagem à direita, que vem do total que a lista já devolve;
- a segunda mostra os filtros ativos ou a barra das ações em lote.

As ações em lote são as do menu de contexto que aceitam várias linhas (`acoesDasLinhas`), na mesma ordem, como botões secundários.

### 6. O carregamento

A tabela base ganha o estado "carregando":
- **sem linhas,** ela desenha o `Esqueleto` com as colunas e a altura da linha;
- **com linhas,** ela as mantém com `aria-busy` e uma linha de progresso no alto, porque o TanStack Query já guarda os dados de antes (`placeholderData`). A barra diz "Atualizando" na contagem.

As linhas de antes não perdem opacidade: o texto esmaecido cai abaixo do contraste AA, que o ANTISLOP exige em todos os temas, e a verificação de acessibilidade do catálogo o recusa. A linha de progresso pulsa pelo `--dur-ciclo`, como o esqueleto, e fica parada com o movimento reduzido.

Os textos "Carregando…" da tabela dos ativos saem.

## Risks / Trade-offs

- **[A contagem custa uma consulta a mais]** → Só da coluna aberta, com cache de 30 s e o mesmo índice da lista. Um teste de integração mede a contagem com 10 mil ativos, dentro dos 300 ms das listas.
- **[A contagem revela ativos fora do acesso]** → Ela usa a mesma consulta da lista, no escopo de quem pede: não conta o que a conta não vê.
- **[A barra muda de altura com a seleção]** → A segunda faixa tem a mesma altura com filtros ou com a seleção, e só some quando não há nenhum dos dois.

## Migration Plan

Sem migration. As rotas novas entram junto com o cliente gerado.
