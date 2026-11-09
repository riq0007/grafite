## Context

A motivação está em `proposal.md`, e os requisitos, nas specs desta change. As decisões de produto vêm da spec mestre:
- **A tabela:** seção 7.4 (colunas redimensionáveis, reordenáveis e ocultáveis; visões salvas por usuário e compartilhadas; ordenação, filtros e busca à vista; virtualização; seleção com Shift e Ctrl; clique direito; o clique e o Enter abrem; o resumo ao parar o mouse 1,5 s).
- **As visões:** seção 5.2, decisão 9 (visões de tabela por usuário e compartilhadas da organização) e seção 2.3, critério 4 (as visões acompanham o usuário em qualquer aparelho).
- **O que não repetir do PMG:** as colunas gravadas iguais para todos (seção 13.2). A ideia do resumo vem do `ConfigurableTable` do PMG: as colunas fora da área visível, depois de 1,5 s parado.
- **Desempenho:** seção 2.3, critério 6 (10 mil linhas sem travar e as listas abaixo de 300 ms no p95).

Pontos de partida no código, depois do P1b:
- **UI:**
  - a `Tabela` sobre a `Table` do React Aria, com a ordenação de uma coluna, o espaço que pede a prévia, o "Carregar mais", a miniatura e as preferências da tabela pelo `ProvedorDaTabela`;
  - o `QuickLook` e o `usePrevia`, que hoje só passam pelos itens carregados;
  - os `FiltrosAtivos`, o `Menu`, o `Popover`, o `Checkbox` e a `Gaveta`.
- **Web:**
  - a `ListaDeAtivos`, com os filtros no endereço, o `useInfiniteQuery` com `paginar` e as colunas fixas;
  - o `SeletorDeLocal`, o seletor de registros e os provedores da busca;
  - as preferências com as camadas da organização e da conta, a sincronia com espera de 400 ms e os eventos.
- **API:**
  - `GET /ativos`, com o alcance de `ativos.ver`, a busca no ativo e no modelo e o cursor no id;
  - `referenciasDos` e `podeEm` por ativo, para os restritos;
  - `modulosDesligados` e `moduloDesligado`, da guarda dos módulos;
  - as leituras do catálogo, abertas a toda sessão (`semPermissao: 'referencia'`).
- **Domínio:**
  - o motor de campos (`mostrarValor`), com os valores guardados: o número como número, a data em aaaa-mm-dd, a lista pelo id da opção e as referências pelo uuid;
  - `CAMPOS_DO_ATIVO`, `CAPACIDADES` e o modelo das preferências com os leitores campo a campo;
  - o público dos eventos, com `todas` e `contas`.
- **Bibliotecas:** o React Aria 1.21 já traz o `Virtualizer` com o `TableLayout`, o `ResizableTableContainer` com o `ColumnResizer` e o `TableLoadMoreItem`. Ele não traz o arraste de colunas nem o menu de contexto. O TanStack Table e o Virtual, citados na seção 4.2 da spec mestre, não estão instalados.

## Goals / Non-Goals

**Goals:**
- A tabela configurável e as visões genéricas: outra tabela ganha visões só registrando as colunas dela, sem mudar o banco nem o contrato das visões.
- A ordenação e os filtros no servidor, sobre todos os ativos que a conta vê, com a paginação por cursor e o p95 abaixo de 300 ms com 10 mil ativos.
- Os campos restritos protegidos na coluna, no filtro, na ordenação, na prévia, no resumo e no que se copia.
- A tabela dos ativos inteira pelo teclado e pelo leitor de tela, como a tabela base.

**Non-Goals:**
- **Visões nas outras tabelas:** pessoas, auditoria, modelos e as demais continuam como estão. A infraestrutura fica pronta, mas só a tabela dos ativos é registrada.
- **Exportar para planilha e ações em lote:** só copiar as linhas. A etiqueta em lote chega no P1f, sobre a seleção.
- **Agrupamento, ordenação por várias colunas e filtros com "ou" entre colunas.**
- **Arrastar o cabeçalho para reordenar:** a ordem muda pelo painel "Colunas", pelo arraste na lista dele e pelo teclado.
- **A busca na visão:** a busca é do momento e não se salva.
- **O menu Visualizar na barra superior:** os menus da barra são fixos no contrato de módulo, e as visões são dados. A escolha da visão fica na própria tela.
- **Seleção no toque:** o toque longo abre o menu de contexto de uma linha só.
- **A galeria e a vista em colunas do protótipo:** a spec mestre não as pede.

