## 1. Spec mestre e tokens

- [x] 1.1 Registrar na seção 3.3 da spec mestre a divisão do F1 em F1a · Estrutura da casca, F1b · Interação e F1c · Chegada e PWA, com o conteúdo de cada uma; verificar: o diff da spec mestre mostra a divisão, coerente com `proposal.md`
- [x] 1.2 Acrescentar os tokens da casca, começando pelos testes do gerador para os valores novos: tempos do dock em `tempos.ts` (abrir 150 ms, trocar 60 ms, fechar 320 ms, animação do menu 170 ms, esconder 650 ms, animação de esconder 280 ms) e, em `escalas.ts`, itens do dock de 28 a 64 px, faixa de revelar de 18 px, ampliação máxima de 0,55 com σ de 1,3, alvo de toque de 44 px, limites de postura de 768 e 1024 px e formulário de até 960 px; verificar: os testes passam e `pnpm tokens:verificar` fica em dia depois de `pnpm tokens:gerar` (a largura do formulário já existia no F0, como `--largura-formulario`)

## 2. Preferências da interface

- [x] 2.1 Escrever os testes do modelo `PreferenciasDaInterface` (padrões de fábrica da seção 7.2, validação campo a campo, raio de 0 a 24 px, dock de 28 a 64 px, leitura única da chave do F0) e depois substituir `PreferenciasDeAparencia` por ele; verificar: os testes unitários passam
- [x] 2.2 Criar o provedor `usePreferencias`, começando pelos testes: aplicação imediata no `<html>`, gravação em `grafite.preferencias`, falha de gravação sem mensagem, restauração dos padrões por seção; verificar: os testes de componente passam, inclusive com o armazenamento bloqueado
- [x] 2.3 Escrever o teste que compara a lista de atributos do script anti-flash com a do app e depois estender o script com `data-dock`, `data-dock-ocultar` e `--tamanho-item-dock`; verificar: o teste passa, e o CSS da casca posiciona o dock só pelos atributos (conferido na ponta a ponta da tarefa 8.1)

## 3. Controle deslizante

- [x] 3.1 Escrever as histórias e os testes de interação do controle deslizante (valor com a unidade, setas, Home e End, limites, nome acessível) e depois implementá-lo sobre o `Slider` do React Aria, com estilo por tokens; verificar: `pnpm test:stories` passa, sem violações de acessibilidade sérias ou críticas
- [x] 3.2 Exportar o controle deslizante no `index.ts` do `packages/ui`, incluí-lo no catálogo do conjunto de componentes e gravar suas referências visuais; verificar: `pnpm test:visual` passa, com as referências novas revisadas

## 4. Dock e barra superior (`packages/ui`)

- [x] 4.1 Escrever os testes com relógio falso da máquina de estado dos menus do dock (abrir em 150 ms, passagem rápida sem abrir, trocar em 60 ms, fechar em 320 ms, voltar antes do fechamento, toque, teclado) e depois implementá-la; verificar: os testes unitários passam
- [x] 4.2 Escrever os testes com relógio falso da máquina do ocultar automático (esconder em 650 ms, faixa de 18 px, foco ou menu aberto mantêm o dock visível) e depois implementá-la; verificar: os testes unitários passam
- [x] 4.3 Escrever os testes da função de ampliação (48 px no centro chegam a cerca de 74 px, vizinhos decrescem com a distância, deslocamento sem sobrepor itens) e depois implementá-la; verificar: os testes unitários passam
- [x] 4.4 Criar o componente Dock: itens com ícone e nome acessível, ponto do módulo atual anunciado como atual, separador antes de Ajustes, dica no item sem menu, posição e tamanho pelos atributos, material com transparência reduzida; verificar: as histórias passam na checagem de acessibilidade, e o teste de interação confere o módulo atual e a dica
- [x] 4.5 Ligar ao Dock a ampliação (laço por quadro, só transform, desligada com movimento reduzido, toque ou preferência) e o ocultar automático; verificar: o teste de interação confere o item sob o ponteiro maior e a janela parada, sem ampliação com movimento reduzido, e o dock escondido e revelado pela borda
- [x] 4.6 Criar os menus em árvore do dock, ligando a máquina da tarefa 4.1 ao `MenuTrigger` controlado, com a posição pela borda do dock, o submenu no lado com espaço e a animação de 160 a 180 ms (só opacidade no movimento reduzido); verificar: os testes de interação de abrir com atraso, passagem rápida, troca rápida, fechar ao sair e submenu perto da borda passam
- [x] 4.7 Escrever os testes de interação e implementar o teclado do dock (parada única do Tab, setas na direção do dock, Home e End, Enter, seta para longe da borda abre o menu, Esc devolve o foco) e o toque (primeiro toque abre o menu); verificar: os testes passam nas três posições do dock e no toque
- [x] 4.8 Criar a barra superior (nome do módulo, menus da barra, área de status à direita, menus reunidos no nome do módulo abaixo de 1024 px), com as histórias; verificar: os testes de interação abrem os menus da barra por clique e teclado, também com a barra a 900 px
- [x] 4.9 Criar a janela de conteúdo (superfície sólida, título focável, link "Ir para o conteúdo") e a história "Casca", que compõe barra, dock e janela com um registro de exemplo marcado como exemplo; verificar: as histórias passam na checagem de acessibilidade, e o teste de interação confere o link "Ir para o conteúdo"

## 5. Posturas e layout

