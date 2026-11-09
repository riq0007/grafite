## ADDED Requirements

### Requirement: Indicador com meta e decisão

O indicador SHALL mostrar o nome, uma linha com o que ele mede, o valor com a unidade em algarismos tabulares, o valor do período anterior, a meta e a situação no rótulo de situação: "Dentro da meta", de sucesso, "Fora da meta", de Atenção, ou "Sem dado", neutra. Fora da meta, SHALL mostrar a decisão que o indicador pede, em texto. Sem valor, SHALL mostrar o motivo em texto no lugar do número, e nunca um zero. O detalhe, como a lista do que passou da meta, e a ação, como mudar a meta, SHALL vir de quem usa o indicador.

#### Scenario: Indicador sem dado
- **WHEN** um indicador não tem valor no período
- **THEN** ele mostra o motivo, como "Nenhum toner trocado nos últimos 30 dias.", e "Sem dado", sem nenhum número

#### Scenario: Fora da meta sem cor
- **WHEN** um indicador fora da meta é visto por alguém que não distingue as cores
- **THEN** ele lê "Fora da meta" e a decisão em texto

## MODIFIED Requirements

### Requirement: Conjunto de componentes base

A biblioteca SHALL oferecer os seguintes componentes:

- **ações:** botão (primário, secundário, terciário e destrutivo);
- **formulário:** campo de texto, área de texto, campo de data, seleção, busca com sugestões, checkbox, rádio, interruptor, controle segmentado, controle deslizante, linha de campos, escolha de imagem;
- **exibição:** rótulo de situação, miniatura de ativo, avatar, tecla de atalho, código QR, texto para copiar, etiqueta do ativo, indicador com meta;
- **camadas:** dica, popover, menu com submenu, menu de contexto, diálogo, gaveta, aviso, prévia do registro (Quick Look), resumo da linha;
- **estrutura:** abas, tabela base, árvore, filtros ativos, estado vazio, esqueleto de carregamento, barra de progresso;
- **tabela configurável:** painel de colunas, escolha da visão, editor de filtro.

#### Scenario: Tela nova
- **WHEN** uma tela precisa de um desses elementos
- **THEN** ela usa o componente da biblioteca, sem criar uma variação própria