## Decisions

### 1. O que a visão guarda
- **Escolha:** `DefinicaoDaVisao`, no `packages/domain`:
  - `colunas`: `{ chave, largura? }[]`, na ordem da tabela, até 60;
  - `ordenacao`: `{ chave, direcao }` ou nula;
  - `filtros`: até 20, um por coluna.
- **Os filtros, pelo operador:**
  - `contem`, com o texto, até 200 caracteres;
  - `vazio` e `preenchido`;
  - `entre`, com `de` e `ate`, um dos dois ou os dois: o número, ou a data em aaaa-mm-dd;
  - `qualquer`, com até 100 ids: as opções, os tipos, os modelos ou as pessoas;
  - `em`, com o id do local;
  - `situacao`, o filtro de situação da lista: `ativos`, cada situação de uso, `inativos` ou `todos`.
- **Conferência:** `lerDefinicaoDaVisao(bruto)` confere a forma: os limites, as larguras de 64 a 800 px, trazidas ao limite mais próximo, e uma coluna repetida, que fica de fora. Ela não confere as chaves contra o catálogo: uma coluna que deixou de valer fica guardada e volta quando valer de novo (spec visoes-de-tabela).
- **A visão de fábrica dos ativos:**
  - as colunas: o ativo, o patrimônio, o local e a situação;
  - a ordem: "Cadastrado em", decrescente;
  - o filtro de situação: `ativos`.
- **Alterada:** `mesmaDefinicao(a, b)` compara as colunas, as larguras, a ordenação e os filtros, sem a ordem dos filtros.
- **A largura na visão:** a visão guarda a largura, como no Airtable e no GitHub Projects. Quem não pode salvar uma visão da organização salva uma cópia como visão sua.
- **Alternativa:** a largura como preferência de cada conta, salva sozinha. Ela ficaria fora do link e do "Alterada", e as preferências da conta têm 8 KB.

### 2. As colunas dos ativos no domínio
- **Escolha:** `colunasDosAtivos({ tipos, campos, capacidades, verRestritos })` devolve as colunas disponíveis. Cada uma traz:
  - a chave, o rótulo e o grupo;
  - o tipo de campo, ou o especial;
  - se ordena e os operadores de filtro;
  - o alinhamento, a fonte mono e a largura padrão;
  - se é a principal e se é restrita.
- **As chaves especiais:** `ativo.rotulo` (a principal), `ativo.tipo`, `ativo.modelo`, `ativo.situacao`, `ativo.criado-em` e `ativo.atualizado-em`.
- **As demais chaves:**
  - as dos campos comuns, fora `ativo.nome` e `ativo.uso`, que a coluna Ativo e a Situação mostram;
  - as dos campos da organização, pelo id;
  - as das capacidades, pela chave fixa.
- **O que está disponível:**
  - os campos da organização ativos que algum tipo ativo usa;
  - os campos das capacidades ligadas a algum tipo ativo;
  - os restritos só com `verRestritos`, que é ter `ativos.restritos` em algum ramo.
- **Por tipo de campo,** como a tabela da spec cadastro-de-ativos:
  - os textos, a licença, a URL e o MAC: ordem alfabética e `contem`;
  - o IP: ordem pelos números e `contem`;
  - os números e a moeda: ordem numérica, à direita, e `entre`;
  - a data: `entre`;
  - a lista: a ordem das opções e `qualquer`; a lista múltipla não ordena;
  - a pessoa: o nome e `qualquer`; o local: o caminho e `em`;
  - o ativo não ordena e só tem `vazio` e `preenchido`;
  - `vazio` e `preenchido` em toda coluna que pode ficar sem valor.
- **Uso:** a mesma função confere na API as colunas, a ordem e os filtros pedidos, e monta na web o cabeçalho, o painel, as células e os editores de filtro.

