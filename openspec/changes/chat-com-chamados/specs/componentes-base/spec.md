## MODIFIED Requirements

### Requirement: Menu com submenu e tolerância diagonal

O menu SHALL:
- abrir o submenu ao passar o mouse, depois de um atraso de intenção;
- manter o submenu aberto enquanto o ponteiro se desloca em direção a ele, dentro do triângulo de tolerância;
- aceitar teclado (setas, Enter e Esc);
- abrir por toque em telas de toque;
- usar o material translúcido, respeitando a transparência reduzida.

Os tempos exatos SHALL ser os do Apêndice B da spec mestre.

O painel do menu SHALL ter a largura do conteúdo, até a largura da janela menos as margens, também junto da borda da janela, onde SHALL NOT se estreitar nem crescer depois de aberto.

Na postura celular, o submenu SHALL abrir embaixo do item que o abre, por cima do menu, inteiro dentro da janela, com o mesmo teclado. Nas outras posturas, ele SHALL abrir ao lado do menu, do lado com mais espaço.

#### Scenario: Movimento diagonal até o submenu
- **WHEN** o usuário move o ponteiro na diagonal do item "Rede" até o submenu, passando sobre o item seguinte
- **THEN** o submenu de "Rede" permanece aberto até o ponteiro chegar a ele

#### Scenario: Navegação por teclado no menu
- **WHEN** o menu está aberto e o usuário pressiona seta para a direita sobre um item com submenu
- **THEN** o submenu abre com o foco no primeiro item, e Esc volta ao item de origem

#### Scenario: Menu junto da borda da janela estreita
- **WHEN** o usuário abre, numa janela de 390 px, o "Mais" de uma mensagem, junto da borda direita
- **THEN** o menu abre na largura do conteúdo, inteiro dentro da janela, e não muda de largura depois

#### Scenario: Submenu na janela estreita
- **WHEN** o usuário, numa janela de 390 px, abre o submenu "Tema" do menu da conta, que não cabe ao lado do menu
- **THEN** o submenu abre embaixo do item "Tema", por cima do menu, inteiro dentro da janela

## ADDED Requirements

### Requirement: Botão direito com um menu ou uma lista aberta

Com um menu do kit aberto, de botão, de contexto, do dock ou submenu, ou com a lista de uma seleção, de uma busca com sugestões ou da escolha em árvore aberta, o botão direito fora dele SHALL fechá-lo e valer onde cai, como se ele não estivesse aberto:
- onde a tela abre o próprio menu, como em outra linha, outro cartão ou outra mensagem, esse menu SHALL abrir, com o foco nele;
- num campo de texto, num link e no texto selecionado, o menu do navegador SHALL abrir no mesmo clique, como sem o menu aberto, para colar, abrir e copiar;
- em outro lugar, o clique SHALL só fechar o menu ou a lista, sem o menu do navegador, e o foco SHALL voltar a quem o abriu. O clique seguinte SHALL abrir o menu do navegador.

No macOS, o Ctrl+clique SHALL valer como o botão direito.

O menu do navegador SHALL NOT abrir por cima de um menu ou de uma lista do kit aberta: o botão direito dentro dele, num item ou no submenu, e o que o navegador manda ao soltar a tecla de menu, no item que já tem o foco, SHALL ficar com o app. O campo de texto dentro dele, como o filtro da escolha em árvore, SHALL ficar com o menu do navegador.

#### Scenario: Outra linha com o menu aberto
- **WHEN** o menu de contexto de uma linha da tabela está aberto, e o usuário clica com o botão direito em outra linha
- **THEN** o menu da primeira fecha, e o da outra abre onde o ponteiro está, sem o menu do navegador

#### Scenario: Fora de um menu de botão
- **WHEN** o menu "Mais" de uma mensagem está aberto, e o usuário clica com o botão direito na caixa de escrever
- **THEN** o menu fecha, e o menu do navegador abre na caixa, com o foco nela, para colar

#### Scenario: No campo da busca com a lista aberta
- **WHEN** a lista de sugestões de uma busca está aberta, e o usuário clica com o botão direito no campo dela
- **THEN** a lista fecha, e o menu do navegador abre no campo no mesmo clique

#### Scenario: Fora da lista de uma escolha
- **WHEN** a lista do fuso horário está aberta em Ajustes, e o usuário clica com o botão direito no texto da tela
- **THEN** a lista fecha, sem o menu do navegador, e o fuso escolhido continua o mesmo

#### Scenario: Tecla de menu sem o menu do navegador
- **WHEN** o usuário, com o foco numa linha da tabela, abre o menu de contexto pela tecla de menu
- **THEN** o menu abre junto da linha, e o menu do navegador não abre por cima dele
