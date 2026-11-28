## ADDED Requirements

### Requirement: Abertura do chamado gravada pelo chat

O chat, na web, no celular e na aba, SHALL gravar a abertura da conversa de um chamado da pessoa quando ela aparece na tela (spec chamados, "Resposta por ver"), e de novo quando chega uma mensagem da TI com a conversa à vista. À vista quer dizer a página visível e com o foco.

#### Scenario: Conversa à vista
- **WHEN** Fernanda está com o #1041 aberto no chat, com a janela na frente, e Ana responde
- **THEN** a resposta não fica por ver, e a aba de Fernanda não avisa

### Requirement: Chat na aba

O app do chat SHALL saber quando abre dentro da aba. Ali ele SHALL:
- entrar pelo bilhete da aba (spec aba-dos-colaboradores, "Chat dentro da aba"), e pedir outro quando a sessão vence;
- passar à aba o Esc que ele não usou;
- não mostrar o que leva à casca, como "Abrir no Chamados", nem o "Andamento", a instalação do app e o push;
- tratar a recusa fora do alcance da aba como o pedido que falhou, e não como a sessão perdida;
- abrir o chamado pedido pela linha da resposta.

#### Scenario: Link de fora
- **WHEN** Fernanda clica num link para um site de fora numa mensagem do chat da aba
- **THEN** o site abre no navegador padrão, e o chat segue na aba