### 3. A lista no servidor: colunas, filtros e ordem
- **`GET /ativos` ganha:**
  - `colunas`: as chaves, separadas por vírgula, cujos valores a resposta traz;
  - `ordem` e `direcao`;
  - `filtros`: o JSON da lista de filtros, conferido pelo domínio;
  - `fuso`: o fuso da conta, para os dias de "Cadastrado em" e "Atualizado em".

  Os parâmetros do P1b (`busca`, `tipo`, `local`, `situacao` e `uso`) continuam, para a busca (Ctrl+K) e os links antigos. Um filtro de situação em `filtros` substitui o padrão de `situacao`.
- **Recusas e o que fica de fora:**
  - um filtro malformado, como um operador que a coluna não tem ou uma data inexistente, é recusado com 400 e a mensagem em `filtros`;
  - uma coluna, uma ordem ou um filtro de uma coluna que não está disponível para a conta, como um campo inativado entre a leitura do catálogo e o pedido, ficam de fora, como a web faz (spec visoes-de-tabela). Sem a coluna, o filtro não vale e a ordem volta à de cadastro: nada de um restrito chega a quem não o vê.
- **O SQL de cada coluna** fica em `apps/api/src/ativos/colunas.ts`, com o valor, que o filtro usa, e a chave da ordem:
  - **colunas da tabela:** direto;
  - **JSONB:** `valores ->> 'chave'`, com `::numeric` nos números, `::inet` no IP e o texto da data em aaaa-mm-dd, que ordena como data;
  - **lista:** `array_position` pelos ids das opções na ordem do campo;
  - **lista múltipla:** `valores -> 'chave' ?| array[...]`;
  - **pessoa:** o nome, por uma subconsulta pelo uuid;
  - **local:** a posição do caminho, por uma junção com `unnest` dos ids da árvore na ordem dos caminhos;
  - **Ativo:** `coalesce` do nome, do fabricante e do modelo e do nome do tipo.
- **Texto sem acento:** a ordem e o `contem` usam `lower(translate(texto, acentuadas, sem acento))`, a mesma forma do `normalizarTexto` para as letras do português. Um teste compara as duas formas letra a letra. O termo pedido passa pelo `normalizarTexto`.
- **Alternativas:**
  - **a extensão `unaccent`:** é mais uma peça para instalar e conferir no PostgreSQL do Windows;
  - **uma ordenação ICU não determinística:** depende do ICU no PostgreSQL e muda a semântica do `=` no cursor.
- **O cursor:** `[valorDaOrdem, id]`, com o tipo do valor conferido pela coluna. A ordem é `chave asc|desc NULLS LAST, id desc`. A página seguinte:
  - com o valor: `(chave > v) or (chave = v and id < último) or chave is null`, com `<` no decrescente;
  - sem o valor: `chave is null and id < último`.
- **A resposta ganha:**
  - em cada item: `serie`, `hostname`, `criadoEm`, `atualizadoEm`, `valores`, com as chaves pedidas do JSONB, e `permite.verRestritos`;
  - na lista: `referencias`, com os nomes das pessoas, dos ativos e dos modelos que os valores da página e os filtros apontam, por `referenciasDos`.
- **A contagem:** `total` usa as mesmas condições, como no P1b.

### 4. Os restritos na lista
- **O alcance:** `alcance(acesso, 'ativos.restritos', arvore)` vira um predicado: verdadeiro na organização inteira, `local_id in (...)` num ramo e falso sem a permissão.
- **Valor:** o item traz o valor restrito só onde `podeEm` deixa, e `permite.verRestritos` diz à web se a célula mostra "Fora do seu acesso".
- **Filtro:** `predicado and condição`. O ativo em que a conta não vê o restrito não entra nem em `vazio`.
- **Ordem:** `case when predicado then chave end`, e o valor oculto vai para o fim, com os vazios.
- **Coluna:** sem `ativos.restritos` em nenhum ramo, a coluna não é oferecida, e a API recusa o pedido dela.

