## Context

A casca (`packages/ui/src/casca/Casca.tsx`) é uma grade com a barra superior e a área da janela. Ela tem `min-height: 100dvh`, então cresce com o conteúdo, e quem rola é a página. A área reserva o espaço do dock com um `padding`, mas esse espaço fica no fim da página. Ao rolar, o conteúdo passa por baixo do dock, que é fixo.

A janela (`JanelaDeConteudo`, o `<main>`) tem o respiro de `--esp-6` por dentro. A barra das abas (`AbasDaJanela`) desfaz esse respiro com margens negativas, para ficar colada nas bordas, e os painéis das abas vêm logo abaixo dela, todos montados, com os de trás escondidos pelo `hidden`.

Outras peças dependem da rolagem da página:
- **a lista das etapas** (`EtapasDoFormulario`) fica presa com `position: sticky; top: 0`, para continuar à vista enquanto o painel longo rola;
- **a tabela dos ativos** mede a altura do topo dela até o fim da janela do navegador (`useAlturaAteOFim`), descontando o respiro de baixo do `<main>` e da área;
- **"Ir para o conteúdo"** leva o foco ao `<main>`.

O título da tela é o `TituloDaJanela`, um `h1` com `data-titulo-da-janela`. O foco vai para ele depois de cada navegação, e a `JanelaComAbas` lê dele o nome da primeira aba.

Os campos ficam assim hoje:
- **no cadastro em etapas**, a coluna dos campos (`CadastroEmEtapas.module.css`, `.campos`) tem um campo por linha, e o `Formulario` em volta da lista e do painel limita tudo a 960 px (`--largura-formulario`);
- **na ficha em cartões**, os campos (`Ativos.module.css`, `.camposDoGrupo`) já ficam em colunas de pelo menos 240 px (`calc(var(--esp-12) * 5)`), e o `Formulario` em volta deles os limita a 960 px.

Os desenhos aprovados estão na página dos desenhos, fora do repositório, aba "Janela e colunas".

## Goals / Non-Goals

**Goals:**
- A janela com altura fixa, e o conteúdo rolando numa área só, abaixo da barra das abas, com o esmaecimento calculado em um lugar.
- Nenhuma tela precisa saber da rolagem: as que rolam ganham o esmaecimento sozinhas, e as que ocupam a janela até embaixo, como a tabela, continuam medindo a própria altura.
- Uma regra só para os campos em colunas, no cadastro e na ficha.

**Non-Goals:**
- A rolagem própria das telas que já têm uma, como a da tabela virtualizada, não muda.
- Os outros formulários não ganham as colunas nem perdem o título.
- A aparência do dock, da barra superior e da barra das abas não muda: só o lugar da rolagem.

## Decisions

### 1. A área que rola fica dentro da janela, abaixo da barra das abas

A casca passa a ter a altura da tela:
- `.casca` troca `min-height: 100dvh` por `height: 100dvh`, com as linhas `auto minmax(0, 1fr)`;
- a área ganha `min-height: 0`;
- o `<main>` vira uma coluna flexível, sem respiro e com `overflow: hidden`, que só segura a borda, o raio e a superfície.

Dentro dela, uma peça nova da biblioteca, a `RolagemDaJanela`, é a única que rola:
- ela tem `data-rolagem-da-janela` e o respiro de `--esp-6`, com `flex: 1` e `min-height: 0`;
- a `AbasDaJanela` desenha a barra (`flex: none`, sem as margens negativas) e, abaixo dela, a `RolagemDaJanela` com os painéis.

A posição da casca não muda:
- a área continua reservando o espaço do dock do lado dele, e o vão entre a janela e o dock continua sendo o `--esp-4` que já existe;
- com o ocultar automático, a área não reserva o espaço, e o dock passa por cima da janela, como hoje;
- no celular, a área continua reservando a barra de abas embaixo.

Alternativa: o próprio `<main>` rolar, com a barra das abas presa (`sticky`) no topo. Essa opção mexe em menos lugares, mas a faixa esmaecida de cima cairia sobre a barra presa, e a barra de rolagem correria ao lado das abas. A área separada deixa a barra fora da rolagem, sem compensações.

### 2. O esmaecimento é uma máscara ligada só quando há conteúdo além da borda

