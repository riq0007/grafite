## 1. A área que rola da janela

- [x] 1.1 A `RolagemDaJanela`, com o esmaecimento, a largura da barra de rolagem e o `scroll-padding` das faixas (design, decisão 2). Começar pelo teste: uma história com o conteúdo mais alto que a área, com a função de interação. Verificar: as histórias passam pelo `vitest --project catalogo`, cobrindo:
  - sem rolar, só a marca de baixo e a máscara ligada;
  - rolada até o meio, as duas marcas; no fim, só a de cima;
  - o conteúdo que cabe, sem marca e sem máscara;
  - a largura da barra de rolagem em `--largura-da-barra`;
  - o Tab num campo da faixa de baixo, que rola até ele ficar inteiro fora da faixa.

## 2. A casca e a biblioteca

- [x] 2.1 A casca com a altura da tela, a janela em coluna, a barra das abas fora da área que rola e "Ir para o conteúdo" levando o foco a ela (decisões 1 e 4). A barra sai da rolagem no mesmo commit, para o app não ficar sem o respiro entre as duas tarefas. Começar pelo teste: a história da casca com o conteúdo mais alto que a janela. Verificar: as histórias da casca passam pelo `vitest --project catalogo`, cobrindo:
  - a página sem rolagem;
  - a janela antes do dock, com o vão de hoje, com o dock embaixo, à esquerda e à direita;
  - o ocultar automático, com a janela até o respiro da borda;
  - "Ir para o conteúdo" com o foco na área que rola;
  - nas histórias das abas, a barra no lugar enquanto o conteúdo rola.
- [x] 2.2 As abas da janela com a posição da rolagem de cada aba e a `chave` do conteúdo (decisão 3). Começar pelo teste. Verificar: as histórias das abas passam pelo `vitest --project catalogo`, cobrindo:
  - a volta a uma aba no mesmo ponto da rolagem, e a aba nova no começo;
  - a chave nova, que volta a aba ao começo.
- [x] 2.3 O título que sai da vista com a barra das abas, pela opção `ocultarComAbas` do `TituloDaJanela` (decisão 5). Começar pelo teste. Verificar: a história das abas passa, conferindo:
  - sem a barra, o título à vista;
  - com a barra, o título fora da vista e ainda achado pelo papel `heading`, com o nome da primeira aba vindo dele.
- [x] 2.4 A lista das etapas presa abaixo da faixa de cima (decisão 6). Começar pelo teste: a história da lista numa janela com o painel mais alto que ela. Verificar: a história passa pelo `vitest --project catalogo`, com a lista inteira à vista e fora da faixa no fim da rolagem.
- [x] 2.5 O `Formulario` com a largura máxima pela variável `--largura-maxima-do-formulario` (decisão 7). Começar pelo teste. Verificar: a história do formulário passa, conferindo os 960 px sem a variável e a largura livre com ela em `none`.

## 3. A web

- [x] 3.1 A primeira aba com o caminho do endereço como `chave`, e a tabela medindo a altura pela área que rola (decisões 3 e 8). Começar pelo teste: as pontas a ponta da navegação e da tabela. Verificar: o `pnpm test:e2e` dessas specs e a suíte da web (`pnpm --filter @grafite/web test`) passam, cobrindo:
  - "Ir para o conteúdo" com o foco na área que rola, e o PageDown rolando o conteúdo, com as teclas de verdade do Playwright;
  - a tabela dos ativos indo até o fim da área, sem a área rolar, numa janela de 1366 × 768;
  - a ficha rolada até o fim e Ajustes no dock abrindo no começo.
- [x] 3.2 A grade dos campos no cadastro em etapas e na ficha em cartões, com a linha inteira para o texto longo, a lista múltipla, o arquivo e a imagem, e o limite de 960 px só na grade (decisão 7). Começar pelo teste: o `CampoDoAtivo` com `data-largura="linha"` nos quatro tipos largos e sem ela nos outros. Verificar: a suíte da web passa, e a ponta a ponta confere a etapa Administrativo:
  - no cadastro e na ficha, numa janela de 1366 px, os campos lado a lado, linha por linha;
  - numa de 390 px, um embaixo do outro;
  - numa de 1920 px, a área dos campos sem passar de 960 px.
- [x] 3.3 O título do cadastro do ativo com `ocultarComAbas` (decisão 5). Começar pelo teste. Verificar:
  - o teste do `AtivoNovo` confere a opção no título do cadastro, e não nas telas de falha e de carregamento;
  - a ponta a ponta confere o título fora da vista com a aba "Novo modelo" aberta, e de volta depois de fechá-la.
- [x] 3.4 A ponta a ponta da janela acima do dock. Começar pelo teste. Verificar: o `pnpm test:e2e` passa, cobrindo, numa janela de 1366 × 768 com o dock embaixo:
  - a etapa Administrativo sem campo sob o dock, com o esmaecimento embaixo e, no fim da rolagem, só em cima;
  - a aba do ativo de volta no mesmo ponto depois do Novo fornecedor.

## 4. Capturas e conferência

- [x] 4.1 As referências visuais que mudaram, regravadas no contêiner do Playwright com `pnpm test:visual --atualizar`, apagando antes as de mudança sutil. Verificar: o `pnpm test:visual` passa.
- [x] 4.2 A conferência na tela, com a web compilada e a API simulada das pontas a ponta: o `pnpm dev` desta máquina servia a demonstração, com a senha do admin trocada. Verificar: as capturas enviadas ao usuário mostram o Novo ativo e a ficha em 1366 × 768 e em 1920 × 1080:
  - a janela antes do dock e o esmaecimento;
  - os campos em colunas;
  - o título com e sem a barra das abas.

## 5. Fechamento

- [x] 5.1 A documentação. Verificar: o teste-guarda do mapa e o da documentação passam.
  - A seção 7.4 da spec mestre ganha a janela que rola por dentro, com o esmaecimento e a rolagem de cada aba, o título do cadastro só sem a barra das abas e os campos em colunas no cadastro e na ficha.
  - A seção 7.8 ganha o limite de 960 px na área dos campos.
  - O contrato de módulo (`docs/casca/modulos.md`) diz que a tela rola dentro da janela, que uma peça presa usa a faixa de cima como `top`, e quando usar o `ocultarComAbas`.
  - O mapa traz a change em andamento.
- [x] 5.2 Conferir as verificações. Verificar: os comandos passam sem erros, e o PR fica com todos os jobs verdes:
  - `pnpm lint` e `pnpm typecheck`;
  - `openspec validate janela-rolavel-e-campos-em-colunas --strict`;
  - o `pnpm test:e2e:pilha` no CI do PR.