### 5. A tabela `visoes`
- **Escolha:** uma tabela criada com `orgScoped()`:
  - `tabela`, conferida contra a lista das tabelas com visões, por enquanto só `ativos`;
  - `conta_id`, nulo na visão da organização, com a referência `(org_id, conta_id)` às contas;
  - `nome` e `nome_normalizado`;
  - `definicao jsonb`, um objeto de até 32 KB;
  - `criado_em` e `atualizado_em`.
- **Unicidade:** dois índices únicos parciais: `(org_id, tabela, nome_normalizado)` com `conta_id` nulo, e `(org_id, tabela, conta_id, nome_normalizado)` sem ele.
- **Limites:** antes de contar as visões, a criação trava a linha da conta, na visão pessoal, ou a da organização, na compartilhada. Duas criações juntas não passam do limite.
- **Remoção:** a visão sai da tabela. Ela é configuração, e não um registro de negócio (spec mestre, seção 5.2, decisão 8). A remoção da visão da organização fica na auditoria.
- **Anonimização:** remove as visões da conta da pessoa, na mesma transação.

### 6. As rotas das visões
- **Rotas:**
  - `GET /visoes?tabela=ativos`: as da organização e as da conta, cada uma com `permite.editar`, e `permite.compartilhar` na lista;
  - `POST /visoes`, com a tabela, o nome, `compartilhada` e a definição: devolve 201 com a visão;
  - `PATCH /visoes/:id`, com o nome, a definição ou os dois;
  - `DELETE /visoes/:id`: devolve 204.
- **Permissões:**
  - toda rota pede a permissão de ver a tabela, que é `ativos.ver` nos ativos, em algum ramo;
  - a escrita numa visão da organização pede também `organizacao.editar`, e a recusa vai para a auditoria;
  - a visão de outra conta responde 404.
- **Módulo:** cada tabela registra o módulo dela. A rota confere `modulosDesligados` e recusa com `moduloDesligado`, como a guarda do escopo, mas pela tabela pedida. As rotas ficam fora do escopo do Ativos, para servir às tabelas de outros módulos.
- **Auditoria:** `visao.criada`, `visao.alterada` e `visao.removida`, só nas visões da organização. O antes → depois mostra o nome, as colunas pelos rótulos, a ordenação e os filtros em texto, por `descreverDefinicao`, no domínio.
- **Evento:** `visoes.mudaram`, com o alvo `{ tipo: 'visao', id }` e o público dado por quem grava: `todas`, na da organização, e `contas: [dona]`, na de uma conta. As visões pessoais não vão para a auditoria e gravam só o evento, como as preferências.

### 7. A visão nas preferências
- **Preferências novas, em `tabelas`:**
  - `resumoDaLinha`: boolean, ligado na fábrica;
  - `visoes`: `{ [tabela]: 'fabrica' | id }`. O leitor guarda só as tabelas conhecidas e os valores `fabrica` ou uuid.
- **A visão que abre:** `visaoQueVale(tabela, { conta, organizacao }, usaveis)`, no domínio. Ela é a da conta, depois a da organização, depois a de fábrica, pulando o id que não está entre as visões que a conta pode usar.

  A web chama a função com as duas camadas do estado da sessão, porque `resolverPreferencias` junta as camadas campo a campo e perderia a da organização quando a conta tem a dela.
- **Gravação:**
  - escolher uma visão no menu grava `tabelas.visoes` na conta, pela sincronia que já existe;
  - "Usar como padrão da organização" grava nos padrões, com a auditoria `padroes.alterados`.
- **Conferência na API:**
  - `PATCH /conta/preferencias` confere que a visão é da organização ou da conta;
  - `PATCH /organizacao/padroes` confere que a visão é da organização;
  - as mensagens são as da spec preferencias-da-interface.
- **Visão removida:** a preferência que aponta para ela fica, e a resolução a pula. Nenhuma limpeza percorre as contas.

### 8. O estado da tabela no endereço
- **Os parâmetros de `/ativos/`:**
  - `visao`: o id, ou `fabrica`;
  - `busca`;
  - as mudanças, cada uma presente só quando difere da visão: `colunas`, compacta como `chave:largura,chave,…`, `ordem`, como `chave` ou `-chave`, e `filtros`, a lista em JSON.
