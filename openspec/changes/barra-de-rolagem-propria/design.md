## Context

Nenhuma folha de estilo do projeto define a barra de rolagem. Cerca de vinte delas têm uma área com `overflow: auto`: a `RolagemDaJanela`, a `Tabela`, os flutuantes, o modal, o Quick Look e as telas de alguns módulos. Três mexem na barra por conta própria: as abas e as abas da janela a escondem (`scrollbar-width: none`), e as etapas do formulário pedem a fina do navegador (`scrollbar-width: thin`).

A `base.css` do `@grafite/ui` é importada pela web, pelo painel da operação e pelo catálogo. O que entra nela vale nos três.

As faixas esmaecidas da janela e da tabela deixam a barra de fora da máscara. Elas medem a barra do próprio elemento, em `--largura-da-barra` e `--altura-da-barra`, e por isso acompanham qualquer largura.

As preferências chegam à raiz do documento por `atributosDaInterface` (`apps/web/src/preferencias/preferencias.ts`), e o `index.html` copia uma lista fechada desses atributos antes da primeira pintura.

O token `--cor-borda-controle` já é verificado em 3:1 contra as superfícies, em todos os temas e no Personalizado.

## Goals / Non-Goals

**Goals:**
- Uma regra só, na base, sem nenhuma tela declarar a barra.
- A rolagem continua sendo a do navegador: o teclado, a roda, o toque e o leitor de tela não mudam.
- O polegar no contraste que os componentes já têm, sem cor nova.

**Non-Goals:**
- Animar a entrada e a saída do polegar.
- Desenhar a barra com elementos próprios.
- Mudar as faixas esmaecidas ou a largura de alguma tela.

## Decisions

### 1. Uma regra global na base

As regras ficam na `base.css`, para todo elemento, sob `html:not([data-barra-do-sistema])` (decisão 6). A declaração `scrollbar-width: thin` das etapas do formulário sai: ela passa a ser redundante e, no Chromium, desligaria a barra própria naquela lista.

**Alternativa descartada:** uma classe ou um componente `AreaQueRola`. Cada tela nova teria de lembrar de usá-lo, e as vinte áreas de hoje teriam de mudar.

### 2. Um caminho por motor

- **Chromium e Safari:** os pseudo-elementos `::-webkit-scrollbar`. A barra tem 12 px (`--esp-3`), sem trilho e sem botões. O polegar tem 6 px em repouso e 8 px com o ponteiro nele, feitos com uma borda transparente e `background-clip: padding-box`: a largura da barra não muda, e nada se desloca. O raio vem da escala dos raios, e o polegar fica reto com o raio base em zero.
- **Firefox:** `scrollbar-width: thin` e `scrollbar-color`, dentro de `@supports not selector(::-webkit-scrollbar)`.

Os dois caminhos não se misturam porque, no Chromium a partir da versão 121, as propriedades padrão desligam os pseudo-elementos. O Chromium é o navegador do uso real, no computador e na PWA.

### 3. As cores

O polegar usa `--cor-borda-controle` em repouso e `--cor-texto-2` com o ponteiro nele ou arrastado. O trilho é transparente. Nenhum token novo e nenhum par novo no verificador de contraste.

### 4. Quando o polegar aparece

Com "Ao rolar", o polegar é transparente e ganha a cor quando a área:
- está sob o ponteiro (`:hover`);
- tem ela mesma o foco do teclado (`:focus-visible`), como a janela;
- tem a marca `data-rolando`.

O `:focus-within` fica de fora: quase sempre há um elemento com foco dentro da janela, e o polegar dela nunca sumiria.

A marca vem de `acompanharRolagem(documento)`, no `@grafite/ui`: um ouvinte de `scroll` na fase de captura, passivo, que marca o elemento que rolou, ou a raiz quando quem rola é o documento, e tira a marca 1 s depois da última rolagem daquele elemento. Há um temporizador por elemento, num `WeakMap`. A função devolve a que desfaz o ouvinte, para os testes. A web, o painel da operação e o catálogo a chamam na partida.

O `:hover` vale para todos os ancestrais do elemento sob o ponteiro. Com o ponteiro numa tabela, o polegar dela e o da janela aparecem juntos; os dois rolam com a roda naquele ponto, e isso fica como está.

Sem animação: os pseudo-elementos da barra não aceitam transição de forma confiável, e a mudança é de um elemento pequeno.

### 5. A preferência

`aparencia.barraDeRolagem` é `'ao-rolar'` ou `'sempre'`, com `'ao-rolar'` no padrão de fábrica e o leitor `umDe`, como a densidade. Ela vai para a raiz como `data-rolagem`, entra na lista que o `index.html` copia antes da primeira pintura e, com `sempre`, dá a cor ao polegar sem as condições da decisão 4.

Na seção Aparência, é um grupo de duas opções, com a explicação de cada uma, o endereço do ajuste e a entrada na busca, como os outros ajustes.

### 6. A barra do sistema

`barraDoSistemaSobreposta()` mede, na partida, uma área de teste fora da tela: se a largura dela com a barra é igual à sem a barra, o sistema sobrepõe a barra. Nesse caso a raiz ganha `data-barra-do-sistema`, nenhuma regra da barra própria vale, e a seção Aparência mostra "Neste aparelho vale a barra de rolagem do sistema.".

A medida não é uma preferência e não entra na cópia do navegador: ela roda antes de a casca aparecer, quando ainda não há área que rola na tela.

## Risks / Trade-offs

- **[Uma versão do Chromium deixar de aceitar os pseudo-elementos]** → o caminho das propriedades padrão já existe; basta trocar a condição do `@supports`.
- **[O polegar invisível esconde que a área rola]** → as faixas esmaecidas da janela e da tabela continuam dizendo que há mais conteúdo, e "Sempre visível" fica a um clique.
- **[As capturas da regressão visual com barra mudam]** → regravar só as afetadas, apagando a referência antes, porque a diferença é pequena e pode passar pela tolerância.
- **[O alvo do polegar é estreito]** → a barra inteira, de 12 px, recebe o clique e o arrasto, e a rolagem pela roda, pelo teclado e pelo toque não depende dela.

## Migration Plan

Nada a migrar: sem o campo, vale "Ao rolar".

## Open Questions

Nenhuma.
