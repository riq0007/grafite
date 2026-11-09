## Why

Com o P1b, a organização cadastra os ativos e os vê numa lista simples, com quatro colunas fixas, os cadastrados por último primeiro e três filtros. Isso não basta para a TI trabalhar: quem cuida das impressoras quer ver o IP e o modelo, quem cuida dos computadores quer o hostname e o responsável, e cada um quer guardar o recorte que usa todo dia. O PMG gravava as colunas iguais para todos os usuários, um dos erros que a spec mestre manda não repetir (seção 13.2).

O P1c · Tabela e visões é a terceira das seis changes do P1 (spec mestre, seção 3.2). Ela leva à tabela dos ativos o que a seção 7.4 pede de toda tabela (colunas que se escolhem, ordenam e redimensionam, a ordenação pelas colunas, filtros, seleção com Shift e Ctrl, menu de contexto, o resumo ao parar o mouse e a virtualização) e as visões salvas da seção 5.2, decisão 9: as de cada usuário e as compartilhadas da organização. Liga também o Quick Look do F1b à tabela dos ativos.

Ficam fora desta change: a ficha completa, os ativos ligados e a imagem própria do ativo (P1d), a importação (P1e), a etiqueta (P1f), a exportação para planilha e as ações em lote além de copiar, e as visões nas outras tabelas, como as de pessoas e da auditoria.

## What Changes

- **Spec mestre:** as decisões da tabela e das visões: o que a visão guarda, as visões da organização e as de cada conta, a visão que abre, o estado da tabela no endereço e a largura das colunas na visão.
- **Tabela configurável, no `packages/ui` e para qualquer módulo:**
  - colunas redimensionáveis pelo cabeçalho e pelo teclado, e o painel "Colunas", que mostra, esconde e reordena as colunas;
  - o menu de cada coluna: ordenar, filtrar, ocultar e redimensionar;
  - as linhas virtualizadas, com as próximas trazidas sozinhas ao fim da rolagem;
  - a seleção com Ctrl e Shift, pelo mouse e pelo teclado, sem tirar do clique a abertura do registro;
  - o menu de contexto pelo clique direito, pela tecla de menu e pelo toque longo;
  - o resumo da linha: ao parar o mouse 1,5 s sobre uma linha, as colunas que estão fora da tela;
  - copiar as linhas selecionadas como texto separado por tabulações, com os títulos das colunas.
- **Visões de tabela:**
  - a visão guarda as colunas, com a ordem e a largura, a ordenação e os filtros;
  - a visão de fábrica, "Todos os ativos", as visões da organização, que todos usam, e "Minhas visões", de cada conta;
  - a tabela mudada fica "Alterada", com "Salvar alterações", "Salvar como nova visão…" e "Descartar alterações";
  - quem define os padrões da organização cria, edita e remove as visões dela e escolhe a visão padrão;
  - a visão escolhida acompanha a conta em qualquer aparelho, pelas preferências no servidor;
  - o estado da tabela fica no endereço: recarregar, voltar e mandar o link mostram a mesma tabela.
- **A tabela dos ativos:**
  - as colunas disponíveis: o ativo, o tipo, o modelo, os campos comuns, os campos da organização e os das capacidades que algum tipo usa, e o cadastro e a última mudança;
  - a ordenação por qualquer coluna que se ordena, no servidor, com a paginação por cursor;
  - os filtros conforme o tipo de campo (contém, de e até, qualquer de, no local, vazio e preenchido), com os filtros ativos à vista;
  - os campos restritos só para quem os vê, também nos filtros e na ordenação;
  - a prévia (Quick Look) do ativo, com a imagem, os campos principais e os da visão, e as setas pela ordem da tabela;
  - as visões na busca (Ctrl+K).
- **Ajustes › Tabelas:** liga e desliga o resumo da linha.
- **Auditoria e eventos:** as visões da organização vão para a auditoria, e as de cada conta, não, como as preferências. O evento `visoes.mudaram` atualiza os menus abertos.

## Capabilities

### New Capabilities

- `tabelas-configuraveis`: a tabela base configurável: as colunas (escolher, ordenar, redimensionar), o menu da coluna, a ordenação, os filtros por coluna, a seleção, o menu de contexto, o resumo da linha, copiar as linhas e a rolagem virtualizada.
- `visoes-de-tabela`: as visões salvas de uma tabela: a de fábrica, as da organização e as de cada conta, o estado alterado, salvar, descartar, renomear e remover, a visão que abre, o estado no endereço, os limites, a auditoria e o evento.

### Modified Capabilities

- `cadastro-de-ativos`: a lista dos ativos vira a tabela configurável, com as colunas disponíveis, a ordenação e os filtros pelos tipos de campo, os restritos e a prévia do ativo.
- `componentes-base`: o conjunto ganha o menu de contexto, o resumo da linha, o painel de colunas, a escolha da visão e o editor de filtro; a tabela base passa a trazer as próximas linhas sozinha quando é virtualizada, e o espaço continua sendo da prévia com a seleção.
- `quick-look`: com uma seleção, as setas passam só pelos registros selecionados; numa lista paginada, a posição conta o total da lista, e a seta traz a página seguinte ao fim das carregadas.
- `preferencias-da-interface`: o resumo da linha e a visão escolhida de cada tabela, com a da organização como padrão e a recusa de uma visão que a camada não pode usar.
- `ajustes-do-sistema`: a seção Tabelas ganha o resumo da linha.
- `permissoes`: `organizacao.editar` passa a definir também as visões da organização.
- `auditoria`: os eventos registrados ganham a criação, a edição e a remoção das visões da organização.
- `eventos-em-tempo-real`: a tabela dos tipos de evento ganha `visoes.mudaram`.
- `modulo-ativos`: a busca (Ctrl+K) ganha as visões dos ativos.

## Impact

- **`packages/domain`:**
  - as colunas da tabela dos ativos a partir do catálogo, com o que cada uma ordena e filtra;
  - a definição da visão e a conferência dela, os filtros e a visão de fábrica;
  - a visão que vale entre as camadas, e as preferências novas;
  - a permissão, as ações da auditoria e o evento novos.
- **`packages/db`:** a migration com a tabela `visoes`, isolada pela organização, e a ordenação de texto em pt-BR.
- **`apps/api`:**
  - `GET /ativos` com as colunas pedidas, a ordenação, os filtros e as referências da página;
  - as rotas das visões, com a guarda do módulo da tabela;
  - a conferência da visão nas preferências da conta e nos padrões da organização;
  - o contrato da API e o cliente gerado.
- **`packages/ui`:** a tabela com colunas redimensionáveis, virtualização, seleção, menu de contexto e resumo da linha; o painel de colunas, a escolha da visão, o editor de filtro e o menu de contexto, com as histórias no catálogo.
- **`apps/web`:** a tabela dos ativos com as visões, as colunas, os filtros, a seleção, a prévia e o resumo; as visões na busca; o resumo da linha em Ajustes › Tabelas.
- **Dependências:** nenhuma nova. O React Aria já traz a virtualização (`Virtualizer` e `TableLayout`), o redimensionamento (`ResizableTableContainer` e `ColumnResizer`) e a carga ao fim da tabela (`TableLoadMoreItem`).
- **Documentação:** a spec mestre e o contrato de módulo (a tabela configurável e as visões).
- A ficha completa (P1d), a importação (P1e) e a etiqueta (P1f) chegam depois. A etiqueta de vários ativos de uma vez vai usar a seleção desta change.