- **Comportamento:**
  - "Alterada" é haver alguma das três mudanças no endereço;
  - "Descartar" tira as três;
  - "Salvar alterações" grava a definição e tira as três;
  - uma mudança na tabela substitui a entrada do histórico (`replace`), como os filtros do P1b.
- **Sem `visao`:** o endereço é reescrito com a visão que abre. O dock, o menu e a busca levam a `/ativos`, sem as mudanças.
- **Links antigos:** `tipo`, `local` e `situacao` do P1b viram os filtros equivalentes na leitura do endereço.
- **Alternativa:** guardar as mudanças não salvas no navegador. O link deixaria de reproduzir a tabela, e uma parte do estado ficaria escondida.

### 9. A tabela configurável no `packages/ui`
- **A `Tabela` ganha props opcionais.** As telas de hoje continuam iguais:
  - `larguras` e `aoRedimensionar`: o `ResizableTableContainer`, com o `ColumnResizer` no cabeçalho de cada coluna e de 64 a 800 px;
  - `virtualizada`: o `Virtualizer` com o `TableLayout`, na altura da linha da densidade, lida da variável `--altura-linha`. O `TableLoadMoreItem` entra no lugar do "Carregar mais", com o mesmo `carregarMais`;
  - `selecao` e `aoMudarSelecao`: a seleção múltipla controlada do React Aria;
  - `menuDeContexto`, `aoCopiar` e `resumoDaLinha`.
- **A seleção:** o React Aria dá o Shift com as setas, o Ctrl+A e o Esc. O clique sem modificador é interceptado para abrir o registro, e o Ctrl+clique e o Shift+clique viram a seleção. O espaço continua capturado para a prévia antes do React Aria, como no F1b.
- **`Coluna`** ganha:
  - o menu da coluna, com um botão de ícone no cabeçalho: ordenar, filtrar, ocultar e redimensionar. "Redimensionar coluna" chama o `startResize` do React Aria;
  - o alinhamento e a largura mínima.
- **O resumo da linha:**
  - um relógio puro, `relogioDoResumo`, testado com o tempo falso: 1,5 s parado sobre a linha, cancelado pelo movimento para outra linha, pela saída, pela rolagem e pelas teclas;
  - as colunas fora da área visível, medidas pelo retângulo das células do cabeçalho contra o da rolagem;
  - só com `pointerType === 'mouse'` e com a preferência ligada no `ProvedorDaTabela`.
- **O menu de contexto:** `MenuDeContexto`, um `Popover` com o `Menu`, preso a um elemento invisível na posição do ponteiro. Ele abre por `contextmenu`, pela tecla de menu, por Shift+F10 e pelo `useLongPress` no toque.
- **Componentes novos:**
  - `PainelDeColunas`: a busca, os grupos com checkbox e a lista das colunas à vista, que se reordena pelo arraste e pelo teclado, num `GridList` do React Aria com `useDragAndDrop`, e pelos botões "Mover para cima" e "Mover para baixo";
  - `EscolhaDaVisao`: o botão com o nome e "Alterada" em texto, e o menu com as seções e as ações;
  - `EditorDeFiltro`: o operador e os campos do valor por tipo de filtro, com "Aplicar filtro" e "Tirar filtro". O seletor do local e o das pessoas entram por um espaço que a web preenche;
  - `ResumoDaLinha` e `MenuDeContexto`.
- **`usePrevia`** ganha `total`, `carregarMais` e `selecao`:
  - a posição conta a seleção ou o total da lista;
  - a seta que passa do último carregado pede a página seguinte e mostra o esqueleto até ela chegar.

  A assinatura de hoje continua valendo.
- **Alternativa:** o TanStack Table e o Virtual, da seção 4.2 da spec mestre. Seriam duas bibliotecas novas sobre a `Table` do React Aria, que já virtualiza, redimensiona e carrega ao fim, com a acessibilidade dela. A seção 4.2 fica atualizada.

