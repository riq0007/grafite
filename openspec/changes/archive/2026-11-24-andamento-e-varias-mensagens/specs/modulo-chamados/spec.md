## MODIFIED Requirements

### Requirement: Conversa com a pessoa no chamado aberto

A conversa do chamado aberto SHALL mostrar, nas duas formas da conversa:
- **as mensagens de quem participa,** com o nome e a hora, como as da pessoa, e, de quem abriu pelo chat no nome de outra pessoa, "Fernanda Rocha · abriu o chamado". Na forma "nos cantos", elas ficam à esquerda. A mensagem de quem participa pela TI (spec chamados, "Quem atende pelo chat") SHALL ser a da TI, como as mandadas pelo Chamados;
- **a origem pelo chat,** no começo: "Aberto a partir da conversa Equipe Financeiro", com as mensagens citadas, na ordem da conversa, cada uma com quem a escreveu, a hora, o texto e os anexos, e, a quem participa da conversa, "Abrir a conversa", que leva ao chat na primeira delas;
- **a pergunta com opções:** as opções em botões, sem ação para a TI, e, respondida, a escolhida com o ✓, quem escolheu e a hora, e as outras apagadas;
- **o cartão do ativo,** com "Abrir a ficha" a quem vê o ativo;
- **a imagem anexada** a uma mensagem ou a uma nota, na miniatura (spec arquivos-e-imagens, "Miniatura do anexo de imagem"), que baixa o arquivo, com o nome, o tamanho e "Baixar" embaixo. A imagem sem a miniatura fica como os outros anexos;
- **no resolvido,** o resumo dos tempos e, quando há, a avaliação, como "Fernanda Rocha avaliou: Ótimo · Resolveu muito bem", com o comentário.

A conversa SHALL se atualizar sozinha com as mensagens e as escolhas de quem participa (requisito "Telas atualizadas e módulo desligado").

#### Scenario: Origem na conversa
- **WHEN** Bruno Lima abre o #1045, aberto pela mensagem das 10:19 de Paulo Nunes na Equipe Financeiro
- **THEN** a conversa começa com "Aberto a partir da conversa Equipe Financeiro" e a mensagem de Paulo, sem "Abrir a conversa", porque Bruno não é da equipe

#### Scenario: Escolha que chega
- **WHEN** Fernanda Rocha escolhe "Pode ser" no chat, com Bruno no #1045
- **THEN** a pergunta das 10:52 mostra "Pode ser" com o ✓, Fernanda e a hora, sem recarregar

#### Scenario: Origem de três mensagens
- **WHEN** Bruno Lima abre o #1046, aberto pelas mensagens das 10:19 e das 10:20 de Paulo Nunes e pela das 10:21 de Fernanda Rocha
- **THEN** a conversa começa com "Aberto a partir da conversa Equipe Financeiro" e as três mensagens, na ordem, cada uma com quem a escreveu e a hora

#### Scenario: Mensagem de quem participa pela TI
- **WHEN** Bruno Lima abre o #1050, em que Ana Souza, que o abriu no nome de Paulo Nunes e o atende, escreveu pelo chat "Passo aí às 14h"
- **THEN** a mensagem de Ana aparece como a da TI, e não com "Ana Souza · abriu o chamado"