A `RolagemDaJanela` acompanha a própria rolagem:
- o evento `scroll`, passivo;
- um `ResizeObserver` nela e no invólucro do conteúdo, porque a troca de etapa muda a altura sem rolar.

Ela marca `data-mais-acima` quando `scrollTop > 1` e `data-mais-abaixo` quando ainda falta mais de 1 px até o fim. Só com uma das marcas o CSS liga a `mask-image`, com duas camadas:
- **o conteúdo:** um `linear-gradient` de cima para baixo, de `transparent` até `currentColor` na faixa de cima, e de `currentColor` a `transparent` na faixa de baixo. Cada faixa vale zero sem a marca da borda dela;
- **a barra de rolagem:** uma camada opaca na largura dela, à direita. A largura é medida (`offsetWidth - clientWidth`, menos as bordas) e passada em `--largura-da-barra`. Com a barra que flutua sobre o conteúdo, a largura é zero.

As faixas e o foco:
- a faixa de cima é `--esp-6`, a mesma medida do respiro, e a de baixo é `--esp-8`;
- o `scroll-padding-block` usa as mesmas faixas, então o campo que recebe o foco pelo Tab rola até ficar fora delas (técnica C43 das WCAG).

A máscara só lê a opacidade, e a cor do texto da janela é opaca em todos os temas. Por isso as cores da máscara são `transparent` e `currentColor`, que o verificador das cores aceita, e nenhum token novo é preciso. As faixas são variáveis comuns, sem transição, então o esmaecimento aparece e some sem animação.

O gradiente tem função visual, a de dizer que há mais conteúdo além da borda, como pede a seção 18 do ANTISLOP.

Alternativa: uma sombra ou uma película com a cor da superfície por cima da borda. A película cobre o conteúdo, rouba o clique perto da borda e precisa acompanhar o tema. A máscara deixa o conteúdo esmaecer de verdade, sem nada por cima.

### 3. A rolagem de cada aba e a tela nova no começo

A `AbasDaJanela` guarda, num `Map` por id de aba, a última posição da rolagem da aba da frente, gravada no `scroll`:
- quando outra aba vem para a frente, ela aplica a posição guardada dela, ou zero, no `useLayoutEffect` da troca;
- fechar uma aba apaga a posição dela.

A `AbaNaJanela` ganha a `chave` opcional do conteúdo. Quando a chave de uma aba muda, a posição dela volta a zero, e a rolagem também, se ela está na frente. A `JanelaComAbas` passa o caminho do endereço como a chave da primeira aba, então trocar de tela volta ao começo.

A busca do endereço não é a chave. Ela muda com o cartão da ficha e com os filtros da tabela, que não são outra tela. Nesses casos, o foco no nome do cartão já mostra o começo do painel.

### 4. "Ir para o conteúdo" leva o foco à área que rola

O `<main>` não rola mais, então o PageDown com o foco nele não moveria nada. O link passa a levar o foco à `RolagemDaJanela` dentro da janela. Sem ela, como numa história que põe o conteúdo direto na casca, o foco vai ao `<main>`, como hoje.

A área tem `tabIndex={-1}` e entra na ordem do Tab (`tabIndex={0}`) só quando rola sem nada focável dentro, como o Chrome faz com as áreas que rolam:
- a regra `scrollable-region-focusable` do axe pede o alcance pelo teclado, e a área só com texto ficaria fora dele;
- a área com campos e botões já é alcançada por eles, e uma parada a mais no Tab de toda tela atrapalharia.

A decisão é tomada quando a área ou o conteúdo mudam de tamanho. Com o foco do teclado na área, o anel aparece em volta da janela, pelo `:has()` no CSS da casca, e não na própria área, onde a máscara o esmaeceria.

O teste da história e o da ponta a ponta passam a conferir o foco na área, dentro do `<main>`.

### 5. O título que sai da vista com a barra das abas

O `TituloDaJanela` ganha a opção `ocultarComAbas`, que marca o `h1` com `data-ocultar-com-abas`. A `RolagemDaJanela` recebe `data-com-barra` quando a `AbasDaJanela` mostra a barra. Com as duas marcas, o CSS da casca esconde o título só da vista, como o texto para o leitor de tela da busca (`clip-path: inset(50%)`, 1 px).

Assim, nada muda no título para o resto da casca:
- o `h1` continua no lugar, recebe o foco depois da navegação e é lido pelo leitor de tela;
- a `JanelaComAbas` continua lendo dele o nome da primeira aba.