### 10. A tabela dos ativos na web
- **`apps/web/src/tabelas/`, o genérico das tabelas com visões:**
  - `useVisoes(tabela)`;
  - `useEstadoDaTabela`: o endereço ↔ o estado, "Alterada", salvar e descartar;
  - `useVisaoQueAbre`;
  - as mutações: criar, salvar, renomear, remover e o padrão da organização;
  - `linhasParaCopiar`: o texto com tabulações, uma função pura e testada;
  - o evento `visoes.mudaram`, que invalida `['visoes', tabela]`.
- **`apps/web/src/modulos/ativos/tabela/`:**
  - `TabelaDosAtivos`: as colunas de `colunasDosAtivos`, com o catálogo, e as células por tipo de coluna, por `mostrarValor` e pelas `referencias`;
  - a prévia do ativo;
  - os itens do menu de contexto;
  - os editores de filtro dos ativos: o `SeletorDeLocal`, as escolhas dos tipos e dos modelos pelo catálogo, a das pessoas por `/pessoas/nomes` e as opções do campo.
- **A barra da tela:** a escolha da visão, a busca, o filtro de situação, "Filtros", "Colunas" e "Novo ativo". Embaixo, os filtros ativos e a contagem, com "<n> selecionados" e "Limpar seleção".
- **Saem da barra:** os filtros de tipo e de local do P1b. Eles passam a ser filtros de coluna, em "Filtros" e no menu da coluna.
- **A tela:** a tabela ocupa a altura da janela, rolando por dentro com o cabeçalho fixo, para a virtualização.
- **A busca (Ctrl+K):** o provedor "Visões" do módulo Ativos lê `GET /visoes?tabela=ativos`, pelo cache da consulta, e filtra pelo nome com o `normalizarTexto`. O destino é `/ativos?visao=<id>`, com "Ativos › Visões".
- **Ajustes › Tabelas:** o interruptor "Resumo da linha", com a explicação da spec.

### 11. O contrato de módulo
`docs/casca/modulos.md` ganha a seção "Tabela configurável e visões":
- como uma tabela registra as colunas e o módulo dela;
- como a tela usa o estado do endereço e a escolha da visão;
- a seleção, o menu de contexto, o resumo e copiar;
- a prévia paginada.

O trecho citado sai de uma história do catálogo, que o `documentacao.test.ts` confere, como as outras seções.

## Risks / Trade-offs

- **[O `Virtualizer` com o redimensionamento, a seleção e o clique interceptado]** → a tarefa da tabela no `packages/ui` começa pelas histórias com os testes de interação de cada combinação. Se o React Aria não as combinar, a virtualização passa ao TanStack Virtual, sem mudar a spec.
- **[A ordem e os filtros sobre o JSONB sem índice]** → 10 mil ativos varridos e ordenados ficam abaixo de 300 ms, e um teste de integração mede o p95. Os índices de expressão ficam para quando uma organização passar disso.
- **[O `translate` cobre as letras do português, e não toda marca do Unicode]** → o teste compara com o `normalizarTexto` em todas as letras acentuadas do Latin-1 e do Latin Extended-A. Outras escritas são raras nos dados de ativos.
- **[O endereço longo com muitas colunas]** → a forma compacta dá uns 45 caracteres por coluna, menos de 3 KB com 60 colunas, abaixo do limite do Node (16 KB de cabeçalho) e dos navegadores.
- **[A preferência que aponta para uma visão removida]** → a resolução pula o id. O campo fica até a conta escolher outra visão ou restaurar a seção Tabelas.
- **[Duas edições da mesma visão da organização]** → a última grava, e o evento atualiza a outra sessão, que continua com as mudanças dela no endereço.
- **[A contagem dobra o custo da página]** → igual ao P1b, e medida no mesmo teste do p95.

## Migration Plan

- **Migration nova:** a tabela `visoes`, com `app.isolar_por_organizacao`. Ela só acrescenta.
- **Preferências:** `tabelas.resumoDaLinha` e `tabelas.visoes` entram no JSONB que já existe, sem mudar o tamanho permitido.
- **Volta:**
  - a versão anterior ignora a tabela `visoes`;
  - o leitor das preferências dela deixa de fora os campos desconhecidos, e as preferências da conta continuam valendo;
  - as visões ficam guardadas para a volta à versão nova.
- **Permissões:** nenhuma nova. Só muda a descrição de `organizacao.editar`.
