## Why

O inventário do handoff de 2026-10-13 (`relatorio-01`, achados 7 a 12; `relatorio-04`, P1 a P6) mostrou o atrito de filtrar a tabela dos ativos:
- o menu "Filtros" é uma lista plana de dezenas de colunas, sem grupos nem busca, ao contrário do painel "Colunas";
- filtrar é em dois passos, e o editor abre preso ao botão "Filtros", longe da coluna, mesmo quando sai do menu da coluna;
- o filtro "é qualquer de" não diz quantos ativos cada opção traz, e o filtro de Modelo ignora o filtro de Tipo;
- os filtros ativos só se removem, e não se editam no lugar;
- as ações sobre a seleção ficam em segundo plano, e o carregamento é um texto solto, com o componente de esqueleto sem uso.

A change pertence ao P1c · Tabela e visões, seção 3.2 da spec mestre, e aplica a terceira proposta do handoff ("Filtros, chips e barra"), sem mudar a estética: os mesmos tokens e componentes, com o painel flutuante de hoje.

Ficam fora desta change:
- os filtros com "ou" e os grupos de condições;
- mais operadores de texto, como "é igual" e "começa com";
- a exportação e a edição em lote, que são outra proposta;
- as visões como abas.

## What Changes

- **O painel de filtros em duas colunas:**
  - à esquerda, as colunas que se filtram, agrupadas como no painel "Colunas", com um campo para filtrar a lista e a marca "Filtrada" em texto nas que já têm filtro;
  - à direita, o editor da coluna escolhida.

  "Filtrar…" no menu de uma coluna abre o painel preso ao cabeçalho dela, já nela.
- **Contagens no "é qualquer de":**
  - cada opção diz quantos ativos ela traz, contados com os outros filtros ativos;
  - as opções com zero ficam no fim, com "(0)" em texto;
  - o botão de aplicar diz o resultado, como "Mostrar 134 ativos".
- **Os filtros ativos se editam no lugar:** cada rótulo mostra a coluna, o operador e o valor, como "Hostname · contém · almox". Clicar nele abre o editor preso a ele, e Backspace com o foco nele o tira.
- **Tipo antes de Modelo:**
  - com um filtro de Tipo, o filtro de Modelo oferece primeiro os modelos daqueles tipos, e diz isso em texto;
  - um modelo já escolhido de outro tipo continua no filtro, marcado "de outro tipo";
  - o painel de filtros e o de colunas mostram primeiro os campos dos tipos filtrados.
- **A barra da tabela em duas faixas:**
  - a primeira com a visão, a busca, a situação, "Filtros", "Colunas" e a contagem à direita, como "1.204 ativos";
  - a segunda com os filtros ativos.

  Com linhas selecionadas, a segunda faixa vira a barra das ações em lote: "3 selecionados", "Imprimir etiquetas", "Copiar linhas", "Prévia" e "Limpar seleção".
- **O carregamento:**
  - a primeira carga mostra o esqueleto das linhas, com as colunas à vista;
  - trocar a busca, um filtro ou a ordem mantém as linhas de antes, marcadas como carregando, até as novas chegarem.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `tabelas-configuraveis`:
  - os filtros pelas colunas no painel de duas colunas, com as contagens e o editor no lugar;
  - a barra das ações em lote com a seleção;
  - o carregamento com o esqueleto e a carga sem apagar as linhas.
- `componentes-base`: os filtros ativos com o operador e a edição no lugar.
- `cadastro-de-ativos`: o filtro de Modelo encadeado ao de Tipo, e os campos dos tipos filtrados primeiro nos painéis.

## Impact

- **`packages/ui`:** o editor e o painel de filtros, os filtros ativos, a barra da tabela e o carregamento da tabela base, com as histórias e os testes do catálogo.
- **`apps/api`:** a contagem por opção de uma coluna, com os filtros, a busca e o escopo de quem pede (`GET /ativos/contagens`), e a busca de modelos por tipo; o contrato e o cliente gerados de novo.
- **`apps/web`:** a tabela dos ativos com a barra nova, o painel de filtros, o encadeamento e a seleção.
- **Testes:** a ponta a ponta e a regressão visual da tabela mudam junto.
- **Documentação:** o contrato de módulo, na tabela configurável, e o mapa.
