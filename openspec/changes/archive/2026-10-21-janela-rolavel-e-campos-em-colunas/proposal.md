## Why

No Novo ativo, a etapa Administrativo tem dez campos, e eles descem até passar por trás do dock. A casca cresce com o conteúdo e a página rola, mas o dock fica fixo na borda. Com isso, os campos de baixo ficam sob ele, contra a spec dock ("sem ficar sob ele"). Há mais dois problemas na mesma tela:
- o cadastro inteiro para nos 960 px dos formulários e mostra um campo embaixo do outro, então sobra muito espaço vazio à direita;
- com a barra de abas aberta, o título "Novo ativo" repete o nome que a primeira aba já mostra.

O usuário pediu a correção em 19/10, antes de começar o P4c, e escolheu as opções no desenho da aba "Janela e colunas" da página dos desenhos, fora do repositório:
- **a janela:** termina acima do dock, rola por dentro, e os campos esmaecem perto da borda;
- **o título:** sai só quando a barra de abas aparece ("Tirar só com as abas");
- **os campos lado a lado:** valem no cadastro e na ficha do ativo ("Cadastro e ficha").

A change pertence à casca (F1a, estrutura da casca) e ao cadastro e à ficha do ativo (P1b e P1d), nas seções 7.4 e 7.8 da spec mestre.

Ficam fora desta change:
- os outros formulários, como o Novo consumível e o Novo local, que continuam com o título e um campo embaixo do outro;
- a ficha do modelo, a do tipo, a da pessoa e a do local;
- o P4c · Estoque, que começa depois desta change.

## What Changes

- **Janela acima do dock:**
  - a casca deixa de crescer com o conteúdo, e a página não rola mais;
  - a janela termina sempre antes do dock, ou da barra de abas do celular, com o mesmo respiro que a separa da barra superior;
  - o que não cabe rola dentro da janela, abaixo da barra de abas dela, que fica no lugar;
  - com o ocultar automático, o dock continua passando por cima da janela quando reaparece.
- **Esmaecimento nas bordas:**
  - perto da borda de cima e da de baixo da área que rola, o conteúdo esmaece enquanto ainda há conteúdo além daquela borda;
  - no começo e no fim da rolagem, a borda fica nítida, e a barra de rolagem não esmaece;
  - o campo que recebe o foco rola para fora da faixa esmaecida.
- **Rolagem de cada aba:**
  - cada aba da janela guarda a posição da rolagem, e voltar a ela mostra o mesmo ponto;
  - trocar de tela na mesma aba volta a rolagem ao começo.
- **Título do Novo ativo:** aparece acima das etapas só sem a barra de abas. Com ela, sai da vista e continua para o leitor de tela e para o foco depois da navegação.
- **Campos em colunas:**
  - no cadastro em etapas e na ficha em cartões, os campos ficam lado a lado enquanto cabem, cada um com pelo menos 240 px, e um embaixo do outro na janela estreita;
  - o texto longo, a lista múltipla, o arquivo e a imagem ocupam a linha inteira.
- **Limite de 960 px:** no cadastro em etapas e na ficha em cartões, o limite vale para a área dos campos. A lista das etapas e a imagem ficam fora dele, e o cadastro deixa de parar nos 960 px.
- **Lista à vista:** a lista das etapas, e a dos cartões, continua à vista enquanto o painel rola, abaixo da faixa esmaecida.
- **Tabela dos ativos:** continua ocupando a janela até embaixo, agora medida pela área que rola da janela.
- **Spec mestre e mapa:**
  - a seção 7.4 ganha a janela que rola por dentro e o esmaecimento;
  - a 7.8 ganha o limite de 960 px na área dos campos;
  - o `docs/mapa.md` traz a change em andamento.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `estrutura-da-casca`:
  - na "Janela de conteúdo", a janela termina antes do dock, rola por dentro e esmaece nas bordas, e a tela nova abre no começo;
  - nas "Abas de cadastro na janela", cada aba guarda a posição da rolagem.
- `dock`: em "Posição e tamanho", o conteúdo rola dentro da janela sem passar sob o dock, e o ocultar automático continua passando por cima dela.
- `posturas-da-casca`: no "Layout fluido", o limite de 960 px vale para a área dos campos no formulário com a lista das etapas e a imagem ao lado.
- `componentes-base`: nas "Etapas de um formulário", a lista continua à vista enquanto o painel rola, fora da faixa esmaecida.
- `cadastro-de-ativos`:
  - no "Cadastro do ativo em etapas", o título só aparece sem a barra de abas, e os campos ficam em colunas;
  - na "Aba Dados em cartões", os campos ficam em colunas, com a mesma regra.

## Impact

- **UI (`packages/ui`):**
  - a casca, com a altura da tela e a janela em coluna;
  - a área que rola da janela, com o esmaecimento, o foco fora da faixa e a rolagem de cada aba;
  - as abas da janela, com a barra fora da área que rola;
  - o título da janela, que pode sair da vista com a barra de abas;
  - a lista das etapas, presa abaixo da faixa;
  - histórias, testes de interação e capturas novas da casca, das abas e das etapas.
- **Web (`apps/web`):**
  - o cadastro em etapas e a ficha em cartões, com a mesma grade de campos;
  - o campo do ativo, que diz quando ocupa a linha inteira;
  - a altura da tabela dos ativos, medida pela área que rola;
  - as pontas a ponta do cadastro, da ficha e da tabela.
- **Capturas visuais:** as referências da casca e das histórias que mudam são regravadas no contêiner do Playwright.
- **API e banco:** nada muda.
- **Documentação:** a spec mestre (seções 7.4 e 7.8) e o mapa.
