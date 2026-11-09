## ADDED Requirements

### Requirement: Barra de abas da janela

A biblioteca SHALL oferecer a barra de abas da janela, que mostra as abas abertas, com a da frente marcada. Cada aba SHALL ter o título e, menos a primeira, um botão de fechar com o nome acessível "Fechar <título>".

A barra SHALL seguir estas regras:
- a aba da frente SHALL ser indicada pela forma e pelo texto lido pelo leitor de tela, e não só pela cor;
- o teclado SHALL andar entre as abas pelas setas e por Home e End, e Enter ou espaço SHALL trazer a aba escolhida para a frente;
- o leitor de tela SHALL anunciar a lista de abas, a posição de cada uma e qual está na frente;
- com mais abas do que cabem, a barra SHALL rolar na horizontal, e a aba da frente SHALL ficar à vista;
- no toque, cada aba e cada botão de fechar SHALL ter alvo de pelo menos 44 px;
- abrir uma aba SHALL animar a entrada dela em no máximo 300 ms, e, com movimento reduzido, a aba SHALL aparecer sem animação; fechar SHALL tirar a aba na hora, sem animação.

#### Scenario: Aba da frente pelo teclado
- **WHEN** o foco está na barra com as abas "Novo ativo" e "Novo local", e o usuário pressiona a seta para a esquerda e Enter
- **THEN** "Novo ativo" vai para a frente, e o leitor de tela anuncia que ela está selecionada, a primeira de duas

#### Scenario: Fechar pelo botão
- **WHEN** o usuário escolhe "Fechar Novo local"
- **THEN** a barra avisa quem a usa de que a aba "Novo local" pediu para fechar, e a primeira aba não tem botão de fechar

### Requirement: Link de cadastro do campo

A biblioteca SHALL oferecer o link de cadastro que fica embaixo de um campo, com o texto do que ele cria, como "Cadastrar novo local", precedido de um ícone de mais. O link SHALL ficar ligado ao campo, de modo que o leitor de tela o anuncie junto dele, e SHALL ser alcançável pelo teclado logo depois do campo. Com o campo desabilitado ou só para leitura, o link SHALL NOT aparecer.

#### Scenario: Link anunciado com o campo
- **WHEN** o foco sai do campo Local para o link embaixo dele
- **THEN** o leitor de tela anuncia "Cadastrar novo local" e que ele é do campo Local

#### Scenario: Campo só para leitura
- **WHEN** o campo Local aparece só para leitura
- **THEN** o link "Cadastrar novo local" não aparece embaixo dele
