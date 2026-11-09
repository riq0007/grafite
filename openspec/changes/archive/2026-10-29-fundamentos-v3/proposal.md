## Why

Em 29/10 o usuário pediu o redesenho de todo o sistema, inspirado no jeito como a Anthropic (Claude), o Google, a Microsoft, a Kimi e outras empresas organizam o design. O pedido inclui:
- nada de AI slop;
- mais criatividade para mostrar a quantidade de toner, os Face ID e os backups;
- mais controle na mão do usuário.

Hoje, cada um dos seis temas é uma lista de cores escritas à mão, e cada destaque tem três valores por tom (Apêndice A da spec mestre). Por isso, um tema novo custa caro, e não há como dar ao usuário um tema próprio com o contraste garantido. Além disso, o Grafite escuro com o destaque azul de fábrica fica perto demais da interface genérica de SaaS que o ANTISLOP proíbe (seções 2 e 3).

As empresas citadas organizam o design em camadas e geram as cores a partir de poucas entradas:
- **Material 3 (Google):** gera paletas tonais a partir de uma cor-semente e dá a cada papel o seu par "sobre" (`on-`).
- **Fluent 2 (Microsoft):** separa os tokens globais dos de apelido e trata o alto contraste como um tema de primeira classe.
- **Linear:** gera os temas claros, escuros e personalizados a partir de três entradas (a base, o destaque e o contraste), num espaço de cor perceptual.
- **Atlassian:** dá nome à elevação pela superfície (afundada, padrão, elevada e sobreposta) e pareia cada uma com a sua sombra.
- **IBM Carbon:** põe a visualização de dados dentro do sistema, com uma paleta própria.
- **Anthropic e Kimi:** mostram contenção, com neutros escolhidos com intenção e o destaque usado com parcimônia.

Esta change abre um subprojeto novo da spec mestre, o **D1 · Linguagem visual v3**, com a primeira etapa: as fundações. As próximas etapas vêm em changes próprias:
- os componentes;
- as visualizações (níveis, faixas de dias e tendências), aplicadas aos toners, aos rostos do Control iD e aos backups;
- o controle do usuário (o tema personalizado e o Início ajustável).

Ficam fora desta change:
- o desenho dos componentes e das telas, que só recebem as cores e as medidas novas pelos tokens;
- as visualizações;
- a escolha do tema personalizado nos Ajustes. O gerador já o permite, mas a escolha entra na change do controle do usuário.

## What Changes

- **Temas gerados.**
  - Um gerador em OKLCH produz todas as cores de um tema a partir de cinco entradas:
    - o tom, claro ou escuro;
    - a base, com o matiz e o croma dos neutros;
    - o contraste, de 0 a 100;
    - o destaque, com o matiz e o croma.
  - Os seis temas e os destaques passam a ser pontos de partida do gerador.
  - Para qualquer entrada, o gerador garante os mínimos da WCAG 2.2 AA: ele move a luminosidade de cada papel até o mínimo, contra as superfícies sobre as quais o papel fica.
- **Paleta nova.**
  - Os neutros ganham a matiz da base: um grafite frio no Grafite, um azul-noite no Meia-noite e um papel quente no Papel.
  - O destaque de fábrica passa a ser o **Grafite**, monocromático. A ação principal fica num quase branco sobre o escuro, ou num quase preto sobre o claro, e as cores de situação e de dados ganham o primeiro plano.
  - O azul, o verde e o laranja continuam como escolhas.
- **Elevação em quatro superfícies:** a afundada, a padrão, a elevada e a sobreposta, cada uma com a sua sombra.
- **Situações completas:** ok, atenção, crítico, informação e neutro, cada uma com:
  - o texto;
  - o fundo sutil;
  - a borda;
  - o preenchimento, com a cor do texto sobre ele.
- **Paleta de dados.**
  - Oito cores categóricas, de luminosidade parecida e em ordem que separa as vizinhas.
  - As tintas dos suprimentos (ciano, magenta, amarelo e preto), cada uma legível em todos os temas.
- **Tipografia:** dois papéis novos.
  - **Numeral:** o número de instrumento, em mono, com algarismos tabulares.
  - **Legenda:** 11 px, o menor texto da interface.
- **Raio:** a base de fábrica passa de 12 para 10 px, para um acabamento mais preciso.
- **Documentação:**
  - o ANTISLOP v3, com os princípios, a organização do sistema e as regras novas;
  - a spec mestre, com o D1 e o Apêndice A apontando para o gerador;
  - as páginas de Fundamentos no catálogo.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `design-tokens`: as camadas passam a ser referência, sistema e componente, e os temas saem do gerador. A change traz também:
  - o destaque de fábrica Grafite;
  - o contraste garantido para qualquer entrada;
  - a elevação, as situações completas, a paleta de dados e os papéis numeral e legenda;
  - a base de raio de 10 px.
- `preferencias-da-interface`: os padrões de fábrica passam a ter o destaque Grafite e o raio base de 10 px.

## Impact

- **`packages/ui/src/tokens`:**
  - a conversão OKLCH;
  - o gerador de temas;
  - os temas e os destaques como pontos de partida;
  - a geração do CSS, dos tipos e do DTCG, com as variáveis novas;
  - o relatório de contraste e os testes.
- **`packages/domain`:** os padrões de fábrica das preferências.
- **`apps/web`:**
  - o anti-flash e a ordem dos destaques na Aparência;
  - os testes que contam com o azul de fábrica.
- **O catálogo:** as páginas de Fundamentos (cor, elevação, situações, dados e tipografia).
- **A documentação:**
  - o `docs/ANTISLOP.md` v3 e a regra 3 do `CLAUDE.md`;
  - a spec mestre (o D1 e o Apêndice A);
  - o `docs/identidade/contraste.md` regenerado;
  - o mapa.
- **A regressão visual:** todas as capturas mudam de cor e são regravadas.
- A API, o banco, o contrato e o coletor não mudam.