Só o cadastro do ativo usa a opção, no título do cadastro (`AtivoNovo`). As telas de falha e de carregamento dele mantêm o título, porque nelas o título é o conteúdo.

Alternativa: um contexto do React que diz se há barra. Ele exigiria que cada tela que esconde o título lesse o contexto, e o CSS resolve com uma marca.

### 6. A lista das etapas presa abaixo da faixa

O navegador prende o elemento `sticky` abaixo do respiro da área que rola, e a faixa de cima tem a mesma medida do respiro. Por isso a coluna da `EtapasDoFormulario` já fica fora da faixa com `top: 0`, e a lista não pula quando começa a ficar presa. O `top` passa a somar só a parte da faixa que passa do respiro, `max(0px, faixa − respiro)`, que hoje é zero, para a regra continuar valendo se uma das medidas mudar.

Com a lista mais alta que a janela, ela continua presa, e o fim dela aparece no fim da rolagem (riscos).

### 7. Uma grade de campos para o cadastro e a ficha

As duas telas passam a usar a mesma classe de `Ativos.module.css`, a `.camposEmColunas`, que é a regra de hoje da ficha com o limite:
- `grid-template-columns: repeat(auto-fill, minmax(calc(var(--esp-12) * 5), 1fr))`, com o vão `--esp-4`;
- `max-width: var(--largura-formulario)`.

O `CampoDoAtivo` marca a raiz dele com `data-largura="linha"` nos tipos `texto-longo`, `lista-multipla`, `arquivo` e `imagem`, e a grade dá a esses campos `grid-column: 1 / -1`. O Tab e o leitor de tela seguem a ordem do DOM, que é a das linhas da grade.

As etapas Tipo e Modelo do cadastro não usam a grade. Elas têm um campo só, com o fabricante e o tipo em texto embaixo, e continuam numa coluna.

O limite de 960 px:
- o `Formulario` da biblioteca passa a ler a largura máxima de `--largura-maxima-do-formulario`, que vale `--largura-formulario` quando não é definida;
- o cadastro em etapas define a variável como `none` no formulário dele, e o limite fica só na grade dos campos;
- na ficha, o `Formulario` já envolve só a grade, e nada muda.

Alternativa: um componente de grade na biblioteca. Só o módulo Ativos usa a regra agora; ela pode subir para a biblioteca quando outro módulo precisar.

### 8. A tabela mede até o fim da área que rola

O `useAlturaAteOFim` passa a medir pela `RolagemDaJanela` mais próxima, e não pela janela do navegador:
- o fim é o `bottom` da área, menos a borda e o respiro de baixo dela;
- o topo é o do elemento, somado ao `scrollTop` da área, para a medida não depender de onde a área está rolada.

A altura mínima continua 320 px, e, abaixo dela, quem rola agora é a área. A medida segue os mesmos avisos de hoje: o `resize` do navegador e o aviso que a `JanelaComAbas` dá quando a barra das abas aparece ou some.

## Risks / Trade-offs

- **A lista das etapas mais alta que a janela fica com o fim escondido enquanto o painel rola.** Mitigação: com sete etapas, a lista cabe a partir de uns 600 px de altura da janela. Abaixo disso, o fim da lista aparece no fim da rolagem, e "Continuar" anda pelas etapas. Na janela estreita, a lista vira a faixa que rola de lado.
- **A máscara cria um contexto de empilhamento na área que rola.** Os menus, os popovers e os avisos abrem em portais fora da janela, e o vidro fosco só existe neles, então nada perde o fundo.
- **As capturas da casca e das histórias mudam.** As referências que reprovarem são regravadas no contêiner do Playwright, apagando antes as de mudança sutil.
- **Testes que conferem o foco no `<main>`** (a história "Ir para o conteúdo" e a ponta a ponta da navegação) mudam junto, na tarefa da casca.
- **Uma tela que dependa da rolagem da página.** A busca no código só achou o `useAlturaAteOFim` lendo o `window.scrollY`, e ele muda nesta change. As pontas a ponta rodam inteiras no CI do PR.

## Migration Plan

Só a interface muda, sem dados nem API. Para voltar atrás, basta reverter o PR.

## Open Questions

- O tamanho das faixas (24 px em cima e 32 px embaixo) pode ser ajustado na conferência visual, sem mudar a spec.