- [x] 5.1 Escrever os testes da escolha da postura (ponteiro primário, 768 e 1024 px) e depois implementar a função e o hook `usePostura`, junto com o teste que confere as media queries do CSS da casca contra os tokens; verificar: os testes unitários passam
- [x] 5.2 Implementar a postura tablet: dock embaixo por CSS sem mudar a preferência, alvos de 44 × 44 px, menus do dock e da barra como popovers por toque e sem ampliação; verificar: o teste de interação com toque mede os alvos e abre o menu no primeiro toque (a posição embaixo sai da postura, no componente Casca; design, decisão 6)
- [x] 5.3 Criar o painel que sobe de baixo, como variante da gaveta do F0, com a pilha de níveis e o botão Voltar; verificar: os testes de interação abrem o painel, descem num submenu, voltam e fecham, com o foco preso e o Esc
- [x] 5.4 Criar a barra de abas do celular (ordem por prioridade, até cinco abas, ou quatro e "Mais" com a lista no painel) e o nome do módulo que abre a árvore no painel; verificar: os testes de interação com três e com sete módulos de exemplo passam
- [x] 5.5 Aplicar o layout fluido: margem de 16 px mais 1% da largura, até 40 px; formulário de até 960 px; tabela na largura toda; e a linha de campos, adaptável por container query; verificar: a história de um formulário a 2560 px não passa de 960 px, com a tabela na largura toda; a margem é de 19,9 px a 390 px e de 40 px a 2560 px; e a linha de campos numa coluna de 320 px ou numa gaveta usa o arranjo estreito (a fórmula da spec mestre usava `1rem`, que vale 13 px na raiz, e foi corrigida para `16px + 1vw`; a linha de campos é o próprio container; design, decisão 6)

## 6. Módulos, rotas e barra no app (`apps/web`)

- [x] 6.1 Escrever o teste de consistência do registro (ids únicos, destinos que existem, Ajustes por último) e depois criar o registro tipado, as rotas compostas por ele, os módulos Início e Ajustes e a página "Página não encontrada"; verificar: os testes passam, e no `pnpm dev` um endereço desconhecido mostra a página dentro da casca
- [x] 6.2 Ligar a casca do `packages/ui` ao roteador, ao registro e às preferências, com o foco no título depois de navegar; tirar o dock provisório e a página "Casca vazia", e deixar no Início um estado vazio honesto até o F1c; verificar: a ponta a ponta de navegação (dock, voltar do navegador, foco no título) passa
- [x] 6.3 Escrever os testes com relógio falso e `fetch` simulado do item de rede (eventos `online` e `offline`, `/api/health` na abertura, na volta da rede e a cada 50 s com a página visível, desistência em 10 s) e depois implementá-lo; verificar: os testes unitários passam, e a ponta a ponta com o `/api/health` interceptado mostra "Sem conexão com o servidor" (com 60 s entre as conferências, o pior caso de 70 s passava do minuto da spec; design, decisão 10)
- [x] 6.4 Escrever o teste do formato do relógio ("qui 24 set 14:32") e da virada do minuto e depois implementar o relógio e o menu do usuário com avatar neutro e "Ajustes do Sistema"; verificar: os testes unitários e de componente passam
- [x] 6.5 Escrever `docs/casca/modulos.md`: como registrar um módulo (pasta, entrada no registro, rotas, menus em árvore, menus da barra e prioridade no celular), com Início e Ajustes de exemplo; verificar: o documento existe, e os exemplos batem com o registro real

## 7. Ajustes do Sistema

- [x] 7.1 Criar o módulo Ajustes com a lista de seções e uma rota por seção, e no celular a lista e a seção uma de cada vez, com Voltar; verificar: a ponta a ponta abre `/ajustes/dock` com a seção Dock escolhida e, no celular, mostra primeiro a lista
- [x] 7.2 Criar a seção Aparência (tema com amostras, escuros e claros separados; destaque; cantos no controle deslizante; densidade) com "Restaurar padrões", começando pelos testes de componente de troca e restauração; verificar: os testes passam, e na ponta a ponta o destaque verde muda a interface inteira na hora
- [x] 7.3 Criar a seção Dock (posição, tamanho com o valor à vista, ampliar, ocultar e o aviso na postura tablet) com "Restaurar padrões", começando pelos testes de componente; verificar: os testes passam, e na ponta a ponta o tamanho em 36 px muda o dock na hora e mostra "36 px"
- [x] 7.4 Criar a seção Acessibilidade ("Seguir o sistema" e "Reduzir", com o que o sistema pede no momento) com "Restaurar padrões", começando pelos testes com `matchMedia` simulado, e remover o painel provisório do F0; verificar: os testes passam, e na ponta a ponta a transparência reduzida deixa o dock sólido

## 8. Verificação integrada e fechamento

- [x] 8.1 Escrever a ponta a ponta das preferências: dock salvo à esquerda já na primeira pintura, sem mudar de lugar depois; reabertura com o dock à direita; armazenamento bloqueado sem mensagem; verificar: `pnpm test:e2e` passa
- [x] 8.2 Escrever a ponta a ponta das posturas: tablet em 1024×768 com toque (dock embaixo, alvos de 44 px) e celular em 390×844 (barra de abas, painel que sobe de baixo, sem rolagem horizontal); verificar: `pnpm test:e2e` passa
- [x] 8.3 Capturar a história "Casca" nas sete resoluções da seção 7.8, nos temas Grafite e Névoa, junto com as histórias novas, e revisar as referências; verificar: `pnpm test:visual` passa, e falha quando a posição do dock é alterada de propósito
- [x] 8.4 Revisar as telas novas pelo checklist do ANTISLOP v2 e atualizar o `CLAUDE.md` (change em andamento e documento do contrato de módulo); verificar: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:stories`, `pnpm test:e2e` e `pnpm test:visual` verdes, e o CI verde no PR
