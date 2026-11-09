## Why

O handoff de 2026-10-13 (`relatorio-05`) mostrou que o Grafite já tem a infraestrutura das relações:
- a tabela que filtra por local, pessoa e modelo;
- os filtros no endereço;
- o Quick Look e a busca com provedores;
- a aba Ligados com o lado de lá.

O que falta é ligar as pontas. Quase toda relação aparece como texto morto: o responsável, o local e o modelo são texto na célula, na prévia e na ficha. O local escolhido na árvore não diz quantos ativos e pessoas tem. A ficha da pessoa não sabe dos ativos dela, e a do modelo não lista os seus. A busca abre registros, mas não age na tela em que o usuário está.

A change pertence ao P1d · Ficha e relacionamentos e ao F1b (a busca), seção 3.2 da spec mestre, e aplica a quarta proposta do handoff ("Relações vivas"). Toda relação passa a ser três coisas: um link com cartão, uma contagem com "Ver na tabela" e um caminho previsível de volta.

Ficam fora desta change:
- o inspetor lateral na tabela;
- a trilha "anterior e próximo" na ficha;
- os "Recentes" da busca;
- os prefixos de escopo na busca;
- a vizinhança em dois níveis na aba Ligados.

## What Changes

- **A referência com cartão:**
  - toda referência a uma pessoa, um local, um modelo, um tipo ou um ativo vira um link para o registro;
  - ao parar o ponteiro 500 ms sobre ela, ou ao focá-la e apertar a seta para baixo, abre um cartão com o resumo e as ações, como "Ver ativos";
  - no toque, o toque abre o registro;
  - a pessoa anonimizada e o ativo fora do acesso continuam só texto.
- **"Ver na tabela" com a origem:**
  - as contagens das fichas abrem a tabela dos ativos já filtrada, com uma faixa de origem, como "Ativos de Jundiaí › Expedição (vindo do local)", e "Limpar origem";
  - "Novo ativo" nessa tabela chega com o local, o responsável, o modelo ou o tipo da origem preenchidos;
  - a origem fica no endereço.
- **Contagens nas fichas, no escopo de quem vê:**
  - local: "Ativos: 12 aqui · 30 com os de dentro" e "Pessoas: 4";
  - pessoa: "Ativos sob responsabilidade: 3";
  - modelo e tipo: os ativos deles.

  Cada contagem tem "Ver" e diz "que você vê" quando o escopo recorta o total.
- **Os locais:**
  - "Mostrar contagens" na árvore;
  - "Mover para…" e "Inativar" dizem antes o que vai junto, como "3 locais, 30 ativos e 4 pessoas".
- **A ficha do ativo:**
  - uma linha de relações no cabeçalho, com o local, o responsável, o modelo e "Ligados (5)", como referências com cartão;
  - na aba Dados, o local, o responsável e o modelo também como referências.
- **A busca global:**
  - com o campo vazio, ela mostra "Nesta tela", com as ações da tela aberta, como "Novo ativo", "Filtrar por tipo…" e "Imprimir etiqueta", antes de "Ir para";
  - cada grupo de registros termina com "Ver todos os N em Ativos".
- **O contrato de módulo** ganha as relações (o que um módulo mostra na ficha de outro) e as ações da tela para a busca.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `componentes-base`: a referência com cartão.
- `cadastro-de-ativos`: as relações na ficha e na tabela, e "Ver na tabela" com a origem e o cadastro preenchido.
- `locais`: as contagens dos locais e o que vai junto ao mover e ao inativar.
- `modulo-administracao`: os ativos da pessoa na ficha dela.
- `catalogo-de-ativos`: os ativos do modelo e do tipo nas fichas deles.
- `busca-global`: "Nesta tela" com o campo vazio e "Ver todos os N" nos grupos.
- `estrutura-da-casca`: o registro de módulos com as relações e as ações de cada tela.

## Impact

- **`packages/ui`:** a `ReferenciaComCartao`, a faixa de origem da tabela e a busca com "Nesta tela" e "Ver todos", com as histórias.
- **`apps/api`:**
  - o resumo de cada registro, com as contagens no escopo de quem vê: `/pessoas/{id}/resumo`, `/locais/{id}/resumo`, `/modelos/{id}/resumo` e `/ativos/{id}/resumo`;
  - as contagens dos locais na árvore;
  - o contrato e o cliente gerados de novo.
- **`apps/web`:**
  - o registro de módulos com as relações e as ações da tela;
  - as células, a ficha do ativo, as fichas do local, da pessoa, do modelo e do tipo;
  - a tabela com a origem e o cadastro preenchido.
- **Documentação:** o contrato de módulo e o mapa.
